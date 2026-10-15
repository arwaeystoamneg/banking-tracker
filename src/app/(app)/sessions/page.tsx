"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSessions } from "@/hooks/useSessions";
import { Button } from "@/components/ui/Button";
import { SessionListItem } from "@/components/sessions/SessionListItem";
import { TripGroup } from "@/components/sessions/TripGroup";
import { groupSessionsIntoTrips } from "@/lib/trips";
import { isSessionOpen } from "@/lib/sessionHelpers";
import { ownsSession } from "@/lib/auth/permissions";
import { isConfiguredAccountRole } from "@/lib/auth/types";
import { useCurrentUser } from "@/components/providers/AuthProvider";

type View = "trips" | "all";
type Scope = "everyone" | "mine";

export default function SessionsPage() {
  const user = useCurrentUser();
  const { sessions, isLoading } = useSessions();
  const [view, setView] = useState<View>("trips");
  const [scope, setScope] = useState<Scope>("everyone");
  const canFilterMine = isConfiguredAccountRole(user.role);

  // "Mine" = sessions I played or logged — the same set I'm allowed to update.
  const visible = useMemo(
    () => (scope === "mine" && canFilterMine ? sessions.filter((s) => ownsSession(user, s)) : sessions),
    [sessions, scope, canFilterMine, user],
  );
  const openNow = useMemo(
    () => visible.filter(isSessionOpen).sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1)),
    [visible],
  );
  // Open sessions are already listed above; trips still count them so trip totals stay whole.
  const sortedAll = useMemo(
    () => visible.filter((s) => !isSessionOpen(s)).sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1)),
    [visible],
  );
  const trips = useMemo(() => groupSessionsIntoTrips(visible), [visible]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sessions</h1>
          <p className="text-sm text-muted">
            {isLoading
              ? "Loading…"
              : `${visible.length} session${visible.length === 1 ? "" : "s"} · ${trips.length} trip${trips.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {user.role !== "demo" ? (
          <Link href="/sessions/new">
            <Button className="h-10 px-4 text-sm">+ Log session</Button>
          </Link>
        ) : null}
      </div>

      {sessions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {canFilterMine ? (
            <Toggle>
              <ToggleButton active={scope === "everyone"} onClick={() => setScope("everyone")}>
                Everyone
              </ToggleButton>
              <ToggleButton active={scope === "mine"} onClick={() => setScope("mine")}>
                Mine
              </ToggleButton>
            </Toggle>
          ) : null}
          <Toggle>
            <ToggleButton active={view === "trips"} onClick={() => setView("trips")}>
              By trip
            </ToggleButton>
            <ToggleButton active={view === "all"} onClick={() => setView("all")}>
              All
            </ToggleButton>
          </Toggle>
        </div>
      ) : null}

      {!isLoading && openNow.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-amber-400">Open now · {openNow.length}</h2>
          <div className="space-y-3">
            {openNow.map((s) => (
              <SessionListItem key={s.session_id} session={s} />
            ))}
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted">{scope === "mine" ? "No sessions for you yet." : "No sessions logged yet."}</p>
      ) : (
        <section className="space-y-2">
          {openNow.length > 0 ? (
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted">History</h2>
          ) : null}
          {view === "trips" ? (
            <div className="space-y-3">
              {trips.map((trip, i) => (
                <TripGroup key={trip.id} trip={trip} defaultOpen={i === 0 && openNow.length === 0} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedAll.map((s) => (
                <SessionListItem key={s.session_id} session={s} />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Toggle({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex rounded-xl border border-border bg-surface p-0.5 text-sm">{children}</div>;
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
