"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DALogo } from "@/components/DALogo";
import { DavidBubble } from "@/components/DavidBubble";
import { PLACEHOLDER_LOOKS, resolveItems } from "@/lib/placeholder-looks";

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


function LookCard({ look, isFirst }: { look: typeof PLACEHOLDER_LOOKS[0]; isFirst: boolean }) {
  return (
    <Link
      href="/swipe"
      className="shrink-0 flex flex-col"
      style={{
        width: 102,
        borderRadius: 12,
        border: isFirst ? "1.5px solid #c4a882" : "1px solid rgba(42,37,32,0.14)",
        background: "#f5f0e8",
        boxShadow: isFirst ? "0 4px 16px rgba(196,168,130,0.28)" : "none",
        overflow: "hidden",
      }}
    >
      {/* flat-lay placeholder */}
      <div style={{ height: 112, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: 6 }}>
        {resolveItems(look, {}).map((item, i) => (
          <div
            key={i}
            className="texture relative"
            style={{ background: item.color, borderRadius: 6 }}
          />
        ))}
      </div>
      {/* label */}
      <div style={{ padding: "6px 8px 8px" }}>
        <span
          style={{
            display: "block",
            fontSize: 9,
            color: "#c4a882",
            fontFamily: "var(--font-jost), sans-serif",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 2,
          }}
        >
          {look.tag}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 12,
            fontFamily: "var(--font-playfair), serif",
            fontStyle: "italic",
            fontWeight: 700,
            color: "#2a2520",
          }}
        >
          {look.name}
        </span>
      </div>
    </Link>
  );
}

export default function MorningPage() {
  const dayLabel = useDayGreeting();

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      {/* header */}
      <div
        className="relative texture flex items-center gap-3.5 shrink-0"
        style={{ background: "#2a2520", padding: "12px 18px 14px" }}
      >
        <DALogo size={54} dark />
        <div>
          <p
            style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 10,
              color: "#c4a882",
              letterSpacing: "0.1em",
              fontWeight: 500,
            }}
          >
            {dayLabel}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#d4cec6", fontWeight: 300 }}>
              ☁ — · —° · —
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
          <p
            style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 9,
              color: "#8a7a6a",
              letterSpacing: "0.1em",
              fontWeight: 500,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Today&apos;s Edits
          </p>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {PLACEHOLDER_LOOKS.map((look, i) => (
              <LookCard key={look.id} look={look} isFirst={i === 0} />
            ))}
          </div>
        </div>

        {/* primary CTA */}
        <Link
          href="/swipe"
          className="fade-up flex items-center justify-center gap-2"
          style={{
            animationDelay: "220ms",
            background: "#2a2520",
            color: "#faf7f2",
            borderRadius: 12,
            padding: "14px 18px",
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Review Look 1 — The Edit →
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
            animationDelay: "320ms",
            border: "1.5px dashed rgba(42,37,32,0.25)",
            borderRadius: 12,
            padding: "13px 18px",
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: "#2a2520",
            textDecoration: "none",
            marginBottom: 16,
          }}
        >
          Planning for something else →
        </Link>
      </div>
    </div>
  );
}
