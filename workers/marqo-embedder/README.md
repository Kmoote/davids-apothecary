# marqo-embedder — Modal worker for visual embeddings

Self-contained Python service that exposes `Marqo-FashionSigLIP` over HTTPS. The Next.js app calls this from `lib/embedder.ts` whenever it needs a 768-dim visual fingerprint for a wardrobe item.

## One-time setup

You'll need a Modal account (free tier covers personal use easily) and the Modal CLI.

### Installing the Modal CLI on macOS

**Don't** use plain `pip install modal` on modern macOS — Homebrew's Python is "externally managed" (PEP 668) and refuses global installs. Use `pipx` instead, which handles the virtual-environment plumbing for you:

```bash
brew install pipx
pipx ensurepath               # adds ~/.local/bin to PATH
brew install rust             # needed because Modal's cbor2 dep builds from source on Python 3.13
pipx install modal
```

**Then close and reopen your terminal** so the PATH update takes effect.

Verify:

```bash
modal --version               # should print something like "1.4.3"
```

### Authenticate the CLI

```bash
modal token new               # opens browser, signs you in
```

Pick a long random string and call it the **shared secret**. This authenticates the Next.js app to the Modal endpoints (so randos can't run up Modal bills on us).

```bash
# pick something like a 32-char hex string — `openssl rand -hex 32` works
modal secret create marqo-embedder-secret SHARED_SECRET=<that-string>
```

## Deploy

From this folder:

```bash
modal deploy app.py
```

After ~2 minutes (longer first time — it bakes the model weights into the container image), Modal will print three live endpoint URLs:

```
✓ Created embed-image  =>  https://yourname--marqo-embedder-embed-image.modal.run
✓ Created embed-text   =>  https://yourname--marqo-embedder-embed-text.modal.run
✓ Created healthz      =>  https://yourname--marqo-embedder-healthz.modal.run
```

Quick smoke test:

```bash
curl https://yourname--marqo-embedder-healthz.modal.run
# {"ok":true,"model":"Marqo/marqo-fashionSigLIP","dim":768}
```

## Wire it into the Next.js app

Add to `.env.local` and to Netlify env vars:

```
MARQO_EMBEDDER_URL=https://yourname--marqo-embedder-embed-image.modal.run
MARQO_EMBEDDER_TEXT_URL=https://yourname--marqo-embedder-embed-text.modal.run
MARQO_EMBEDDER_SECRET=<the-same-shared-secret>
```

The text URL is optional — it's only used by future features (image-to-text similarity, e.g. matching Catherine's Pinterest pictures to her closet).

## Cost expectations

- **Cold start:** ~10–20 sec the very first call after idle.
- **Warm call:** ~150–400 ms on T4.
- **T4 GPU pricing on Modal:** ~$0.000167/sec.
- **Catherine's monthly bill:** likely < $1, possibly < $0.10 once warm.
- **Back-fill of all 92 existing items:** under $0.20 total.

## What to do if it breaks

- `modal app logs marqo-embedder` — full logs from your deployed worker.
- If you change `app.py`, just re-run `modal deploy app.py` — Modal handles the rolling update.
- If you want to nuke it: `modal app stop marqo-embedder` (charges stop immediately; redeploy any time).

## Why this isn't running on Netlify

Netlify Functions are CPU-only and time-bounded at 10s. Diffusion / vision models need GPU + a few hundred milliseconds of warm-up. Modal exists for exactly this gap: serverless GPU work that pays nothing when idle.

This same worker pattern will also host Bria RMBG-2.0 (Step 6 — background removal) and SegFormer (Step 3 — clothes-segmentation) in future sessions. The pattern is reusable; the auth pattern is reusable; the env-var pattern is reusable.
