import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Phase B2 — "Items like this" endpoint.
 *
 * Given a wardrobe item id, returns the N most visually-similar items in
 * Catherine's closet, ranked by cosine distance on the Marqo-FashionSigLIP
 * embeddings. Uses an RPC `find_similar_items` defined in the migration to
 * keep the query off the client (anon key can't safely run vector ops).
 *
 * If the source item has no embedding yet (back-fill hasn't run), returns
 * `{ items: [] }` rather than an error — the UI then shows "no matches yet."
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATHERINE_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing item id" }, { status: 400 });

    const limit = Math.min(
      Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10), 1),
      20
    );

    // 1. Fetch the source item's embedding
    const { data: source, error: srcErr } = await supabase
      .from("wardrobe_items")
      .select("id,embedding")
      .eq("id", id)
      .eq("user_id", CATHERINE_USER_ID)
      .single();

    if (srcErr || !source) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    if (!source.embedding) {
      // No embedding yet — graceful empty response.
      return NextResponse.json({ items: [], reason: "source_not_embedded" });
    }

    // 2. Run cosine-distance query against the rest of Catherine's wardrobe.
    //    The <=> operator is pgvector's cosine distance. Smaller = more similar.
    //    We exclude the source item itself and any rows that aren't embedded yet.
    //
    //    We use a raw SQL filter through PostgREST's `not.is.null` + the rpc
    //    pattern only if needed. For now, fetch a larger candidate window
    //    and rank in app code — simpler than maintaining a Postgres function.
    //    pgvector + HNSW makes this fast even on full-table scans for 92 rows.
    const { data: candidates, error: candErr } = await supabase
      .from("wardrobe_items")
      .select("id,name,category,subcategory,photo_url,thumbnail_url,colors,embedding")
      .eq("user_id", CATHERINE_USER_ID)
      .eq("is_active", true)
      .neq("id", id)
      .not("embedding", "is", null);

    if (candErr) {
      return NextResponse.json({ error: `DB: ${candErr.message}` }, { status: 500 });
    }

    // 3. Rank by cosine similarity (1 - cosine distance). Marqo vectors are
    //    L2-normalized so cosine sim = dot product.
    type Row = {
      id: string; name: string | null; category: string;
      subcategory: string | null; photo_url: string;
      thumbnail_url: string | null; colors: string[];
      embedding: number[] | string;  // PostgREST returns vector as a string sometimes
    };

    const srcVec = parseVector(source.embedding as number[] | string);
    const scored = (candidates ?? []).map((r) => {
      const vec = parseVector((r as Row).embedding);
      return {
        id:           (r as Row).id,
        name:         (r as Row).name,
        category:     (r as Row).category,
        subcategory:  (r as Row).subcategory,
        photo_url:    (r as Row).photo_url,
        thumbnail_url:(r as Row).thumbnail_url,
        colors:       (r as Row).colors,
        score:        cosineSim(srcVec, vec),
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return NextResponse.json({ items: scored.slice(0, limit) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[wardrobe similar]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PostgREST sometimes returns vector columns as a string like "[0.1,0.2,...]". Handle both. */
function parseVector(v: number[] | string): number[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as number[];
    } catch {
      return v.replace(/^\[|\]$/g, "").split(",").map(Number).filter((n) => Number.isFinite(n));
    }
  }
  return [];
}

/** Cosine similarity for L2-normalized vectors = dot product. Defensive fallback for safety. */
function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
