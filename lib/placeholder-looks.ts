export type PlaceholderLook = {
  id: number;
  name: string;
  tag: string;
  davidNote: string;
  closingLine: string;
  colors: string[];
  pieces: string[];
};

export const PLACEHOLDER_LOOKS: PlaceholderLook[] = [
  {
    id: 0,
    name: "The Edit",
    tag: "Polished",
    davidNote:
      "This is your 'I mean business, full stop' look. Clean, structured, completely you. I'm genuinely proud of this one.",
    closingLine: "Go be formidable, Cath.",
    colors: ["#2a3a54", "#ede9e0", "#cec5b0", "#9a7044"],
    pieces: ["Navy Blazer", "White Shirt", "Cream Trouser", "Tan Loafer"],
  },
  {
    id: 1,
    name: "Easy Day",
    tag: "Relaxed",
    davidNote:
      "Relaxed but not careless. There's a real ease to this one — trust it, Cat.",
    closingLine: "Effortless is a skill. You have it.",
    colors: ["#cfc5a0", "#e8e4dc", "#242020", "#c8a87e"],
    pieces: ["Linen Jacket", "Ivory Blouse", "Black Midi", "Nude Mule"],
  },
  {
    id: 2,
    name: "Sharp",
    tag: "Powerful",
    davidNote:
      "You walk into a room and own it without saying a word. This is that look.",
    closingLine: "Sharp, Cat. Very sharp.",
    colors: ["#2a3a54", "#ede9e0", "#48485a", "#1c1c22"],
    pieces: ["Cos Blazer", "White Shirt", "Charcoal Trouser", "Black Pump"],
  },
];
