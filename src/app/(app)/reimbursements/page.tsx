"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useReimbursements } from "@/hooks/useReimbursements";
import { Button } from "@/components/ui/Button";
import { ReimbursementListItem } from "@/components/reimbursements/ReimbursementListItem";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canRequestReimbursement, sameIdentity } from "@/lib/auth/permissions";
import { isConfiguredAccountRole, type AuthUser } from "@/lib/auth/types";
import { compareReimbursements, owedByPerson, totalOwed } from "@/lib/reimbursements";
import { formatMoney } from "@/lib/decimal";
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
  const byPerson = useMemo(() => owedByPerson(scoped), [scoped]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reimbursements</h1>
          <p className="text-sm text-muted">
            {isLoading ? "Loading…" : owed.isZero() ? "Nothing owed" : `${formatMoney(owed)} owed`}
          </p>
        </div>
        {canRequestReimbursement(user) ? (
          <Link href="/reimbursements/new">
            <Button className="h-10 px-4 text-sm">+ Add</Button>
          </Link>
        ) : null}
      </div>

      {byPerson.length > 1 ? (
        <section className="space-y-1 rounded-2xl border border-border bg-surface p-4 text-sm">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Owed to</h2>
          {byPerson.map((group) => (
            <div key={group.name} className="flex items-baseline justify-between gap-3">
              <span className="truncate text-foreground">
                {group.name} <span className="text-xs text-muted">· {group.count}</span>
              </span>
              <span className="num font-semibold text-amber-400">{formatMoney(group.total)}</span>
            </div>
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
