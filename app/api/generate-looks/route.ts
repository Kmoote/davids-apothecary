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

const buildPrompt = (items: object[], season: string) =>
  `It's ${season}. Here are Catherine's most-available pieces for today (${items.length} items — pre-filtered by season and recency):
${JSON.stringify(items)}

Create 3 complete, cohesive outfit looks. Return ONLY a JSON array — no markdown, no explanation.

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
- No item_id may appear twice across all 3 looks
- Look 1 is your top recommendation for today
- For a dress look use labels: "Dress", "Shoes", "Layer", "Accessory"`;

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

    // 2. Build the ~35–40 item candidate pool (constant size as wardrobe grows)
    const candidates = buildCandidatePool(allItems, season);

    // 3. Condensed payload for Claude — metadata only, no photo URLs
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

    // 4. Call Claude with the focused candidate pool
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: DAVID_SYSTEM,
      messages: [{ role: "user", content: buildPrompt(condensed, season) }],
    });

    const rawText = msg.content[0].type === "text" ? msg.content[0].text : "[]";
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Claude returned no JSON array");

    const claudeLooks = JSON.parse(jsonMatch[0]) as Array<{
      name: string; tag: string; david_note: string; closing_line: string;
      slots: Array<{ label: string; item_id: string }>;
    }>;

    // 5. Resolve items + build alternatives (alts drawn from full wardrobe, not just candidates)
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

    // 6. Persist look rows so the wear trigger can update wear_count
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
