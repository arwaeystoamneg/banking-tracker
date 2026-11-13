"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/** Pick a trip by name: tap an existing one (tap again to take it out), or type a new one. */
export function TripPicker({
  current,
  names,
  onPick,
  disabled = false,
}: {
  current: string;
  names: string[];
  onPick: (name: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const options = current && !names.some((name) => name.toLowerCase() === current.toLowerCase()) ? [current, ...names] : names;

  function addNew(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    onPick(name);
    setDraft("");
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {options.map((name) => {
            const active = name.toLowerCase() === current.toLowerCase();
            return (
              <Chip key={name} active={active} onClick={() => onPick(active ? "" : name)}>
                {name}
              </Chip>
            );
          })}
        </div>
      ) : null}
      <form onSubmit={addNew} className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New trip, e.g. LA Aug 2026" />
        <Button type="submit" variant="secondary" className="h-12 shrink-0 px-4 text-sm" disabled={!draft.trim()}>
          Add
        </Button>
      </form>
    </fieldset>
  );
}
