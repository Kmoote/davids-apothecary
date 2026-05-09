"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Home",     icon: "⌂", href: "/" },
  { label: "Wardrobe", icon: "⊞", href: "/wardrobe" },
  { label: "Trips",    icon: "✈", href: "/trips" },
  { label: "Inspo",    icon: "✂", href: "/inspo" },
  { label: "Profile",  icon: "◯", href: "/profile" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex bg-cream shrink-0"
      style={{ borderTop: "1px solid rgba(42,37,32,0.14)", paddingBottom: "env(safe-area-inset-bottom, 20px)" }}
    >
      {tabs.map(({ label, icon, href }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1"
          >
            <span style={{ fontSize: 16, color: isActive ? "#c4a882" : "#8a7a6a", lineHeight: 1 }}>
              {icon}
            </span>
            <span
              style={{
                fontSize: 9.5,
                color: isActive ? "#c4a882" : "#8a7a6a",
                fontFamily: "var(--font-jost), sans-serif",
                fontWeight: 500,
                letterSpacing: "0.04em",
                borderBottom: isActive ? "1.5px solid #c4a882" : "1.5px solid transparent",
                paddingBottom: 1,
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
