"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useReimbursements } from "@/hooks/useReimbursements";
import { Button } from "@/components/ui/Button";
import { PaySwitcher } from "@/components/payroll/PaySwitcher";
import { ReimbursementListItem } from "@/components/reimbursements/ReimbursementListItem";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canRequestReimbursement, canSettleReimbursements, sameIdentity } from "@/lib/auth/permissions";
import { isConfiguredAccountRole, type AuthUser } from "@/lib/auth/types";
import { compareReimbursements, reimbursementsByPerson, totalOwed, totalPaid, type PersonReimbursements } from "@/lib/reimbursements";
import { formatMoney, type Decimal } from "@/lib/decimal";
import { addSplit, sortedTotals, UNASSIGNED } from "@/lib/backing";
import type { Reimbursement } from "@/lib/validation/schemas";

type Filter = "owed" | "paid" | "all";

export default function ReimbursementsPage() {
  const user = useCurrentUser();
  const { reimbursements, isLoading } = useReimbursements();
  const [filter, setFilter] = useState<Filter>("owed");
  const [mineOnly, setMineOnly] = useState(false);
  const canFilterMine = isConfiguredAccountRole(user.role);

  // "Mine" = owed to me or filed by me.
  const scoped = useMemo(
    () => (mineOnly && canFilterMine ? reimbursements.filter((item) => isMine(item, user)) : reimbursements),
    [reimbursements, mineOnly, canFilterMine, user],
  );
  const visible = useMemo(
    () => scoped.filter((item) => filter === "all" || item.status === filter).sort(compareReimbursements),
    [scoped, filter],
  );
  const owed = useMemo(() => totalOwed(scoped), [scoped]);
  const paid = useMemo(() => totalPaid(scoped), [scoped]);
  const byPerson = useMemo(() => reimbursementsByPerson(scoped), [scoped]);
  // Who owes the money still owed, by each reimbursement's backers.
  const owedByBacker = useMemo(() => {
    const totals = new Map<string, Decimal>();
    for (const row of scoped) if (row.status === "owed") addSplit(totals, row.amount, row.backing);
    return sortedTotals(totals);
  }, [scoped]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <PaySwitcher />
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reimbursements</h1>
          <p className="text-sm text-muted">
            {isLoading ? "Loading…" : `${owed.isZero() ? "Nothing owed" : `${formatMoney(owed)} owed`} · ${formatMoney(paid)} paid`}
          </p>
        </div>
        {canRequestReimbursement(user) ? (
          <Link href="/reimbursements/new">
            <Button className="h-10 px-4 text-sm">+ Add</Button>
          </Link>
        ) : null}
      </div>

      {owedByBacker.length > 0 && canSettleReimbursements(user) ? (
        <section className="space-y-1 rounded-2xl border border-border bg-surface p-4 text-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Owed, by backer</h2>
          {owedByBacker.map((row) => (
            <div key={row.name} className="flex items-baseline justify-between gap-3">
              <span className={row.name === UNASSIGNED ? "text-amber-400" : "text-foreground"}>{row.name}</span>
              <span className="num font-semibold text-amber-400">{formatMoney(row.amount)}</span>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted">Each reimbursement split by who backs it; set it on the reimbursement or its trip.</p>
        </section>
      ) : null}

      {byPerson.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">By person</h2>
          {byPerson.map((group) => (
            <PersonRow key={group.name} group={group} canSettle={canSettleReimbursements(user)} />
          ))}
        </section>
      ) : null}

      {reimbursements.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {canFilterMine ? (
            <Toggle>
              <ToggleButton active={!mineOnly} onClick={() => setMineOnly(false)}>
                Everyone
              </ToggleButton>
              <ToggleButton active={mineOnly} onClick={() => setMineOnly(true)}>
                Mine
              </ToggleButton>
            </Toggle>
          ) : null}
          <Toggle>
            {(["owed", "paid", "all"] as const).map((value) => (
              <ToggleButton key={value} active={filter === value} onClick={() => setFilter(value)}>
                {value === "owed" ? "Owed" : value === "paid" ? "Paid" : "All"}
              </ToggleButton>
            ))}
          </Toggle>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted">
          {reimbursements.length === 0 ? "No reimbursements yet." : filter === "owed" ? "Nobody is owed anything." : "Nothing here."}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <ReimbursementListItem key={item.reimbursement_id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}

/** One person's owed and paid totals; whoever can settle gets "Pay all", which asks once before marking every owed item paid. */
function PersonRow({ group, canSettle }: { group: PersonReimbursements; canSettle: boolean }) {
  const { update } = useReimbursements();
  const [confirming, setConfirming] = useState(false);
  const [paying, setPaying] = useState(false);
  const owedCount = group.owedItems.length;

  async function payAll() {
    setPaying(true);
    try {
      const paidAt = new Date().toISOString();
      for (const item of group.owedItems) {
        await update(item.reimbursement_id, { status: "paid", paid_at: paidAt }, item._row_version);
      }
    } finally {
      setPaying(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-foreground">{group.name}</p>
        <p className="text-xs text-muted">
          {owedCount ? (
            <span className="num font-semibold text-amber-400">{formatMoney(group.owed)} owed</span>
          ) : (
            "All paid up"
          )}
          {owedCount ? ` · ${owedCount}` : ""} · <span className="num">{formatMoney(group.paid)}</span> paid
        </p>
      </div>
      {canSettle && owedCount ? (
        confirming ? (
          <div className="flex shrink-0 gap-1.5">
            <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => setConfirming(false)} disabled={paying}>
              Cancel
            </Button>
            <Button className="h-9 px-3 text-xs" onClick={payAll} disabled={paying}>
              {paying ? "…" : `Pay ${formatMoney(group.owed)}`}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="h-9 shrink-0 px-3 text-xs" onClick={() => setConfirming(true)}>
            Pay all
          </Button>
        )
      ) : null}
    </div>
  );
}

function isMine(item: Reimbursement, user: AuthUser): boolean {
  if (item.payee_id && sameIdentity(item.payee_id, user)) return true;
  return item.owner_id ? sameIdentity(item.owner_id, user) : sameIdentity(item.requested_by, user);
}

function Toggle({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex rounded-xl border border-border bg-surface p-0.5 text-sm">{children}</div>;
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-9 rounded-lg px-3 py-1.5 font-medium transition-colors ${
        active ? "bg-surface-raised text-foreground" : "text-muted active:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
