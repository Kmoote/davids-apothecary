"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PLACEHOLDER_LOOKS } from "@/lib/placeholder-looks";
import { DALogo } from "@/components/DALogo";
import { DavidAvatar } from "@/components/DavidBubble";

function ConfirmInner() {
  const params = useSearchParams();
  const router = useRouter();
  const lookId = Number(params.get("look") ?? 0);
  const look = PLACEHOLDER_LOOKS[lookId] ?? PLACEHOLDER_LOOKS[0];

  return (
    <div
      className="flex flex-col bg-cream"
      style={{ height: "100dvh", maxWidth: 390, margin: "0 auto", padding: "0 0 max(24px, env(safe-area-inset-bottom))" }}
    >
      {/* top spacer + logo */}
      <div className="flex justify-center" style={{ paddingTop: 40 }}>
        <div className="pop-in">
          <DALogo size={52} />
        </div>
      </div>

      {/* "The Edit" badge */}
      <div
        className="fade-up flex flex-col items-center"
        style={{ animationDelay: "120ms", padding: "18px 24px 0" }}
      >
        <span
          style={{
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 9,
            color: "#c4a882",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Today&apos;s Choice
        </span>
        <h1
          style={{
            fontFamily: "var(--font-playfair), serif",
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 32,
            color: "#2a2520",
            textAlign: "center",
          }}
        >
          {look.name}
        </h1>
      </div>

      {/* flat-lay card */}
      <div
        className="fade-up"
        style={{
          animationDelay: "220ms",
          margin: "16px 24px",
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid rgba(42,37,32,0.12)",
          background: "#f5f0e8",
          boxShadow: "0 4px 20px rgba(42,37,32,0.08)",
          flex: 1,
          maxHeight: 240,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            padding: 14,
            height: "100%",
          }}
        >
          {look.colors.map((c, i) => (
            <div
              key={i}
              className="texture relative"
              style={{ background: c, borderRadius: 10 }}
            />
          ))}
        </div>
      </div>

      {/* pieces */}
      <div
        className="fade-up flex flex-wrap justify-center gap-2"
        style={{ animationDelay: "320ms", padding: "0 24px" }}
      >
        {look.pieces.map((piece) => (
          <span
            key={piece}
            style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 11,
              fontWeight: 500,
              padding: "5px 12px",
              borderRadius: 20,
              background: "#f5f0e8",
              border: "1px solid rgba(42,37,32,0.14)",
              color: "#2a2520",
            }}
          >
            {piece}
          </span>
        ))}
      </div>

      {/* david's closing line */}
      <div
        className="fade-up flex gap-2.5 items-start"
        style={{ animationDelay: "420ms", padding: "14px 24px" }}
      >
        <DavidAvatar size={26} />
        <div
          style={{
            flex: 1,
            background: "#f5f0e8",
            border: "1px solid rgba(42,37,32,0.12)",
            borderRadius: "3px 14px 14px 14px",
            padding: "9px 13px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 13,
              color: "#2a2520",
              lineHeight: 1.55,
              fontStyle: "italic",
            }}
          >
            {look.closingLine}
          </p>
        </div>
      </div>

      {/* start over */}
      <div
        className="fade-up"
        style={{ animationDelay: "520ms", padding: "0 24px" }}
      >
        <button
          onClick={() => router.push("/")}
          style={{
            width: "100%",
            borderRadius: 12,
            padding: "14px 0",
            border: "1.5px solid rgba(42,37,32,0.2)",
            background: "transparent",
            color: "#2a2520",
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
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
