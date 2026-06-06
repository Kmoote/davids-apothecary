-- Phase B2 — pgvector + per-item visual embeddings
--
-- Enables Postgres' vector extension and adds a 768-dim embedding column
-- to wardrobe_items. Embeddings are produced by the Marqo-FashionSigLIP
-- model running on a Modal worker (see workers/marqo-embedder/) and
-- written via the recognition pipeline (retag route, bulk-tag.mjs).
--
-- Two items with similar embeddings look similar to a fashion-tuned eye:
-- silhouette, palette, fabric vibe, formality, era. We use cosine
-- distance for similarity queries.
--
-- Why dim=768: matches Marqo-FashionSigLIP's output. Same dim as OpenCLIP
-- ViT-L/14 and Jina-CLIP-v2, so the model is swappable later without a
-- schema migration. If we ever pick a 1024-dim model (e.g. Voyage's
-- multimodal-3), we'd need a fresh column + re-embed, so dim is a real
-- contract — defend it.
--
-- The HNSW index speeds "find the 5 closest embeddings" from a full table
-- scan to sub-millisecond. m=16, ef_construction=64 are pgvector's
-- recommended defaults for small/medium tables (~thousands of rows). Use
-- vector_cosine_ops because Marqo embeddings are L2-normalized — cosine
-- similarity is the right distance metric for them.
--
-- Safe to re-run: extension/column/index all guarded.

create extension if not exists vector;

alter table public.wardrobe_items
  add column if not exists embedding vector(768);

comment on column public.wardrobe_items.embedding is
  '768-dim visual embedding from Marqo-FashionSigLIP. L2-normalized so cosine distance is the right similarity metric. Null until the embedding worker runs against this item.';

-- HNSW index for fast nearest-neighbor queries
create index if not exists wardrobe_items_embedding_hnsw
  on public.wardrobe_items
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
