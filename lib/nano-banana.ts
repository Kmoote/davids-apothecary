/**
 * Nano Banana image processing — Phase 1 (image cleanup at upload).
 *
 * "Nano Banana" is Google's codename for the Gemini image-generation/editing
 * model family. The `NANO_BANANA_API_KEY` in .env.local / Netlify is a Google
 * Gemini API key (AQ.* format), so this talks to the official Gemini REST API
 * (generativelanguage.googleapis.com) — NOT the third-party nananobanana.com
 * wrapper (which uses nb_* keys and only accepts image URLs). The Gemini API
 * takes and returns inline base64, which is what we want for a Buffer in /
 * Buffer out contract.
 *
 * Phase 2 (future) — virtual try-on with Catherine as a reference body — is an
 * evolution of this same call: add her reference photo as a second image part.
 * See the architect-memory "Photo processing" decision (2026-06-08).
 *
 * Failure mode: ANY error (missing key, API failure, timeout, no image in the
 * response) returns the ORIGINAL buffer unchanged, so an upload never fails just
 * because the cleanup step did. The cleaned image is a nice-to-have, never a
 * gate.
 *
 * NOTE: scripts/reprocess-images.mjs reimplements this logic standalone (plain
 * Node can't import a .ts lib, same as scripts/bulk-tag.mjs duplicates the
 * TAGGER_PROMPT). Keep the prompt + request shape in sync between the two.
 */

import sharp from "sharp";

/** The Gemini image model. Override via env to swap to the cheaper/faster
 *  `gemini-2.5-flash-image` if Gemini 3 Pro latency/cost becomes a problem. */
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || "gemini-3-pro-image";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Generous — Gemini 3 Pro image generation routinely takes 10–30s. */
const PROCESS_TIMEOUT_MS = 90_000;

/** Downscale anything wider than this before sending. iPhone originals are
 *  5–9 MB / ~4000px; base64 inflates ~33% and the API is slower + pricier on
 *  huge inputs. 1568px is plenty for catalog-style cleanup. */
const MAX_INPUT_DIM = 1568;

/** The cleanup instruction. Kept verbatim in scripts/reprocess-images.mjs. */
export const WARDROBE_CLEANUP_PROMPT =
  "Remove the background and place the garment on a clean, seamless white studio surface. " +
  "Smooth out any wrinkles and creases, and even out the lighting so the piece looks like a " +
  "clean, professional catalog product photo. Orient the garment so it is upright as it would " +
  "be worn — neckline/collar/top at the top, hem/cuffs/bottom at the bottom (for shoes, soles " +
  "down and toes pointing forward). Keep the garment's colors, pattern, shape, and proportions " +
  "exactly accurate — do not restyle, recolor, crop, or add any new elements. " +
  "Show only this single garment, centered on the white surface.";

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string };
};

/** sharp output formatter that mirrors the input mime type, so the caller's
 *  existing extension / contentType logic stays valid. Defaults to jpeg. */
function toMime(img: sharp.Sharp, mimeType: string): Promise<Buffer> {
  if (mimeType === "image/png") return img.png().toBuffer();
  if (mimeType === "image/webp") return img.webp({ quality: 90 }).toBuffer();
  return img.jpeg({ quality: 90 }).toBuffer();
}

/**
 * Clean up a wardrobe photo via Nano Banana (Gemini image editing): remove the
 * background, place the garment on a clean white surface, smooth wrinkles, and
 * even out lighting.
 *
 * @param imageBuffer raw image bytes (e.g. from an upload or a download)
 * @param mimeType    the input mime type ("image/jpeg" | "image/png" | "image/webp")
 * @returns the cleaned image as a Buffer in the SAME mime type as the input,
 *          or the ORIGINAL buffer unchanged if anything goes wrong.
 */
export async function processWardrobeImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<Buffer> {
  const apiKey = process.env.NANO_BANANA_API_KEY;
  if (!apiKey) {
    console.warn("[nano-banana] NANO_BANANA_API_KEY not set — returning original image");
    return imageBuffer;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROCESS_TIMEOUT_MS);
  try {
    // Normalize mime to one Gemini accepts, and downscale very large inputs.
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
      // sharp couldn't read it — send the original bytes as-is.
      sendBuffer = imageBuffer;
    }

    const res = await fetch(`${GEMINI_BASE}/${NANO_BANANA_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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
      console.warn(`[nano-banana] API ${res.status} ${res.statusText} — returning original. ${body.slice(0, 300)}`);
      return imageBuffer;
    }

    const data = (await res.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
    const b64 = imgPart?.inlineData?.data ?? imgPart?.inline_data?.data;

    if (!b64) {
      console.warn("[nano-banana] no image in response — returning original.",
        data.error?.message ? `(${data.error.message})` : "");
      return imageBuffer;
    }

    // Re-encode the generated image (Gemini returns PNG) back into the input's
    // mime type so the caller's storage extension / contentType stays correct.
    const genBuffer = Buffer.from(b64, "base64");
    try {
      return await toMime(sharp(genBuffer), inMime);
    } catch {
      // If sharp can't re-encode the result, hand back the raw generated bytes.
      return genBuffer;
    }
  } catch (err) {
    console.warn("[nano-banana] processing threw — returning original:",
      err instanceof Error ? err.message : String(err));
    return imageBuffer;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether Nano Banana processing is configured in this environment. */
export function isNanoBananaConfigured(): boolean {
  return Boolean(process.env.NANO_BANANA_API_KEY);
}
