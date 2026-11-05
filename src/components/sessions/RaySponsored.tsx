"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { useSessions } from "@/hooks/useSessions";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canMarkPayrollPaid } from "@/lib/payroll";
import type { Session } from "@/lib/validation/schemas";

export function RaySponsoredBadge({ session }: { session: Pick<Session, "ray_sponsored"> }) {
  return session.ray_sponsored ? <Badge tone="sponsor">Ray sponsored only</Badge> : null;
}

/** Ray or admin turns the "Ray sponsored only" tag on or off. Everyone else just sees the tag. */
export function RaySponsoredToggle({ session }: { session: Session }) {
  const user = useCurrentUser();
  const { update } = useSessions();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!canMarkPayrollPaid(user)) return null;
  const on = session.ray_sponsored;

  async function toggle() {
    setSaving(true);
    setError("");
    try {
      await update(session.session_id, { ray_sponsored: !on }, session._row_version);
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-2 text-sm">
      <span>
        <span className="font-medium text-foreground">Ray sponsored only</span>
        {error ? <span className="block text-xs text-red-400">{error}</span> : <span className="block text-xs text-muted">Shows a tag next to this session</span>}
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={toggle} disabled={saving} className="h-6 w-6 accent-violet-500" />
    </label>
  );
}
