"use client";

import { useEffect, useState } from "react";
import { supabase, CATHERINE_USER_ID } from "@/lib/supabase";
import { DALogo } from "@/components/DALogo";
import { DavidAvatar } from "@/components/DavidBubble";

type Prefs = {
  boldness: number;
  colour_play: number;
  edge: number;
  classic: number;
  palette: string[];
  corrections: string[];
  recent_learnings: { text: string; date?: string }[];
  style_push: number;
  notes_freetext: string | null;
};

const TRAITS = [
  { key: "boldness",    label: "Color Appetite",  ends: ["Muted",   "Mid",     "Bold"]       },
  { key: "colour_play", label: "Silhouette",       ends: ["Soft",    "Mixed",   "Structured"] },
  { key: "edge",        label: "Trend Exposure",   ends: ["Classic", "Selective","Now"]       },
  { key: "classic",     label: "Risk Tolerance",   ends: ["Safe",    "Low-Mid", "Push"]       },
] as const;

function TraitSlider({ label, value, ends }: { label: string; value: number; ends: readonly [string, string, string] }) {
  return (
    <div style={{ padding: "10px 14px", background: "#f5f0e8", borderRadius: 12, border: "1px solid rgba(42,37,32,0.10)" }}>
      <div className="flex justify-between items-center mb-2">
        <span style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 11, fontWeight: 600, color: "#2a2520", letterSpacing: "0.04em" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 11, color: "#c4a882", fontWeight: 600 }}>{ends[value]}</span>
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((seg) => (
          <div
            key={seg}
            className="flex-1"
            style={{ height: 6, borderRadius: 3, background: seg <= value ? "#c4a882" : "rgba(42,37,32,0.12)" }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        {ends.map((e, i) => (
          <span key={i} style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 8.5, color: i === value ? "#2a2520" : "#8a7a6a", fontWeight: i === value ? 600 : 400 }}>{e}</span>
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("user_preferences")
        .select("boldness,colour_play,edge,classic,palette,corrections,recent_learnings,style_push,notes_freetext")
        .eq("user_id", CATHERINE_USER_ID)
        .single();
      setPrefs(data ?? null);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      {/* header */}
      <div
        className="relative texture shrink-0 flex items-center gap-3"
        style={{ background: "#2a2520", padding: "14px 18px" }}
      >
        <DALogo size={44} dark />
        <div>
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase" }}>Style DNA</p>
          <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 20, color: "#faf7f2" }}>
            Catherine
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: "14px 16px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`dot-${i + 1}`} style={{ width: 6, height: 6, borderRadius: "50%", background: "#c4a882", display: "inline-block" }} />
              ))}
            </div>
          </div>
        ) : prefs ? (
          <>
            {/* How David sees you */}
            <section>
              <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#8a7a6a", letterSpacing: "0.1em", fontWeight: 500, textTransform: "uppercase", marginBottom: 10 }}>How David Sees You</p>
              <div className="flex gap-2.5 items-start">
                <DavidAvatar />
                <div style={{ flex: 1, background: "#f5f0e8", border: "1px solid rgba(42,37,32,0.14)", borderRadius: "3px 14px 14px 14px", padding: "10px 14px" }}>
                  <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#2a2520", lineHeight: 1.6, fontStyle: "italic" }}>
                    {prefs.notes_freetext ?? "Quietly confident. You know what works — sometimes you just need a nudge to actually wear it."}
                  </p>
                </div>
              </div>
            </section>

            {/* Traits */}
            <section>
              <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#8a7a6a", letterSpacing: "0.1em", fontWeight: 500, textTransform: "uppercase", marginBottom: 10 }}>
                Your Traits · Tap to Adjust
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TRAITS.map((t) => (
                  <TraitSlider key={t.key} label={t.label} value={prefs[t.key]} ends={t.ends} />
                ))}
              </div>
            </section>

            {/* Palette */}
            {prefs.palette.length > 0 && (
              <section>
                <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#8a7a6a", letterSpacing: "0.1em", fontWeight: 500, textTransform: "uppercase", marginBottom: 10 }}>Your Palette</p>
                <div className="flex gap-2">
                  {prefs.palette.map((hex, i) => (
                    <div
                      key={i}
                      className="flex-1 relative texture"
                      style={{ height: 40, borderRadius: 8, background: hex, border: "1px solid rgba(42,37,32,0.10)" }}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Corrections */}
            {prefs.corrections.length > 0 && (
              <section>
                <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#8a7a6a", letterSpacing: "0.1em", fontWeight: 500, textTransform: "uppercase", marginBottom: 10 }}>Correct David</p>
                <div className="flex flex-wrap gap-2">
                  {prefs.corrections.map((c, i) => (
                    <span
                      key={i}
                      style={{ fontSize: 11, fontFamily: "var(--font-jost), sans-serif", fontWeight: 500, padding: "5px 12px", borderRadius: 20, background: "#f5f0e8", border: "1px solid rgba(42,37,32,0.14)", color: "#2a2520" }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Learnings */}
            {prefs.recent_learnings.length > 0 && (
              <section>
                <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#8a7a6a", letterSpacing: "0.1em", fontWeight: 500, textTransform: "uppercase", marginBottom: 10 }}>Recent Learnings</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {prefs.recent_learnings.map((l, i) => (
                    <div
                      key={i}
                      style={{ borderLeft: "2.5px solid #c4a882", paddingLeft: 10 }}
                    >
                      <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#2a2520", lineHeight: 1.5 }}>
                        {typeof l === "string" ? l : l.text}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#8a7a6a", textAlign: "center", marginTop: 40 }}>
            No style profile yet.
          </p>
        )}
      </div>
    </div>
  );
}
