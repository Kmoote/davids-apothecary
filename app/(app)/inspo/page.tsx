export default function InspoPage() {
  return (
    <div className="flex flex-col h-full bg-cream items-center justify-center gap-3 px-8">
      <p style={{ fontFamily: "var(--font-playfair), serif", fontStyle: "italic", fontSize: 22, color: "#8a7a6a", textAlign: "center" }}>
        Coming in v2.
      </p>
      <p style={{ fontFamily: "var(--font-jost), sans-serif", fontSize: 13, color: "#8a7a6a", textAlign: "center", lineHeight: 1.6 }}>
        Show David a photo and he&apos;ll tell you what he thinks — and pull from what you already own.
      </p>
    </div>
  );
}
