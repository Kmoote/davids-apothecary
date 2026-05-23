"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase, CATHERINE_USER_ID } from "@/lib/supabase";
import { toThumbUrl } from "@/lib/looks";
import type { FitInference } from "@/lib/fit-tagger";

type WardrobeItem = {
  id: string;
  name: string | null;
  brand: string | null;
  size: string | null;
  category: string;
  subcategory: string | null;
  colors: string[];
  occasion_tags: string[];
  season_fit: string[];
  formality: number;
  pattern: string | null;
  fabric: string | null;
  wear_count: number;
  last_worn_at: string | null;
  photo_url: string;
  thumbnail_url: string | null;
  david_note: string | null;
  fit_note: string | null;
  // Phase B1b — David's automated fit reasoning; null until fit-inference Tagger runs
  fit_inference: FitInference | null;
};

const CATEGORIES = ["All", "Tops", "Bottoms", "Outerwear", "Shoes", "Accessories", "Dresses"];
const CAT_VALUES  = ["tops", "bottoms", "outerwear", "shoes", "accessories", "dresses"];

const OCCASIONS  = ["Casual", "Work", "Evening", "Weekend", "Sport", "Formal", "Party"];
const SEASONS    = ["spring", "summer", "fall", "winter"];
const PATTERNS   = ["Solid", "Striped", "Floral", "Geometric", "Plaid", "Animal Print", "Abstract", "Tie-dye", "Other"];
const FORMALITY_LABELS = ["Casual", "Smart Casual", "Work", "Smart", "Formal"];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never worn";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "worn today";
  if (days === 1) return "worn yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Edit Sheet ────────────────────────────────────────────────────────────────

type EditState = {
  name: string;
  brand: string;
  size: string;
  category: string;
  occasion_tags: string[];
  season_fit: string[];
  formality: number;
  pattern: string;
  fabric: string;
  fit_note: string;
};

