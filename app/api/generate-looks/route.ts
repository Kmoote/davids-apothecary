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

const buildPrompt = (items: object[]) => `Here is Catherine's wardrobe (${items.length} pieces):
${JSON.stringify(items)}

Create 3 complete, cohesive outfit looks for today. Return ONLY a JSON array — no markdown, no explanation.

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

// ── helpers ───────────────────────────────────────────────────────────────────

type WardrobeRow = {
  id: string; name: string | null; category: string;
  photo_url: string; thumbnail_url: string | null; colors: string[];
  subcategory: string | null; occasion_tags: string[];
  formality: number; season_fit: string[];
  pattern: string | null; fabric: string | null;
};

/** Pick up to `n` alternatives for a slot: same category, not already used in any look. */
function pickAlts(
  category: string,
  exclude: Set<string>,
  all: WardrobeRow[],
  n = 2
): WardrobeRow[] {
  return all
    .filter((r) => r.category === category && !exclude.has(r.id))
    .slice(0, n);
}

function toSlotItem(row: WardrobeRow, slot: string): RealSlotItem {
  return {
    slot,
    item_id: row.id,
    name: row.name ?? row.category,
    category: row.category,
    photo_url: row.photo_url,
    thumbnail_url: row.thumbnail_url ?? null,
    colors: row.colors,
  };
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. fetch wardrobe
    const { data: rows, error: dbErr } = await supabase
      .from("wardrobe_items")
      .select("id,name,category,subcategory,photo_url,thumbnail_url,colors,occasion_tags,formality,season_fit,pattern,fabric")
      .eq("user_id", CATHERINE_USER_ID)
      .eq("is_active", true)
      .order("category");

    if (dbErr) throw new Error(`DB: ${dbErr.message}`);
    const items = (rows ?? []) as WardrobeRow[];
    if (items.length < 12) {
      return NextResponse.json({ error: "Not enough wardrobe items yet" }, { status: 422 });
    }

    // 2. build condensed list for Claude (no photo URLs to save tokens)
    const condensed = items.map((r) => ({
      id: r.id,
      name: r.name ?? r.category,
      category: r.category,
      subcategory: r.subcategory,
      colors: r.colors,
      occasion_tags: r.occasion_tags,
      formality: r.formality,
      season_fit: r.season_fit,
      pattern: r.pattern,
      fabric: r.fabric,
    }));

    // 3. call Claude
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: DAVID_SYSTEM,
      messages: [{ role: "user", content: buildPrompt(condensed) }],
    });

    const rawText = msg.content[0].type === "text" ? msg.content[0].text : "[]";
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Claude returned no JSON array");

    const claudeLooks = JSON.parse(jsonMatch[0]) as Array<{
      name: string; tag: string; david_note: string; closing_line: string;
      slots: Array<{ label: string; item_id: string }>;
    }>;

    // 4. resolve items + build alternatives
    const itemMap = new Map(items.map((r) => [r.id, r]));
    const usedIds = new Set<string>();

    const resolvedLooks: Omit<RealLook, "look_id">[] = [];

    for (const cl of claudeLooks.slice(0, 3)) {
      const slots: RealLookSlot[] = [];
      const lookUsed = new Set<string>();

      for (const s of (cl.slots ?? []).slice(0, 4)) {
        const row = itemMap.get(s.item_id);
        if (!row) continue; // skip if Claude hallucinated an ID
        if (usedIds.has(row.id)) continue; // skip cross-look duplicates

        usedIds.add(row.id);
        lookUsed.add(row.id);

        const alts = pickAlts(row.category, usedIds, items, 2);
        alts.forEach((a) => usedIds.add(a.id)); // reserve alts from other looks

        slots.push({
          slot: s.label,
          items: [
            toSlotItem(row, s.label),
            ...alts.map((a) => toSlotItem(a, s.label)),
          ],
        });
      }

      if (slots.length < 3) continue; // skip degenerate looks

      resolvedLooks.push({
        name: cl.name ?? "The Edit",
        tag: cl.tag ?? "Casual Cool",
        david_note: cl.david_note ?? "",
        closing_line: cl.closing_line ?? "",
        slots,
      });
    }

    if (resolvedLooks.length === 0) throw new Error("Could not resolve any looks");

    // 5. persist look rows to DB (so wear triggers work)
    const finalLooks: RealLook[] = [];

    for (const look of resolvedLooks) {
      const itemIds = look.slots.map((s) => s.items[0].item_id);
      const { data: inserted, error: insErr } = await supabase
        .from("looks")
        .insert({
          user_id: CATHERINE_USER_ID,
          name: look.name,
          theme: look.tag,
          item_ids: itemIds,
          occasion: look.tag,
          stylist_raw: { david_note: look.david_note, closing_line: look.closing_line },
        })
        .select("id")
        .single();

      if (insErr) throw new Error(`looks insert: ${insErr.message}`);
      finalLooks.push({ ...look, look_id: inserted.id });
    }

    return NextResponse.json({ looks: finalLooks });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generate-looks]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
