export type LookSlotItem = {
  label: string;
  name: string;
  color: string;
  textColor: string;
};

export type PlaceholderLook = {
  id: number;
  name: string;
  tag: string;
  davidNote: string;
  closingLine: string;
  /** Each element is one clothing slot; the array holds 3 alternatives for that slot. */
  slots: [LookSlotItem, LookSlotItem, LookSlotItem][];
  /** Which alternative index is the default for each slot (0–2). */
  defaultAlts: number[];
};

const LAYERS: [LookSlotItem, LookSlotItem, LookSlotItem] = [
  { label: "BLAZER",   name: "Cos Blazer",       color: "#2a3a54", textColor: "#ddd8cc" },
  { label: "JACKET",   name: "Linen Jacket",      color: "#cfc5a0", textColor: "#2a2520" },
  { label: "CARDIGAN", name: "Toteme Cardigan",   color: "#c4a060", textColor: "#2a2520" },
];
const TOPS: [LookSlotItem, LookSlotItem, LookSlotItem] = [
  { label: "SHIRT",  name: "Everlane Shirt",  color: "#ede9e0", textColor: "#2a2520" },
  { label: "BLOUSE", name: "Theory Blouse",   color: "#e8e4dc", textColor: "#2a2520" },
  { label: "SHELL",  name: "Everlane Shell",  color: "#ddd4b8", textColor: "#2a2520" },
];
const BOTTOMS: [LookSlotItem, LookSlotItem, LookSlotItem] = [
  { label: "TROUSER", name: "Arket Trouser",   color: "#cec5b0", textColor: "#2a2520" },
  { label: "SKIRT",   name: "Arket Midi",       color: "#242020", textColor: "#ddd8cc" },
  { label: "TROUSER", name: "Toteme Trouser",  color: "#48485a", textColor: "#ddd8cc" },
];
const SHOES: [LookSlotItem, LookSlotItem, LookSlotItem] = [
  { label: "LOAFER", name: "Tod's Loafer",  color: "#9a7044", textColor: "#f5ede0" },
  { label: "MULE",   name: "Toteme Mule",   color: "#c8a87e", textColor: "#2a2520" },
  { label: "PUMP",   name: "COS Pump",      color: "#1c1c22", textColor: "#ddd8cc" },
];

export const PLACEHOLDER_LOOKS: PlaceholderLook[] = [
  {
    id: 0,
    name: "The Edit",
    tag: "Polished",
    davidNote:
      "This is your 'I mean business, full stop' look. Clean, structured, completely you. I'm genuinely proud of this one.",
    closingLine: "Go be formidable, Cath.",
    slots: [LAYERS, TOPS, BOTTOMS, SHOES],
    defaultAlts: [0, 0, 0, 0],
  },
  {
    id: 1,
    name: "Easy Day",
    tag: "Relaxed",
    davidNote:
      "Relaxed but not careless. There's a real ease to this one — trust it, Cat.",
    closingLine: "Effortless is a skill. You have it.",
    slots: [LAYERS, TOPS, BOTTOMS, SHOES],
    defaultAlts: [1, 0, 1, 1],
  },
  {
    id: 2,
    name: "Sharp",
    tag: "Powerful",
    davidNote:
      "You walk into a room and own it without saying a word. This is that look.",
    closingLine: "Sharp, Cat. Very sharp.",
    slots: [LAYERS, TOPS, BOTTOMS, SHOES],
    defaultAlts: [0, 0, 2, 2],
  },
];

/** Resolve the currently-selected items for a look given altMap overrides. */
export function resolveItems(
  look: PlaceholderLook,
  altMap: Record<string, number>
): LookSlotItem[] {
  return look.slots.map((pool, slotIdx) => {
    const key = `${look.id}_${slotIdx}`;
    const idx = altMap[key] ?? look.defaultAlts[slotIdx];
    return pool[idx % pool.length];
  });
}
