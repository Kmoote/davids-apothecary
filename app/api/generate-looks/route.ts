import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { RealLook, RealLookSlot, RealSlotItem } from "@/lib/looks";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";

// ── season helper ─────────────────────────────────────────────────────────────

function getCurrentSeason(): "spring" | "summer" | "fall" | "winter" {
  const m = new Date().getMonth(); // 0 = Jan
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "fall";
  return "winter";
}

// How many candidates per category to send Claude.
// This pool stays roughly constant no matter how big the wardrobe grows.
const CATEGORY_LIMITS: Record<string, number> = {
  tops:        8,
  bottoms:     8,
  outerwear:   8,
  shoes:       6,
  dresses:     5,
  accessories: 4,
};

// ── David's persona ───────────────────────────────────────────────────────────

const DAVID_SYSTEM = `You are David, a refined personal stylist with impeccable, eclectic taste. You know Catherine's wardrobe intimately — she has a bold, confident style that mixes textures, prints, and unexpected combinations with ease.

Your style philosophy:
- Effortless elegance: looks should feel intentional but never try-hard
- Proportion balance: if the top is fitted, let the bottom breathe (and vice versa)
- Colour cohesion: tones should speak to each other — contrast is fine, clash is not
- Push gently: suggest combinations Catherine wouldn't reach for herself, but will love
- Occasion awareness: today's looks should feel wearable, not costume-y

You'll build exactly 3 outfit looks. Each has 4 slots. Favour these slot combos:
  • top + bottom + shoes + layer (most common)
  • dress + shoes + layer + accessory (for dress days)
Never repeat the same item across looks. Make each look feel like a distinct mood.`;

// ── preference summary ────────────────────────────────────────────────────────

type UserPrefs = {
  boldness: number | null;
  colour_play: number | null;
  edge: number | null;
  classic: number | null;
  notes_freetext: string | null;
  corrections: string[] | null;
  recent_learnings: { text: string; date?: string }[] | null;
};

const TRAIT_LABELS: Record<string, [string, string, string]> = {
  boldness:    ["Muted palette", "Mid-range palette", "Bold palette"],
  colour_play: ["Soft silhouettes", "Mixed silhouettes", "Structured silhouettes"],
  edge:        ["Classic style", "Selective trend exposure", "Trend-forward"],
  classic:     ["Plays it safe", "Moderate risk tolerance", "Loves a push"],
};

function buildPrefSummary(prefs: UserPrefs | null): string {
  if (!prefs) return "";
  const traits = (["boldness", "colour_play", "edge", "classic"] as const)
    .map((k) => TRAIT_LABELS[k][prefs[k] ?? 1])
    .join(". ");
  const corrections = prefs.corrections?.length
    ? `Rules from Catherine: ${prefs.corrections.join("; ")}.`
    : "";
  const note = prefs.notes_freetext
    ? `Catherine's note to David: "${prefs.notes_freetext}"`
    : "";
  return [traits, corrections, note].filter(Boolean).join(" ");
}

const buildPrompt = (items: object[], season: string) =>
  `It's ${season}. Here are Catherine's most-available pieces for today (${items.length} items — pre-filtered by season and recency):
${JSON.stringify(items)}

Create 3 complete, cohesive outfit looks. Return ONLY a JSON array — no markdown, no explanation.

CRITICAL: Every look MUST have EXACTLY 4 slots. No more, no less. A look with 3 slots is invalid.

Standard look (use when no dress):
  slot 1 label: "Top"      — pick from category: tops
  slot 2 label: "Bottom"   — pick from category: bottoms
  slot 3 label: "Shoes"    — pick from category: shoes  ← REQUIRED in every look
  slot 4 label: "Layer"    — pick from category: outerwear OR accessories

Dress look (use when featuring a dress):
  slot 1 label: "Dress"      — pick from category: dresses
  slot 2 label: "Shoes"      — pick from category: shoes  ← REQUIRED in every look
  slot 3 label: "Layer"      — pick from category: outerwear
  slot 4 label: "Accessory"  — pick from category: accessories

[
  {
    "name": "short evocative look name (2–3 words)",
    "tag": "one occasion tag: Work Ready | Weekend Easy | Evening Out | Casual Cool | Smart Casual",
    "david_note": "David's warm, personal styling rationale — 1–2 sentences, conversational, specific about WHY these pieces work together",
    "closing_line": "David's send-off line — one sentence, encouraging, personal to Catherine",
    "slots": [
      { "label": "Top",    "item_id": "<valid uuid from the list above>" },
      { "label": "Bottom", "item_id": "<valid uuid>" },
      { "label": "Shoes",  "item_id": "<valid uuid>" },
      { "label": "Layer",  "item_id": "<valid uuid>" }
    ]
  },
  { ... },
  { ... }
]

Rules:
- Every item_id must be a real uuid from the list I gave you
- Every look must have EXACTLY 4 slots — if you cannot find 4 valid items, still return 4 slots using the best available items
- No item_id may appear twice across all 3 looks
- Shoes (category: shoes) must appear in every look — do not omit them
- Look 1 is your top recommendation for today`;

