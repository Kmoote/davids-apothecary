/**
 * Shared types and sessionStorage helpers for real generated looks.
 */

export type RealSlotItem = {
  slot: string;           // "Top", "Bottom", "Shoes", "Layer", "Dress", etc.
  item_id: string;
  name: string;
  category: string;
  photo_url: string;
  thumbnail_url: string | null;
  colors: string[];       // hex, first = primary swatch
};

export type RealLookSlot = {
  slot: string;
  items: RealSlotItem[];  // [0] = primary pick, [1+] = alternatives for swapping
};

export type RealLook = {
  look_id: string;        // uuid from looks table
  name: string;
  tag: string;
  david_note: string;
  closing_line: string;
  slots: RealLookSlot[];
};

// ── sessionStorage cache ──────────────────────────────────────────────────────

const LOOKS_KEY = "da_looks";
const WORN_KEY  = "da_worn_look";
const CACHE_TTL = 8 * 60 * 60 * 1000; // 8 h

export function cacheLooks(looks: RealLook[]): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LOOKS_KEY, JSON.stringify({ ts: Date.now(), looks }));
}

export function getCachedLooks(): RealLook[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LOOKS_KEY);
    if (!raw) return null;
    const { ts, looks } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(LOOKS_KEY); return null; }
    return looks as RealLook[];
  } catch { return null; }
}

export function invalidateLooks(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(LOOKS_KEY);
}

export function cacheWornLook(look: RealLook): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(WORN_KEY, JSON.stringify(look));
}

export function getWornLook(): RealLook | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WORN_KEY);
    return raw ? (JSON.parse(raw) as RealLook) : null;
  } catch { return null; }
}
