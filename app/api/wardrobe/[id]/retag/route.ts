import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  inferFit,
  FIT_BODY_CONTEXT_SELECT,
  type FitBodyContext,
} from "@/lib/fit-tagger";
import { embedImage } from "@/lib/embedder";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";

// Mirrors /api/tag-item TAGGER_PROMPT. Single-item re-tag, no upload.
const TAGGER_PROMPT = `Analyze this clothing item photo and return a JSON object.
Return ONLY valid JSON — no explanation, no markdown, just the raw JSON object.

CATEGORY RULES (pick the best fit — do not guess "tops" as a default):
- "tops": shirts, blouses, t-shirts, tank tops, sweaters, cardigans, bodysuits
- "bottoms": trousers, jeans, shorts, skirts (any length), leggings
- "dresses": one-piece garments covering torso + lower body (including jumpsuits)
- "outerwear": jackets, coats, blazers, vests, windbreakers
- "shoes": all footwear — heels, flats, boots, sneakers, sandals, loafers
- "accessories": bags, scarves, belts, jewellery, hats, sunglasses

OCCASION RULES (can have multiple — be generous, not restrictive):
- "casual": relaxed everyday wear
- "work": office or smart-casual professional settings
- "evening": dinner, drinks, events after 6pm
- "weekend": brunches, errands, relaxed social outings
- "formal": black tie, weddings, galas
- "sport": athletic or activewear

FORMALITY GUIDE:
1 = athletic / very casual (jeans + plain tee)
2 = casual-smart (nice jeans, casual blouse)
3 = smart casual (chinos, blazer, midi dress)
4 = business / cocktail
5 = formal / black tie

Fields required:
{
  "category": one of the categories above,
  "subcategory": specific type (e.g. "blazer", "straight-leg jeans", "strappy sandal", "midi skirt"),
  "colors": array of 1–3 hex color strings for the dominant colors (e.g. ["#2a3a54", "#f5f0e8"]),
  "occasion_tags": array from the occasion values above (usually 2–3 tags),
  "season_fit": array from: "spring" | "summer" | "fall" | "winter" — omit seasons where this item would be uncomfortable,
  "formality": integer 1–5 using the guide above,
  "name": short descriptive name in 3–5 words (e.g. "Navy Wool Blazer", "Ivory Silk Blouse", "Leopard Print Midi Skirt"),
  "brand": brand name if clearly visible on the item, otherwise null,
  "pattern": one of "solid" | "striped" | "floral" | "checked" | "geometric" | "animal_print" | "printed" | "textured" or null,
  "fabric": fabric type if detectable ("cotton" | "wool" | "silk" | "linen" | "denim" | "leather" | "synthetic" | "knit") or null
}`;

/**
 * Re-run the Tagger on an existing wardrobe item using its stored photo.
 *
 * Updates AI-derived fields (category, subcategory, colors, occasion_tags,
 * season_fit, formality, pattern, fabric, tagger_raw) and refreshes `name`
 * ONLY if Catherine hasn't customized it (i.e. current name matches the
 * previous tagger_raw.name). Preserves brand, size, david_note, fit_note
 * untouched — Catherine's manual edits never get overwritten.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing item id" }, { status: 400 });
    }

    // 1. Fetch the item — ensures it belongs to Catherine and exists
    const { data: item, error: fetchErr } = await supabase
      .from("wardrobe_items")
      .select("id,photo_url,name,tagger_raw")
      .eq("id", id)
      .eq("user_id", CATHERINE_USER_ID)
      .single();

    if (fetchErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (!item.photo_url) {
      return NextResponse.json({ error: "Item has no photo to re-tag" }, { status: 422 });
    }

    // 2. Download the photo (public Supabase Storage URL)
    const photoRes = await fetch(item.photo_url);
    if (!photoRes.ok) {
      return NextResponse.json(
        { error: `Could not fetch photo (${photoRes.status})` },
        { status: 502 }
      );
    }
    const contentType = photoRes.headers.get("content-type") ?? "image/jpeg";
    const mediaType = (
      contentType.includes("png")  ? "image/png"  :
      contentType.includes("webp") ? "image/webp" :
                                     "image/jpeg"
    ) as "image/jpeg" | "image/png" | "image/webp";

    const buffer = Buffer.from(await photoRes.arrayBuffer());
    const base64 = buffer.toString("base64");

    // 3. Re-tag with Claude vision (same model the bulk-tag script uses)
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: TAGGER_PROMPT },
          ],
        },
      ],
    });

    const rawText = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Tagger returned no JSON" }, { status: 502 });
    }
    const tags = JSON.parse(jsonMatch[0]);

    // 4. Build the update — only AI-derived fields. Catherine's manual edits
    //    (brand, size, david_note, fit_note) are NOT overwritten.
    type PrevTagger = { name?: string } | null;
    const prevTagger = item.tagger_raw as PrevTagger;
    const nameWasUntouched =
      !item.name ||
      (prevTagger?.name && item.name === prevTagger.name);

    const update: Record<string, unknown> = {
      category:      tags.category ?? "tops",
      subcategory:   tags.subcategory ?? null,
      colors:        Array.isArray(tags.colors) ? tags.colors : [],
      occasion_tags: Array.isArray(tags.occasion_tags) ? tags.occasion_tags : [],
      season_fit:    Array.isArray(tags.season_fit) ? tags.season_fit : [],
      formality:     Number(tags.formality) || 2,
      pattern:       tags.pattern ?? null,
      fabric:        tags.fabric ?? null,
      tagger_raw:    tags,
    };
    // Only refresh name if Catherine hasn't given it her own
    if (nameWasUntouched && tags.name) {
      update.name = tags.name;
    }

    // 4b. Phase B1b — fit-inference pass. Best-effort: if it fails, we still
    //     persist the recognition update so the user isn't left with a half-
    //     broken retag. The Stylist gracefully tolerates a null fit_inference.
    try {
      const { data: bodyRow } = await supabase
        .from("user_preferences")
        .select(FIT_BODY_CONTEXT_SELECT)
        .eq("user_id", CATHERINE_USER_ID)
        .single();

      const fit = await inferFit(anthropic, {
        base64,
        mediaType,
        bodyContext: (bodyRow ?? null) as FitBodyContext | null,
      });

      if (fit) {
        update.fit_inference = fit;
      }
    } catch (fitErr) {
      // Log but don't fail the request — fit-inference is additive.
      console.warn("[wardrobe retag] fit-inference skipped:",
        fitErr instanceof Error ? fitErr.message : String(fitErr));
    }

    // 4c. Phase B2 — visual embedding via Marqo-FashionSigLIP on Modal.
    //     Best-effort: returns null if the embedder isn't configured or
    //     the call fails. Stored as pgvector for similarity queries.
    try {
      const embedding = await embedImage(base64);
      if (embedding) {
        update.embedding = embedding;
      }
    } catch (embedErr) {
      console.warn("[wardrobe retag] embedding skipped:",
        embedErr instanceof Error ? embedErr.message : String(embedErr));
    }

    const { data: updated, error: updateErr } = await supabase
      .from("wardrobe_items")
      .update(update)
      .eq("id", id)
      .eq("user_id", CATHERINE_USER_ID)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: `DB: ${updateErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ item: updated, tags });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[wardrobe retag]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
