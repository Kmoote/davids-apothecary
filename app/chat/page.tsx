"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DALogo } from "@/components/DALogo";
import { DavidAvatar } from "@/components/DavidBubble";

type WeatherResult = {
  emoji: string;
  condition: string;
  temp: number;
  city: string;
};

export default function PlanningPage() {
  const router = useRouter();
  const [query, setQuery]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<WeatherResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res  = await fetch(`/api/weather?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error === "City not found" ? "Couldn't find that city — try a different spelling." : data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <div
      className="flex flex-col bg-cream"
      style={{ height: "100dvh", maxWidth: 390, margin: "0 auto" }}
    >
      {/* header */}
      <div
        className="relative texture flex items-center gap-3 shrink-0"
        style={{ background: "#2a2520", padding: "14px 18px" }}
      >
        <button
          onClick={() => router.push("/")}
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
        <div className="flex items-center gap-2.5 flex-1">
          <DALogo size={28} dark />
          <div>
            <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882", letterSpacing: "0.12em", fontWeight: 500, textTransform: "uppercase" }}>
              Plan Ahead
            </p>
            <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 17, color: "#faf7f2" }}>
              Weather Check
            </p>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 flex flex-col" style={{ padding: "24px 20px", gap: 20, overflowY: "auto" }}>

        {/* David's prompt */}
        <div className="fade-up flex gap-3 items-start">
          <DavidAvatar size={30} />
          <div style={{
            flex: 1, background: "#f5f0e8",
            border: "1px solid rgba(42,37,32,0.12)",
            borderRadius: "3px 14px 14px 14px",
            padding: "11px 14px",
          }}>
            <p style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 13, color: "#2a2520", lineHeight: 1.6, fontStyle: "italic",
            }}>
              Heading somewhere? Tell me the city and I&apos;ll tell you what you&apos;re dressing into.
            </p>
          </div>
        </div>

        {/* search input */}
        <div className="fade-up" style={{ animationDelay: "80ms" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="City — e.g. London, Paris, Miami"
              style={{
                flex: 1, padding: "12px 14px", borderRadius: 12,
                border: "1.5px solid rgba(42,37,32,0.18)", background: "#faf7f2",
                fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#2a2520",
                outline: "none",
              }}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              style={{
                borderRadius: 12, padding: "12px 18px",
                border: "none", background: loading || !query.trim() ? "#8a7a6a" : "#2a2520",
                color: "#faf7f2", fontFamily: "var(--font-jost), sans-serif",
                fontSize: 13, fontWeight: 600, cursor: loading || !query.trim() ? "not-allowed" : "pointer",
                transition: "background 0.2s", whiteSpace: "nowrap",
              }}
            >
              {loading ? "…" : "Check"}
            </button>
          </div>
        </div>

        {/* error */}
        {error && (
          <div className="fade-up flex gap-3 items-start">
            <DavidAvatar size={30} />
            <div style={{
              flex: 1, background: "#f5f0e8",
              border: "1px solid rgba(42,37,32,0.12)",
              borderRadius: "3px 14px 14px 14px",
              padding: "11px 14px",
            }}>
              <p style={{
                fontFamily: "var(--font-jost), sans-serif",
                fontSize: 13, color: "#8a7a6a", lineHeight: 1.6, fontStyle: "italic",
              }}>
                {error}
              </p>
            </div>
          </div>
        )}

        {/* weather result */}
        {result && (
          <div className="fade-up" style={{ animationDelay: "60ms" }}>
            {/* weather card */}
            <div style={{
              background: "#f5f0e8", border: "1px solid rgba(42,37,32,0.12)",
              borderRadius: 16, padding: "20px 20px 16px",
              boxShadow: "0 4px 20px rgba(42,37,32,0.08)",
            }}>
              <p style={{
                fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882",
                fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8,
              }}>
                Right now in
              </p>
              <p style={{
                fontFamily: "var(--font-playfair), serif", fontStyle: "italic",
                fontWeight: 700, fontSize: 24, color: "#2a2520", marginBottom: 12,
              }}>
                {result.city}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 40 }}>{result.emoji}</span>
                <div>
                  <p style={{
                    fontFamily: "var(--font-jost), sans-serif",
                    fontSize: 32, fontWeight: 700, color: "#2a2520", lineHeight: 1,
                  }}>
                    {result.temp}°F
                  </p>
                  <p style={{
                    fontFamily: "var(--font-jost), sans-serif",
                    fontSize: 12, color: "#8a7a6a", marginTop: 3,
                  }}>
                    {result.condition}
                  </p>
                </div>
              </div>
            </div>

            {/* David's commentary */}
            <div className="flex gap-3 items-start" style={{ marginTop: 16 }}>
              <DavidAvatar size={30} />
              <div style={{
                flex: 1, background: "#f5f0e8",
                border: "1px solid rgba(42,37,32,0.12)",
                borderRadius: "3px 14px 14px 14px",
                padding: "11px 14px",
              }}>
                <p style={{
                  fontFamily: "var(--font-jost), sans-serif",
                  fontSize: 13, color: "#2a2520", lineHeight: 1.6, fontStyle: "italic",
                }}>
                  {getWeatherNote(result)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* back button */}
      <div style={{ padding: "0 20px max(24px, env(safe-area-inset-bottom))", paddingTop: 8 }}>
        <button
          onClick={() => router.push("/")}
          style={{
            width: "100%", borderRadius: 12, padding: "14px 0",
            border: "1.5px solid rgba(42,37,32,0.2)", background: "transparent",
            color: "#2a2520", fontFamily: "var(--font-jost), sans-serif",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}
        >
          Back to morning
        </button>
      </div>
    </div>
  );
}

// David gives a single-line dressing note based on conditions
function getWeatherNote(w: WeatherResult): string {
  const t = w.temp;
  const c = w.condition;

  if (c === "Rain" || c === "Drizzle" || c === "Thunderstorm") {
    return t < 50
      ? "Rain and cold — waterproof layer over something warm. Boots, not loafers."
      : "Rain on the way. A light trench handles it without overpowering the look.";
  }
  if (c === "Snow") return "Snow means boots and a real coat. Everything else is secondary.";
  if (c === "Clear" && t >= 75) return "Warm and clear — this is a linen day. Light layers only.";
  if (c === "Clear" && t >= 60) return "Nice out. The kind of day where a good outfit actually gets noticed.";
  if (c === "Clear" && t >= 45) return "Crisp and sunny — a blazer over something easy reads exactly right.";
  if (c === "Clear") return "Cold and clear. Layer properly; it's worth it.";
  if (c === "Clouds" && t >= 60) return "Overcast but mild — good neutral-palette weather.";
  if (c === "Clouds") return "Grey day. A strong colour or a clean white makes it.";
  if (c === "Mist" || c === "Fog" || c === "Haze") {
    return "Misty — something with texture shows well in this light.";
  }
  if (t >= 75) return "It's warm. One layer, breathable fabric, nothing fussy.";
  if (t >= 55) return "Comfortable — the whole wardrobe is fair game today.";
  if (t >= 40) return "Cool enough for a proper coat. Dress for outside, not the indoors.";
  return "Cold. Warmth first; style within that constraint.";
}
