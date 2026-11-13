"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSessions } from "@/hooks/useSessions";
import { Button } from "@/components/ui/Button";
import { SessionListItem } from "@/components/sessions/SessionListItem";
import { TripGroup } from "@/components/sessions/TripGroup";
import { BulkMarkPanel } from "@/components/sessions/BulkMarkPanel";
import { groupSessionsIntoTrips, sessionTrip } from "@/lib/trips";
import { canMarkPayrollPaid } from "@/lib/payroll";
import { byPlayTimeNewestFirst, isSessionOpen } from "@/lib/sessionHelpers";
import { ownsSession } from "@/lib/auth/permissions";
import { isConfiguredAccountRole } from "@/lib/auth/types";
import { useCurrentUser } from "@/components/providers/AuthProvider";

type View = "sessions" | "trips";
type Scope = "everyone" | "mine";

export default function SessionsPage() {
  const user = useCurrentUser();
  const { sessions, isLoading } = useSessions();
  const [view, setView] = useState<View>("sessions");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const canMark = canMarkPayrollPaid(user);
  const [scope, setScope] = useState<Scope>("everyone");
  const canFilterMine = isConfiguredAccountRole(user.role);

  // "Mine" = sessions I played or logged — the same set I'm allowed to update.
  const visible = useMemo(
    () => (scope === "mine" && canFilterMine ? sessions.filter((s) => ownsSession(user, s)) : sessions),
    [sessions, scope, canFilterMine, user],
  );
  const openNow = useMemo(
    () => visible.filter(isSessionOpen).sort(byPlayTimeNewestFirst),
    [visible],
  );
  // Open sessions are already listed above; trips still count them so trip totals stay whole.
  const sortedAll = useMemo(
    () => visible.filter((s) => !isSessionOpen(s)).sort(byPlayTimeNewestFirst),
    [visible],
  );
  const trips = useMemo(() => groupSessionsIntoTrips(visible), [visible]);
  // In the Trips view, sessions nobody put in a trip are listed on their own after the trips.
  const untripped = useMemo(() => sortedAll.filter((s) => !sessionTrip(s)), [sortedAll]);
  const allTripNames = useMemo(() => groupSessionsIntoTrips(sessions).map((trip) => trip.name), [sessions]);
  const pickedSessions = useMemo(() => sessions.filter((s) => picked.has(s.session_id)), [sessions, picked]);

  function toggle(sessionId: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }
  const selectProps = (s: { session_id: string }) =>
    selecting ? { selected: picked.has(s.session_id), onToggle: () => toggle(s.session_id) } : {};

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
            <ToggleButton active={view === "sessions"} onClick={() => setView("sessions")}>
              Sessions
            </ToggleButton>
            <ToggleButton active={view === "trips"} onClick={() => setView("trips")}>
              Trips
            </ToggleButton>
          </Toggle>
          {canMark && !selecting ? (
            <Toggle>
              <ToggleButton active={false} onClick={() => setSelecting(true)}>
                Select
              </ToggleButton>
            </Toggle>
          ) : null}
        </div>
      ) : null}

      {selecting ? (
        <BulkMarkPanel
          selected={pickedSessions}
          tripNames={allTripNames}
          onClear={() => setPicked(new Set())}
          onDone={() => {
            setSelecting(false);
            setPicked(new Set());
          }}
        />
      ) : null}

      {!isLoading && openNow.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-amber-400">Open now · {openNow.length}</h2>
          <div className="space-y-3">
            {openNow.map((s) => (
              <SessionListItem key={s.session_id} session={s} {...selectProps(s)} />
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
              {trips.length === 0 ? (
                <p className="text-sm text-muted">
                  No trips yet.{canMark ? " Open a session or use Select to put sessions in a trip." : ""}
                </p>
              ) : null}
              {trips.map((trip) => (
                <TripGroup
                  key={`${trip.id}-${selecting}`}
                  trip={trip}
                  defaultOpen={selecting}
                  selected={selecting ? picked : undefined}
                  onToggle={selecting ? toggle : undefined}
                />
              ))}
              {untripped.length > 0 ? (
                <>
                  <h2 className="pt-2 text-xs font-medium uppercase tracking-wide text-muted">Not in a trip · {untripped.length}</h2>
                  {untripped.map((s) => (
                    <SessionListItem key={s.session_id} session={s} {...selectProps(s)} />
                  ))}
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedAll.map((s) => (
                <SessionListItem key={s.session_id} session={s} {...selectProps(s)} />
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
