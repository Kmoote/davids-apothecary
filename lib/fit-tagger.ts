/**
 * Fit-Inference Tagger — Phase B1b.
 *
 * A second vision pass that runs *after* the recognition Tagger. Same photo,
 * different job: instead of "what is this item?" it answers "how will this
 * lay on Catherine's body?" The output is a small JSON we store in
 * wardrobe_items.fit_inference, and a one-sentence fit_note_for_catherine
 * that the Stylist quotes verbatim or reasons against when composing looks.
 *
 * Cost: ~$0.005–0.012 per item on Sonnet 4.6. Cheap enough to back-fill all
 * 92 existing items for ~$1 total.
 *
 * Why separate from the recognition Tagger:
 *  - Recognition doesn't need to know whose closet it is.
 *  - Fit-inference needs Catherine's body context, which would bloat the
 *    recognition prompt unnecessarily.
 *  - If Catherine updates her measurements, we can refresh fit-inference
 *    alone without re-running recognition.
 *  - Either side can swap models (e.g. Haiku for recognition, Sonnet for
 *    fit) without touching the other.
 */

import Anthropic from "@anthropic-ai/sdk";

// ── types ─────────────────────────────────────────────────────────────────────

export type FitInference = {
  silhouette?: string;
  ease_1to5?: number;
  drape_stiffness_1to5?: number;
  estimated_fabric_weight?: "light" | "medium" | "heavy";
  length_category?: string | null;
  neckline?: string | null;
  sleeve?: string | null;
  body_zones_emphasized?: string[];
  confidence?: "low" | "medium" | "high";
  fit_note_for_catherine?: string;
};

/**
 * Lightweight body-context summary used in the fit-inference prompt.
 * Pulled from user_preferences. Only fields relevant to FIT reasoning
 * (skip style sliders, color preferences, etc — those belong on the
 * Stylist side, not the per-item fit tagger).
 */
export type FitBodyContext = {
  height: string | null;
  body_shape: string | null;
  waist_size: string | null;
  cup_size: string | null;
  weight: string | null;
  // Phase B1a — self-measured tape measurements (inches)
  shoulder_in: number | null;
  bust_in: number | null;
  hip_in: number | null;
  inseam_in: number | null;
  // Free-text fit history
  tops_that_fit: string | null;
  tops_that_almost_fit: string | null;
  bottoms_that_fit: string | null;
  bottoms_that_almost_fit: string | null;
};

// ── helpers ───────────────────────────────────────────────────────────────────

/** Render Catherine's body context as a short paragraph for the system prompt. */
export function buildFitBodyContext(ctx: FitBodyContext | null): string {
  if (!ctx) return "Catherine's body details are not yet in the profile.";

  const parts: string[] = [];

  // Physical
  const phys = [
    ctx.height       && `${ctx.height} tall`,
    ctx.body_shape   && `${ctx.body_shape.toLowerCase()} body shape`,
    ctx.weight       && `weight ${ctx.weight}`,
  ].filter(Boolean);
  if (phys.length) parts.push(phys.join(", "));

  // Sizes
  const sizes = [
    ctx.waist_size && `waist ${ctx.waist_size}`,
    ctx.cup_size   && `bust ${ctx.cup_size}`,
  ].filter(Boolean);
  if (sizes.length) parts.push(sizes.join(", "));

  // Tape measurements (Phase B1a)
  const tape = [
    ctx.shoulder_in != null && `shoulder ${ctx.shoulder_in}"`,
    ctx.bust_in     != null && `bust ${ctx.bust_in}"`,
    ctx.hip_in      != null && `hip ${ctx.hip_in}"`,
    ctx.inseam_in   != null && `inseam ${ctx.inseam_in}"`,
  ].filter(Boolean);
  if (tape.length) parts.push(`tape: ${tape.join(", ")}`);

  // Fit history (what works / what doesn't)
  const fitHistory = [
    ctx.tops_that_fit           && `tops that work — ${ctx.tops_that_fit}`,
    ctx.tops_that_almost_fit    && `tops that don't quite work — ${ctx.tops_that_almost_fit}`,
    ctx.bottoms_that_fit        && `bottoms that work — ${ctx.bottoms_that_fit}`,
    ctx.bottoms_that_almost_fit && `bottoms that don't quite work — ${ctx.bottoms_that_almost_fit}`,
  ].filter(Boolean);
  if (fitHistory.length) parts.push(fitHistory.join("; "));

  return parts.length ? parts.join(". ") + "." : "Catherine's body details are minimal.";
}

// ── prompt ────────────────────────────────────────────────────────────────────

/**
 * The fit-inference prompt. David's voice; Catherine's body in context.
 * Returns ONLY JSON — same constraint as the recognition Tagger.
 */
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
  "length_category": one of "cropped" | "regular" | "long" | "above-knee" | "knee" | "midi" | "maxi" | "ankle" or null if not a length-relevant garment (shoes, accessories, scarves),
  "neckline": short descriptor like "crew", "v-neck", "scoop", "boat", "halter", "collared", "off-shoulder" — or null if not a top/dress,
  "sleeve": short descriptor like "sleeveless", "short", "3/4", "long", "cap", "bell" — or null if not a top/dress,
  "body_zones_emphasized": array from "shoulders" | "bust" | "waist" | "hips" | "legs" | "neckline" | "back" (which body zones this piece draws the eye to),
  "confidence": one of "low" | "medium" | "high" (your own certainty in this fit reasoning — say "low" when the photo is ambiguous or you can't see the construction clearly),
  "fit_note_for_catherine": 1–2 sentences in your voice (David's), spoken TO Catherine, telling her specifically how this piece is likely to lay on HER body given her measurements and shape. Reference concrete things — length, drape, where it sits, where it floats. Warm and honest. About 20–35 words.
}

If the garment is shoes, accessories, or anything where most of these fields don't apply, fill what you can and set the others to null. The fit_note_for_catherine should still say something useful — for shoes, comment on heel height / silhouette / how they affect a leg line; for bags, comment on proportion / how they sit; etc.`;

export function buildFitPrompt(bodyContextSummary: string): string {
  return `${FIT_SCHEMA_INSTRUCTIONS}

Catherine's body context (use this to reason about how this garment will lay on HER):
${bodyContextSummary}`;
}

// ── inference ─────────────────────────────────────────────────────────────────

/**
 * Run fit-inference on a single garment photo. Returns the parsed JSON or
 * null if the model output was unparseable.
 */
export async function inferFit(
  anthropic: Anthropic,
  args: {
    base64: string;
    mediaType: "image/jpeg" | "image/png" | "image/webp";
    bodyContext: FitBodyContext | null;
    model?: string;
  },
): Promise<FitInference | null> {
  const { base64, mediaType, bodyContext } = args;
  const model = args.model ?? "claude-sonnet-4-6";

  const bodySummary = buildFitBodyContext(bodyContext);

  const msg = await anthropic.messages.create({
    model,
    max_tokens: 600,
    system: FIT_SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text",  text: buildFitPrompt(bodySummary) },
      ],
    }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as FitInference;
    return parsed;
  } catch {
    return null;
  }
}

/** SELECT clause for the body-context columns. Keep in sync with FitBodyContext. */
export const FIT_BODY_CONTEXT_SELECT = [
  "height", "body_shape", "waist_size", "cup_size", "weight",
  "shoulder_in", "bust_in", "hip_in", "inseam_in",
  "tops_that_fit", "tops_that_almost_fit",
  "bottoms_that_fit", "bottoms_that_almost_fit",
].join(",");
