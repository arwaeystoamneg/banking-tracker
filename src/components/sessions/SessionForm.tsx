"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessions } from "@/hooks/useSessions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { formatDateForDisplay, nowIso, startDateForTimeIn } from "@/lib/dates";
import { useLiveTime } from "@/hooks/useLiveTime";
import { getRememberedLoggedBy, getRememberedPlayer, rememberLoggedBy, rememberPlayer } from "@/lib/loggedInAs";
import type { Session } from "@/lib/validation/schemas";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { isConfiguredAccountRole } from "@/lib/auth/types";
import { canReassignSessionPlayer } from "@/lib/auth/permissions";
import { isSessionOpen, sessionPlayerName } from "@/lib/sessionHelpers";

const OTHER = "other";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted";

/**
 * Starting a session is buy-in + time in. Editing adds the end fields once a session is closed.
 * "Who played" defaults to you; teammates can log for each other with one tap.
 */
export function SessionForm({ session }: { session?: Session }) {
  const user = useCurrentUser();
  const team = useTeam();
  const router = useRouter();
  const { create, update } = useSessions();
  const editing = session !== undefined;
  const isAccount = isConfiguredAccountRole(user.role);
  const closed = session !== undefined && !isSessionOpen(session);

  // Me first, then teammates. Admin is a shared login, not a person, so it only sees the team.
  const people = useMemo(() => {
    const others = team.filter((member) => member.id !== user.userId);
    return isAccount ? [{ id: user.userId, name: user.name }, ...others] : others;
  }, [team, user.userId, user.name, isAccount]);

  const [playerChoice, setPlayerChoice] = useState(() => initialPlayerChoice(session, people, isAccount, user.userId));
  const [otherName, setOtherName] = useState(() =>
    session ? (initialPlayerChoice(session, people, isAccount, user.userId) === OTHER ? sessionPlayerName(session) : "") : rememberedOtherName(),
  );
  // Sessions are dated by when they started. A new one follows time in until the date is picked by hand.
  const [pickedDate, setPickedDate] = useState(() => session?.date ?? "");
  const [buyIn, setBuyIn] = useState(() => (session ? String(session.buy_in) : ""));
  const [buyOut, setBuyOut] = useState(() => (session?.buy_out == null ? "" : String(session.buy_out)));
  const [timeIn, setTimeIn, timeInForSave] = useLiveTime(session?.time_in ?? "");
  const date = pickedDate || startDateForTimeIn(timeIn);
  const [timeOut, setTimeOut] = useState(() => session?.time_out ?? "");
  const [loggedBy, setLoggedBy] = useState(() => session?.logged_by ?? (isAccount ? user.name : getRememberedLoggedBy()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const playerLocked = session !== undefined && !canReassignSessionPlayer(user, session);
  const showPicker = people.length > 1 || !isAccount || playerChoice === OTHER;

  function selectedPlayer(): { player: string; player_id: string } {
    if (playerChoice === OTHER) return { player: otherName.trim(), player_id: "" };
    const id = playerChoice.slice(3);
    return { player: people.find((person) => person.id === id)?.name ?? "", player_id: id };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const player = selectedPlayer();
    const buyInAmount = Number(buyIn);
    const buyOutAmount = Number(buyOut);
    const time = timeInForSave();
    const startDate = pickedDate || startDateForTimeIn(time);
    const problems: string[] = [];
    if (!player.player) problems.push("who played");
    if (buyIn === "" || !Number.isFinite(buyInAmount) || buyInAmount < 0) problems.push("buy-in");
    if (!time || !startDate) problems.push("time in");
    if (closed && (buyOut === "" || !Number.isFinite(buyOutAmount) || buyOutAmount < 0)) problems.push("buy-out");
    if (closed && !timeOut) problems.push("time out");
    if (!isAccount && !loggedBy.trim()) problems.push("your name");
    if (problems.length > 0) {
      setError(`Still needed: ${problems.join(", ")}.`);
      return;
    }

    setSubmitting(true);
    setError("");
    if (!isAccount) rememberLoggedBy(loggedBy.trim());
    if (!editing) rememberPlayer(player.player_id ? `id:${player.player_id}` : `name:${player.player}`);

    try {
      const fields = {
        date: startDate,
        buy_in: buyInAmount,
        time_in: time,
        logged_by: isAccount ? (session?.logged_by ?? user.name) : loggedBy.trim(),
        ...(playerLocked ? {} : player),
        ...(closed ? { buy_out: buyOutAmount, time_out: timeOut } : {}),
      };

      if (session) {
        await update(session.session_id, fields, session._row_version);
        router.replace(`/sessions/${session.session_id}`);
        return;
      }

      const id = await create({
        ...fields,
        casino: "",
        notes: "",
        game_id: "",
        schedule_option: "",
        buy_out: null,
        time_out: "",
        rounds_banked: null,
        action_offered: null,
        action_booked: null,
        coverage_pct: null,
        bonus_action_booked: null,
        collection_paid: null,
        gross_wl: null,
        net_pnl: null,
        peak_drawdown: null,
        partners: "",
        split_terms: "",
        logged_at: nowIso(),
        owner_id: user.userId,
      });
      router.push(`/sessions/${id}`);
    } catch {
      setError("Could not save. Nothing was lost; check sync status and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {showPicker ? (
        <fieldset className="space-y-2" disabled={playerLocked}>
          <legend className={`${LABEL} mb-2`}>Who played?</legend>
          <div className="flex flex-wrap gap-2">
            {people.map((person) => (
              <Chip
                key={person.id}
                active={playerChoice === `id:${person.id}`}
                onClick={() => setPlayerChoice(`id:${person.id}`)}
              >
                {person.id === user.userId ? "Me" : person.name}
              </Chip>
            ))}
            <Chip active={playerChoice === OTHER} onClick={() => setPlayerChoice(OTHER)}>
              Someone else
            </Chip>
          </div>
          {playerChoice === OTHER ? (
            <Input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Player's name" />
          ) : null}
        </fieldset>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className={LABEL}>Buy in</span>
          <Input value={buyIn} onChange={(e) => setBuyIn(e.target.value)} inputMode="decimal" placeholder="0" autoFocus={!editing} />
        </label>
        <label className="block space-y-1">
          <span className={LABEL}>Time in</span>
          <Input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} />
        </label>
      </div>

      {closed ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className={LABEL}>Buy out</span>
            <Input value={buyOut} onChange={(e) => setBuyOut(e.target.value)} inputMode="decimal" placeholder="0" />
          </label>
          <label className="block space-y-1">
            <span className={LABEL}>Time out</span>
            <Input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} />
          </label>
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className={LABEL}>Date started</span>
        <Input type="date" value={date} onChange={(e) => setPickedDate(e.target.value)} />
        {!editing && !pickedDate ? (
          <span className="block text-xs text-muted">
            {formatDateForDisplay(date)} — set from time in. A session that runs past midnight keeps this date.
          </span>
        ) : null}
      </label>

      {isAccount ? null : (
        <label className="block space-y-1">
          <span className={LABEL}>Your name (logged by)</span>
          <Input value={loggedBy} onChange={(e) => setLoggedBy(e.target.value)} placeholder="Name" />
        </label>
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Button type="submit" disabled={submitting} className="h-14 w-full text-base">
        {submitting ? "Saving…" : editing ? "Save changes" : "Start session"}
      </Button>
    </form>
  );
}

function initialPlayerChoice(
  session: Session | undefined,
  people: { id: string; name: string }[],
  isAccount: boolean,
  userId: string,
): string {
  const known = (id: string) => people.some((person) => person.id === id);
  if (session) {
    if (session.player_id && known(session.player_id)) return `id:${session.player_id}`;
    const name = sessionPlayerName(session).toLowerCase();
    const byName = people.find((person) => person.name.toLowerCase() === name);
    return byName ? `id:${byName.id}` : OTHER;
  }
  if (isAccount) return `id:${userId}`;
  const remembered = getRememberedPlayer();
  if (remembered.startsWith("id:") && known(remembered.slice(3))) return remembered;
  if (remembered.startsWith("name:")) return OTHER;
  return people[0] ? `id:${people[0].id}` : OTHER;
}

function rememberedOtherName(): string {
  const remembered = getRememberedPlayer();
  return remembered.startsWith("name:") ? remembered.slice(5) : "";
}
