import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full max-w-sm mx-auto">
      <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
      <BottomNav />
    </div>
  );
}