function EditSheet({
  item,
  onClose,
  onSaved,
}: {
  item: WardrobeItem;
  onClose: () => void;
  onSaved: (updated: Partial<WardrobeItem>) => void;
}) {
  const [form, setForm] = useState<EditState>({
    name:          item.name ?? "",
    brand:         item.brand ?? "",
    size:          item.size ?? "",
    category:      item.category,
    occasion_tags: item.occasion_tags ?? [],
    season_fit:    item.season_fit ?? [],
    formality:     item.formality ?? 2,
    pattern:       item.pattern ?? "",
    fabric:        item.fabric ?? "",
    fit_note:      item.fit_note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [retagging, setRetagging] = useState(false);
  const [retagMessage, setRetagMessage] = useState<string | null>(null);
  // Phase B1b — David's fit reading. Local state so re-tag can refresh it.
  const [fitInference, setFitInference] = useState<FitInference | null>(item.fit_inference ?? null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Prevent background scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function toggleTag(list: "occasion_tags" | "season_fit", value: string) {
    setForm((f) => {
      const current = f[list];
      return {
        ...f,
        [list]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  }

  async function handleRetag() {
    if (retagging) return;
    if (!confirm("Re-tag this piece? David will re-read the photo and refresh category, colors, tags, and his fit reading. Your brand, size, and fit note stay as-is.")) return;
    setRetagging(true);
    setRetagMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/wardrobe/${item.id}/retag`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Re-tag failed");

      // Merge the refreshed fields back into the form so Catherine sees them
      const u = data.item ?? {};
      setForm((f) => ({
        ...f,
        name:          u.name ?? f.name,
        category:      u.category ?? f.category,
        occasion_tags: u.occasion_tags ?? f.occasion_tags,
        season_fit:    u.season_fit ?? f.season_fit,
        formality:     u.formality ?? f.formality,
        pattern:       u.pattern ?? f.pattern ?? "",
        fabric:        u.fabric ?? f.fabric ?? "",
      }));
      // Push the AI-derived fields back to the parent list right away
      onSaved({
        name:          u.name,
        category:      u.category,
        subcategory:   u.subcategory,
        colors:        u.colors,
        occasion_tags: u.occasion_tags,
        season_fit:    u.season_fit,
        formality:     u.formality,
        pattern:       u.pattern,
        fabric:        u.fabric,
        fit_inference: u.fit_inference,
      });
      // Phase B1b — refresh the in-sheet "How David Reads This Piece" card
      if (u.fit_inference) setFitInference(u.fit_inference as FitInference);
      setRetagMessage("David refreshed the tags. Review and save if you want any tweaks.");
      setTimeout(() => setRetagMessage(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-tag failed");
    } finally {
      setRetagging(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name:          form.name.trim() || null,
        brand:         form.brand.trim() || null,
        size:          form.size.trim() || null,
        category:      form.category,
        occasion_tags: form.occasion_tags,
        season_fit:    form.season_fit,
        formality:     form.formality,
        pattern:       form.pattern.trim() || null,
        fabric:        form.fabric.trim() || null,
        fit_note:      form.fit_note.trim() || null,
      };

      const res = await fetch(`/api/wardrobe/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }

      onSaved(payload);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const input: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1px solid rgba(42,37,32,0.18)", background: "#faf7f2",
    fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#2a2520",
    outline: "none", boxSizing: "border-box",
  };

  const label: React.CSSProperties = {
    fontFamily: "var(--font-jost), sans-serif", fontSize: 10,
    fontWeight: 600, color: "#8a7a6a", letterSpacing: "0.08em",
    textTransform: "uppercase", marginBottom: 6, display: "block",
  };

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(42,37,32,0.45)",
          zIndex: 50, backdropFilter: "blur(2px)",
        }}
      />

      {/* sheet */}
      <div
        ref={sheetRef}
        style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 390, maxHeight: "90dvh",
          background: "#faf7f2", borderRadius: "20px 20px 0 0",
          zIndex: 51, display: "flex", flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(42,37,32,0.2)",
        }}
      >
        {/* drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(42,37,32,0.15)" }} />
        </div>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 12px" }}>
          <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: "#2a2520" }}>
            Edit Tags
          </p>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#8a7a6a", lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        {/* scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>

          {/* photo + name row */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 10, overflow: "hidden",
              background: item.colors[0] ?? "#cec5b0", flexShrink: 0,
              border: "1px solid rgba(42,37,32,0.12)",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={toThumbUrl(item.photo_url, 200) ?? item.photo_url} alt={item.name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>Name</label>
              <input
                style={input}
                value={form.name}
                placeholder="e.g. White linen shirt"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
          </div>

          {/* Category */}
          <div style={{ marginBottom: 20 }}>
            <label style={label}>Category</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CAT_VALUES.map((cat) => {
                const active = form.category === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setForm((f) => ({ ...f, category: cat }))}
                    style={{
                      borderRadius: 20, padding: "6px 14px", fontSize: 12,
                      fontFamily: "var(--font-jost), sans-serif", fontWeight: 500,
                      border: active ? "none" : "1px solid rgba(42,37,32,0.18)",
                      background: active ? "#2a2520" : "transparent",
                      color: active ? "#faf7f2" : "#2a2520", cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Occasion tags */}
          <div style={{ marginBottom: 20 }}>
            <label style={label}>Occasion Tags</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {OCCASIONS.map((occ) => {
                const val   = occ.toLowerCase();
                const active = form.occasion_tags.includes(val);
                return (
                  <button
                    key={occ}
                    onClick={() => toggleTag("occasion_tags", val)}
                    style={{
                      borderRadius: 20, padding: "6px 14px", fontSize: 12,
                      fontFamily: "var(--font-jost), sans-serif", fontWeight: 500,
                      border: active ? "none" : "1px solid rgba(42,37,32,0.18)",
                      background: active ? "#c4a882" : "transparent",
                      color: active ? "#2a2520" : "#2a2520", cursor: "pointer",
                    }}
                  >
                    {occ}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Season fit */}
          <div style={{ marginBottom: 20 }}>
            <label style={label}>Season Fit <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(empty = all-season)</span></label>
            <div style={{ display: "flex", gap: 6 }}>
              {SEASONS.map((s) => {
                const active = form.season_fit.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleTag("season_fit", s)}
                    style={{
                      borderRadius: 20, padding: "6px 14px", fontSize: 12,
                      fontFamily: "var(--font-jost), sans-serif", fontWeight: 500,
                      border: active ? "none" : "1px solid rgba(42,37,32,0.18)",
                      background: active ? "#2a2520" : "transparent",
                      color: active ? "#faf7f2" : "#2a2520", cursor: "pointer",
                      textTransform: "capitalize", flex: 1,
                    }}
                  >
                    {s.slice(0, 2).toUpperCase()}
                  </button>
                );
              })}
            </div>
            {form.season_fit.length > 0 && (
              <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 10, color: "#8a7a6a", marginTop: 5 }}>
                {form.season_fit.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")}
              </p>
            )}
            {form.season_fit.length === 0 && (
              <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 10, color: "#c4a882", marginTop: 5 }}>
                All-season — will appear year-round
              </p>
            )}
          </div>

          {/* Formality */}
          <div style={{ marginBottom: 20 }}>
            <label style={label}>Formality</label>
            <div style={{ display: "flex", gap: 4 }}>
              {FORMALITY_LABELS.map((lbl, i) => {
                const val    = i + 1;
                const active = form.formality === val;
                return (
                  <button
                    key={val}
                    onClick={() => setForm((f) => ({ ...f, formality: val }))}
                    style={{
                      flex: 1, borderRadius: 8, padding: "8px 2px", fontSize: 9,
                      fontFamily: "var(--font-jost), sans-serif", fontWeight: 500,
                      border: active ? "none" : "1px solid rgba(42,37,32,0.18)",
                      background: active ? "#2a2520" : "transparent",
                      color: active ? "#faf7f2" : "#8a7a6a", cursor: "pointer",
                      lineHeight: 1.3, textAlign: "center",
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pattern */}
          <div style={{ marginBottom: 20 }}>
            <label style={label}>Pattern</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PATTERNS.map((p) => {
                const val    = p.toLowerCase().replace(" ", "_");
                const active = form.pattern === val || form.pattern === p.toLowerCase();
                return (
                  <button
                    key={p}
                    onClick={() => setForm((f) => ({ ...f, pattern: active ? "" : val }))}
                    style={{
                      borderRadius: 20, padding: "6px 12px", fontSize: 11,
                      fontFamily: "var(--font-jost), sans-serif", fontWeight: 500,
                      border: active ? "none" : "1px solid rgba(42,37,32,0.18)",
                      background: active ? "#c4a882" : "transparent",
                      color: active ? "#2a2520" : "#2a2520", cursor: "pointer",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Brand, Size, Fabric row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10, marginBottom: 20 }}>
            <div>
              <label style={label}>Brand</label>
              <input
                style={input}
                value={form.brand}
                placeholder="e.g. Zara"
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </div>
            <div>
              <label style={label}>Size</label>
              <input
                style={input}
                value={form.size}
                placeholder="M"
                onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={label}>Fabric</label>
            <input
              style={input}
              value={form.fabric}
              placeholder="e.g. cotton, silk, linen..."
              onChange={(e) => setForm((f) => ({ ...f, fabric: e.target.value }))}
            />
          </div>

          {/* Phase B1b — David's fit reading (read-only) */}
          <div style={{ marginBottom: 20 }}>
            <label style={label}>How David Reads This Piece</label>
            {fitInference ? (
              <div style={{
                background: "rgba(196,168,130,0.10)",
                border: "1px solid rgba(196,168,130,0.30)",
                borderRadius: 12,
                padding: "12px 14px",
              }}>
                {fitInference.fit_note_for_catherine && (
                  <p style={{
                    fontFamily: "var(--font-jost), sans-serif",
                    fontSize: 13,
                    color: "#2a2520",
                    lineHeight: 1.5,
                    margin: 0,
                  }}>
                    {fitInference.fit_note_for_catherine}
                  </p>
                )}
                {(() => {
                  const meta = [
                    fitInference.silhouette,
                    fitInference.ease_1to5 != null && `ease ${fitInference.ease_1to5}/5`,
                    fitInference.drape_stiffness_1to5 != null && `drape ${fitInference.drape_stiffness_1to5}/5`,
                    fitInference.length_category,
                    fitInference.estimated_fabric_weight && `${fitInference.estimated_fabric_weight} weight`,
                  ].filter(Boolean).join("  ·  ");
                  return meta ? (
                    <p style={{
                      fontFamily: "var(--font-jost), sans-serif",
                      fontSize: 10.5,
                      color: "#8a7a6a",
                      lineHeight: 1.5,
                      marginTop: 8,
                      marginBottom: 0,
                      textTransform: "lowercase",
                    }}>
                      {meta}
                    </p>
                  ) : null;
                })()}
                {fitInference.confidence === "low" && (
                  <p style={{
                    fontFamily: "var(--font-jost), sans-serif",
                    fontSize: 10,
                    color: "#a89484",
                    fontStyle: "italic",
                    marginTop: 8,
                    marginBottom: 0,
                  }}>
                    David isn't fully sure on this one — the photo isn't giving him a clear read.
                  </p>
                )}
              </div>
            ) : (
              <p style={{
                fontFamily: "var(--font-jost), sans-serif",
                fontSize: 11.5,
                color: "#8a7a6a",
                lineHeight: 1.5,
                fontStyle: "italic",
                padding: "10px 0",
                margin: 0,
              }}>
                David hasn't read this one yet. Tap "Re-tag with David" below.
              </p>
            )}
          </div>

          {/* Fit note — what's off about this piece, for David */}
          <div style={{ marginBottom: 20 }}>
            <label style={label}>Anything off about this piece?</label>
            <textarea
              style={{ ...input, resize: "none", lineHeight: 1.5, minHeight: 70 }}
              value={form.fit_note}
              placeholder="e.g. neckline cuts weird, fabric is too sheer, never know what to pair this with…"
              rows={3}
              onChange={(e) => setForm((f) => ({ ...f, fit_note: e.target.value }))}
            />
            <p style={{
              fontFamily: "var(--font-jost), sans-serif", fontSize: 10,
              color: "#8a7a6a", marginTop: 5, lineHeight: 1.4,
            }}>
              David reads this every time he considers this piece. Optional — leave blank if it works fine.
            </p>
          </div>

          {/* Re-tag with David — single-item refresh via the Tagger */}
          <div style={{ marginBottom: 28 }}>
            <button
              onClick={handleRetag}
              disabled={retagging}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 12,
                border: "1px solid rgba(196,168,130,0.5)",
                background: "transparent", color: "#2a2520",
                fontFamily: "var(--font-jost), sans-serif", fontSize: 12,
                fontWeight: 500, letterSpacing: "0.04em",
                cursor: retagging ? "wait" : "pointer",
              }}
            >
              {retagging ? "David is re-reading the photo…" : "Re-tag with David"}
            </button>
            {retagMessage && (
              <p style={{
                fontFamily: "var(--font-jost), sans-serif", fontSize: 10.5,
                color: "#8a7a6a", marginTop: 6, lineHeight: 1.4, textAlign: "center",
              }}>
                {retagMessage}
              </p>
            )}
            <p style={{
              fontFamily: "var(--font-jost), sans-serif", fontSize: 10,
              color: "#8a7a6a", marginTop: 6, lineHeight: 1.4,
            }}>
              Refreshes category, colors, tags, and David's fit reading. Brand, size, name, and your own fit note stay as-is.
            </p>
          </div>

        </div>

        {/* sticky footer */}
        <div style={{ padding: "12px 20px max(20px, env(safe-area-inset-bottom))", borderTop: "1px solid rgba(42,37,32,0.10)", background: "#faf7f2" }}>
          {error && (
            <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 11, color: "#c0392b", marginBottom: 8, textAlign: "center" }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, borderRadius: 12, padding: "13px 0",
                border: "1.5px solid rgba(42,37,32,0.2)", background: "transparent",
                color: "#2a2520", fontFamily: "var(--font-jost), sans-serif",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 2, borderRadius: 12, padding: "13px 0",
                border: "none", background: saving ? "#8a7a6a" : "#2a2520",
                color: "#faf7f2", fontFamily: "var(--font-jost), sans-serif",
                fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Item Tile ─────────────────────────────────────────────────────────────────

function ItemTile({ item, onEdit }: { item: WardrobeItem; onEdit: () => void }) {
  const swatch = item.colors[0] ?? "#cec5b0";
  return (
    <div
      className="flex flex-col"
      onClick={onEdit}
      style={{
        borderRadius: 12, overflow: "hidden", border: "1px solid rgba(42,37,32,0.12)",
        background: "#f5f0e8", cursor: "pointer", position: "relative",
      }}
    >
      {/* photo or colour swatch */}
      <div className="relative texture" style={{ aspectRatio: "1", background: swatch }}>
        {item.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={toThumbUrl(item.photo_url, 300) ?? item.photo_url}
            alt={item.name ?? item.category}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* edit pencil badge */}
        <div style={{
          position: "absolute", top: 5, right: 5,
          width: 18, height: 18, borderRadius: "50%",
          background: "rgba(42,37,32,0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, color: "#faf7f2",
        }}>
          ✎
        </div>
      </div>
      {/* meta */}
      <div style={{ padding: "5px 6px 7px" }}>
        {item.brand && (
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 8, fontWeight: 500, color: "#8a7a6a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 1 }}>
            {item.brand}
          </p>
        )}
        <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 10, fontWeight: 500, color: "#2a2520", lineHeight: 1.3 }}>
          {item.name ?? item.category}
        </p>
        {item.size && (
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 8.5, color: "#8a7a6a", marginTop: 1 }}>
            Sz {item.size}
          </p>
        )}
        <div className="flex items-center justify-between mt-1.5">
          <span style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 8, color: "#8a7a6a" }}>
            {timeAgo(item.last_worn_at)}
          </span>
          <span style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 8, color: "#c4a882", fontWeight: 500 }}>
            ×{item.wear_count}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WardrobePage() {
  const [items, setItems]               = useState<WardrobeItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading]           = useState(true);
  const [editing, setEditing]           = useState<WardrobeItem | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("wardrobe_items")
        .select("id,name,brand,size,category,subcategory,colors,occasion_tags,season_fit,formality,pattern,fabric,wear_count,last_worn_at,photo_url,thumbnail_url,david_note,fit_note,fit_inference")
        .eq("user_id", CATHERINE_USER_ID)
        .eq("is_active", true)
        .order("last_worn_at", { ascending: true, nullsFirst: false });
      setItems(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function handleSaved(updated: Partial<WardrobeItem>) {
    if (!editing) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === editing.id ? { ...item, ...updated } : item
      )
    );
  }

  const filtered =
    activeCategory === "All"
      ? items
      : items.filter((i) => i.category.toLowerCase() === activeCategory.toLowerCase());

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      {/* header */}
      <div className="relative texture shrink-0" style={{ background: "#2a2520", padding: "14px 18px 12px" }}>
        <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase", marginBottom: 3 }}>
          Your Wardrobe
        </p>
        <div className="flex items-end justify-between">
          <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 22, color: "#faf7f2" }}>
            {loading ? "—" : `${items.length} piece${items.length !== 1 ? "s" : ""}`}
          </p>
          <Link
            href="/upload"
            style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 11, fontWeight: 600, color: "#c4a882",
              border: "1px solid rgba(196,168,130,0.4)",
              borderRadius: 20, padding: "5px 12px",
              textDecoration: "none", letterSpacing: "0.04em",
            }}
          >
            + Add piece
          </Link>
        </div>
      </div>

      {/* category filter pills */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar shrink-0" style={{ padding: "10px 16px", borderBottom: "1px solid rgba(42,37,32,0.10)" }}>
        {CATEGORIES.map((cat) => {
          const active = cat === activeCategory;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                whiteSpace: "nowrap", borderRadius: 20, padding: "5px 12px",
                fontSize: 11, fontFamily: "var(--font-jost), sans-serif",
                fontWeight: 500, letterSpacing: "0.04em",
                border: active ? "none" : "1px solid rgba(42,37,32,0.18)",
                background: active ? "#2a2520" : "transparent",
                color: active ? "#faf7f2" : "#2a2520", cursor: "pointer",
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* grid */}
      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: 14 }}>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`dot-${i + 1}`} style={{ width: 6, height: 6, borderRadius: "50%", background: "#c4a882", display: "inline-block" }} />
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 pt-16">
            <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 18, color: "#8a7a6a", textAlign: "center" }}>
              Nothing here yet.
            </p>
            <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#8a7a6a", textAlign: "center", maxWidth: 200, lineHeight: 1.5 }}>
              Once you add pieces, they&apos;ll show up here.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {filtered.map((item) => (
              <ItemTile key={item.id} item={item} onEdit={() => setEditing(item)} />
            ))}
          </div>
        )}
      </div>

      {/* edit sheet */}
      {editing && (
        <EditSheet
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
