/**
 * reprocess-images.mjs
 *
 * One-time / on-demand batch cleanup of existing wardrobe photos through Nano
 * Banana (Gemini image editing): remove background, place each garment on a
 * clean white surface, smooth wrinkles, even out lighting. The cleaned image
 * OVERWRITES the original in Supabase Storage (same path → photo_url stays
 * valid), so no DB migration is needed.
 *
 * This mirrors lib/nano-banana.ts. Plain Node can't import a .ts lib (same
 * reason scripts/bulk-tag.mjs duplicates the TAGGER_PROMPT), so the Nano Banana
 * call + prompt are reimplemented here. Keep them in sync with the lib.
 *
 * Usage:
 *   node scripts/reprocess-images.mjs            # process every item with a photo
 *   node scripts/reprocess-images.mjs --limit 5  # only the first 5 (smoke test)
 *   node scripts/reprocess-images.mjs --dry-run  # clean + report, but DON'T overwrite
 *
 * Run from the project root. Reads credentials from .env.local automatically.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
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
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const NANO_KEY = env.NANO_BANANA_API_KEY;
const NANO_MODEL = env.NANO_BANANA_MODEL || "gemini-3-pro-image";
const CATHERINE_USER_ID = env.NEXT_PUBLIC_CATHERINE_USER_ID ?? "00000000-0000-0000-0000-000000000001";
const BUCKET = "wardrobe-photos";

if (!SUPABASE_URL || !SERVICE_KEY || !NANO_KEY) {
  console.error("❌  Missing env vars in .env.local (need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NANO_BANANA_API_KEY)");
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const PROCESS_TIMEOUT_MS = 90_000;
const MAX_INPUT_DIM = 1568;

// Kept verbatim in sync with WARDROBE_CLEANUP_PROMPT in lib/nano-banana.ts.
const WARDROBE_CLEANUP_PROMPT =
  "Remove the background and place the garment on a clean, seamless white studio surface. " +
  "Smooth out any wrinkles and creases, and even out the lighting so the piece looks like a " +
  "clean, professional catalog product photo. Keep the garment's colors, pattern, shape, and " +
  "proportions exactly accurate — do not restyle, recolor, crop, or add any new elements. " +
  "Show only this single garment, centered on the white surface.";

function toMime(img, mimeType) {
  if (mimeType === "image/png") return img.png().toBuffer();
  if (mimeType === "image/webp") return img.webp({ quality: 90 }).toBuffer();
  return img.jpeg({ quality: 90 }).toBuffer();
}

/** Send one image to Nano Banana. Returns the cleaned Buffer, or THROWS on any
 *  failure so the caller logs+skips the item (and never overwrites a good
 *  original with an un-cleaned recompression). */
async function cleanImage(imageBuffer, mimeType) {
  const inMime =
    mimeType === "image/png" || mimeType === "image/webp" ? mimeType : "image/jpeg";

  let sendBuffer = imageBuffer;
  try {
    const meta = await sharp(imageBuffer).metadata();
    if ((meta.width ?? 0) > MAX_INPUT_DIM || (meta.height ?? 0) > MAX_INPUT_DIM) {
      sendBuffer = await toMime(
        sharp(imageBuffer).resize({
          width: MAX_INPUT_DIM,
          height: MAX_INPUT_DIM,
          fit: "inside",
          withoutEnlargement: true,
        }),
        inMime
      );
    }
  } catch {
    sendBuffer = imageBuffer;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROCESS_TIMEOUT_MS);
  try {
    const res = await fetch(`${GEMINI_BASE}/${NANO_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": NANO_KEY },
      signal: ac.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: WARDROBE_CLEANUP_PROMPT },
              { inline_data: { mime_type: inMime, data: sendBuffer.toString("base64") } },
            ],
          },
        ],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Nano Banana API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
    const b64 = imgPart?.inlineData?.data ?? imgPart?.inline_data?.data;
    if (!b64) {
      throw new Error(`no image in response${data?.error?.message ? ` (${data.error.message})` : ""}`);
    }

    const genBuffer = Buffer.from(b64, "base64");
    try {
      return await toMime(sharp(genBuffer), inMime);
    } catch {
      return genBuffer;
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the storage object path out of a public Supabase Storage URL.
 *  .../object/public/wardrobe-photos/<uid>/<file>  →  <uid>/<file> */
function storagePathFromUrl(url) {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

function mimeFromPath(path, fallback) {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  return fallback || "image/jpeg";
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🍌  Nano Banana batch reprocess${DRY_RUN ? "  (DRY RUN — no overwrites)" : ""}`);
  console.log(`    model: ${NANO_MODEL}\n`);

  const { data: items, error } = await supabase
    .from("wardrobe_items")
    .select("id,name,photo_url")
    .eq("user_id", CATHERINE_USER_ID)
    .not("photo_url", "is", null)
    .order("id", { ascending: true });

  if (error) {
    console.error("❌  Could not query wardrobe_items:", error.message);
    process.exit(1);
  }

  const queue = items.slice(0, LIMIT);
  const total = queue.length;
  console.log(`Found ${items.length} item(s) with a photo${Number.isFinite(LIMIT) ? `, processing first ${total}` : ""}.\n`);

  const failures = [];
  let done = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const label = item.name || "(unnamed)";
    process.stdout.write(`Processing item ${i + 1} of ${total}: ${label}... `);

    try {
      const path = storagePathFromUrl(item.photo_url);
      if (!path) throw new Error(`couldn't parse storage path from ${item.photo_url}`);

      const dl = await fetch(item.photo_url);
      if (!dl.ok) throw new Error(`download failed (${dl.status})`);
      const mimeType = mimeFromPath(path, dl.headers.get("content-type") ?? undefined);
      const original = Buffer.from(await dl.arrayBuffer());

      const cleaned = await cleanImage(original, mimeType);

      if (DRY_RUN) {
        console.log(`cleaned ✓ (dry run, ${(cleaned.length / 1024).toFixed(0)} KB, not uploaded)`);
        done++;
        continue;
      }

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, cleaned, { contentType: mimeType, upsert: true, cacheControl: "3600" });
      if (upErr) throw new Error(`upload failed: ${upErr.message}`);

      console.log("done ✓");
      done++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`SKIPPED ✗  (${msg})`);
      failures.push({ id: item.id, name: label, error: msg });
    }
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`✅  Cleaned ${done}/${total}${DRY_RUN ? " (dry run)" : ""}.`);
  if (failures.length) {
    console.log(`⚠️   ${failures.length} skipped:`);
    for (const f of failures) console.log(`     • ${f.name} [${f.id}] — ${f.error}`);
  }
  if (!DRY_RUN && done > 0) {
    console.log(
      `\nℹ️   Images were overwritten in place at the same URLs. Supabase's CDN /` +
      ` the /render/image/ thumbnail transform may serve cached originals for a` +
      ` short while before refreshing.`
    );
  }
  console.log("");
}

main().catch((err) => {
  console.error("\n❌  Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
