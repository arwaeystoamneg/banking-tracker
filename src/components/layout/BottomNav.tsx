"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/games", label: "Games" },
  { href: "/sessions", label: "Sessions" },
  { href: "/rollups", label: "Stats" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-3 text-xs font-medium ${
              active ? "text-emerald-400" : "text-muted"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
