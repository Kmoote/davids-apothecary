"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DALogo } from "@/components/DALogo";
import { DavidBubble } from "@/components/DavidBubble";
import { type RealLook, getCachedLooks, cacheLooks } from "@/lib/looks";

// Bay Ridge, Brooklyn — Catherine's home base
const HOME_LAT = 40.6357;
const HOME_LON = -74.0236;

type WeatherData = { emoji: string; temp: number; city: string };

function useHomeWeather(): WeatherData | null {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  useEffect(() => {
    fetch(`/api/weather?lat=${HOME_LAT}&lon=${HOME_LON}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setWeather(d); })
      .catch(() => {/* silent fail — placeholder stays */});
  }, []);
  return weather;
}

function useDayGreeting() {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const now = new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const h = now.getHours();
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 || 12;
    const m = String(now.getMinutes()).padStart(2, "0");
    setLabel(`${days[now.getDay()].toUpperCase()} · ${months[now.getMonth()]} ${now.getDate()} · ${h12}:${m} ${ampm}`);
  }, []);
  return label;
}

// ── look card ─────────────────────────────────────────────────────────────────

function LookCard({ look, index, isFirst }: { look: RealLook; index: number; isFirst: boolean }) {
  return (
    <Link
      href={`/swipe?look=${index}`}
      className="shrink-0 flex flex-col"
      style={{
        width: 102, borderRadius: 12,
        border: isFirst ? "1.5px solid #c4a882" : "1px solid rgba(42,37,32,0.14)",
        background: "#f5f0e8",
        boxShadow: isFirst ? "0 4px 16px rgba(196,168,130,0.28)" : "none",
        overflow: "hidden",
      }}
    >
      {/* 2×2 photo grid */}
      <div style={{ height: 112, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: 6 }}>
        {look.slots.slice(0, 4).map((slot, i) => {
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
                  src={item.thumbnail_url ?? item.photo_url}
                  alt={item.name}
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ pointerEvents: "none" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* label */}
      <div style={{ padding: "6px 8px 8px" }}>
        <span style={{
          display: "block", fontSize: 9, color: "#c4a882",
          fontFamily: "var(--font-jost), sans-serif", fontWeight: 600,
          letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2,
        }}>
          {look.tag}
        </span>
        <span style={{
          display: "block", fontSize: 12,
          fontFamily: "var(--font-playfair), serif", fontStyle: "italic",
          fontWeight: 700, color: "#2a2520",
        }}>
          {look.name}
        </span>
      </div>
    </Link>
  );
}

// ── skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard({ isFirst }: { isFirst: boolean }) {
  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        width: 102, borderRadius: 12,
        border: isFirst ? "1.5px solid rgba(196,168,130,0.35)" : "1px solid rgba(42,37,32,0.10)",
        background: "#f5f0e8", overflow: "hidden",
      }}
    >
      <div style={{ height: 112, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: 6 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ borderRadius: 6, background: "rgba(42,37,32,0.07)" }} />
        ))}
      </div>
      <div style={{ padding: "6px 8px 8px" }}>
        <div style={{ height: 8, borderRadius: 4, background: "rgba(42,37,32,0.07)", marginBottom: 5, width: "60%" }} />
        <div style={{ height: 10, borderRadius: 4, background: "rgba(42,37,32,0.09)", width: "80%" }} />
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function MorningPage() {
  const dayLabel = useDayGreeting();
  const weather  = useHomeWeather();
  const [looks, setLooks] = useState<RealLook[] | null>(null);

  useEffect(() => {
    const cached = getCachedLooks();
    if (cached) { setLooks(cached); return; }

    fetch("/api/generate-looks")
      .then((r) => r.json())
      .then((json) => {
        if (!json.error) {
          cacheLooks(json.looks);
          setLooks(json.looks);
        }
      })
      .catch(() => {/* silent fail — skeleton stays */});
  }, []);

  const firstLook = looks?.[0];

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      {/* header */}
      <div
        className="relative texture flex items-center gap-3.5 shrink-0"
        style={{ background: "#2a2520", padding: "12px 18px 14px" }}
      >
        <DALogo size={54} dark />
        <div>
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 10, color: "#c4a882", letterSpacing: "0.1em", fontWeight: 500 }}>
            {dayLabel}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#d4cec6", fontWeight: 300 }}>
              {weather ? `${weather.emoji} ${weather.temp}° · ${weather.city}` : "☁ · —° · —"}
            </p>
          </div>
        </div>
      </div>

      {/* scroll body */}
      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 14 }}>
        <DavidBubble
          text="Good morning, Cath. Let's find your look for today."
          delay={100}
        />

        {/* look carousel */}
        <div>
          <p style={{
            fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#8a7a6a",
            letterSpacing: "0.1em", fontWeight: 500, textTransform: "uppercase", marginBottom: 10,
          }}>
            Today&apos;s Edits
          </p>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {looks
              ? looks.map((look, i) => <LookCard key={look.look_id} look={look} index={i} isFirst={i === 0} />)
              : [0, 1, 2].map((i) => <SkeletonCard key={i} isFirst={i === 0} />)
            }
          </div>
        </div>

        {/* primary CTA */}
        <Link
          href="/swipe"
          className="fade-up flex items-center justify-center gap-2"
          style={{
            animationDelay: "220ms", background: "#2a2520", color: "#faf7f2",
            borderRadius: 12, padding: "14px 18px",
            fontFamily: "var(--font-jost), sans-serif", fontSize: 14, fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {firstLook ? `Review Look 1 — ${firstLook.name} →` : "Review Today's Looks →"}
        </Link>

        {/* divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1" style={{ height: 1, background: "rgba(42,37,32,0.10)" }} />
          <span style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 11, color: "#8a7a6a" }}>
            not dressing for work?
          </span>
          <div className="flex-1" style={{ height: 1, background: "rgba(42,37,32,0.10)" }} />
        </div>

        {/* secondary CTA */}
        <Link
          href="/chat"
          className="fade-up flex items-center justify-center"
          style={{
            animationDelay: "320ms", border: "1.5px dashed rgba(42,37,32,0.25)",
            borderRadius: 12, padding: "13px 18px",
            fontFamily: "var(--font-jost), sans-serif", fontSize: 13, fontWeight: 500,
            color: "#2a2520", textDecoration: "none", marginBottom: 16,
          }}
        >
          Planning for something else →
        </Link>
      </div>
    </div>
  );
}
