"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { DALogo } from "@/components/DALogo";
import { DavidAvatar } from "@/components/DavidBubble";

type TaggedItem = {
  id: string;
  name: string | null;
  category: string;
  colors: string[];
  photo_url: string;
  occasion_tags: string[];
};

type UploadState =
  | { status: "idle" }
  | { status: "previewing"; file: File; previewUrl: string }
  | { status: "uploading" }
  | { status: "done"; item: TaggedItem }
  | { status: "error"; message: string };

/** Compress an image file client-side to keep payloads small. */
async function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(new File([blob!], file.name, { type: "image/jpeg" })),
        "image/jpeg",
        quality
      );
    };
    img.src = url;
  });
}

export default function UploadPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [name, setName] = useState("");

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setState({ status: "previewing", file, previewUrl });
  };

  const onUpload = async () => {
    if (state.status !== "previewing") return;
    setState({ status: "uploading" });

    try {
      const compressed = await compressImage(state.file);
      const fd = new FormData();
      fd.append("photo", compressed);
      if (name.trim()) fd.append("name", name.trim());

      const res = await fetch("/api/tag-item", { method: "POST", body: fd });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setState({ status: "done", item: json.item });
      setName("");
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  };

  const reset = () => {
    setState({ status: "idle" });
    setName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      className="flex flex-col bg-cream"
      style={{ minHeight: "100dvh", maxWidth: 390, margin: "0 auto" }}
    >
      {/* header */}
      <div
        className="relative texture flex items-center gap-3 shrink-0"
        style={{ background: "#2a2520", padding: "14px 18px" }}
      >
        <button
          onClick={() => router.push("/wardrobe")}
          style={{
            width: 32, height: 32, borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, color: "#faf7f2", lineHeight: 1, flexShrink: 0,
          }}
        >
          ‹
        </button>
        <div>
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase" }}>
            Add to Wardrobe
          </p>
          <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: "#faf7f2" }}>
            New piece
          </p>
        </div>
      </div>

      <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── idle / previewing ── */}
        {(state.status === "idle" || state.status === "previewing") && (
          <>
            {/* photo area */}
            {state.status === "idle" ? (
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  width: "100%", aspectRatio: "4/3",
                  border: "2px dashed #c4a882",
                  borderRadius: 16, background: "rgba(196,168,130,0.06)",
                  cursor: "pointer", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 10,
                }}
              >
                <span style={{ fontSize: 32, opacity: 0.5 }}>📷</span>
                <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#8a7a6a", fontWeight: 500 }}>
                  Tap to choose a photo
                </p>
                <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 11, color: "#8a7a6a", opacity: 0.7 }}>
                  Camera or photo library
                </p>
              </button>
            ) : (
              <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", aspectRatio: "4/3" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.previewUrl}
                  alt="Preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <button
                  onClick={reset}
                  style={{
                    position: "absolute", top: 10, right: 10,
                    width: 30, height: 30, borderRadius: "50%",
                    background: "rgba(42,37,32,0.6)", border: "none",
                    color: "#faf7f2", cursor: "pointer", fontSize: 14,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* hidden file input — accept images, open camera on mobile */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFileChange}
              style={{ display: "none" }}
            />

            {/* optional name */}
            {state.status === "previewing" && (
              <div>
                <label style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 10, color: "#8a7a6a", letterSpacing: "0.1em", fontWeight: 500, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Navy Blazer"
                  style={{
                    width: "100%", borderRadius: 24,
                    border: "1px solid rgba(42,37,32,0.18)",
                    padding: "12px 16px", fontSize: 14,
                    fontFamily: "var(--font-jost), sans-serif",
                    background: "#f5f0e8", color: "#2a2520",
                    outline: "none",
                  }}
                />
                <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 10.5, color: "#8a7a6a", marginTop: 5 }}>
                  David will suggest one if you leave this blank.
                </p>
              </div>
            )}

            {/* upload button */}
            {state.status === "previewing" && (
              <button
                onClick={onUpload}
                style={{
                  width: "100%", borderRadius: 12, padding: "15px 0",
                  border: "none", background: "#2a2520",
                  color: "#faf7f2", fontFamily: "var(--font-jost), sans-serif",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Let David tag this →
              </button>
            )}
          </>
        )}

        {/* ── uploading ── */}
        {state.status === "uploading" && (
          <div style={{ padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <DavidAvatar size={40} />
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`dot-${i + 1}`} style={{ width: 7, height: 7, borderRadius: "50%", background: "#c4a882", display: "inline-block" }} />
              ))}
            </div>
            <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#8a7a6a", textAlign: "center" }}>
              David is having a look…
            </p>
          </div>
        )}

        {/* ── done ── */}
        {state.status === "done" && (
          <div className="fade-up flex flex-col gap-4">
            {/* photo */}
            <div style={{ borderRadius: 16, overflow: "hidden", aspectRatio: "4/3" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.item.photo_url}
                alt={state.item.name ?? ""}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>

            {/* tag result */}
            <div style={{
              background: "#f5f0e8", border: "1px solid rgba(42,37,32,0.12)",
              borderRadius: 14, padding: "14px 16px",
            }}>
              <div className="flex items-start gap-2.5">
                <DavidAvatar size={26} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 18, color: "#2a2520", marginBottom: 4 }}>
                    {state.item.name ?? state.item.category}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span style={{ fontSize: 10, fontFamily: "var(--font-jost), sans-serif", fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "#2a2520", color: "#faf7f2", letterSpacing: "0.04em" }}>
                      {state.item.category}
                    </span>
                    {state.item.occasion_tags.slice(0, 3).map((t) => (
                      <span key={t} style={{ fontSize: 10, fontFamily: "var(--font-jost), sans-serif", fontWeight: 500, padding: "3px 9px", borderRadius: 20, border: "1px solid rgba(42,37,32,0.18)", color: "#2a2520" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                  {/* color swatches */}
                  <div className="flex gap-1.5">
                    {state.item.colors.map((c) => (
                      <div key={c} style={{ width: 20, height: 20, borderRadius: "50%", background: c, border: "1px solid rgba(42,37,32,0.12)" }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* actions */}
            <button
              onClick={reset}
              style={{
                width: "100%", borderRadius: 12, padding: "15px 0",
                border: "none", background: "#2a2520",
                color: "#faf7f2", fontFamily: "var(--font-jost), sans-serif",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              Add another piece →
            </button>
            <button
              onClick={() => router.push("/wardrobe")}
              style={{
                width: "100%", borderRadius: 12, padding: "14px 0",
                border: "1.5px solid rgba(42,37,32,0.2)", background: "transparent",
                color: "#2a2520", fontFamily: "var(--font-jost), sans-serif",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              View wardrobe
            </button>
          </div>
        )}

        {/* ── error ── */}
        {state.status === "error" && (
          <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#c94040", textAlign: "center" }}>
              {state.message}
            </p>
            <button
              onClick={reset}
              style={{
                borderRadius: 12, padding: "13px 24px",
                border: "1.5px solid rgba(42,37,32,0.2)", background: "transparent",
                color: "#2a2520", fontFamily: "var(--font-jost), sans-serif",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
