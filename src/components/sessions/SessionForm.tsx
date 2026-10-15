"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessions } from "@/hooks/useSessions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { currentTimeString, todayDateString, nowIso } from "@/lib/dates";
import { getRememberedLoggedBy, getRememberedPlayer, rememberLoggedBy, rememberPlayer } from "@/lib/loggedInAs";
import type { Session } from "@/lib/validation/schemas";
import { useCurrentUser, useTeam } from "@/components/providers/AuthProvider";
import { isConfiguredAccountRole } from "@/lib/auth/types";
import { canReassignSessionPlayer } from "@/lib/auth/permissions";
import { isSessionOpen, sessionPlayerName } from "@/lib/sessionHelpers";
import { useGames } from "@/hooks/useGames";
import { useRounds } from "@/hooks/useRounds";
import { useFeeSchedules } from "@/hooks/useFeeSchedules";
import { canonicalCasino, gameIsAtCasino, KNOWN_CASINO_NAMES, normalizeCasinoKey } from "@/lib/names";

const OTHER = "other";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted";
const SELECT =
  "h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none focus:border-neutral-500";

/**
 * One form for both ways sessions get logged: a teammate entering a session for whoever played, and a
 * player logging their own. A session can be started live ("Playing now") or entered after the fact in
 * one step ("Already finished").
 */
