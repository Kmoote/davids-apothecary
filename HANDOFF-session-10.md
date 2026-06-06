# Session 10 Handoff — Phase B2: Visual Embeddings (Marqo-FashionSigLIP + pgvector)

**Date:** 2026-05-24
**What shipped:** Every garment now gets a 768-dim "visual fingerprint" via Marqo-FashionSigLIP, stored as `pgvector` in Supabase. Wardrobe edit sheet shows the 5 most-similar items in Catherine's closet. This is the foundation that unlocks every one of her v1.2 asks (anchor-item Stylist, save outfit, regenerate, inspiration matching) without any new infra after this.

> **First time we're standing up infrastructure outside Netlify + Supabase.** A small Modal Python worker now runs the embedding model. Same worker pattern will host Bria (Step 6) and SegFormer (Step 3) later — set up once, reuse for the rest of the pipeline.

## Files this session

```
A supabase/migrations/20260518000003_phase_b2_embeddings.sql       (enable pgvector, embedding vector(768), HNSW index)
A workers/marqo-embedder/app.py                                    (Modal Python worker — Marqo on T4 GPU, scale-to-zero)
A workers/marqo-embedder/README.md                                 (deploy walkthrough)
A lib/embedder.ts                                                  (Next.js → Modal HTTP wrapper, returns 768-dim vector or null)
A app/api/wardrobe/[id]/similar/route.ts                           (GET — 5 nearest neighbors by cosine, server-side rank)
M app/api/wardrobe/[id]/retag/route.ts                             (+ best-effort embedding call after fit-inference)
M scripts/bulk-tag.mjs                                             (+ --with-embed and --embed-only flags + runEmbedOnly())
M app/(app)/wardrobe/page.tsx                                      (+ "Items Like This" horizontal thumbnail row in edit sheet, fetches on open)
```

`tsc --noEmit` clean. `node --check scripts/bulk-tag.mjs` clean.

## Deploy steps (in order — read all the way through first)

The Modal piece is **a one-time setup**. After it's done, every subsequent push is a normal `git push origin main`.

### 1. Deploy the Modal worker (one-time, ~15 min)

From this repo root:

```bash
cd workers/marqo-embedder

# install Modal CLI if you don't have it
pip install --upgrade modal

# first time only — opens browser to sign in / sign up
modal token new

# pick a long random string (this authenticates the Next.js app to Modal)
# `openssl rand -hex 32` gives a good one
modal secret create marqo-embedder-secret SHARED_SECRET=<your-random-string>

# the actual deploy — first run is slow (~5 min) because it bakes Marqo weights into the container
modal deploy app.py
```

Modal prints three URLs at the end. Copy the **embed-image** one — looks like:

```
https://<your-name>--marqo-embedder-embed-image.modal.run
```

Smoke test:

```bash
curl https://<your-name>--marqo-embedder-healthz.modal.run
# {"ok":true,"model":"Marqo/marqo-fashionSigLIP","dim":768}
```

### 2. Add three env vars to `.env.local` AND Netlify

```
MARQO_EMBEDDER_URL=https://<your-name>--marqo-embedder-embed-image.modal.run
MARQO_EMBEDDER_TEXT_URL=https://<your-name>--marqo-embedder-embed-text.modal.run
MARQO_EMBEDDER_SECRET=<the-random-string-from-step-1>
```

Netlify: Site Settings → Environment Variables → Add. Trigger a redeploy after.

### 3. Apply the migration in Supabase Studio

- SQL Editor → New Query
- Paste `supabase/migrations/20260518000003_phase_b2_embeddings.sql`
- Run. Should report "Success. No rows returned."
- Verify: `select column_name from information_schema.columns where table_name='wardrobe_items' and column_name='embedding';` — should return one row.

### 4. Commit + push from your terminal

```bash
git add -A
git commit -m "feat(wardrobe): phase B2 — Marqo embeddings, pgvector, similar-items"
git push origin main
```

GitHub Actions deploys in ~2 minutes.

### 5. Back-fill all 92 items with embeddings

```bash
node scripts/bulk-tag.mjs --embed-only
```

Takes ~5–8 minutes (Modal cold start the first call, then ~0.3 sec per item). Cost: under $0.20 total.

### 6. Smoke test the live app

