"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DALogo } from "@/components/DALogo";
import { DavidAvatar } from "@/components/DavidBubble";
import { type RealLook, getCachedLooks } from "@/lib/looks";

function ConfirmInner() {
  const params   = useSearchParams();
  const router   = useRouter();
  const [look, setLook] = useState<RealLook | null>(null);

  useEffect(() => {
    // Find the worn look by index from the sessionStorage cache
    const lookIdx = Number(params.get("look") ?? 0);
    const cached  = getCachedLooks();
    if (cached) {
      setLook(cached[lookIdx] ?? cached[0]);
    }
  }, [params]);

  if (!look) {
    // Fallback — shouldn't normally show, but just in case
    return (
      <div className="flex flex-col items-center justify-center bg-cream" style={{ height: "100dvh" }}>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`dot-${i + 1}`} style={{ width: 7, height: 7, borderRadius: "50%", background: "#c4a882", display: "inline-block" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col bg-cream"
      style={{ height: "100dvh", maxWidth: 390, margin: "0 auto", padding: "0 0 max(24px, env(safe-area-inset-bottom))" }}
    >
      {/* logo */}
      <div className="flex justify-center" style={{ paddingTop: 40 }}>
        <div className="pop-in">
          <DALogo size={52} />
        </div>
      </div>

      {/* badge + title */}
      <div className="fade-up flex flex-col items-center" style={{ animationDelay: "120ms", padding: "18px 24px 0" }}>
        <span style={{
          fontFamily: "var(--font-jost), sans-serif", fontSize: 9, color: "#c4a882",
          fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6,
        }}>
          Today&apos;s Choice
        </span>
        <h1 style={{
          fontFamily: "var(--font-playfair), serif", fontStyle: "italic",
          fontWeight: 700, fontSize: 32, color: "#2a2520", textAlign: "center",
        }}>
          {look.name}
        </h1>
        <p style={{
          fontFamily: "var(--font-jost), sans-serif", fontSize: 10, color: "#c4a882",
          fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4,
        }}>
          {look.tag}
        </p>
      </div>

      {/* flat-lay card */}
      <div
        className="fade-up"
        style={{
          animationDelay: "220ms", margin: "16px 24px",
          borderRadius: 16, overflow: "hidden",
          border: "1px solid rgba(42,37,32,0.12)",
          background: "#f5f0e8",
          boxShadow: "0 4px 20px rgba(42,37,32,0.08)",
          flex: 1, maxHeight: 240,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 14, height: "100%" }}>
          {look.slots.slice(0, 4).map((slot, i) => {
            const item = slot.items[0];
            return (
              <div
                key={i}
                className="texture relative"
                style={{ background: item?.colors[0] ?? "#cec5b0", borderRadius: 10, overflow: "hidden" }}
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
      </div>

      {/* piece chips */}
      <div
        className="fade-up flex flex-wrap justify-center gap-2"
        style={{ animationDelay: "320ms", padding: "0 24px" }}
      >
        {look.slots.map((slot) => {
          const item = slot.items[0];
          return (
            <span
              key={slot.slot}
              style={{
                fontFamily: "var(--font-jost), sans-serif", fontSize: 11, fontWeight: 500,
                padding: "5px 12px", borderRadius: 20,
                background: "#f5f0e8", border: "1px solid rgba(42,37,32,0.14)", color: "#2a2520",
              }}
            >
              {item?.name ?? slot.slot}
            </span>
          );
        })}
      </div>

      {/* David's closing line */}
      <div
        className="fade-up flex gap-2.5 items-start"
        style={{ animationDelay: "420ms", padding: "14px 24px" }}
      >
        <DavidAvatar size={26} />
        <div style={{
          flex: 1, background: "#f5f0e8",
          border: "1px solid rgba(42,37,32,0.12)",
          borderRadius: "3px 14px 14px 14px", padding: "9px 13px",
        }}>
          <p style={{
            fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#2a2520",
            lineHeight: 1.55, fontStyle: "italic",
          }}>
            {look.closing_line}
          </p>
        </div>
      </div>

      {/* start over */}
      <div className="fade-up" style={{ animationDelay: "520ms", padding: "0 24px" }}>
        <button
          onClick={() => router.push("/")}
          style={{
            width: "100%", borderRadius: 12, padding: "14px 0",
            border: "1.5px solid rgba(42,37,32,0.2)", background: "transparent",
            color: "#2a2520", fontFamily: "var(--font-jost), sans-serif",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}
        >
          Start over
        </button>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmInner />
    </Suspense>
  );
}
