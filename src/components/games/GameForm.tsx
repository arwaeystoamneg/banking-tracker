"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGames } from "@/hooks/useGames";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { nowIso } from "@/lib/dates";
import { getRememberedLoggedBy } from "@/lib/loggedInAs";

export function GameForm() {
  const router = useRouter();
  const { create } = useGames();
  const [name, setName] = useState("");
  const [casinos, setCasinos] = useState("");
  const [version, setVersion] = useState("");
  const [rules, setRules] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Game name is required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const id = await create({
        name: name.trim(),
        version: version.trim(),
        casinos: casinos.trim(),
        filing: "",
        edge_text: "Not yet verified",
        edge_pct: 0,
        verified: false,
        exposure_mult: 1,
        fee_text: "",
        rules: rules.trim(),
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
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Version</span>
        <Input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="Optional variation or version" />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Rules</span>
        <textarea
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          rows={5}
          className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-3 text-base text-foreground outline-none focus:border-neutral-500"
        />
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

      <p className="text-xs text-amber-400">
        New games start unverified with placeholder edge and exposure values. Update those only after sourcing the rules.
      </p>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Adding…" : "Add table game"}
      </Button>
    </form>
  );
}
