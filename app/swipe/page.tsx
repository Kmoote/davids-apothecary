"use client";

import { Suspense, useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DavidAvatar } from "@/components/DavidBubble";
import {
  type RealLook,
  type RealSlotItem,
  getCachedLooks,
  cacheLooks,
  cacheWornLook,
  toThumbUrl,
} from "@/lib/looks";

const CARD_THRESHOLD = 100;
const ITEM_THRESHOLD = 40;

type Decision = "wear" | "pass";

// Meta returned by POST /api/generate-looks (anchor mode)
type AnchorMeta = {
  id: string;
  name: string;
  category: string;
  thumbnail_url: string;
} | null;

// ── individual item tile ──────────────────────────────────────────────────────

function SwipeableItem({
  item,
  onSwap,
  onDragStart,
  onDragEnd,
  isAnchor,
}: {
  item: RealSlotItem;
  onSwap: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isAnchor?: boolean;
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
  const swatch = item.colors[0] ?? "#cec5b0";

  return (
    <div
      onPointerDown={onPD}
      onPointerMove={onPM}
      onPointerUp={onPU}
      className="relative"
      style={{
        borderRadius: 10,
        overflow: "hidden",
        background: swatch,
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
        userSelect: "none",
        // Anchor item gets a gold ring to visually distinguish it
        outline: isAnchor ? "2px solid #c4a882" : "none",
        outlineOffset: isAnchor ? "-2px" : undefined,
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
      {/* photo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={toThumbUrl(item.photo_url, 600) ?? item.thumbnail_url ?? item.photo_url}
        alt={item.name}
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ pointerEvents: "none" }}
      />

      {/* dark gradient for label legibility */}
      <div
        style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, transparent 38%, transparent 60%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* slot label / anchor badge top-left */}
      <div style={{ position: "absolute", top: 5, left: 6, pointerEvents: "none" }}>
        {isAnchor ? (
          <span style={{
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 7, fontWeight: 700, letterSpacing: "0.08em",
            color: "#c4a882", textTransform: "uppercase",
          }}>
            ✦ anchor
          </span>
        ) : (
          <span style={{
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 7, fontWeight: 700, letterSpacing: "0.1em",
            color: "#c4a882", textTransform: "uppercase",
          }}>
            {item.slot}
          </span>
        )}
      </div>

      {/* swap hint (hidden for anchor item — it can still be swapped for similar pieces) */}
      <div style={{
        position: "absolute", top: 5, right: 5,
        opacity: dragging ? swapHintOpacity * 0.9 : 0.35,
        pointerEvents: "none",
        transition: dragging ? "none" : "opacity 0.2s",
      }}>
        <span style={{
          fontFamily: "var(--font-jost), sans-serif",
          fontSize: 6.5, color: "#fff",
        }}>
          {dragging && dx < -8 ? "← swap" : "↔"}
        </span>
      </div>

      {/* item name bottom */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "3px 5px 5px", pointerEvents: "none" }}>
        <p style={{
          fontFamily: "var(--font-jost), sans-serif",
          fontSize: 7.5, color: "#fff", fontWeight: 500,
          lineHeight: 1.25, textAlign: "center",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {item.name}
        </p>
      </div>
    </div>
  );
}

// ── flat-lay grid ─────────────────────────────────────────────────────────────

function FlatLay({
  look,
  altMap,
  onSwap,
  onItemDragStart,
  onItemDragEnd,
  anchorItemId,
}: {
  look: RealLook;
  altMap: Record<string, number>;
  onSwap: (slotIdx: number) => void;
  onItemDragStart: () => void;
  onItemDragEnd: () => void;
  anchorItemId?: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 14, height: "100%" }}>
      {look.slots.map((slot, i) => {
        const key = `${look.look_id}_${i}`;
        const itemIdx = altMap[key] ?? 0;
        const item = slot.items[itemIdx % slot.items.length];
        // An item is the anchor if its id matches anchorItemId OR if the current
        // alt selection shows the anchor item (e.g. they swiped back to it).
        const isAnchor = !!anchorItemId && item.item_id === anchorItemId;
        return (
          <SwipeableItem
            key={i}
            item={item}
            onSwap={() => onSwap(i)}
            onDragStart={onItemDragStart}
            onDragEnd={onItemDragEnd}
            isAnchor={isAnchor}
          />
        );
      })}
    </div>
  );
}

// ── loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4" style={{ padding: "60px 0" }}>
      <DavidAvatar size={42} />
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`dot-${i + 1}`}
            style={{ width: 7, height: 7, borderRadius: "50%", background: "#c4a882", display: "inline-block" }}
          />
        ))}
      </div>
      <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#8a7a6a", textAlign: "center" }}>
        {message ?? "David is pulling your looks…"}
      </p>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

function SwipePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [looks, setLooks] = useState<RealLook[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [anchorMeta, setAnchorMeta] = useState<AnchorMeta>(null);

  // Read ?anchor=<id> — when present, swipe page fetches via POST (anchor mode)
  const anchorId = searchParams.get("anchor");

  // Read ?look=N from the URL so tapping Look 2 or 3 on home starts there
  const startIndex = Math.max(0, parseInt(searchParams.get("look") ?? "0", 10) || 0);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [altMap, setAltMap] = useState<Record<string, number>>({});

  // True while the "None of these" regenerate fetch is in flight
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Phase C1 — set of look_ids that Catherine has currently saved.
  // Populated once on mount; updated optimistically on heart-tap.
  const [savedLookIds, setSavedLookIds] = useState<Set<string>>(new Set());

  const [cardDx, setCardDx] = useState(0);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [cardExiting, setCardExiting] = useState<Decision | null>(null);
  // True for one frame when a new card snaps in — disables CSS transition so it
  // doesn't sweep from the previous exit position (e.g. -130%/-14deg → 0)
  const [isSnapping, setIsSnapping] = useState(false);

  const cardStartX = useRef(0);
  const cardLiveX = useRef(0);
  const itemDraggingRef = useRef(false);

  // ── fetch looks ──
  useEffect(() => {
    if (anchorId) {
      // Anchor mode: always fresh, call POST with the anchor item id.
      // Never read from or write to the normal localStorage cache.
      fetch("/api/generate-looks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorItemId: anchorId }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (json.error) throw new Error(json.error);
          setAnchorMeta(json.meta?.anchor ?? null);
          setLooks(json.looks);
        })
        .catch((err) => setLoadError(err.message));
      return;
    }

    // Normal mode: check localStorage cache first
    const cached = getCachedLooks();
    if (cached) { setLooks(cached); return; }

    fetch("/api/generate-looks")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        cacheLooks(json.looks);
        setLooks(json.looks);
      })
      .catch((err) => setLoadError(err.message));
  }, [anchorId]);

  const look = looks?.[currentIndex];
  const nextLook = looks?.[currentIndex + 1];

  // Phase C1 — fetch which of Catherine's looks are currently saved.
  // Cheap (one query, returns ids only), fires after we have looks so we know
  // what to highlight.
  useEffect(() => {
    if (!looks || looks.length === 0) return;
    fetch("/api/saved-looks")
      .then((r) => r.json())
      .then((json: { saved?: Array<{ look?: { look_id?: string } | null }> }) => {
        const ids = new Set(
          (json.saved ?? [])
            .map((s) => s.look?.look_id)
            .filter((id): id is string => Boolean(id))
        );
        setSavedLookIds(ids);
      })
      .catch(() => {/* silent — heart will just stay unsaved */});
  }, [looks]);

  /** Toggle save/unsave for a look. Optimistic UI; reverts on error. */
  const toggleSave = useCallback(async (lookId: string) => {
    if (!lookId) return;
    const wasSaved = savedLookIds.has(lookId);
    // Optimistic: flip local state immediately
    setSavedLookIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(lookId); else next.add(lookId);
      return next;
    });
    try {
      if (wasSaved) {
        await fetch(`/api/saved-looks?look_id=${encodeURIComponent(lookId)}`, { method: "DELETE" });
      } else {
        await fetch("/api/saved-looks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ look_id: lookId }),
        });
      }
    } catch {
      // Revert on network error
      setSavedLookIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(lookId); else next.delete(lookId);
        return next;
      });
    }
  }, [savedLookIds]);

  const commitLook = useCallback(
    async (decision: Decision) => {
      if (!looks || !look) return;
      setCardExiting(decision);

      // fire-and-forget decision record
      if (look.look_id) {
        fetch("/api/record-decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ look_id: look.look_id, action: decision }),
        }).catch(() => {/* non-blocking */});
      }

      // cache the worn look for confirm page
      if (decision === "wear") cacheWornLook(look);

      setTimeout(() => {
        const next = { ...decisions, [currentIndex]: decision };
        setDecisions(next);

        if (currentIndex >= looks.length - 1) {
          // all done — navigate to confirm with the worn look's id
          const wornEntry = Object.entries(next).find(([, d]) => d === "wear");
          const wornIdx = wornEntry ? wornEntry[0] : "0";
          const wornLook = looks[Number(wornIdx)];
          if (wornLook) cacheWornLook(wornLook);
          router.push(`/confirm?look=${wornIdx}`);
        } else {
          // Snap the card to position 0 with no transition, then re-enable
          setIsSnapping(true);
          setCardExiting(null);
          setCardDx(0);
          setCurrentIndex((i) => i + 1);
          requestAnimationFrame(() => requestAnimationFrame(() => setIsSnapping(false)));
        }
      }, 300);
    },
    [look, looks, currentIndex, decisions, router]
  );

  const swapItem = useCallback(
    (slotIdx: number) => {
      if (!look) return;
      const key = `${look.look_id}_${slotIdx}`;
      const currentAlt = altMap[key] ?? 0;
      const total = look.slots[slotIdx]?.items.length ?? 1;
      setAltMap((prev) => ({ ...prev, [key]: (currentAlt + 1) % total }));
    },
    [look, altMap]
  );

  // ── regenerate (None of these) ──
  // Fetches a completely fresh set from the server, bypassing both the
  // localStorage cache and the server-side daily DB cache (?refresh=1).
  // No preference signal is recorded for the current set — just silently replace.
  // The regenerated looks ARE written to DB so wear/pass decisions still record.
  const handleRegenerate = useCallback(async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    setLooks(null);
    setCurrentIndex(0);
    setDecisions({});
    setAltMap({});
    setCardDx(0);
    setCardExiting(null);
    try {
      const r = await fetch("/api/generate-looks?refresh=1");
      const json = await r.json();
      if (json.error) throw new Error(json.error);
      // Intentionally NOT calling cacheLooks() — the home page should still
      // show the original daily set; regeneration is ephemeral for this session.
      setLooks(json.looks);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsRegenerating(false);
    }
  }, [isRegenerating]);

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

  const rotation  = cardDx * 0.055;
  const stampPct  = Math.min(1, Math.max(0, (Math.abs(cardDx) - 60) / 50));

  // Loading message varies by mode
  const loadingMessage = anchorId
    ? "David is styling around your pick…"
    : isRegenerating
    ? "David is finding you something different…"
    : "David is pulling your looks…";

  // ── render ──

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 bg-cream" style={{ height: "100dvh", maxWidth: 390, margin: "0 auto", padding: "0 24px" }}>
        <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#c94040", textAlign: "center" }}>
          {loadError}
        </p>
        <button
          onClick={() => { setLoadError(null); window.location.reload(); }}
          style={{ borderRadius: 12, padding: "12px 24px", border: "1.5px solid rgba(42,37,32,0.2)", background: "transparent", color: "#2a2520", fontFamily: "var(--font-jost), sans-serif", fontSize: 13, cursor: "pointer" }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!looks || !look) {
    return (
      <div className="flex flex-col bg-cream" style={{ height: "100dvh", maxWidth: 390, margin: "0 auto" }}>
        {/* header skeleton */}
        <div className="flex items-center shrink-0" style={{ padding: "12px 18px 8px", gap: 12 }}>
          <button
            onClick={() => router.push(anchorId ? "/wardrobe" : "/")}
            style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px solid rgba(42,37,32,0.2)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#2a2520", flexShrink: 0 }}
          >
            ‹
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <LoadingSkeleton message={loadingMessage} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-cream" style={{ height: "100dvh", maxWidth: 390, margin: "0 auto" }}>

      {/* ── header ── */}
      <div className="flex items-center shrink-0" style={{ padding: "12px 18px 8px", gap: 12 }}>
        <button
          onClick={() => router.push(anchorId ? "/wardrobe" : "/")}
          style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px solid rgba(42,37,32,0.2)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#2a2520", lineHeight: 1, flexShrink: 0 }}
        >
          ‹
        </button>

        {/* step pips */}
        <div className="flex items-center gap-1.5 flex-1 justify-center">
          {looks.map((_, i) => {
            const d = decisions[i];
            const isActive = i === currentIndex;
            const bg = isActive ? "#2a2520"
              : d === "wear" ? "#3d7a55"
              : d === "pass" ? "#c94040"
              : "rgba(42,37,32,0.15)";
            return (
              <div key={i} style={{
                width: isActive ? 20 : 6, height: 6, borderRadius: 3, background: bg,
                transition: "width 0.25s ease, background 0.2s ease",
              }} />
            );
          })}
        </div>

        <span style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 11, color: "#8a7a6a", fontWeight: 500, flexShrink: 0 }}>
          {currentIndex + 1} of {looks.length}
        </span>
      </div>

      {/* ── anchor mode banner ── */}
      {anchorMeta && (
        <div style={{ padding: "0 18px 6px", flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(196,168,130,0.12)",
            border: "1px solid rgba(196,168,130,0.28)",
            borderRadius: 10, padding: "6px 10px",
          }}>
            <span style={{ fontSize: 11, color: "#c4a882" }}>✦</span>
            <p style={{
              fontFamily: "var(--font-jost), sans-serif",
              fontSize: 11, color: "#8a7a6a", lineHeight: 1.4, margin: 0,
            }}>
              Styled around{" "}
              <strong style={{ color: "#2a2520", fontWeight: 600 }}>
                {anchorMeta.name}
              </strong>
            </p>
          </div>
        </div>
      )}

      {/* ── david's note ── */}
      <div style={{ padding: "0 18px 8px", flexShrink: 0 }}>
        <div className="flex gap-2.5 items-start" style={{ background: "#f5f0e8", border: "1px solid rgba(42,37,32,0.12)", borderRadius: 12, padding: "9px 12px" }}>
          <DavidAvatar size={24} />
          <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 12.5, color: "#2a2520", lineHeight: 1.55, flex: 1 }}>
            {look.david_note}
          </p>
        </div>
        <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 10, color: "#8a7a6a", textAlign: "center", marginTop: 6, letterSpacing: "0.02em" }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 14, height: "100%" }}>
              {nextLook.slots.map((slot, i) => (
                <div key={i} style={{
                  borderRadius: 10, overflow: "hidden",
                  background: slot.items[0]?.colors[0] ?? "#cec5b0",
                  position: "relative",
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={toThumbUrl(slot.items[0]?.photo_url, 400) ?? slot.items[0]?.thumbnail_url ?? slot.items[0]?.photo_url}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ opacity: 0.6, pointerEvents: "none" }}
                  />
                </div>
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
            touchAction: "none", cursor: isDraggingCard ? "grabbing" : "grab",
            userSelect: "none",
            transform: cardExiting
              ? `translateX(${cardExiting === "wear" ? "130%" : "-130%"}) rotate(${cardExiting === "wear" ? 14 : -14}deg)`
              : `translateX(${cardDx}px) rotate(${rotation}deg)`,
            transition: (isDraggingCard || isSnapping) ? "none" : "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* flat-lay */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <FlatLay
              look={look}
              altMap={altMap}
              onSwap={swapItem}
              onItemDragStart={() => { itemDraggingRef.current = true; }}
              onItemDragEnd={() => { setTimeout(() => { itemDraggingRef.current = false; }, 50); }}
              anchorItemId={anchorMeta?.id}
            />
          </div>

          {/* look name strip — Phase C1 adds heart on the right */}
          <div style={{ padding: "10px 16px 14px", borderTop: "1px solid rgba(42,37,32,0.10)", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 9.5, color: "#c4a882", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
                {look.tag}
              </p>
              <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 22, color: "#2a2520" }}>
                {look.name}
              </p>
            </div>
            {look.look_id && (() => {
              const isSaved = savedLookIds.has(look.look_id);
              return (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (look.look_id) toggleSave(look.look_id); }}
                  aria-label={isSaved ? "Remove from saved" : "Save this look"}
                  style={{
                    flexShrink: 0,
                    width: 40, height: 40,
                    borderRadius: 20,
                    border: `1px solid ${isSaved ? "#c94060" : "rgba(42,37,32,0.18)"}`,
                    background: isSaved ? "rgba(201,64,96,0.10)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    transition: "background 0.15s, border-color 0.15s",
                    padding: 0,
                  }}
                >
                  <span style={{ fontSize: 18, lineHeight: 1, color: isSaved ? "#c94060" : "#8a7a6a" }}>
                    {isSaved ? "♥" : "♡"}
                  </span>
                </button>
              );
            })()}
          </div>

          {/* PASS stamp */}
          <div style={{ position: "absolute", top: "28%", left: 18, opacity: cardDx < 0 ? stampPct : 0, transform: "rotate(-12deg)", border: "3px solid #c94040", borderRadius: 6, padding: "4px 12px", pointerEvents: "none" }}>
            <span style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, color: "#c94040" }}>PASS</span>
          </div>

          {/* WEAR stamp */}
          <div style={{ position: "absolute", top: "28%", right: 18, opacity: cardDx > 0 ? stampPct : 0, transform: "rotate(12deg)", border: "3px solid #3d7a55", borderRadius: 6, padding: "4px 12px", pointerEvents: "none" }}>
            <span style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, color: "#3d7a55" }}>WEAR</span>
          </div>
        </div>
      </div>

      {/* ── footer ── */}
      <div className="shrink-0" style={{ padding: "14px 18px 0" }}>
        {/* Pass / Wear buttons */}
        <div
          className="flex gap-3"
          style={{
            paddingBottom: anchorId
              ? "max(18px, env(safe-area-inset-bottom))"
              : "4px",
          }}
        >
          <button
            onClick={() => commitLook("pass")}
            style={{ flex: 1, borderRadius: 12, padding: "15px 0", border: "1.5px solid #c94040", background: "transparent", color: "#c94040", fontFamily: "var(--font-jost), sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            ✕ Pass
          </button>
          <button
            onClick={() => commitLook("wear")}
            style={{ flex: 1.4, borderRadius: 12, padding: "15px 0", border: "none", background: "#3d7a55", color: "#faf7f2", fontFamily: "var(--font-jost), sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            ✓ Wear this
          </button>
        </div>

        {/* None of these — only shown in normal mode (not anchor mode) */}
        {!anchorId && (
          <div style={{ textAlign: "center", paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}>
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              style={{
                background: "none",
                border: "none",
                cursor: isRegenerating ? "wait" : "pointer",
                fontFamily: "var(--font-jost), sans-serif",
                fontSize: 12,
                color: isRegenerating ? "#c4a882" : "#8a7a6a",
                padding: "8px 0",
                letterSpacing: "0.02em",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              {isRegenerating ? "Finding more…" : "None of these — show me something different"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SwipePage() {
  return (
    <Suspense>
      <SwipePageInner />
    </Suspense>
  );
}
