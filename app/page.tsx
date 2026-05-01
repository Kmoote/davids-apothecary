export default function Home() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "#1B2B4B" }}
    >
      <div className="flex flex-col items-center gap-6 text-center px-8">
        {/* Horizon mark — three bars */}
        <div className="flex flex-col items-center gap-[6px] mb-4">
          <div className="h-[6px] rounded-sm" style={{ width: 68, background: "#C9A96E" }} />
          <div className="h-[6px] rounded-sm" style={{ width: 47, background: "#C9A96E" }} />
          <div className="h-[6px] rounded-sm" style={{ width: 30, background: "#C9A96E" }} />
        </div>

        <h1
          className="text-4xl font-serif tracking-wide"
          style={{ color: "#F2EDE4", fontFamily: "Georgia, serif" }}
        >
          David&apos;s Apothecary
        </h1>
        <p
          className="text-sm tracking-widest uppercase"
          style={{ color: "#C9A96E", fontFamily: "monospace" }}
        >
          Coming soon — Mother&apos;s Day 2026
        </p>
      </div>
    </main>
  );
}
