/**
 * bulk-tag.mjs
 *
 * Lists every image in the wardrobe-photos Supabase Storage bucket,
 * skips any that already have a wardrobe_items row,
 * tags the rest with Claude vision, and writes rows to the DB.
 *
 * Usage:
 *   node scripts/bulk-tag.mjs                       # tag new items only (recognition pass)
 *   node scripts/bulk-tag.mjs --retag               # re-tag every item (recognition pass)
 *   node scripts/bulk-tag.mjs --with-fit            # tag new items + Phase B1b fit-inference
 *   node scripts/bulk-tag.mjs --retag --with-fit    # re-tag every item + fit-inference
 *   node scripts/bulk-tag.mjs --fit-only            # skip recognition; refresh fit_inference on ALL existing items
 *   node scripts/bulk-tag.mjs --with-embed          # tag new items + Phase B2 visual embedding (Marqo)
 *   node scripts/bulk-tag.mjs --embed-only          # skip recognition + fit; refresh embedding on ALL existing items
 *   node scripts/bulk-tag.mjs --retag --with-fit --with-embed  # everything, the whole pipeline, on every item
 *
 * Run from the project root. Reads credentials from .env.local automatically.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

// ── load .env.local ───────────────────────────────────────────────────────────
const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
const CATHERINE_USER_ID = env.NEXT_PUBLIC_CATHERINE_USER_ID ?? "00000000-0000-0000-0000-000000000001";
const BUCKET = "wardrobe-photos";

if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error("❌  Missing env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

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

// ── Phase B1b: Fit-Inference Tagger (mirrors lib/fit-tagger.ts) ───────────────

const FIT_SYSTEM = `You are David, Catherine's personal stylist with an MFA from FIT and a decade of working with real women's closets. Your job here is narrower than usual: look at one garment photo and write structured fit reasoning for how it will lay on Catherine's specific body.

You will receive Catherine's body context in the user message. Use it. The fit_note_for_catherine should sound like you talking to her — specific, warm, honest. If something is likely to fall well, say why in concrete terms (drape, length, where it skims vs. where it floats). If something is likely to be a problem on her body (length wrong for proportion, shape fights her frame, fabric weight wrong), say it plainly in one beat.

Do not flatter. Do not body-police. Do not narrate ("I've analyzed your measurements…"). Just observe and say.

Return ONLY valid JSON. No markdown, no explanation, no preamble.`;

const FIT_SCHEMA_INSTRUCTIONS = `Return a JSON object with these fields:

{
  "silhouette": one of "fitted" | "relaxed" | "A-line" | "shift" | "boxy" | "drapey" | "tailored" | "oversized" | "column" | "wrap" | "other",
  "ease_1to5": integer 1–5 (1 = skin-tight, 3 = standard, 5 = oversized),
  "drape_stiffness_1to5": integer 1–5 (1 = fluid like silk, 5 = architectural like denim/wool),
  "estimated_fabric_weight": one of "light" | "medium" | "heavy",
  "length_category": one of "cropped" | "regular" | "long" | "above-knee" | "knee" | "midi" | "maxi" | "ankle" or null if not length-relevant,
  "neckline": short descriptor like "crew", "v-neck", "scoop", "boat", "halter", "collared", "off-shoulder" — or null if not a top/dress,
  "sleeve": short descriptor like "sleeveless", "short", "3/4", "long", "cap", "bell" — or null if not a top/dress,
  "body_zones_emphasized": array from "shoulders" | "bust" | "waist" | "hips" | "legs" | "neckline" | "back",
  "confidence": one of "low" | "medium" | "high",
  "fit_note_for_catherine": 1–2 sentences in your voice spoken TO Catherine — concrete things like length, drape, where it sits. About 20–35 words.
}

If the garment is shoes/accessories where most fields don't apply, fill what you can and set the rest to null. fit_note_for_catherine should still say something useful.`;

const FIT_BODY_CONTEXT_COLUMNS = [
  "height", "body_shape", "waist_size", "cup_size", "weight",
  "shoulder_in", "bust_in", "hip_in", "inseam_in",
  "tops_that_fit", "tops_that_almost_fit",
  "bottoms_that_fit", "bottoms_that_almost_fit",
].join(",");

function buildFitBodyContext(ctx) {
  if (!ctx) return "Catherine's body details are not yet in the profile.";
  const parts = [];
  const phys = [
    ctx.height       && `${ctx.height} tall`,
    ctx.body_shape   && `${ctx.body_shape.toLowerCase()} body shape`,
    ctx.weight       && `weight ${ctx.weight}`,
  ].filter(Boolean);
  if (phys.length) parts.push(phys.join(", "));
  const sizes = [
    ctx.waist_size && `waist ${ctx.waist_size}`,
    ctx.cup_size   && `bust ${ctx.cup_size}`,
  ].filter(Boolean);
  if (sizes.length) parts.push(sizes.join(", "));
  const tape = [
    ctx.shoulder_in != null && `shoulder ${ctx.shoulder_in}"`,
    ctx.bust_in     != null && `bust ${ctx.bust_in}"`,
    ctx.hip_in      != null && `hip ${ctx.hip_in}"`,
    ctx.inseam_in   != null && `inseam ${ctx.inseam_in}"`,
  ].filter(Boolean);
  if (tape.length) parts.push(`tape: ${tape.join(", ")}`);
  const fitHistory = [
    ctx.tops_that_fit           && `tops that work — ${ctx.tops_that_fit}`,
    ctx.tops_that_almost_fit    && `tops that don't quite work — ${ctx.tops_that_almost_fit}`,
    ctx.bottoms_that_fit        && `bottoms that work — ${ctx.bottoms_that_fit}`,
    ctx.bottoms_that_almost_fit && `bottoms that don't quite work — ${ctx.bottoms_that_almost_fit}`,
  ].filter(Boolean);
  if (fitHistory.length) parts.push(fitHistory.join("; "));
  return parts.length ? parts.join(". ") + "." : "Catherine's body details are minimal.";
}

async function inferFit(base64, mediaType, bodyContext) {
  const bodySummary = buildFitBodyContext(bodyContext);
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: FIT_SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: `${FIT_SCHEMA_INSTRUCTIONS}\n\nCatherine's body context (use this to reason about how this garment will lay on HER):\n${bodySummary}` },
      ],
    }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ── Phase B2: visual embedding (Marqo on Modal) ───────────────────────────────

const MARQO_EMBEDDER_URL    = env.MARQO_EMBEDDER_URL;
const MARQO_EMBEDDER_SECRET = env.MARQO_EMBEDDER_SECRET;

async function embedImage(base64) {
  if (!MARQO_EMBEDDER_URL || !MARQO_EMBEDDER_SECRET) {
    return null;
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(MARQO_EMBEDDER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-secret": MARQO_EMBEDDER_SECRET },
      body: JSON.stringify({ image_b64: base64 }),
      signal: ac.signal,
    });
    if (!res.ok) {
      console.log(`      ⚠️  embedding failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data.embedding) || data.embedding.length !== 768) return null;
    return data.embedding;
  } catch (err) {
    console.log(`      ⚠️  embedding threw: ${err.message}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** List all files recursively in the bucket (handles subfolders). */
