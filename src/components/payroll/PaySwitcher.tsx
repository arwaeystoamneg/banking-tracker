"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/payroll", label: "Payroll" },
  { href: "/reimbursements", label: "Reimburse" },
  { href: "/loans", label: "Loans" },
];

/** The Pay tab holds three sections; this switches between them. */
export function PaySwitcher() {
  const pathname = usePathname();
  return (
    <div className="grid grid-cols-3 rounded-xl border border-border bg-surface p-0.5 text-sm">
      {SECTIONS.map((section) => {
        const active = pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 items-center justify-center rounded-lg font-medium transition-colors ${
              active ? "bg-surface-raised text-foreground" : "text-muted active:text-foreground"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}
