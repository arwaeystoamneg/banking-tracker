"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canSeeAllLossReports, canSubmitLossReport } from "@/lib/auth/permissions";

/** Stroked line icons — flat, no fill, so they read in low light without emotional color. */
function Icon({ path }: { path: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      {path}
    </svg>
  );
}

const BANKING_ITEMS: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/games",
    label: "Games",
    icon: <Icon path={<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16" /></>} />,
  },
  {
    href: "/ev",
    label: "EV",
    icon: <Icon path={<><path d="M3 20c3 0 4-14 9-14s6 14 9 14" /><path d="M3 20h18" /></>} />,
  },
  {
    href: "/sessions",
    label: "Sessions",
    icon: <Icon path={<><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></>} />,
  },
  {
    href: "/rollups",
    label: "Stats",
    icon: <Icon path={<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>} />,
  },
];

const LOSSES_ITEM: { href: string; label: string; icon: ReactNode } = {
  href: "/losses",
  label: "Losses",
  icon: (
    <Icon
      path={
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h5" />
        </>
      }
    />
  ),
};

export function BottomNav() {
  const pathname = usePathname();
  const user = useCurrentUser();
  const items =
    canSubmitLossReport(user) || canSeeAllLossReports(user)
      ? [...BANKING_ITEMS, LOSSES_ITEM]
      : BANKING_ITEMS;

  return (
    <nav className="sticky bottom-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              active ? "text-emerald-400" : "text-muted active:text-muted-strong"
            }`}
          >
            {active ? (
              <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-emerald-400" aria-hidden />
            ) : null}
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
