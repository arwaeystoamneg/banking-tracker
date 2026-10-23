"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useReimbursements } from "@/hooks/useReimbursements";
import { useSessions } from "@/hooks/useSessions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { formatDateForDisplay, todayDateString } from "@/lib/dates";
import { formatMoney } from "@/lib/decimal";
import { getRememberedLoggedBy, rememberLoggedBy } from "@/lib/loggedInAs";
import type { Reimbursement, Session } from "@/lib/validation/schemas";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { isConfiguredAccountRole } from "@/lib/auth/types";
import { canReassignReimbursementPayee } from "@/lib/auth/permissions";
import { sessionPlayerName } from "@/lib/sessionHelpers";

const OTHER = "other";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted";
const SELECT =
  "h-12 w-full rounded-xl border border-border bg-surface-inset px-3 text-base text-foreground outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20";

/** Who is owed, how much, and what for. Linking a session is optional. */
export function ReimbursementForm({ item, fromSession }: { item?: Reimbursement; fromSession?: Session }) {
  const user = useCurrentUser();
  const team = useTeam();
  const router = useRouter();
  const { create, update } = useReimbursements();
  const { sessions } = useSessions();
  const editing = item !== undefined;
  const isAccount = isConfiguredAccountRole(user.role);

  const people = useMemo(() => {
    const others = team.filter((member) => member.id !== user.userId);
    return isAccount ? [{ id: user.userId, name: user.name }, ...others] : others;
  }, [team, user.userId, user.name, isAccount]);

  const initialPayee = useMemo(() => {
    if (item) return { id: item.payee_id, name: item.payee };
    if (fromSession) return { id: fromSession.player_id, name: sessionPlayerName(fromSession) };
    return isAccount ? { id: user.userId, name: user.name } : { id: people[0]?.id ?? "", name: "" };
  }, [item, fromSession, isAccount, user.userId, user.name, people]);

  const [payeeChoice, setPayeeChoice] = useState(() => choiceFor(initialPayee, people));
  const [otherName, setOtherName] = useState(() => (choiceFor(initialPayee, people) === OTHER ? initialPayee.name : ""));
  const [amount, setAmount] = useState(() => (item ? String(item.amount) : ""));
  const [reason, setReason] = useState(() => item?.reason ?? "");
  const [date, setDate] = useState(() => item?.date ?? fromSession?.date ?? todayDateString());
  const [sessionId, setSessionId] = useState(() => item?.session_id ?? fromSession?.session_id ?? "");
  const [requestedBy, setRequestedBy] = useState(() => item?.requested_by ?? (isAccount ? user.name : getRememberedLoggedBy()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const payeeLocked = item !== undefined && !canReassignReimbursementPayee(user, item);

  const sessionOptions = useMemo(() => {
    const recent = [...sessions].sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1)).slice(0, 30);
    const selected = sessions.find((s) => s.session_id === sessionId);
    return selected && !recent.includes(selected) ? [selected, ...recent] : recent;
  }, [sessions, sessionId]);

  function selectedPayee(): { payee: string; payee_id: string } {
    if (payeeChoice === OTHER) return { payee: otherName.trim(), payee_id: "" };
    const id = payeeChoice.slice(3);
    return { payee: people.find((person) => person.id === id)?.name ?? "", payee_id: id };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payee = selectedPayee();
    const value = Number(amount);
    const problems: string[] = [];
    if (!payee.payee) problems.push("who is owed");
    if (amount === "" || !Number.isFinite(value) || value <= 0) problems.push("amount");
    if (!date) problems.push("date");
    if (!isAccount && !requestedBy.trim()) problems.push("your name");
    if (problems.length > 0) {
      setError(`Still needed: ${problems.join(", ")}.`);
      return;
    }

    setSubmitting(true);
    setError("");
    if (!isAccount) rememberLoggedBy(requestedBy.trim());

    try {
      const fields = {
        amount: value,
        reason: reason.trim(),
        date,
        session_id: sessionId,
        ...(payeeLocked ? {} : payee),
        ...(isAccount ? {} : { requested_by: requestedBy.trim() }),
      };

      if (item) {
        await update(item.reimbursement_id, fields, item._row_version);
        router.replace(`/reimbursements/${item.reimbursement_id}`);
        return;
      }

      const id = await create({
        ...fields,
        requested_by: isAccount ? user.name : requestedBy.trim(),
        requested_at: new Date().toISOString(),
        owner_id: user.userId,
        status: "owed",
        paid_at: "",
        paid_by: "",
      });
      router.push(`/reimbursements/${id}`);
    } catch {
      setError("Could not save. Nothing was lost; check sync status and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <fieldset className="space-y-2" disabled={payeeLocked}>
        <legend className={`${LABEL} mb-2`}>Who is owed?</legend>
        <div className="flex flex-wrap gap-2">
          {people.map((person) => (
            <Chip key={person.id} active={payeeChoice === `id:${person.id}`} onClick={() => setPayeeChoice(`id:${person.id}`)}>
              {person.id === user.userId ? "Me" : person.name}
            </Chip>
          ))}
          <Chip active={payeeChoice === OTHER} onClick={() => setPayeeChoice(OTHER)}>
            Someone else
          </Chip>
        </div>
        {payeeChoice === OTHER ? (
          <Input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Their name" />
        ) : null}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className={LABEL}>Amount</span>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" autoFocus={!editing} />
        </label>
        <label className="block space-y-1">
          <span className={LABEL}>Date</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className={LABEL}>What for</span>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Buy-in from own cash, gas, food…" />
      </label>

      <label className="block space-y-1">
        <span className={LABEL}>Session (optional)</span>
        <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={SELECT}>
          <option value="">None</option>
          {sessionOptions.map((s) => (
            <option key={s.session_id} value={s.session_id}>
              {sessionPlayerName(s) || "Unknown"} · {formatDateForDisplay(s.date)} · buy-in {formatMoney(s.buy_in)}
            </option>
          ))}
        </select>
      </label>

      {isAccount ? null : (
        <label className="block space-y-1">
          <span className={LABEL}>Your name (filed by)</span>
          <Input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Name" />
        </label>
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Button type="submit" disabled={submitting} className="h-14 w-full text-base">
        {submitting ? "Saving…" : editing ? "Save changes" : "Add reimbursement"}
      </Button>
    </form>
  );
}

function choiceFor(payee: { id: string; name: string }, people: { id: string; name: string }[]): string {
  if (payee.id && people.some((person) => person.id === payee.id)) return `id:${payee.id}`;
  const byName = people.find((person) => person.name.toLowerCase() === payee.name.trim().toLowerCase());
  if (byName) return `id:${byName.id}`;
  if (!payee.name && people[0]) return `id:${people[0].id}`;
  return OTHER;
}
