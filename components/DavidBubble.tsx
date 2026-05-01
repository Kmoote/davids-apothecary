export function DavidAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="shrink-0 flex items-center justify-center rounded-full bg-da-dark"
      style={{ width: size, height: size }}
    >
      <span
        style={{
          fontFamily: "var(--font-playfair), serif",
          fontStyle: "italic",
          fontSize: size * 0.44,
          color: "#faf7f2",
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        D
      </span>
    </div>
  );
}

export function DavidBubble({
  text,
  delay = 0,
}: {
  text: string;
  delay?: number;
}) {
  return (
    <div
      className="fade-up flex gap-2.5 items-start"
      style={{ animationDelay: `${delay}ms` }}
    >
      <DavidAvatar />
      <div
        className="flex-1"
        style={{
          background: "#f5f0e8",
          border: "1px solid rgba(42,37,32,0.14)",
          borderRadius: "3px 14px 14px 14px",
          padding: "10px 14px",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-jost), sans-serif",
            fontSize: 13.5,
            color: "#2a2520",
            lineHeight: 1.6,
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
}
