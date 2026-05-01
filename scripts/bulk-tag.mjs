/**
 * bulk-tag.mjs
 *
 * Lists every image in the wardrobe-photos Supabase Storage bucket,
 * skips any that already have a wardrobe_items row,
 * tags the rest with Claude vision, and writes rows to the DB.
 *
 * Usage:
 *   node scripts/bulk-tag.mjs
 *
 * Run from the project root. Reads credentials from .env.local automatically.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ── load .env.local ───────────────────────────────────────────────────────────
const envPath = new URL("../.env.local", import.meta.url).pathname;
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

{
  "category": one of: "tops" | "bottoms" | "outerwear" | "shoes" | "accessories" | "dresses",
  "subcategory": specific type (e.g. "blazer", "jeans", "sneakers", "midi skirt"),
  "colors": array of 1–3 hex color strings for the dominant colors (e.g. ["#2a3a54"]),
  "occasion_tags": array from: "casual" | "work" | "evening" | "weekend" | "formal" | "sport",
  "season_fit": array from: "spring" | "summer" | "fall" | "winter",
  "formality": integer 1–5 (1=very casual, 5=very formal),
  "name": short descriptive name (e.g. "Navy Wool Blazer"),
  "brand": brand name if visible, otherwise null,
  "pattern": "solid" | "striped" | "floral" | "checked" | "printed" | "textured" | null,
  "fabric": "cotton" | "wool" | "silk" | "linen" | "denim" | "leather" | "synthetic" | null
}`;

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

/** Fetch image from public URL and return base64 + mediaType. */
async function fetchBase64(publicUrl) {
  const res = await fetch(publicUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${publicUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") ?? "image/jpeg";
  const mediaType =
    ct.includes("png") ? "image/png"
    : ct.includes("webp") ? "image/webp"
    : "image/jpeg";
  return { base64: buf.toString("base64"), mediaType };
}

/** Call Claude Haiku vision and parse the tag JSON. */
async function tagImage(base64, mediaType) {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
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
  console.log("\n🗄  David's Apothecary — Bulk Tagger\n");

  // 1. list files in bucket
  console.log(`📦  Listing files in "${BUCKET}"…`);
  const files = await listAllFiles();
  if (files.length === 0) {
    console.log("   No image files found. Upload photos to the bucket first.");
    return;
  }
  console.log(`   Found ${files.length} image(s)\n`);

  // 2. fetch already-tagged photo_urls so we can skip them
  const { data: existing } = await supabase
    .from("wardrobe_items")
    .select("photo_url")
    .eq("user_id", CATHERINE_USER_ID);
  const tagged = new Set((existing ?? []).map((r) => r.photo_url));

  // 3. process each untagged file
  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const path = files[i];
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    if (tagged.has(publicUrl)) {
      console.log(`   ⏭  [${i + 1}/${files.length}] skipped (already tagged): ${path}`);
      skipped++;
      continue;
    }

    process.stdout.write(`   ⏳  [${i + 1}/${files.length}] tagging: ${path} … `);

    try {
      const { base64, mediaType } = await fetchBase64(publicUrl);
      const tags = await tagImage(base64, mediaType);

      const { error: dbErr } = await supabase.from("wardrobe_items").insert({
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
      });

      if (dbErr) throw new Error(dbErr.message);

      console.log(`✅  ${tags.name ?? tags.category} (${tags.category})`);
      added++;

      // small delay to avoid rate-limiting
      if (i < files.length - 1) await new Promise((r) => setTimeout(r, 400));

    } catch (err) {
      console.log(`❌  ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✨  Done.`);
  console.log(`   ${added} tagged and added`);
  if (skipped) console.log(`   ${skipped} already in wardrobe (skipped)`);
  if (failed)  console.log(`   ${failed} failed — re-run to retry`);
  console.log();
}

main().catch((err) => { console.error(err); process.exit(1); });
