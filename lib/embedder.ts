/**
 * Embedder client — Phase B2.
 *
 * Thin wrapper around the Modal-hosted Marqo-FashionSigLIP worker. Returns
 * a 768-dim L2-normalized vector for a single image or text query.
 *
 * The model itself lives in workers/marqo-embedder/ — see that folder's
 * README for deploy + env-var setup. This file just makes the HTTP call.
 *
 * Failure mode: returns null on any error. Callers should treat null as
 * "embedding not produced this round" and persist nothing — the column is
 * nullable and consumers degrade gracefully.
 */

const EMBED_TIMEOUT_MS = 30_000;

export type Embedding = number[];

function getConfig(): { imageUrl: string; textUrl: string; secret: string } | null {
  const imageUrl = process.env.MARQO_EMBEDDER_URL;
  const textUrl  = process.env.MARQO_EMBEDDER_TEXT_URL ?? "";
  const secret   = process.env.MARQO_EMBEDDER_SECRET;
  if (!imageUrl || !secret) return null;
  return { imageUrl, textUrl, secret };
}

async function postWithTimeout(url: string, secret: string, body: unknown): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), EMBED_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-secret": secret },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Embed a single image. Returns null if the embedder isn't configured or
 * if the call fails — callers should treat null as "skip persistence."
 */
export async function embedImage(base64: string): Promise<Embedding | null> {
  const cfg = getConfig();
  if (!cfg) {
    console.warn("[embedder] MARQO_EMBEDDER_URL or MARQO_EMBEDDER_SECRET not set — embedding skipped");
    return null;
  }
  try {
    const res = await postWithTimeout(cfg.imageUrl, cfg.secret, { image_b64: base64 });
    if (!res.ok) {
      console.warn(`[embedder] image embed failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json() as { embedding?: unknown; dim?: number };
    if (!Array.isArray(data.embedding) || data.embedding.length !== 768) {
      console.warn("[embedder] image embed returned wrong shape:", data);
      return null;
    }
    return data.embedding as Embedding;
  } catch (err) {
    console.warn("[embedder] image embed threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Embed a free-text query. Used for future image-text similarity (e.g.
 * matching Catherine's Pinterest captions to her closet). Returns null if
 * MARQO_EMBEDDER_TEXT_URL isn't configured.
 */
export async function embedText(text: string): Promise<Embedding | null> {
  const cfg = getConfig();
  if (!cfg || !cfg.textUrl) {
    console.warn("[embedder] MARQO_EMBEDDER_TEXT_URL not set — text embed skipped");
    return null;
  }
  try {
    const res = await postWithTimeout(cfg.textUrl, cfg.secret, { text });
    if (!res.ok) {
      console.warn(`[embedder] text embed failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json() as { embedding?: unknown };
    if (!Array.isArray(data.embedding) || data.embedding.length !== 768) {
      console.warn("[embedder] text embed returned wrong shape:", data);
      return null;
    }
    return data.embedding as Embedding;
  } catch (err) {
    console.warn("[embedder] text embed threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Whether the embedder is configured in this environment. */
export function isEmbedderConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Postgres vector literal format: '[0.1,0.2,...]' (no spaces).
 * Use when sending the vector to Supabase via REST — the supabase-js client
 * accepts numbers[] directly for vector columns, but if we ever build a raw
 * SQL path we'll need this.
 */
export function toPgVectorLiteral(v: Embedding): string {
  return `[${v.join(",")}]`;
}
