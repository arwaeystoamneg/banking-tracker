"use client";

import Link from "next/link";
import { tripHref } from "@/lib/trips";
import { NO_TRIP, type PnlLine } from "@/lib/stats/tripPnl";

function money(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

function signed(value: number): string {
  return value > 0 ? `+${money(value)}` : money(value);
}

function tone(value: number): string {
  return value < 0 ? "text-red-400" : value > 0 ? "text-emerald-400" : "text-muted";
}

/**
 * Each trip's P&L, net first, then how it got there: gross results − pay − expenses. With `showCosts` off
 * (people who can't see everyone's pay) it's gross only.
 */
export function TripPnlTable({ rows, total, showCosts }: { rows: PnlLine[]; total: PnlLine; showCosts: boolean }) {
  if (rows.length === 0) return null;

  const line = (row: PnlLine, strong = false) => {
    const headline = showCosts ? row.net : row.gross;
    return (
      <div key={row.label} className="py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className={`min-w-0 truncate text-sm text-foreground ${strong ? "font-semibold" : ""}`}>
            {row.label === NO_TRIP || row.label === "Total" ? (
              row.label
            ) : (
              <Link href={tripHref(row.label)} className="underline decoration-border-strong underline-offset-4 active:text-muted">
                {row.label}
              </Link>
            )}
          </p>
          <p className={`num shrink-0 text-sm ${strong ? "font-semibold" : ""} ${tone(headline)}`}>{signed(headline)}</p>
        </div>
        <p className="num text-xs text-muted">
          {showCosts ? (
            <>
              {signed(row.gross)} gross{row.pay ? ` · −${money(row.pay)} pay` : ""}
              {row.expenses ? ` · −${money(row.expenses)} costs` : ""}
              {" · "}
            </>
          ) : null}
          {row.sessions} session{row.sessions === 1 ? "" : "s"} · {Math.round(row.hours)}h
          {row.hours > 0 ? ` · ${signed(headline / row.hours)}/h` : ""}
          {showCosts && row.payUnknown > 0 ? <span className="text-amber-400"> · {row.payUnknown} without pay rate or times</span> : null}
        </p>
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">P&amp;L by trip</h2>
      <p className="text-xs text-muted">
        {showCosts
          ? "Net = gross − pay (current rates) − costs (reimbursements, owed or paid)."
          : "Gross results of each trip's finished sessions."}
      </p>
      <div className="mt-1 divide-y divide-border">{rows.map((row) => line(row))}</div>
      <div className="border-t border-border-strong">{line(total, true)}</div>
    </section>
  );
}
