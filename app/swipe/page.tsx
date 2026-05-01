"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DavidAvatar } from "@/components/DavidBubble";
import {
  PLACEHOLDER_LOOKS,
  resolveItems,
  type LookSlotItem,
} from "@/lib/placeholder-looks";

const CARD_THRESHOLD = 100; // px to commit pass/wear on the overall card
const ITEM_THRESHOLD = 40;  // px to swap an individual item

type Decision = "wear" | "pass";

/* ── individual swipeable item tile ─────────────────────── */
function SwipeableItem({
  item,
  onSwap,
  onDragStart,
  onDragEnd,
}: {
  item: LookSlotItem;
  onSwap: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [entering, setEntering] = useState(false);
  const startX = useRef(0);
  const liveX = useRef(0);

  const onPD = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    liveX.current = 0;
    setDragging(true);
    onDragStart();
  };
  const onPM = (e: React.PointerEvent) => {
    if (!dragging) return;
    e.stopPropagation();
    // only track leftward drag for swapping
    liveX.current = Math.min(0, e.clientX - startX.current);
    setDx(liveX.current);
  };
  const onPU = (e: React.PointerEvent) => {
    e.stopPropagation();
    setDragging(false);
    onDragEnd();
    const d = liveX.current;
    liveX.current = 0;
    if (d <= -ITEM_THRESHOLD) {
      setExiting(true);
      setTimeout(() => {
        onSwap();
        setExiting(false);
        setDx(0);
        setEntering(true);
        setTimeout(() => setEntering(false), 240);
      }, 200);
    } else {
      setDx(0);
    }
  };

  const swapHintOpacity = Math.min(1, Math.abs(dx) / ITEM_THRESHOLD);

  return (
    <div
      onPointerDown={onPD}
      onPointerMove={onPM}
      onPointerUp={onPU}
      className="texture relative flex flex-col justify-end"
      style={{
        borderRadius: 10,
        overflow: "hidden",
        background: item.color,
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
        userSelect: "none",
        transform: exiting
          ? "translateX(-110%)"
          : entering
          ? "translateX(12px)"
          : `translateX(${dx}px)`,
        opacity: exiting ? 0 : entering ? 0 : 1,
        transition: dragging
          ? "none"
          : "transform 0.22s cubic-bezier(0.22,1,0.36,1), opacity 0.18s ease",
      }}
    >
      {/* swap hint — appears as you drag */}
      <div
        style={{
          position: "absolute",
          top: 5,
          left: 5,
          opacity: swapHintOpacity * 0.8,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 7,
            color: item.textColor,
            fontWeight: 500,
          }}
        >
          ← swap
        </span>
      </div>

      {/* idle hint (always faintly visible) */}
      {!dragging && (
        <div
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            opacity: 0.3,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 6.5,
              color: item.textColor,
            }}
          >
            ↔
          </span>
        </div>
      )}

      {/* item labels */}
      <div style={{ padding: "3px 5px 4px", position: "relative" }}>
        <p
          style={{
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 7,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: item.textColor,
            opacity: 0.7,
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          {item.label}
        </p>
        <p
          style={{
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 7,
            color: item.textColor,
            opacity: 0.55,
            textAlign: "center",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.name}
        </p>
      </div>
    </div>
  );
}

/* ── swipeable flat-lay grid ────────────────────────────── */
function SwipeableFlatLay({
  items,
  onSwap,
  onItemDragStart,
  onItemDragEnd,
}: {
  items: LookSlotItem[];
  onSwap: (slotIdx: number) => void;
  onItemDragStart: () => void;
  onItemDragEnd: () => void;
}) {
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
      {items.map((item, i) => (
        <SwipeableItem
          key={i}
          item={item}
          onSwap={() => onSwap(i)}
          onDragStart={onItemDragStart}
          onDragEnd={onItemDragEnd}
        />
      ))}
    </div>
  );
}

