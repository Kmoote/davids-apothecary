"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, CATHERINE_USER_ID } from "@/lib/supabase";

type WardrobeItem = {
  id: string;
  name: string | null;
  brand: string | null;
  size: string | null;
  category: string;
  colors: string[];
  wear_count: number;
  last_worn_at: string | null;
  photo_url: string;
  thumbnail_url: string | null;
  david_note: string | null;
};

const CATEGORIES = ["All", "Tops", "Bottoms", "Outerwear", "Shoes", "Accessories", "Dresses"];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never worn";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "worn today";
  if (days === 1) return "worn yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function ItemTile({ item }: { item: WardrobeItem }) {
  const swatch = item.colors[0] ?? "#cec5b0";
  return (
    <div
      className="flex flex-col"
      style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(42,37,32,0.12)", background: "#f5f0e8" }}
    >
      {/* photo or color swatch */}
      <div
        className="relative texture"
        style={{ aspectRatio: "1", background: swatch }}
      >
        {item.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail_url}
            alt={item.name ?? item.category}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
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

export default function WardrobePage() {
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("wardrobe_items")
        .select("id,name,brand,size,category,colors,wear_count,last_worn_at,photo_url,thumbnail_url,david_note")
        .eq("user_id", CATHERINE_USER_ID)
        .eq("is_active", true)
        .order("last_worn_at", { ascending: true, nullsFirst: false });
      setItems(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered =
    activeCategory === "All"
      ? items
      : items.filter((i) => i.category.toLowerCase() === activeCategory.toLowerCase());

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      {/* header */}
      <div
        className="relative texture shrink-0"
        style={{ background: "#2a2520", padding: "14px 18px 12px" }}
      >
        <p
          style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase", marginBottom: 3 }}
        >
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
      <div
        className="flex gap-2 overflow-x-auto no-scrollbar shrink-0"
        style={{ padding: "10px 16px", borderBottom: "1px solid rgba(42,37,32,0.10)" }}
      >
        {CATEGORIES.map((cat) => {
          const active = cat === activeCategory;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                whiteSpace: "nowrap",
                borderRadius: 20,
                padding: "5px 12px",
                fontSize: 11,
                fontFamily: "var(--font-jost), sans-serif",
                fontWeight: 500,
                letterSpacing: "0.04em",
                border: active ? "none" : "1px solid rgba(42,37,32,0.18)",
                background: active ? "#2a2520" : "transparent",
                color: active ? "#faf7f2" : "#2a2520",
                cursor: "pointer",
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
              <ItemTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
