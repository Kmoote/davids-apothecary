import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";

const TAGGER_PROMPT = `Analyze this clothing item photo and return a JSON object.
Return ONLY valid JSON — no explanation, no markdown, just the raw JSON object.

Fields required:
{
  "category": one of: "tops" | "bottoms" | "outerwear" | "shoes" | "accessories" | "dresses",
  "subcategory": specific type (e.g. "blazer", "jeans", "sneakers", "midi skirt"),
  "colors": array of 1–3 hex color strings for the dominant colors (e.g. ["#2a3a54", "#f5f0e8"]),
  "occasion_tags": array from: "casual" | "work" | "evening" | "weekend" | "formal" | "sport",
  "season_fit": array from: "spring" | "summer" | "fall" | "winter",
  "formality": integer 1–5 (1 = very casual, 5 = very formal),
  "name": short descriptive name (e.g. "Navy Wool Blazer", "Ivory Silk Blouse"),
  "brand": brand name if visible on the item, otherwise null,
  "pattern": pattern type ("solid" | "striped" | "floral" | "checked" | "printed" | "textured") or null,
  "fabric": fabric type if detectable ("cotton" | "wool" | "silk" | "linen" | "denim" | "leather" | "synthetic") or null
}`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("photo") as File | null;
    const customName = (formData.get("name") as string | null)?.trim() || null;

    if (!file) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mediaType = (
      file.type === "image/png" ? "image/png"
      : file.type === "image/webp" ? "image/webp"
      : "image/jpeg"
    ) as "image/jpeg" | "image/png" | "image/webp";

    // Upload to Supabase Storage
    const ext = file.type === "image/png" ? "png" : "jpg";
    const storagePath = `${CATHERINE_USER_ID}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("wardrobe-photos")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: `Storage: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("wardrobe-photos")
      .getPublicUrl(storagePath);

    const photoUrl = urlData.publicUrl;

    // Tag with Claude vision
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
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
    const tags = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Write to wardrobe_items
    const { data: item, error: dbError } = await supabase
      .from("wardrobe_items")
      .insert({
        user_id: CATHERINE_USER_ID,
        photo_url: photoUrl,
        thumbnail_url: photoUrl,
        category: tags.category ?? "tops",
        subcategory: tags.subcategory ?? null,
        colors: Array.isArray(tags.colors) ? tags.colors : [],
        occasion_tags: Array.isArray(tags.occasion_tags) ? tags.occasion_tags : [],
        season_fit: Array.isArray(tags.season_fit) ? tags.season_fit : [],
        formality: Number(tags.formality) || 2,
        pattern: tags.pattern ?? null,
        fabric: tags.fabric ?? null,
        name: customName || tags.name || null,
        brand: tags.brand ?? null,
        tagger_raw: tags,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: `DB: ${dbError.message}` }, { status: 500 });
    }

    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