export function SessionForm({ session }: { session?: Session }) {
  const user = useCurrentUser();
  const team = useTeam();
  const router = useRouter();
  const { sessions, create, update } = useSessions();
  const { games } = useGames();
  const { rounds } = useRounds(session?.session_id ?? "(new session)");
  const editing = session !== undefined;
  const isAccount = isConfiguredAccountRole(user.role);
  const wasClosed = session !== undefined && !isSessionOpen(session);

  // Me first, then teammates. Admin is a shared login, not a person, so it only sees the team.
  const people = useMemo(() => {
    const others = team.filter((member) => member.id !== user.userId);
    return isAccount ? [{ id: user.userId, name: user.name }, ...others] : others;
  }, [team, user.userId, user.name, isAccount]);

  const [playerChoice, setPlayerChoice] = useState(() => initialPlayerChoice(session, people, isAccount, user.userId));
  const [otherName, setOtherName] = useState(() =>
    session && initialPlayerChoice(session, people, isAccount, user.userId) === OTHER
      ? sessionPlayerName(session)
      : session
        ? ""
        : rememberedOtherName(),
  );
  const [finished, setFinished] = useState(wasClosed);
  const [date, setDate] = useState(() => session?.date ?? todayDateString());
  const [casino, setCasino] = useState(() => session?.casino ?? "");
  const [buyIn, setBuyIn] = useState(() => (session ? String(session.buy_in) : ""));
  const [buyOut, setBuyOut] = useState(() => (session?.buy_out == null ? "" : String(session.buy_out)));
  const [timeIn, setTimeIn] = useState(() => session?.time_in || currentTimeString());
  const [timeOut, setTimeOut] = useState(() => session?.time_out ?? "");
  const [notes, setNotes] = useState(() => session?.notes ?? "");
  const [gameId, setGameId] = useState(() => session?.game_id ?? "");
  const [scheduleOption, setScheduleOption] = useState(() => session?.schedule_option ?? "");
  const [loggedBy, setLoggedBy] = useState(() => session?.logged_by ?? (isAccount ? user.name : getRememberedLoggedBy()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const { feeSchedules } = useFeeSchedules(gameId || undefined);
  const scheduleOptions = Array.from(
    new Set(
      feeSchedules
        .filter(
          (schedule) =>
            !schedule.casino || !casino || normalizeCasinoKey(schedule.casino) === normalizeCasinoKey(casino),
        )
        .map((schedule) => schedule.option_label || "(unlabeled)"),
    ),
  );
  const casinoSuggestions = useMemo(
    () =>
      Array.from(
        new Set([...KNOWN_CASINO_NAMES, ...sessions.map((row) => row.casino).filter(Boolean).map(canonicalCasino)]),
      ).sort(),
    [sessions],
  );

  const playerLocked = session !== undefined && !canReassignSessionPlayer(user, session);
  // An open session that already has rounds is cashed out from its page, where round totals are saved.
  const canFinishHere = !editing || wasClosed || rounds.length === 0;

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
    const problems: string[] = [];
    if (!player.player) problems.push("who played");
    if (!casino.trim()) problems.push("casino");
    if (buyIn === "" || !Number.isFinite(buyInAmount) || buyInAmount < 0) problems.push("buy-in");
    if (!date || !timeIn) problems.push("start date and time");
    if (finished && (buyOut === "" || !Number.isFinite(buyOutAmount) || buyOutAmount < 0)) problems.push("buy-out");
    if (finished && !timeOut) problems.push("end time");
    if (!isAccount && !loggedBy.trim()) problems.push("your name");
    if (problems.length > 0) {
      setError(`Still needed: ${problems.join(", ")}.`);
      return;
    }

    setSubmitting(true);
    setError("");
    if (!isAccount) rememberLoggedBy(loggedBy.trim());
    if (!editing) rememberPlayer(player.player_id ? `id:${player.player_id}` : `name:${player.player}`);

    const closeFields = finished
      ? { buy_out: buyOutAmount, time_out: timeOut }
      : editing && !wasClosed
        ? {}
        : { buy_out: null, time_out: "" };

    try {
      const fields = {
        date,
        casino: casino.trim(),
        buy_in: buyInAmount,
        time_in: timeIn,
        notes: notes.trim(),
        logged_by: isAccount ? (session?.logged_by ?? user.name) : loggedBy.trim(),
        game_id: gameId,
        schedule_option: scheduleOption,
        ...(playerLocked ? {} : player),
        ...closeFields,
      };

      if (session) {
        await update(session.session_id, fields, session._row_version);
        router.replace(`/sessions/${session.session_id}`);
        return;
      }

      const id = await create({
        ...fields,
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
      setError(
        editing
          ? "Could not save the session. Your changes were not discarded; check sync status and try again."
          : "Could not save the session. Your entry was not discarded; check sync status and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <fieldset className="space-y-2" disabled={playerLocked}>
        <legend className={`${LABEL} mb-2`}>Who played?</legend>
        <div className="flex flex-wrap gap-2">
          {people.map((person) => (
            <Chip
              key={person.id}
              active={playerChoice === `id:${person.id}`}
              onClick={() => setPlayerChoice(`id:${person.id}`)}
            >
              {person.id === user.userId ? `Me (${person.name})` : person.name}
            </Chip>
          ))}
          <Chip active={playerChoice === OTHER} onClick={() => setPlayerChoice(OTHER)}>
            Someone else
          </Chip>
        </div>
        {playerChoice === OTHER ? (
          <Input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Player's name" autoFocus={!editing} />
        ) : null}
        {playerLocked ? (
          <p className="text-xs text-muted">Only the person who logged this session can change who played.</p>
        ) : null}
      </fieldset>

      <label className="block space-y-1">
        <span className={LABEL}>Casino</span>
        <Input value={casino} onChange={(e) => setCasino(e.target.value)} placeholder="Casino name" list="casino-suggestions" />
        <datalist id="casino-suggestions">
          {casinoSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>

      <label className="block space-y-1">
        <span className={LABEL}>Buy in</span>
        <Input value={buyIn} onChange={(e) => setBuyIn(e.target.value)} inputMode="decimal" placeholder="0" />
      </label>

      {canFinishHere ? (
        <div className="grid grid-cols-2 rounded-xl border border-border bg-surface p-1 text-sm">
          <Segment active={!finished} onClick={() => setFinished(false)} disabled={wasClosed}>
            {editing ? "Still open" : "Playing now"}
          </Segment>
          <Segment
            active={finished}
            onClick={() => {
              setFinished(true);
              if (!timeOut) setTimeOut(currentTimeString());
            }}
          >
            {editing ? "Finished" : "Already finished"}
          </Segment>
        </div>
      ) : (
        <p className="text-xs text-muted">This session has logged rounds. Cash it out from the session page.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className={LABEL}>Date</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className={LABEL}>Started</span>
          <Input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} />
        </label>
      </div>

      {finished ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className={LABEL}>Buy out</span>
            <Input value={buyOut} onChange={(e) => setBuyOut(e.target.value)} inputMode="decimal" placeholder="0" />
          </label>
          <label className="block space-y-1">
            <span className={LABEL}>Ended</span>
            <Input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} />
          </label>
        </div>
      ) : null}

      <details className="group rounded-xl border border-border bg-surface" open={Boolean(gameId)}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm text-muted-strong">
          <span>Game &amp; fee schedule <span className="text-muted">(optional, for round tracking)</span></span>
          <span className="text-muted transition-transform group-open:rotate-90" aria-hidden>
            ▸
          </span>
        </summary>
        <div className="space-y-3 border-t border-border p-3">
          <select
            aria-label="Game"
            value={gameId}
            onChange={(event) => {
              setGameId(event.target.value);
              setScheduleOption("");
            }}
            className={SELECT}
          >
            <option value="">No game selected</option>
            {games
              .filter((game) => !casino.trim() || gameIsAtCasino(game.casinos, casino) || game.game_id === gameId)
              .map((game) => (
                <option key={game.game_id} value={game.game_id}>
                  {game.name}
                </option>
              ))}
          </select>
          {gameId && scheduleOptions.length > 0 ? (
            <select
              aria-label="Fee schedule"
              value={scheduleOption}
              onChange={(event) => setScheduleOption(event.target.value)}
              className={SELECT}
            >
              <option value="">Select a fee schedule</option>
              {scheduleOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </details>

      <label className="block space-y-1">
        <span className={LABEL}>Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
          rows={3}
          className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-3 text-base text-foreground outline-none focus:border-neutral-500"
        />
      </label>

      {isAccount ? null : (
        <label className="block space-y-1">
          <span className={LABEL}>Your name (logged by)</span>
          <Input value={loggedBy} onChange={(e) => setLoggedBy(e.target.value)} placeholder="Name" />
        </label>
      )}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : editing ? "Save changes" : finished ? "Save session" : "Start session"}
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-60 ${
        active
          ? "border-emerald-500/70 bg-emerald-600/20 text-foreground"
          : "border-border bg-surface text-muted-strong active:bg-surface-raised"
      }`}
    >
      {children}
    </button>
  );
}

function Segment({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`min-h-10 rounded-lg font-medium transition-colors disabled:opacity-40 ${
        active ? "bg-surface-raised text-foreground" : "text-muted active:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
