"""
Marqo-FashionSigLIP embedder, deployed on Modal.

Purpose
-------
Exposes an HTTPS endpoint that takes a clothing-item photo and returns a
768-dimension visual embedding. The Next.js app (David's Apothecary) calls
this from its API routes (retag, bulk-tag.mjs) and stores the result in
the wardrobe_items.embedding column (pgvector).

Why Modal
---------
- Scale to zero: pays nothing when idle, fires up only when called.
- Per-second pricing on a small T4 GPU = pennies/month at single-user volume.
- Python-first, so we can self-host a HuggingFace model with one file.
- Same infrastructure pattern will host Bria (Step 6) and SegFormer (Step 3)
  in future sessions — set up once, reuse for the rest of the pipeline.

Deploy (one-time, from this folder)
-----------------------------------
  pip install --upgrade modal
  modal token new                    # first time only — sign up + auth
  modal secret create marqo-embedder-secret SHARED_SECRET=<long-random-string>
  modal deploy app.py

After deploy, `modal app logs marqo-embedder` shows the live endpoint URL.
Copy it into Netlify env as MARQO_EMBEDDER_URL, and the secret into Netlify
as MARQO_EMBEDDER_SECRET. Also drop both into .env.local for local dev.

Endpoints
---------
  POST /embed_image  body: { "image_b64": <base64 string> }  -> { "embedding": [768 floats] }
  POST /embed_text   body: { "text": <string> }              -> { "embedding": [768 floats] }
  GET  /healthz                                              -> { "ok": true }

All endpoints require header `x-secret: <SHARED_SECRET>`. Reject otherwise.

Cost expectations
-----------------
- Cold start: ~10–20 s the first call after idle.
- Warm call: ~150–400 ms per image on T4.
- T4 pricing: ~$0.0001 per second on Modal — single-call cost < $0.001.
- Catherine's 92-item back-fill: under $0.20 total.
"""

import base64
import io
import os
from typing import Optional

import modal
# Modal 1.4.x doesn't re-export `modal.fastapi.Header`, so we import Header
# directly from fastapi. Modal bakes fastapi into the deploy container via
# `image.pip_install("fastapi[standard]==0.115.0")` below, but the CLI also
# parses this file locally before submitting it — meaning `fastapi` must be
# installed in modal's local venv too. If you see ModuleNotFoundError on
# fastapi during deploy, run:
#   ~/.local/pipx/venvs/modal/bin/pip install "fastapi[standard]==0.115.0"
from fastapi import Header


# ── Modal app + image ─────────────────────────────────────────────────────────

# Use modal Image to bake in deps + pre-download the model weights, so cold
# start doesn't pay the HF download time on every fresh container.
def _download_model():
    import open_clip
    open_clip.create_model_and_transforms("hf-hub:Marqo/marqo-fashionSigLIP")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "open_clip_torch==2.30.0",
        "torch==2.4.1",
        "torchvision==0.19.1",
        "pillow==10.4.0",
        "fastapi[standard]==0.115.0",
        "huggingface_hub==0.25.2",
        # SigLIP-family models in open_clip use HuggingFace's SentencePiece
        # tokenizer (via `from transformers import AutoTokenizer`), so the
        # tokenizer side of the model fails with ModuleNotFoundError on
        # `transformers` (and downstream `sentencepiece`) if these aren't
        # in the image. open_clip_torch does NOT pull them automatically.
        "transformers==4.45.2",
        "sentencepiece==0.2.0",
    )
    .run_function(_download_model)  # bakes weights into the image
)

app = modal.App("marqo-embedder", image=image)


# ── model holder (loaded once per container) ──────────────────────────────────

@app.cls(
    gpu="T4",
    scaledown_window=120,           # idle 2 min before scale-to-zero
    secrets=[modal.Secret.from_name("marqo-embedder-secret")],
    timeout=120,
)
class MarqoEmbedder:
    @modal.enter()
    def load(self):
        import open_clip
        import torch
        self.torch = torch
        # Load Marqo-FashionSigLIP — fashion-fine-tuned SigLIP, 768-dim.
        # Apache 2.0 license, free for commercial use.
        model, _, preprocess = open_clip.create_model_and_transforms(
            "hf-hub:Marqo/marqo-fashionSigLIP"
        )
        tokenizer = open_clip.get_tokenizer("hf-hub:Marqo/marqo-fashionSigLIP")
        self.model = model.eval().cuda()
        self.preprocess = preprocess
        self.tokenizer = tokenizer

    # ── image embedding ──
    @modal.method()
    def embed_image_b64(self, image_b64: str) -> list[float]:
        from PIL import Image
        raw = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        tensor = self.preprocess(img).unsqueeze(0).cuda()
        with self.torch.no_grad(), self.torch.cuda.amp.autocast():
            features = self.model.encode_image(tensor)
            features = features / features.norm(dim=-1, keepdim=True)  # L2 normalize
        return features[0].cpu().tolist()

    # ── text embedding (for future image-text similarity, eg pinterest match) ──
    @modal.method()
    def embed_text(self, text: str) -> list[float]:
        tokens = self.tokenizer([text]).cuda()
        with self.torch.no_grad(), self.torch.cuda.amp.autocast():
            features = self.model.encode_text(tokens)
            features = features / features.norm(dim=-1, keepdim=True)
        return features[0].cpu().tolist()


# ── HTTP endpoint ─────────────────────────────────────────────────────────────

@app.function(secrets=[modal.Secret.from_name("marqo-embedder-secret")])
@modal.fastapi_endpoint(method="POST", label="embed-image")
def embed_image_endpoint(
    body: dict,
    x_secret: Optional[str] = Header(default=None, alias="x-secret"),
):
    from fastapi import HTTPException
    expected = os.environ["SHARED_SECRET"]
    if x_secret != expected:
        raise HTTPException(status_code=401, detail="bad secret")
    image_b64 = body.get("image_b64")
    if not isinstance(image_b64, str) or not image_b64:
        raise HTTPException(status_code=400, detail="image_b64 required")
    vec = MarqoEmbedder().embed_image_b64.remote(image_b64)
    return {"embedding": vec, "dim": len(vec)}


@app.function(secrets=[modal.Secret.from_name("marqo-embedder-secret")])
@modal.fastapi_endpoint(method="POST", label="embed-text")
def embed_text_endpoint(
    body: dict,
    x_secret: Optional[str] = Header(default=None, alias="x-secret"),
):
    from fastapi import HTTPException
    expected = os.environ["SHARED_SECRET"]
    if x_secret != expected:
        raise HTTPException(status_code=401, detail="bad secret")
    text = body.get("text")
    if not isinstance(text, str) or not text:
        raise HTTPException(status_code=400, detail="text required")
    vec = MarqoEmbedder().embed_text.remote(text)
    return {"embedding": vec, "dim": len(vec)}


@app.function()
@modal.fastapi_endpoint(method="GET", label="healthz")
def healthz():
    return {"ok": True, "model": "Marqo/marqo-fashionSigLIP", "dim": 768}