/* ── main page ──────────────────────────────────────────── */
export default function SwipePage() {
  const router = useRouter();

  // which look we're on
  const [currentIndex, setCurrentIndex] = useState(0);
  // overall pass/wear decisions per look index
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  // which alternative is selected per slot: key = `${lookId}_${slotIdx}`
  const [altMap, setAltMap] = useState<Record<string, number>>({});

  // overall card drag state
  const [cardDx, setCardDx] = useState(0);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [cardExiting, setCardExiting] = useState<Decision | null>(null);

  const cardStartX = useRef(0);
  const cardLiveX = useRef(0);
  // flag set by item tiles to block card drag while they're being swiped
  const itemDraggingRef = useRef(false);

  const look = PLACEHOLDER_LOOKS[currentIndex];
  const nextLook = PLACEHOLDER_LOOKS[currentIndex + 1];
  const resolvedItems = resolveItems(look, altMap);
  const nextItems = nextLook ? resolveItems(nextLook, altMap) : [];

  const commitLook = useCallback(
    (decision: Decision) => {
      setCardExiting(decision);
      setTimeout(() => {
        const next = { ...decisions, [currentIndex]: decision };
        setDecisions(next);
        setCardExiting(null);
        setCardDx(0);
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

  const swapItem = useCallback(
    (slotIdx: number) => {
      const key = `${look.id}_${slotIdx}`;
      const current = altMap[key] ?? look.defaultAlts[slotIdx];
      setAltMap((prev) => ({
        ...prev,
        [key]: (current + 1) % look.slots[slotIdx].length,
      }));
    },
    [look, altMap]
  );

  /* card pointer handlers — blocked when an item tile is being dragged */
  const onCardPD = (e: React.PointerEvent<HTMLDivElement>) => {
    if (itemDraggingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    cardStartX.current = e.clientX;
    cardLiveX.current = 0;
    setIsDraggingCard(true);
  };
  const onCardPM = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCard || itemDraggingRef.current) return;
    cardLiveX.current = e.clientX - cardStartX.current;
    setCardDx(cardLiveX.current);
  };
  const onCardPU = () => {
    setIsDraggingCard(false);
    const d = cardLiveX.current;
    cardLiveX.current = 0;
    if (d >= CARD_THRESHOLD) commitLook("wear");
    else if (d <= -CARD_THRESHOLD) commitLook("pass");
    else setCardDx(0);
  };

  const rotation = cardDx * 0.055;
  const stampPct = Math.min(1, Math.max(0, (Math.abs(cardDx) - 60) / 50));

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
            width: 34, height: 34, borderRadius: "50%",
            border: "1.5px solid rgba(42,37,32,0.2)",
            background: "transparent", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: "#2a2520", lineHeight: 1, flexShrink: 0,
          }}
        >
          ‹
        </button>

        {/* step pips */}
        <div className="flex items-center gap-1.5 flex-1 justify-center">
          {PLACEHOLDER_LOOKS.map((_, i) => {
            const d = decisions[i];
            const isActive = i === currentIndex;
            const bg = isActive ? "#2a2520"
              : d === "wear" ? "#3d7a55"
              : d === "pass" ? "#c94040"
              : "rgba(42,37,32,0.15)";
            return (
              <div key={i} style={{
                width: isActive ? 20 : 6, height: 6, borderRadius: 3,
                background: bg,
                transition: "width 0.25s ease, background 0.2s ease",
              }} />
            );
          })}
        </div>

        <span style={{
          fontFamily: "var(--font-jost), sans-serif",
          fontSize: 11, color: "#8a7a6a", fontWeight: 500, flexShrink: 0,
        }}>
          {currentIndex + 1} of {PLACEHOLDER_LOOKS.length}
        </span>
      </div>

      {/* ── david's note ── */}
      <div style={{ padding: "0 18px 8px", flexShrink: 0 }}>
        <div className="flex gap-2.5 items-start" style={{
          background: "#f5f0e8", border: "1px solid rgba(42,37,32,0.12)",
          borderRadius: 12, padding: "9px 12px",
        }}>
          <DavidAvatar size={24} />
          <p style={{
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 12.5, color: "#2a2520", lineHeight: 1.55, flex: 1,
          }}>
            {look.davidNote}
          </p>
        </div>
        {/* swap affordance hint */}
        <p style={{
          fontFamily: "var(--font-jost), sans-serif",
          fontSize: 10, color: "#8a7a6a", textAlign: "center",
          marginTop: 6, letterSpacing: "0.02em",
        }}>
          ↔ Swipe any piece left to swap it out
        </p>
      </div>

      {/* ── card stack ── */}
      <div className="flex-1 relative" style={{ padding: "0 18px" }}>
        {/* background card */}
        {nextLook && (
          <div style={{
            position: "absolute", inset: "0 18px",
            borderRadius: 16, border: "1px solid rgba(42,37,32,0.10)",
            background: "#f5f0e8", transform: "scale(0.96)", overflow: "hidden",
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 8, padding: 14, height: "100%",
            }}>
              {nextItems.map((item, i) => (
                <div key={i} className="texture relative" style={{ background: item.color, borderRadius: 10 }} />
              ))}
            </div>
          </div>
        )}

        {/* active card */}
        <div
          onPointerDown={onCardPD}
          onPointerMove={onCardPM}
          onPointerUp={onCardPU}
          style={{
            position: "absolute", inset: "0 18px",
            borderRadius: 16, border: "1.5px solid rgba(42,37,32,0.14)",
            background: "#f5f0e8", overflow: "hidden",
            touchAction: "none",
            cursor: isDraggingCard ? "grabbing" : "grab",
            userSelect: "none",
            transform: cardExiting
              ? `translateX(${cardExiting === "wear" ? "130%" : "-130%"}) rotate(${cardExiting === "wear" ? 14 : -14}deg)`
              : `translateX(${cardDx}px) rotate(${rotation}deg)`,
            transition: isDraggingCard ? "none"
              : "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* swipeable flat-lay */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <SwipeableFlatLay
              items={resolvedItems}
              onSwap={swapItem}
              onItemDragStart={() => { itemDraggingRef.current = true; }}
              onItemDragEnd={() => {
                // small delay so the card's onPointerUp doesn't fire simultaneously
                setTimeout(() => { itemDraggingRef.current = false; }, 50);
              }}
            />
          </div>

          {/* look name strip */}
          <div style={{
            padding: "10px 16px 14px",
            borderTop: "1px solid rgba(42,37,32,0.10)", flexShrink: 0,
          }}>
            <p style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 9.5, color: "#c4a882", fontWeight: 600,
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3,
            }}>
              {look.tag}
            </p>
            <p style={{
              fontFamily: "var(--font-playfair), serif",
              fontStyle: "italic", fontWeight: 700, fontSize: 22, color: "#2a2520",
            }}>
              {look.name}
            </p>
          </div>

          {/* PASS stamp */}
          <div style={{
            position: "absolute", top: "28%", left: 18,
            opacity: cardDx < 0 ? stampPct : 0,
            transform: "rotate(-12deg)",
            border: "3px solid #c94040", borderRadius: 6,
            padding: "4px 12px", pointerEvents: "none",
          }}>
            <span style={{
              fontFamily: "var(--font-playfair), serif",
              fontStyle: "italic", fontWeight: 700, fontSize: 30, color: "#c94040",
            }}>PASS</span>
          </div>

          {/* WEAR stamp */}
          <div style={{
            position: "absolute", top: "28%", right: 18,
            opacity: cardDx > 0 ? stampPct : 0,
            transform: "rotate(12deg)",
            border: "3px solid #3d7a55", borderRadius: 6,
            padding: "4px 12px", pointerEvents: "none",
          }}>
            <span style={{
              fontFamily: "var(--font-playfair), serif",
              fontStyle: "italic", fontWeight: 700, fontSize: 30, color: "#3d7a55",
            }}>WEAR</span>
          </div>
        </div>
      </div>

      {/* ── footer buttons ── */}
      <div className="flex gap-3 shrink-0" style={{
        padding: "14px 18px",
        paddingBottom: "max(18px, env(safe-area-inset-bottom))",
      }}>
        <button onClick={() => commitLook("pass")} style={{
          flex: 1, borderRadius: 12, padding: "15px 0",
          border: "1.5px solid #c94040", background: "transparent",
          color: "#c94040", fontFamily: "var(--font-jost), sans-serif",
          fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>
          ✕ Pass
        </button>
        <button onClick={() => commitLook("wear")} style={{
          flex: 1.4, borderRadius: 12, padding: "15px 0",
          border: "none", background: "#3d7a55",
          color: "#faf7f2", fontFamily: "var(--font-jost), sans-serif",
          fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>
          ✓ Wear this
        </button>
      </div>
    </div>
  );
}