async function listAllFiles(prefix = "") {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;

  const files = [];
  for (const entry of data ?? []) {
    if (entry.metadata) {
      // it's a file
      files.push(prefix ? `${prefix}/${entry.name}` : entry.name);
    } else {
      // it's a folder — recurse
      const sub = await listAllFiles(prefix ? `${prefix}/${entry.name}` : entry.name);
      files.push(...sub);
    }
  }
  return files.filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f));
}

/** Fetch image from public URL, resize to ≤1500px, return base64 + mediaType. */
async function fetchBase64(publicUrl) {
  const res = await fetch(publicUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${publicUrl}`);
  const rawBuf = Buffer.from(await res.arrayBuffer());

  // Resize using sharp — keeps iPhone photos well under the 5 MB Claude limit
  const resized = await sharp(rawBuf)
    .resize(1500, 1500, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return { base64: resized.toString("base64"), mediaType: "image/jpeg" };
}

/** Call Claude Sonnet vision and parse the tag JSON. */
async function tagImage(base64, mediaType) {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: TAGGER_PROMPT },
      ],
    }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Flag parsing
  const retag     = process.argv.includes("--retag");
  const withFit   = process.argv.includes("--with-fit");
  const withEmbed = process.argv.includes("--with-embed");
  const fitOnly   = process.argv.includes("--fit-only");
  const embedOnly = process.argv.includes("--embed-only");

  if (fitOnly) {
    return runFitOnly();
  }
  if (embedOnly) {
    return runEmbedOnly();
  }

  const modeTags = [
    retag && "retag",
    withFit && "with-fit",
    withEmbed && "with-embed",
  ].filter(Boolean).join(", ");
  console.log(`\n🗄  David's Apothecary — Bulk Tagger${modeTags ? ` (${modeTags})` : ""}\n`);

  if (withEmbed && (!MARQO_EMBEDDER_URL || !MARQO_EMBEDDER_SECRET)) {
    console.error("❌  --with-embed requires MARQO_EMBEDDER_URL and MARQO_EMBEDDER_SECRET in .env.local");
    process.exit(1);
  }

  // Fetch Catherine's body context once if we need it for fit-inference
  let bodyContext = null;
  if (withFit) {
    const { data: bodyRow } = await supabase
      .from("user_preferences")
      .select(FIT_BODY_CONTEXT_COLUMNS)
      .eq("user_id", CATHERINE_USER_ID)
      .single();
    bodyContext = bodyRow ?? null;
    console.log(`   🧵  Fit-inference enabled — body context loaded${bodyContext ? "" : " (empty)"}\n`);
  }

  // 1. list files in bucket
  console.log(`📦  Listing files in "${BUCKET}"…`);
  const files = await listAllFiles();
  if (files.length === 0) {
    console.log("   No image files found. Upload photos to the bucket first.");
    return;
  }
  console.log(`   Found ${files.length} image(s)\n`);

  // 2. fetch already-tagged photo_urls
  const { data: existing } = await supabase
    .from("wardrobe_items")
    .select("photo_url")
    .eq("user_id", CATHERINE_USER_ID);
  const tagged = new Set((existing ?? []).map((r) => r.photo_url));

  // 3. process each file
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const path = files[i];
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    const alreadyTagged = tagged.has(publicUrl);

    if (alreadyTagged && !retag) {
      console.log(`   ⏭  [${i + 1}/${files.length}] skipped (already tagged): ${path}`);
      skipped++;
      continue;
    }

    process.stdout.write(`   ⏳  [${i + 1}/${files.length}] ${alreadyTagged ? "re-tagging" : "tagging"}: ${path} … `);

    try {
      const { base64, mediaType } = await fetchBase64(publicUrl);
      const tags = await tagImage(base64, mediaType);

      // Phase B1b — optional fit-inference second pass
      let fitInference = null;
      if (withFit) {
        try {
          fitInference = await inferFit(base64, mediaType, bodyContext);
        } catch (fitErr) {
          // Don't fail the row over fit-inference — log and continue.
          console.log(`\n      ⚠️  fit-inference skipped: ${fitErr.message}`);
        }
      }

      // Phase B2 — optional visual embedding pass
      let embedding = null;
      if (withEmbed) {
        embedding = await embedImage(base64);
      }

      const payload = {
        user_id:       CATHERINE_USER_ID,
        photo_url:     publicUrl,
        thumbnail_url: publicUrl,
        category:      tags.category    ?? "tops",
        subcategory:   tags.subcategory ?? null,
        colors:        Array.isArray(tags.colors) ? tags.colors : [],
        occasion_tags: Array.isArray(tags.occasion_tags) ? tags.occasion_tags : [],
        season_fit:    Array.isArray(tags.season_fit) ? tags.season_fit : [],
        formality:     Number(tags.formality) || 2,
        pattern:       tags.pattern ?? null,
        fabric:        tags.fabric  ?? null,
        name:          tags.name    ?? null,
        brand:         tags.brand   ?? null,
        tagger_raw:    tags,
        ...(fitInference ? { fit_inference: fitInference } : {}),
        ...(embedding   ? { embedding } : {}),
      };

      let dbErr;
      if (alreadyTagged) {
        // update existing row by photo_url
        ({ error: dbErr } = await supabase
          .from("wardrobe_items")
          .update(payload)
          .eq("photo_url", publicUrl)
          .eq("user_id", CATHERINE_USER_ID));
        if (!dbErr) updated++;
      } else {
        ({ error: dbErr } = await supabase.from("wardrobe_items").insert(payload));
        if (!dbErr) added++;
      }

      if (dbErr) throw new Error(dbErr.message);

      console.log(`✅  ${tags.name ?? tags.category} (${tags.category})`);

      // small delay to avoid rate-limiting
      if (i < files.length - 1) await new Promise((r) => setTimeout(r, 400));

    } catch (err) {
      console.log(`❌  ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✨  Done.`);
  if (added)   console.log(`   ${added} tagged and added`);
  if (updated) console.log(`   ${updated} re-tagged and updated`);
  if (skipped) console.log(`   ${skipped} already in wardrobe (skipped)`);
  if (failed)  console.log(`   ${failed} failed — re-run to retry`);
  console.log();
}

// ── --fit-only mode ───────────────────────────────────────────────────────────
//
// Skip recognition entirely. Iterate all existing wardrobe_items rows and
// refresh fit_inference using the current body_context. Use this after
// Catherine updates her measurements, or after the fit-inference prompt
// itself changes.

async function runFitOnly() {
  console.log(`\n🗄  David's Apothecary — Fit-Inference Refresh (--fit-only)\n`);

  // 1. Fetch body context once
  const { data: bodyRow } = await supabase
    .from("user_preferences")
    .select(FIT_BODY_CONTEXT_COLUMNS)
    .eq("user_id", CATHERINE_USER_ID)
    .single();
  const bodyContext = bodyRow ?? null;
  console.log(`   🧵  Body context loaded${bodyContext ? "" : " (empty — fit notes will be generic)"}\n`);

  // 2. Fetch every active wardrobe item with its photo
  const { data: items, error } = await supabase
    .from("wardrobe_items")
    .select("id,name,photo_url")
    .eq("user_id", CATHERINE_USER_ID)
    .eq("is_active", true);

  if (error) throw error;
  if (!items || items.length === 0) {
    console.log("   No active wardrobe items found.\n");
    return;
  }
  console.log(`   Found ${items.length} item(s) to refresh.\n`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = item.name ?? item.id.slice(0, 8);
    process.stdout.write(`   ⏳  [${i + 1}/${items.length}] ${label} … `);

    try {
      const { base64, mediaType } = await fetchBase64(item.photo_url);
      const fitInference = await inferFit(base64, mediaType, bodyContext);

      if (!fitInference) {
        console.log(`⚠️  no JSON returned, skipped`);
        failed++;
        continue;
      }

      const { error: updateErr } = await supabase
        .from("wardrobe_items")
        .update({ fit_inference: fitInference })
        .eq("id", item.id)
        .eq("user_id", CATHERINE_USER_ID);

      if (updateErr) throw new Error(updateErr.message);

      console.log(`✅  ${fitInference.silhouette ?? "(no silhouette)"}`);
      updated++;

      // small delay to avoid rate-limiting
      if (i < items.length - 1) await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.log(`❌  ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✨  Done.`);
  if (updated) console.log(`   ${updated} fit_inference refreshed`);
  if (failed)  console.log(`   ${failed} failed — re-run to retry`);
  console.log();
}

// ── --embed-only mode ─────────────────────────────────────────────────────────
//
// Skip recognition + fit-inference entirely. Iterate all existing wardrobe_items
// rows and refresh the embedding column via the Modal worker. Use this for the
// one-time back-fill after Phase B2 first deploys.

async function runEmbedOnly() {
  console.log(`\n🗄  David's Apothecary — Embedding Refresh (--embed-only)\n`);

  if (!MARQO_EMBEDDER_URL || !MARQO_EMBEDDER_SECRET) {
    console.error("❌  --embed-only requires MARQO_EMBEDDER_URL and MARQO_EMBEDDER_SECRET in .env.local");
    process.exit(1);
  }

  const { data: items, error } = await supabase
    .from("wardrobe_items")
    .select("id,name,photo_url")
    .eq("user_id", CATHERINE_USER_ID)
    .eq("is_active", true);

  if (error) throw error;
  if (!items || items.length === 0) {
    console.log("   No active wardrobe items found.\n");
    return;
  }
  console.log(`   Found ${items.length} item(s) to embed.\n`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = item.name ?? item.id.slice(0, 8);
    process.stdout.write(`   ⏳  [${i + 1}/${items.length}] ${label} … `);

    try {
      const { base64 } = await fetchBase64(item.photo_url);
      const embedding = await embedImage(base64);

      if (!embedding) {
        console.log(`⚠️  no embedding returned, skipped`);
        failed++;
        continue;
      }

      const { error: updateErr } = await supabase
        .from("wardrobe_items")
        .update({ embedding })
        .eq("id", item.id)
        .eq("user_id", CATHERINE_USER_ID);

      if (updateErr) throw new Error(updateErr.message);

      console.log(`✅  embedded (768-dim)`);
      updated++;

      if (i < items.length - 1) await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.log(`❌  ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✨  Done.`);
  if (updated) console.log(`   ${updated} embedding(s) refreshed`);
  if (failed)  console.log(`   ${failed} failed — re-run to retry`);
  console.log();
}

main().catch((err) => { console.error(err); process.exit(1); });
