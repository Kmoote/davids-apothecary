"use client";

/**
 * Phase C1 — Saved outfits view.
 *
 * Lists the looks Catherine has hearted from the swipe page, newest first.
 * Each saved look renders as a 2×2 grid (same visual as home-page look cards)
 * with the optional note Catherine added. Tapping a saved look navigates to
 * `/swipe?saved_idx=N` so she can re-review it in the full swipe-card UI
 * (future enhancement — for v1 we render read-only).
 */

import { useEffect, useState } from "react";
import { DALogo } from "@/components/DALogo";
import { type RealLook, toThumbUrl } from "@/lib/looks";

type SavedEntry = {
  saved_id: string;
  saved_at: string;
  note:     string | null;
  look?:    RealLook;
  missing?: boolean;
};

export default function SavedPage() {
  const [saved, setSaved]     = useState<SavedEntry[] | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/saved-looks")
      .then((r) => r.json())
      .then((json: { saved?: SavedEntry[]; error?: string }) => {
        if (json.error) throw new Error(json.error);
        setSaved(json.saved ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  async function handleRemove(savedId: string, lookId: string | undefined) {
    if (!lookId) return;
    if (!confirm("Remove this from your saved outfits?")) return;
    // Optimistic
    setSaved((prev) => prev?.filter((s) => s.saved_id !== savedId) ?? null);
    try {
      await fetch(`/api/saved-looks?look_id=${encodeURIComponent(lookId)}`, { method: "DELETE" });
    } catch {
      // Best-effort — reload to resync if anything went wrong
      const res = await fetch("/api/saved-looks");
      const json = await res.json();
      setSaved(json.saved ?? []);
    }
  }

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      {/* header */}
      <div
        className="relative texture shrink-0 flex items-center gap-3"
        style={{ background: "#2a2520", padding: "14px 18px" }}
      >
        <DALogo size={44} dark />
        <div>
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase" }}>
            Saved
          </p>
          <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: "#faf7f2" }}>
            {saved === null ? "Loading…" : `${saved.length} look${saved.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {/* scroll body */}
      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: "16px" }}>
        {error && (
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 12, color: "#c94040", textAlign: "center", padding: 16 }}>
            {error}
          </p>
        )}

        {saved !== null && saved.length === 0 && !error && (
          <div style={{ paddingTop: 48, textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 18, color: "#8a7a6a", marginBottom: 8 }}>
              Nothing saved yet.
            </p>
            <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 12.5, color: "#a89484", lineHeight: 1.55, maxWidth: 280, margin: "0 auto" }}>
              Tap the ♡ on any outfit David shows you and it'll land here. Add a note later — "for Sarah's wedding," "for the next sunny Saturday."
            </p>
          </div>
        )}

        {saved && saved.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {saved.map((s) => (
              <SavedCard key={s.saved_id} entry={s} onRemove={() => handleRemove(s.saved_id, s.look?.look_id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SavedCard({ entry, onRemove }: { entry: SavedEntry; onRemove: () => void }) {
  if (entry.missing || !entry.look) {
    return (
      <div style={{ borderRadius: 12, background: "#f5f0e8", padding: 14, border: "1px dashed rgba(42,37,32,0.18)" }}>
        <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 11, color: "#8a7a6a" }}>
          This saved look is no longer available.
        </p>
        <button
          onClick={onRemove}
          style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 10, color: "#c94040", background: "none", border: "none", padding: 0, marginTop: 8, cursor: "pointer", textDecoration: "underline" }}
        >
          Remove
        </button>
      </div>
    );
  }
  const look = entry.look;
  const slots = look.slots.slice(0, 4);
  return (
    <div style={{ borderRadius: 12, overflow: "hidden", background: "#f5f0e8", border: "1px solid rgba(42,37,32,0.12)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: 6, aspectRatio: "1 / 1" }}>
        {slots.map((slot, i) => {
          const item = slot.items[0];
          return (
            <div
              key={i}
              className="texture relative"
              style={{ background: item?.colors[0] ?? "#cec5b0", borderRadius: 6, overflow: "hidden" }}
            >
              {item && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={toThumbUrl(item.photo_url, 240) ?? item.photo_url}
                  alt={item.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ padding: "8px 10px 10px" }}>
        <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 8.5, color: "#c4a882", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
          {look.tag}
        </p>
        <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 14, color: "#2a2520", marginBottom: entry.note ? 6 : 0, lineHeight: 1.2 }}>
          {look.name}
        </p>
        {entry.note && (
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 10.5, color: "#8a7a6a", lineHeight: 1.4 }}>
            {entry.note}
          </p>
        )}
        <button
          onClick={onRemove}
          style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9.5, color: "#8a7a6a", background: "none", border: "none", padding: 0, marginTop: 6, cursor: "pointer" }}
          aria-label="Remove from saved"
        >
          ♥ Remove
        </button>
      </div>
    </div>
  );
}
