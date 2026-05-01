export function DALogo({ size = 60, dark = false }: { size?: number; dark?: boolean }) {
  const fg = dark ? "#faf7f2" : "#2a2520";
  const bg = dark ? "#2a2520" : "#faf7f2";
  return (
    <svg
      width={size}
      height={Math.round(size * 1.28)}
      viewBox="0 0 100 128"
      fill="none"
      aria-label="David's Apothecary"
    >
      <ellipse cx="50" cy="65" rx="46" ry="58" fill={bg} stroke={fg} strokeWidth="2.2" />
      <ellipse cx="50" cy="65" rx="40" ry="52" fill="none" stroke={fg} strokeWidth="0.9" opacity="0.45" />
      <line x1="26" y1="20" x2="74" y2="20" stroke={fg} strokeWidth="0.9" opacity="0.4" />
      <line x1="24" y1="110" x2="76" y2="110" stroke={fg} strokeWidth="0.9" opacity="0.4" />
      <polygon points="50,11 53,17 50,23 47,17" fill={fg} opacity="0.45" />
      <polygon points="50,119 53,113 50,107 47,113" fill={fg} opacity="0.45" />
      <text
        x="50" y="80"
        textAnchor="middle"
        fontFamily="'Playfair Display',Georgia,serif"
        fontStyle="italic"
        fontWeight="700"
        fontSize="46"
        fill={fg}
        letterSpacing="-1"
      >
        DA
      </text>
      <text
        x="50" y="98"
        textAnchor="middle"
        fontFamily="'Playfair Display',Georgia,serif"
        fontWeight="400"
        fontSize="6.8"
        fill={fg}
        letterSpacing="2.8"
        opacity="0.65"
      >
        APOTHECARY
      </text>
    </svg>
  );
}