// ── types & helpers ───────────────────────────────────────────────────────────

type WardrobeRow = {
  id: string; name: string | null; category: string;
  photo_url: string; thumbnail_url: string | null; colors: string[];
  subcategory: string | null; occasion_tags: string[];
  formality: number; season_fit: string[];
  pattern: string | null; fabric: string | null;
  last_worn_at: string | null;
};

/**
 * Build the candidate pool Claude reasons over.
 * - Season-appropriate items come first (empty season_fit = all-season, always included)
 * - Within each category, sorted by least-recently-worn (nulls = never worn = top priority)
 * - Capped per category so total stays ~35–40 items regardless of wardrobe size
 * - Falls back to off-season items if a category is short on season-appropriate pieces
 */
function buildCandidatePool(all: WardrobeRow[], season: string): WardrobeRow[] {
  const candidates: WardrobeRow[] = [];

  for (const [cat, limit] of Object.entries(CATEGORY_LIMITS)) {
    const inCat = all.filter((r) => r.category === cat);

    // Sort: never worn first, then least-recently-worn
    inCat.sort((a, b) => {
      if (!a.last_worn_at && !b.last_worn_at) return 0;
      if (!a.last_worn_at) return -1;
      if (!b.last_worn_at) return 1;
      return new Date(a.last_worn_at).getTime() - new Date(b.last_worn_at).getTime();
    });

    // Prefer season-fit items; fall through to off-season if not enough
    const seasonFit  = inCat.filter((r) => r.season_fit.length === 0 || r.season_fit.includes(season));
    const offSeason  = inCat.filter((r) => r.season_fit.length > 0 && !r.season_fit.includes(season));
    const ordered    = [...seasonFit, ...offSeason];

    candidates.push(...ordered.slice(0, limit));
  }

  return candidates;
}

/** Pick up to `n` alternatives: same category, not already reserved. */
function pickAlts(
  category: string,
  exclude: Set<string>,
  all: WardrobeRow[],
  n = 2
): WardrobeRow[] {
  // Pull from the full wardrobe (not just candidates) for richer swap options
  return all
    .filter((r) => r.category === category && !exclude.has(r.id))
    .slice(0, n);
}

