"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGames } from "@/hooks/useGames";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { nowIso } from "@/lib/dates";
import { d } from "@/lib/decimal";
import { getRememberedLoggedBy } from "@/lib/loggedInAs";

export function GameForm() {
  const router = useRouter();
  const { create } = useGames();
  const [name, setName] = useState("");
  const [casinos, setCasinos] = useState("");
  const [edgePercent, setEdgePercent] = useState("");
  const [verified, setVerified] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const edge = Number(edgePercent);
    if (!name.trim() || edgePercent === "" || !Number.isFinite(edge) || edge < -100 || edge > 100) {
      setError("Game name and a valid edge percentage are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const id = await create({
        name: name.trim(),
        version: "",
        casinos: casinos.trim(),
        filing: "",
        edge_text: `${verified ? "" : "~"}${d(edgePercent).toString()}%${verified ? "" : " (unverified)"}`,
        edge_pct: d(edgePercent).dividedBy(100).toNumber(),
        verified,
        exposure_mult: 1,
        fee_text: "",
        rules: "",
        settlement_order: "",
        notes: notes.trim(),
        edited_by: getRememberedLoggedBy(),
        edited_at: nowIso(),
      });
      router.push(`/games/${id}`);
    } catch {
      setError("Could not add the game. Check sync status and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Game name</span>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Table game name" required />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Casino</span>
        <Input
          value={casinos}
          onChange={(event) => setCasinos(event.target.value)}
          placeholder="Use | between multiple casinos"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Banker edge (%)</span>
        <Input
          value={edgePercent}
          onChange={(event) => setEdgePercent(event.target.value)}
          inputMode="decimal"
          min="-100"
          max="100"
          step="0.001"
          placeholder="Example: 1.25"
          required
        />
        <span className="block text-xs text-muted">Enter 1.25 for 1.25%. Negative values are allowed.</span>
      </label>

      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface px-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={verified}
          onChange={(event) => setVerified(event.target.checked)}
          className="h-5 w-5 accent-emerald-600"
        />
        Edge has been verified from a reliable source
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Notes</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-3 text-base text-foreground outline-none focus:border-neutral-500"
        />
      </label>

      {!verified ? <p className="text-xs text-amber-400">This edge will display as an unverified estimate.</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Adding…" : "Add table game"}
      </Button>
    </form>
  );
}
