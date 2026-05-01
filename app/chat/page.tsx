"use client";

import { useRouter } from "next/navigation";
import { DALogo } from "@/components/DALogo";
import { DavidAvatar } from "@/components/DavidBubble";

export default function ChatPage() {
  const router = useRouter();

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
              Personal Stylist
            </p>
            <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 17, color: "#faf7f2" }}>
              David
            </p>
          </div>
        </div>
      </div>

      {/* chat area — coming soon */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ padding: "0 32px" }}>
        <div className="fade-up flex gap-3 items-start w-full" style={{ maxWidth: 320 }}>
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
              I&apos;m getting my notes ready. Back soon with planning mode — occasions, travel packing, the works.
            </p>
          </div>
        </div>

        <p style={{
          fontFamily: "var(--font-jost), sans-serif",
          fontSize: 11, color: "#8a7a6a", textAlign: "center",
          marginTop: 8, lineHeight: 1.6,
        }}>
          Coming in the next update.
        </p>
      </div>

      {/* back button */}
      <div style={{ padding: "0 24px 32px" }}>
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