function toSlotItem(row: WardrobeRow, slot: string): RealSlotItem {
  return {
    slot,
    item_id:      row.id,
    name:         row.name ?? row.category,
    category:     row.category,
    photo_url:    row.photo_url,
    thumbnail_url: row.thumbnail_url ?? null,
    colors:       row.colors,
  };
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const season = getCurrentSeason();

    // 1. Fetch full wardrobe ordered by least-recently-worn.
    //    The order here feeds both the candidate filter AND the alt pool.
    const { data: rows, error: dbErr } = await supabase
      .from("wardrobe_items")
      .select("id,name,category,subcategory,photo_url,thumbnail_url,colors,occasion_tags,formality,season_fit,pattern,fabric,last_worn_at")
      .eq("user_id", CATHERINE_USER_ID)
      .eq("is_active", true)
      .order("last_worn_at", { ascending: true, nullsFirst: true });

    if (dbErr) throw new Error(`DB: ${dbErr.message}`);
    const allItems = (rows ?? []) as WardrobeRow[];
    if (allItems.length < 12) {
      return NextResponse.json({ error: "Not enough wardrobe items yet" }, { status: 422 });
    }

    // 2. Fetch Catherine's style preferences — degrade gracefully if missing
    const { data: prefsRow } = await supabase
      .from("user_preferences")
      .select("boldness,colour_play,edge,classic,notes_freetext,corrections,recent_learnings")
      .eq("user_id", CATHERINE_USER_ID)
      .single();

    const prefSummary = buildPrefSummary(prefsRow ?? null);
    // Append preferences to David's system prompt when available
    const systemPrompt = prefSummary
      ? `${DAVID_SYSTEM}\n\nCatherine's current style settings: ${prefSummary}`
      : DAVID_SYSTEM;

    // 3. Build the ~35–40 item candidate pool (constant size as wardrobe grows)
    const candidates = buildCandidatePool(allItems, season);

    // 4. Condensed payload for Claude — metadata only, no photo URLs
    const condensed = candidates.map((r) => ({
      id:           r.id,
      name:         r.name ?? r.category,
      category:     r.category,
      subcategory:  r.subcategory,
      colors:       r.colors,
      occasion_tags: r.occasion_tags,
      formality:    r.formality,
      season_fit:   r.season_fit,
      pattern:      r.pattern,
      fabric:       r.fabric,
    }));

    // 5. Call Claude with the focused candidate pool + Catherine's preferences
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: "user", content: buildPrompt(condensed, season) }],
    });

    const rawText = msg.content[0].type === "text" ? msg.content[0].text : "[]";
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Claude returned no JSON array");

    const claudeLooks = JSON.parse(jsonMatch[0]) as Array<{
      name: string; tag: string; david_note: string; closing_line: string;
      slots: Array<{ label: string; item_id: string }>;
    }>;

    // 6. Resolve items + build alternatives (alts drawn from full wardrobe, not just candidates)
    const candidateMap = new Map(candidates.map((r) => [r.id, r]));
    const usedIds      = new Set<string>();
    const resolvedLooks: Omit<RealLook, "look_id">[] = [];

    for (const cl of claudeLooks.slice(0, 3)) {
      const slots: RealLookSlot[] = [];

      for (const s of (cl.slots ?? []).slice(0, 4)) {
        const row = candidateMap.get(s.item_id);
        if (!row)          continue; // Claude hallucinated an ID
        if (usedIds.has(row.id)) continue; // cross-look duplicate

        usedIds.add(row.id);

        // Alts come from the full wardrobe so swapping isn't limited to candidates
        const alts = pickAlts(row.category, usedIds, allItems, 2);
        alts.forEach((a) => usedIds.add(a.id));

        slots.push({
          slot: s.label,
          items: [toSlotItem(row, s.label), ...alts.map((a) => toSlotItem(a, s.label))],
        });
      }

      // Pad to 4 slots if Claude returned fewer (shouldn't happen with new prompt, but be safe)
      const FALLBACK_LABELS = ["Top", "Bottom", "Shoes", "Layer"];
      if (slots.length > 0 && slots.length < 4) {
        const usedLabels = new Set(slots.map((s) => s.slot));
        const missingLabels = FALLBACK_LABELS.filter((l) => !usedLabels.has(l));
        for (const label of missingLabels) {
          // Find the category that maps to this label
          const catMap: Record<string, string> = {
            Top: "tops", Bottom: "bottoms", Shoes: "shoes", Layer: "outerwear",
            Dress: "dresses", Accessory: "accessories",
          };
          const cat = catMap[label];
          if (!cat) continue;
          const fallback = allItems.find((r) => r.category === cat && !usedIds.has(r.id));
          if (!fallback) continue;
          usedIds.add(fallback.id);
          const alts = pickAlts(fallback.category, usedIds, allItems, 2);
          alts.forEach((a) => usedIds.add(a.id));
          slots.push({
            slot: label,
            items: [toSlotItem(fallback, label), ...alts.map((a) => toSlotItem(a, label))],
          });
          if (slots.length === 4) break;
        }
      }

      if (slots.length < 3) continue;

      resolvedLooks.push({
        name:         cl.name ?? "The Edit",
        tag:          cl.tag  ?? "Casual Cool",
        david_note:   cl.david_note   ?? "",
        closing_line: cl.closing_line ?? "",
        slots,
      });
    }

    if (resolvedLooks.length === 0) throw new Error("Could not resolve any looks");

    // 7. Persist look rows so the wear trigger can update wear_count
    const finalLooks: RealLook[] = [];

    for (const look of resolvedLooks) {
      const itemIds = look.slots.map((s) => s.items[0].item_id);
      const { data: inserted, error: insErr } = await supabase
        .from("looks")
        .insert({
          user_id:     CATHERINE_USER_ID,
          name:        look.name,
          theme:       look.tag,
          item_ids:    itemIds,
          occasion:    look.tag,
          stylist_raw: { david_note: look.david_note, closing_line: look.closing_line, season },
        })
        .select("id")
        .single();

      if (insErr) throw new Error(`looks insert: ${insErr.message}`);
      finalLooks.push({ ...look, look_id: inserted.id });
    }

    return NextResponse.json({ looks: finalLooks, meta: { season, candidates: candidates.length } });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generate-looks]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
