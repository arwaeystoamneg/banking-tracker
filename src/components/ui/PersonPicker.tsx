"use client";

import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import type { TeamMember } from "@/lib/auth/types";

export interface PickedPerson {
  /** Account id, or "" for someone typed in. */
  id: string;
  name: string;
  other: boolean;
}

export function pickedFrom(person: { id: string; name: string }, people: TeamMember[]): PickedPerson {
  const byId = person.id && people.find((p) => p.id === person.id);
  const byName = !byId && person.name && people.find((p) => p.name.trim().toLowerCase() === person.name.trim().toLowerCase());
  const match = byId || byName;
  if (match) return { id: match.id, name: match.name, other: false };
  return { id: "", name: person.name, other: Boolean(person.name) };
}

/** Chips for every teammate (you first, as "Me") plus "Someone else" with a name field. */
export function PersonPicker({
  label,
  people,
  meId,
  value,
  onChange,
  disabled,
}: {
  label: string;
  people: TeamMember[];
  meId: string;
  value: PickedPerson;
  onChange: (next: PickedPerson) => void;
  disabled?: boolean;
}) {
  const ordered = [...people].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : 0));
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {ordered.map((person) => (
          <Chip
            key={person.id}
            active={!value.other && value.id === person.id}
            onClick={() => onChange({ id: person.id, name: person.name, other: false })}
          >
            {person.id === meId ? "Me" : person.name}
          </Chip>
        ))}
        <Chip active={value.other} onClick={() => onChange({ id: "", name: value.other ? value.name : "", other: true })}>
          Someone else
        </Chip>
      </div>
      {value.other ? (
        <Input value={value.name} onChange={(e) => onChange({ id: "", name: e.target.value, other: true })} placeholder="Their name" />
      ) : null}
    </fieldset>
  );
}
