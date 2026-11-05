"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { db, type QueueTab, type WriteQueueItem } from "@/offline/db";
import { resolveConflict } from "@/offline/queue";
import { formatDateForDisplay } from "@/lib/dates";

const TAB_LABEL: Record<QueueTab, string> = {
  games: "Game",
  sidebets: "Side bet",
  paytables: "Paytable row",
  feeSchedules: "Fee schedule",
  sessions: "Session",
  rounds: "Round",
  reimbursements: "Reimbursement",
  payrollMembers: "Pay rate",
  loans: "Loan",
};

const FIELD_LABEL: Record<string, string> = {
  buy_in: "Buy in",
  buy_out: "Buy out",
  time_in: "Time in",
  time_out: "Time out",
  date: "Date",
  payroll_paid_at: "Paid",
  payroll_paid_by: "Paid by",
  overtime_status: "Overtime",
  ray_sponsored: "Ray sponsored only",
  amount: "Amount",
  hourly_rate: "Base rate",
  overtime_rate: "Overtime rate",
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "blank";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return "yes";
  return String(value);
}

/** "Session · Damon · Oct 22, 2026" from whatever this phone has cached for the row. */
function describe(item: WriteQueueItem, row: Record<string, unknown> | undefined): string {
  const parts = [TAB_LABEL[item.tab] ?? item.tab];
  const who = row?.player || row?.logged_by || row?.payee || row?.member_name || row?.name;
  if (typeof who === "string" && who) parts.push(who);
  if (item.tab === "loans" && row) parts.push(`${row.from_name} → ${row.to_name}`);
  if (typeof row?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) parts.push(formatDateForDisplay(row.date));
  return parts.join(" · ");
}

function reason(item: WriteQueueItem): string {
  return (item.lastError ?? "").replace(/^(create|update|delete) failed: \d+( — )?/, "") || "The server refused this change.";
}

function serverRow(item: WriteQueueItem): Record<string, unknown> {
  try {
    return JSON.parse(item.lastError ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function ConflictDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const conflicts =
    useLiveQuery(async () => {
      if (!db) return [];
      const database = db;
      const items = await database.writeQueue.where("status").anyOf("conflict", "blocked").toArray();
      return Promise.all(
        items.map(async (item) => ({ item, row: (await database.table(item.tab).get(item.targetId)) as Record<string, unknown> | undefined })),
      );
    }, []) ?? [];

  return (
    <Dialog open={open} onClose={onClose} title="Changes that need you">
      {conflicts.length === 0 ? (
        <p className="text-sm text-muted">Nothing to sort out.</p>
      ) : (
        <div className="space-y-4">
          {conflicts.map(({ item, row }) => {
            const theirs = serverRow(item);
            const fields = Object.keys(item.payload).filter((field) => FIELD_LABEL[field] || item.status === "conflict");
            return (
              <div key={item.id} className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <p className="text-sm font-medium text-foreground">{describe(item, row ?? theirs)}</p>
                {item.status === "conflict" ? (
                  <>
                    <p className="text-xs text-muted">Someone else changed this at the same time. Your change hasn&apos;t been saved yet.</p>
                    {item.op === "update" && fields.length > 0 ? (
                      <ul className="space-y-0.5 text-xs">
                        {fields.map((field) => (
                          <li key={field} className="text-foreground">
                            {FIELD_LABEL[field] ?? field.replace(/_/g, " ")}: <span className="text-emerald-400">yours {show(item.payload[field])}</span>
                            <span className="text-muted"> · now {show(theirs[field])}</span>
                          </li>
                        ))}
                      </ul>
                    ) : item.op === "delete" ? (
                      <p className="text-xs text-foreground">You deleted it; they edited it.</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-muted">This change wasn&apos;t saved: {reason(item)}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="secondary"
                    className="h-9 flex-1 text-xs"
                    onClick={() => item.id !== undefined && resolveConflict(item.id, "discard-mine")}
                  >
                    {item.status === "conflict" ? "Keep theirs" : "Dismiss"}
                  </Button>
                  {item.status === "conflict" ? (
                    <Button variant="primary" className="h-9 flex-1 text-xs" onClick={() => item.id !== undefined && resolveConflict(item.id, "keep-mine")}>
                      Use mine
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