- Open https://davids-apothecary.netlify.app/wardrobe.
- Tap any item to open the edit sheet.
- New "Items Like This" row sits between David's fit reading and Catherine's fit note input.
- Expect 5 thumbnails of visually-similar items from her closet.
- For items where the back-fill hasn't run yet, the empty state says "tap Re-tag with David."

## What this unlocks

The embedding column is the foundation. From here, future sessions get cheap features without new infrastructure:

| Future feature | What it needs (now that B2 is in place) |
|---|---|
| Anchor-item Stylist ("build around this shirt") | `find_similar` against the anchor's vector, filter Stylist candidate pool by it |
| Save-an-outfit and "more like this outfit" | Average the outfit's item vectors → one "outfit vector" stored on the look |
| Regenerate after rejecting all 3 looks | Penalize candidates near rejected-look vectors, sample from further-away neighbors |
| Inspiration matching ("here's a Pinterest pic, find my closest") | Embed the inspiration image via same endpoint → cosine query against wardrobe |
| Duplicate detection on upload | Compute embedding, alert if cosine > 0.95 against any existing item |
| Text search ("show me boho dresses") | Use `/embed/text` endpoint, query against wardrobe vectors |

None of those need new infrastructure. They're SQL queries on top of the new column.

## What this does NOT do yet

- The Stylist (David, in `generate-looks`) does NOT yet use embeddings to filter candidates. He still uses category/occasion/season filters. Adding embedding-based filtering is its own session's work — the foundation is in place.
- Catherine cannot tap a similar-item thumbnail to navigate to it (read-only display for v1).
- No image-text similarity yet (the text-embedding endpoint exists, but no UI consumes it).
- The Modal worker has zero rate limiting and basic auth only. Fine for personal use; tighten before opening to others.

## Cost expectations (single-user volume)

| Operation | Cost |
|---|---|
| Embedding one image (warm) | ~$0.0001 |
| Embedding one image (cold start, first call after 2 min idle) | ~$0.003 (eats ~15s of GPU warm-up) |
| Back-fill 92 items | < $0.20 total |
| Catherine's monthly Modal bill | Almost certainly < $1, likely < $0.10 |
| Supabase pgvector + HNSW index | $0 incremental (within the existing project's free tier easily) |

## What I'd skip if scaling up later

- The HNSW index params (m=16, ef_construction=64) are good for thousands of rows. If wardrobe ever grew past ~50k items per user, bump `ef_construction` to 128–200 for better recall.
- The similar-items endpoint currently fetches all candidates and ranks in app code (~150 rows max). At 10k+ rows, switch to a Postgres function using `<=>` directly with a `LIMIT 5` — sub-millisecond instead of the current ~20ms.
- The text-embedding endpoint is wired but unused. When the first text feature lands (Pinterest matching, "show me X" text search), this is already deployed.

## Where we are on the 7-step plan

✅ Step 1 — Tape measurements (B1a)
✅ Step 2 — VLM fit-inference Tagger (B1b)
⏸ Step 3 — SegFormer pre-crop (deferred — recognition is already good enough)
✅ Step 4 — Marqo embeddings + pgvector (B2) ← **this session**
⏸ Step 5 — FASHN try-on MVP
⏸ Step 6 — Bria RMBG-2.0 canonical photos
⏸ Step 7 — Auth + RLS + cost cap (do before second user)

Next likely session: **Step 5 (FASHN try-on)** — the most visible "wow" feature. Or jump to actually using embeddings in the Stylist (anchor-item, regenerate) since the foundation is in place and Catherine's v1.2 asks have been waiting.

## Defending the architecture next session

The reason this pipeline now genuinely compounds — and why a swap of any single piece doesn't break the rest:

```
Photo upload → (recognition tagger) → tags
            → (fit-inference tagger) → fit_inference JSONB
            → (Marqo embedder)       → embedding vector(768)
                                        ↓
                              pgvector queries (anchor, similar, dedup, inspiration)
                                        ↓
                              Stylist (David) sees: tags + fit_note + future embedding filters
```

The seams are: **tags shape** (jsonb), **fit_inference shape** (jsonb), **embedding dimension** (768). All three are versionable without touching downstream code. Defend them. If a future model is, say, 1024-dim, that's a fresh column + re-embed, not a schema shift.
