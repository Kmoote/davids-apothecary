"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DavidAvatar } from "@/components/DavidBubble";
import { PLACEHOLDER_LOOKS } from "@/lib/placeholder-looks";

const THRESHOLD = 100;
type Decision = "wear" | "pass";

function FlatLay({ colors }: { colors: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        padding: 14,
        height: "100%",
      }}
    >
      {colors.map((c, i) => (
        <div
          key={i}
          className="texture relative"
          style={{ background: c, borderRadius: 10 }}
        />
      ))}
    </div>
  );
}

export default function SwipePage() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [exiting, setExiting] = useState<Decision | null>(null);

  const startX = useRef(0);
  const liveX = useRef(0);

  const look = PLACEHOLDER_LOOKS[currentIndex];
  const nextLook = PLACEHOLDER_LOOKS[currentIndex + 1];

  const commit = useCallback(
    (decision: Decision) => {
      setExiting(decision);
      setTimeout(() => {
        const next = { ...decisions, [currentIndex]: decision };
        setDecisions(next);
        setExiting(null);
        setDragX(0);

        if (currentIndex >= PLACEHOLDER_LOOKS.length - 1) {
          const wornEntry = Object.entries(next).find(([, d]) => d === "wear");
          const wornId = wornEntry ? wornEntry[0] : "0";
          router.push(`/confirm?look=${wornId}`);
        } else {
          setCurrentIndex((i) => i + 1);
        }
      }, 300);
    },
    [currentIndex, decisions, router]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    liveX.current = 0;
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    liveX.current = e.clientX - startX.current;
    setDragX(liveX.current);
  };

  const onPointerUp = () => {
    setIsDragging(false);
    const d = liveX.current;
    liveX.current = 0;
    if (d >= THRESHOLD) commit("wear");
    else if (d <= -THRESHOLD) commit("pass");
    else setDragX(0);
  };

  const rotation = dragX * 0.06;
  const stampPct = Math.min(1, Math.max(0, (Math.abs(dragX) - 60) / 50));

  return (
    <div
      className="flex flex-col bg-cream"
      style={{ height: "100dvh", maxWidth: 390, margin: "0 auto" }}
    >
      {/* ── header ── */}
      <div
        className="flex items-center shrink-0"
        style={{ padding: "12px 18px 8px", gap: 12 }}
      >
        <button
          onClick={() => router.push("/")}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "1.5px solid rgba(42,37,32,0.2)",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            color: "#2a2520",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ‹
        </button>

        {/* step pips */}
        <div className="flex items-center gap-1.5 flex-1 justify-center">
          {PLACEHOLDER_LOOKS.map((_, i) => {
            const d = decisions[i];
            const isActive = i === currentIndex;
            const bg = isActive
              ? "#2a2520"
              : d === "wear"
              ? "#3d7a55"
              : d === "pass"
              ? "#c94040"
              : "rgba(42,37,32,0.15)";
            return (
              <div
                key={i}
                style={{
                  width: isActive ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: bg,
                  transition: "width 0.25s ease, background 0.2s ease",
                }}
              />
            );
          })}
        </div>

        <span
          style={{
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 11,
            color: "#8a7a6a",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {currentIndex + 1} of {PLACEHOLDER_LOOKS.length}
        </span>
      </div>

      {/* ── david's note ── */}
      <div style={{ padding: "0 18px 10px", flexShrink: 0 }}>
        <div
          className="flex gap-2.5 items-start"
          style={{
            background: "#f5f0e8",
            border: "1px solid rgba(42,37,32,0.12)",
            borderRadius: 12,
            padding: "9px 12px",
          }}
        >
          <DavidAvatar size={24} />
          <p
            style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 12.5,
              color: "#2a2520",
              lineHeight: 1.55,
              flex: 1,
            }}
          >
            {look.davidNote}
          </p>
        </div>
      </div>

      {/* ── card stack ── */}
      <div className="flex-1 relative" style={{ padding: "0 18px" }}>
        {/* background card (next look) */}
        {nextLook && (
          <div
            style={{
              position: "absolute",
              inset: "0 18px",
              borderRadius: 16,
              border: "1px solid rgba(42,37,32,0.10)",
              background: "#f5f0e8",
              transform: "scale(0.96)",
              overflow: "hidden",
            }}
          >
            <FlatLay colors={nextLook.colors} />
          </div>
        )}

        {/* active card */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: "absolute",
            inset: "0 18px",
            borderRadius: 16,
            border: "1.5px solid rgba(42,37,32,0.14)",
            background: "#f5f0e8",
            overflow: "hidden",
            touchAction: "none",
            cursor: isDragging ? "grabbing" : "grab",
            userSelect: "none",
            transform: exiting
              ? `translateX(${exiting === "wear" ? "130%" : "-130%"}) rotate(${exiting === "wear" ? 14 : -14}deg)`
              : `translateX(${dragX}px) rotate(${rotation}deg)`,
            transition: isDragging
              ? "none"
              : "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* flat-lay area */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <FlatLay colors={look.colors} />
          </div>

          {/* look name strip */}
          <div
            style={{
              padding: "10px 16px 14px",
              borderTop: "1px solid rgba(42,37,32,0.10)",
              flexShrink: 0,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-jost), sans-serif",
                fontSize: 9.5,
                color: "#c4a882",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              {look.tag}
            </p>
            <p
              style={{
                fontFamily: "var(--font-playfair), serif",
                fontStyle: "italic",
                fontWeight: 700,
                fontSize: 22,
                color: "#2a2520",
              }}
            >
              {look.name}
            </p>
          </div>

          {/* PASS stamp */}
          <div
            style={{
              position: "absolute",
              top: "28%",
              left: 18,
              opacity: dragX < 0 ? stampPct : 0,
              transform: "rotate(-12deg)",
              border: "3px solid #c94040",
              borderRadius: 6,
              padding: "4px 12px",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-playfair), serif",
                fontStyle: "italic",
                fontWeight: 700,
                fontSize: 30,
                color: "#c94040",
              }}
            >
              PASS
            </span>
          </div>

          {/* WEAR stamp */}
          <div
            style={{
              position: "absolute",
              top: "28%",
              right: 18,
              opacity: dragX > 0 ? stampPct : 0,
              transform: "rotate(12deg)",
              border: "3px solid #3d7a55",
              borderRadius: 6,
              padding: "4px 12px",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-playfair), serif",
                fontStyle: "italic",
                fontWeight: 700,
                fontSize: 30,
                color: "#3d7a55",
              }}
            >
              WEAR
            </span>
          </div>
        </div>
      </div>

      {/* ── footer buttons ── */}
      <div
        className="flex gap-3 shrink-0"
        style={{ padding: "14px 18px", paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => commit("pass")}
          style={{
            flex: 1,
            borderRadius: 12,
            padding: "15px 0",
            border: "1.5px solid #c94040",
            background: "transparent",
            color: "#c94040",
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ✕ Pass
        </button>
        <button
          onClick={() => commit("wear")}
          style={{
            flex: 1.4,
            borderRadius: 12,
            padding: "15px 0",
            border: "none",
            background: "#3d7a55",
            color: "#faf7f2",
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ✓ Wear this
        </button>
      </div>
    </div>
  );
}
