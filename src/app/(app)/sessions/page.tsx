"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSessions } from "@/hooks/useSessions";
import { Button } from "@/components/ui/Button";
import { SessionListItem } from "@/components/sessions/SessionListItem";
import { TripGroup } from "@/components/sessions/TripGroup";
import { groupSessionsIntoTrips } from "@/lib/trips";
import { useCurrentUser } from "@/components/providers/AuthProvider";

type View = "trips" | "all";

export default function SessionsPage() {
  const user = useCurrentUser();
  const { sessions, isLoading } = useSessions();
  const [view, setView] = useState<View>("trips");

  const sortedAll = useMemo(
    () => [...sessions].sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1)),
    [sessions],
  );
  const trips = useMemo(() => groupSessionsIntoTrips(sessions), [sessions]);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sessions</h1>
          <p className="text-sm text-muted">
            {isLoading
              ? "Loading…"
              : `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${trips.length} trip${trips.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {user.role !== "demo" ? (
          <Link href="/sessions/new">
            <Button className="h-10 px-4 text-sm">+ New</Button>
          </Link>
        ) : null}
      </div>

      {sessions.length > 0 ? (
        <div className="inline-flex rounded-xl border border-border bg-surface p-0.5 text-sm">
          <ToggleButton active={view === "trips"} onClick={() => setView("trips")}>
            By trip
          </ToggleButton>
          <ToggleButton active={view === "all"} onClick={() => setView("all")}>
            All sessions
          </ToggleButton>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted">No sessions logged yet.</p>
      ) : view === "trips" ? (
        <div className="space-y-3">
          {trips.map((trip, i) => (
            <TripGroup key={trip.id} trip={trip} defaultOpen={i === 0} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedAll.map((s) => (
            <SessionListItem key={s.session_id} session={s} />
          ))}
        </div>
      )}
    </main>
  );
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
      className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
        active ? "bg-surface-raised text-foreground" : "text-muted active:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
