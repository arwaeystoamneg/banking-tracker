"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canManageAdmins } from "@/lib/auth/permissions";

interface Person {
  id: string;
  name: string;
  admin: boolean;
  owner: boolean;
}

/** Ray only: give or take away admin status. Admins can do everything Ray can except this. */
export default function AdminsPage() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const allowed = canManageAdmins(user);

  const { data: people = [], isLoading, error: loadError } = useQuery({
    queryKey: ["admins"],
    enabled: allowed,
    queryFn: async () => {
      const response = await fetch("/api/admins", { cache: "no-store" });
      if (!response.ok) throw new Error(`Couldn't load accounts (${response.status})`);
      return (await response.json()) as Person[];
    },
  });

  async function change(person: Person, admin: boolean) {
    setBusy(person.id);
    setError("");
    try {
      const response = await fetch("/api/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: person.id, admin }),
      });
      if (!response.ok) throw new Error(`Couldn't save (${response.status})`);
      queryClient.setQueryData<Person[]>(["admins"], (current = []) =>
        current.map((row) => (row.id === person.id ? { ...row, admin } : row)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  if (!allowed) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-4">
        <p className="text-sm text-muted">Only Ray can manage admins.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admins</h1>
        <p className="text-sm text-muted">
          Admins can do everything you can — approve sign-ups, mark pay, edit anyone&apos;s records — except change who is
          admin. Only you can do that.
        </p>
      </div>

      {isLoading ? <p className="text-sm text-muted">Loading…</p> : null}
      {loadError ? <p className="text-sm text-red-400">{loadError.message}</p> : null}

      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {people.map((person) => (
          <li key={person.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-foreground">{person.name}</p>
              <p className="text-xs text-muted">
                {person.id} · {person.owner ? "owner" : person.admin ? "admin" : "not admin"}
              </p>
            </div>
            {person.owner ? null : person.admin ? (
              <button
                type="button"
                disabled={busy === person.id}
                onClick={() => void change(person, false)}
                className="h-10 shrink-0 rounded-xl px-3 text-sm font-semibold text-red-400 active:bg-white/5 disabled:opacity-50"
              >
                Remove admin
              </button>
            ) : (
              <button
                type="button"
                disabled={busy === person.id}
                onClick={() => void change(person, true)}
                className="h-10 shrink-0 rounded-xl border border-border bg-surface-raised px-3 text-sm font-semibold text-foreground active:bg-neutral-800 disabled:opacity-50"
              >
                Make admin
              </button>
            )}
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </main>
  );
}
