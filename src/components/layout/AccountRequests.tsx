"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface AccountRequest {
  id: string;
  name: string;
  status: "pending" | "approved" | "declined";
  role: "individual" | "employee";
  requestedAt: string;
}

type Decision = "approve" | "approve_employee" | "decline";

/**
 * Ray/admin only: people who created an account on the login page and are waiting to be let in.
 * Renders nothing when nobody is waiting (or when offline), so it never gets in the way of logging.
 */
export function AccountRequests() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data: pending = [] } = useQuery({
    queryKey: ["account-requests"],
    queryFn: async () => {
      const response = await fetch("/api/accounts", { cache: "no-store" });
      if (!response.ok) throw new Error(`Couldn't load account requests (${response.status})`);
      const accounts = (await response.json()) as AccountRequest[];
      return accounts.filter((account) => account.status === "pending");
    },
    // Offline or a failed read just means the card stays hidden until the next try.
    retry: false,
    staleTime: 60_000,
  });

  async function decide(id: string, decision: Decision) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) throw new Error(`Couldn't save (${response.status})`);
      queryClient.setQueryData<AccountRequest[]>(["account-requests"], (current = []) =>
        current.filter((account) => account.id !== id),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  if (pending.length === 0) return null;

  return (
    <section className="border-b border-border bg-surface px-4 py-3 text-sm">
      <h2 className="mb-2 font-semibold text-foreground">
        {pending.length === 1 ? "1 account waiting for approval" : `${pending.length} accounts waiting for approval`}
      </h2>
      <ul className="space-y-3">
        {pending.map((account) => (
          <li key={account.id} className="space-y-2">
            <p className="text-foreground">
              {account.name} <span className="text-muted">· {account.id}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === account.id}
                onClick={() => void decide(account.id, "approve")}
                className="h-10 rounded-xl bg-emerald-600 px-3 font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy === account.id}
                onClick={() => void decide(account.id, "approve_employee")}
                className="h-10 rounded-xl border border-border bg-surface-raised px-3 font-semibold text-foreground active:bg-neutral-800 disabled:opacity-50"
              >
                Approve as employee
              </button>
              <button
                type="button"
                disabled={busy === account.id}
                onClick={() => void decide(account.id, "decline")}
                className="h-10 rounded-xl px-3 font-semibold text-red-400 active:bg-white/5 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-red-400">{error}</p> : null}
    </section>
  );
}
