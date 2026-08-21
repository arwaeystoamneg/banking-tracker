"use client";

import { useMemo, useState } from "react";
import { useGames } from "@/hooks/useGames";
import { useSidebets } from "@/hooks/useSidebets";
import { usePaytables } from "@/hooks/usePaytables";
import { useFeeSchedules } from "@/hooks/useFeeSchedules";
import { Metric } from "@/components/ui/Metric";
import { Button } from "@/components/ui/Button";
import { CliffWarning } from "@/components/fees/CliffWarning";
import { computeBankingEV } from "@/lib/math/evCalc";
import { simulateSessions, type SimResult } from "@/lib/math/evSim";
import {
  BAD_BEAT_PAYOUTS,
  BAD_BEAT_PROBABILITIES,
  badBeatEdgeForCoverage,
  badBeatPayoutsFromRows,
  badBeatSigma,
  realizedBadBeatEdge,
} from "@/lib/math/uthBadBeat";
import {
  BACCARAT_BET_PAYOUTS,
  baccaratBetCap,
  baccaratBetEdgeForCoverage,
  baccaratBetModel,
  baccaratBetPayoutFromRows,
  baccaratBetSigma,
  matchBaccaratSidebet,
  realizedBaccaratBetEdge,
  type BaccaratBetKind,
} from "@/lib/math/baccaratBets";
import { describeCliff, findTierForAction, isNearCliff, type FeeTier } from "@/lib/fees/cliff";
import { maxPayoutMultiple } from "@/lib/payout";
import { formatMoney } from "@/lib/decimal";
import { normalizeCasinoKey } from "@/lib/names";
import { baccaratExpectedValue, baccaratVariance } from "@/lib/math/baccarat";

const SIM_SESSIONS = 4000;

function num(s: string, fallback = 0): number {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

/** One coverage-capped baccarat (or BBJ-style) layer: fully booked, edge/σ from the leftover bank. */
function cappedBaccaratLayer(
  id: string,
  name: string,
  kind: BaccaratBetKind,
  actionOffered: number,
  payout: number,
  bankAvailable: number,
) {
  const cap = baccaratBetCap(bankAvailable, actionOffered);
  const model = baccaratBetModel(kind, payout);
  return {
    id,
    name,
    actionOffered,
    edge: baccaratBetEdgeForCoverage(kind, bankAvailable, actionOffered, payout),
    exposureMult: 1,
    sigma: baccaratBetSigma(model, cap),
    kind,
    cap,
    baseEdge: realizedBaccaratBetEdge(model, Infinity),
    payout,
  };
}

export default function EvCalculatorPage() {
  const { games } = useGames();
  const { sidebets } = useSidebets();
  const { paytables } = usePaytables();

  const [gameId, setGameId] = useState("");
  const [players, setPlayers] = useState("5");
  const [bank, setBank] = useState("8000");
  const [mainSize, setMainSize] = useState("100");
  const [baccaratPlayerAction, setBaccaratPlayerAction] = useState("250");
  const [baccaratBankerAction, setBaccaratBankerAction] = useState("250");
  const [baccaratTieAction, setBaccaratTieAction] = useState("");
  const [sideSizes, setSideSizes] = useState<Record<string, string>>({});
  const [feeOption, setFeeOption] = useState("");
  const [feeCasino, setFeeCasino] = useState("");
  const [mainSigma, setMainSigma] = useState("1.0");
  const [sideSigma, setSideSigma] = useState("5");
  const [rho, setRho] = useState("0.5");
  const [roundsPerSession, setRoundsPerSession] = useState("50");
  const [sim, setSim] = useState<{ key: string; result: SimResult } | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const game = games.find((g) => g.game_id === gameId) ?? null;
  const isBaccarat = Boolean(game && /baccarat/i.test(game.name));
  const gameSidebets = useMemo(
    () =>
      sidebets.filter(
        (sidebet) =>
          sidebet.game_id === gameId &&
          !(isBaccarat && /^main\s*\(banker\/player\/tie\)$/i.test(sidebet.name)),
      ),
    [sidebets, gameId, isBaccarat],
  );
  const { feeSchedules } = useFeeSchedules(gameId || undefined);

  const sideExposure = useMemo(() => {
    const byId = new Map<string, number>();
    for (const sb of gameSidebets) {
      const rows = paytables.filter((p) => p.sidebet_id === sb.sidebet_id).map((p) => p.payout);
      // `|| 1` (not `?? 1`) also guards a paytable whose max parses to 0 (e.g. all "0:1"/non-numeric).
      byId.set(sb.sidebet_id, maxPayoutMultiple(rows) || 1);
    }
    return byId;
  }, [gameSidebets, paytables]);

  const feeCasinos = useMemo(
    () => Array.from(new Set(feeSchedules.map((schedule) => schedule.casino || "(unspecified)"))),
    [feeSchedules],
  );
  const selectedFeeCasino = feeCasinos.includes(feeCasino) ? feeCasino : (feeCasinos[0] ?? "");
  const casinoSchedules = useMemo(
    () =>
      feeSchedules.filter(
        (schedule) =>
          normalizeCasinoKey(schedule.casino || "(unspecified)") === normalizeCasinoKey(selectedFeeCasino),
      ),
    [feeSchedules, selectedFeeCasino],
  );
  const feeOptions = useMemo(
    () => Array.from(new Set(casinoSchedules.map((f) => f.option_label || "(unlabeled)"))),
    [casinoSchedules],
  );
  const selectedFeeOption = feeOptions.includes(feeOption) ? feeOption : (feeOptions[0] ?? "");
  const feeTiers: FeeTier[] = useMemo(
    () =>
      casinoSchedules
        .filter((f) => (f.option_label || "(unlabeled)") === selectedFeeOption)
        .map((f) => ({ scheduleId: f.schedule_id, basis: f.basis, tierMin: f.tier_min, tierMax: f.tier_max, pdFee: f.pd_fee })),
    [casinoSchedules, selectedFeeOption],
  );

  const n = Math.max(1, Math.round(num(players, 1)));
  // ρ below 0 isn't a valid cross-seat covariance here and would NaN the SD (√ of a negative). Clamp it.
  const rhoVal = Math.min(1, Math.max(0, num(rho, 0.5)));
  const bankAmount = Math.max(0, num(bank));
  const mainBetAmount = Math.max(0, num(mainSize));
  const mainSigmaValue = Math.max(0, num(mainSigma));
  const sideSigmaValue = Math.max(0, num(sideSigma, 5));
  const baccaratPlayerAmount = Math.max(0, num(baccaratPlayerAction));
  const baccaratBankerAmount = Math.max(0, num(baccaratBankerAction));
  const baccaratTieAmount = Math.max(0, num(baccaratTieAction));
  const baseAction = isBaccarat ? baccaratPlayerAmount + baccaratBankerAmount : n * mainBetAmount;
  const baccaratMoments = isBaccarat
    ? {
        ev: baccaratExpectedValue(baccaratPlayerAmount, baccaratBankerAmount),
        variance: baccaratVariance(baccaratPlayerAmount, baccaratBankerAmount),
      }
    : undefined;

  const sideActionOf = (sidebetId: string) => {
    const size = Math.max(0, num(sideSizes[sidebetId] ?? ""));
    return isBaccarat ? size : n * size;
  };
  const paytableRowsOf = (sidebetId: string) =>
    paytables.filter((p) => p.sidebet_id === sidebetId).map((p) => ({ outcome: p.outcome, payout: p.payout }));

  // The UTH Bad Beat Jackpot doesn't fit the exposure-multiple model: the bank collects every wager and
  // caps payouts by coverage. Its edge isn't a stored constant — it's computed from the validated
  // uthBadBeat Monte Carlo as a function of how much bank is left to pay a hit (i.e. the bet sizes).
  const bbjSidebet = gameSidebets.find((sb) => sb.sidebet_id === "sb_uth_progressive" || /bad\s*beat/i.test(sb.name));
  const bbjPayouts = bbjSidebet
    ? (badBeatPayoutsFromRows(paytableRowsOf(bbjSidebet.sidebet_id)) ?? BAD_BEAT_PAYOUTS)
    : BAD_BEAT_PAYOUTS;

  const baccaratCappedSidebets = isBaccarat
    ? gameSidebets
        .filter((sb) => sb !== bbjSidebet)
        .map((sb) => {
          const kind = matchBaccaratSidebet(sb.name);
          if (!kind) return null;
          return {
            id: sb.sidebet_id,
            name: sb.name,
            kind,
            actionOffered: sideActionOf(sb.sidebet_id),
            payout: baccaratBetPayoutFromRows(kind, paytableRowsOf(sb.sidebet_id)) ?? BACCARAT_BET_PAYOUTS[kind],
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
    : [];
  const tieFromSidebet = baccaratCappedSidebets.some((row) => row.kind === "tie");

  const otherSideLayers = gameSidebets
    .filter((sb) => sb !== bbjSidebet && !(isBaccarat && matchBaccaratSidebet(sb.name)))
    .map((sb) => ({
      id: sb.sidebet_id,
      name: sb.name,
      actionOffered: sideActionOf(sb.sidebet_id),
      edge: sb.edge_pct,
      exposureMult: sideExposure.get(sb.sidebet_id) ?? 1,
      sigma: sideSigmaValue,
    }))
    .filter((l) => l.actionOffered > 0);

  // Walk settlement: main (Player/Banker) first, then Tie, Panda/Koi, Dragon, other sides, BBJ last.
  let bankRemaining = Math.max(0, bankAmount - Math.min(baseAction * (game?.exposure_mult || 1), bankAmount));
  const baccaratCappedLayers: ReturnType<typeof cappedBaccaratLayer>[] = [];

  if (isBaccarat && !tieFromSidebet && baccaratTieAmount > 0) {
    const mainPaytable = gameSidebets.find((sb) => /main/i.test(sb.name));
    const tiePayout =
      (mainPaytable ? baccaratBetPayoutFromRows("tie", paytableRowsOf(mainPaytable.sidebet_id)) : null) ??
      BACCARAT_BET_PAYOUTS.tie;
    baccaratCappedLayers.push(
      cappedBaccaratLayer("baccarat_tie", "Tie", "tie", baccaratTieAmount, tiePayout, bankRemaining),
    );
    bankRemaining -= Math.min(baccaratTieAmount, bankRemaining);
  }

  for (const kind of ["tie", "pandaKoi", "dragon"] as const) {
    for (const row of baccaratCappedSidebets) {
      if (row.kind !== kind || row.actionOffered <= 0) continue;
      baccaratCappedLayers.push(
        cappedBaccaratLayer(row.id, row.name, row.kind, row.actionOffered, row.payout, bankRemaining),
      );
      bankRemaining -= Math.min(row.actionOffered, bankRemaining);
    }
  }

  for (const l of otherSideLayers) bankRemaining -= Math.min(l.actionOffered * l.exposureMult, bankRemaining);
  const bankForBbj = Math.max(0, bankRemaining);

  const bbjSize = bbjSidebet ? num(sideSizes[bbjSidebet.sidebet_id] ?? "") : 0;
  const bbjAction = bbjSidebet ? sideActionOf(bbjSidebet.sidebet_id) : 0;
  const bbjCap = bbjSize > 0 ? bankForBbj / bbjSize : Infinity;
  const bbjBaseEdge = realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, Infinity, bbjPayouts);
  const bbjEdge = bbjSidebet && bbjAction > 0 ? badBeatEdgeForCoverage(bankForBbj, bbjSize, bbjPayouts) : null;

  const sideLayers = [
    ...baccaratCappedLayers,
    ...otherSideLayers,
    ...(bbjSidebet && bbjAction > 0 && bbjEdge !== null
      ? [
          {
            id: bbjSidebet.sidebet_id,
            name: bbjSidebet.name,
            actionOffered: bbjAction,
            edge: bbjEdge,
            exposureMult: 1, // fully booked; the coverage cap (not an exposure reserve) models the risk
            sigma: badBeatSigma(BAD_BEAT_PROBABILITIES, bbjCap, bbjPayouts),
          },
        ]
      : []),
  ];

  const baccaratMainCoverage = isBaccarat
    ? [
        ...(baccaratPlayerAmount > 0
          ? [cappedBaccaratLayer("player", "Player line", "player", baccaratPlayerAmount, BACCARAT_BET_PAYOUTS.player, bankAmount)]
          : []),
        ...(baccaratBankerAmount > 0
          ? [cappedBaccaratLayer("banker", "Banker line", "banker", baccaratBankerAmount, BACCARAT_BET_PAYOUTS.banker, bankAmount)]
          : []),
      ]
    : [];

  // Collection tiers use base table action (TTA); side bets are separate settlement layers.
  // Tie is a base wager (Player/Banker/Tie), so it counts toward the fee schedule.
  const feeBasisTta = isBaccarat ? baseAction + baccaratTieAmount : baseAction;
  const feeTier = feeTiers.length > 0 ? findTierForAction(feeTiers, feeBasisTta) : null;
  const collection = feeTier ? feeTier.pdFee.toNumber() : 0;
  const cliff = feeTiers.length > 0 ? describeCliff(feeBasisTta, feeTiers) : null;
  const nearCliff = feeTiers.length > 0 ? isNearCliff(feeBasisTta, feeTiers) : false;

  // Analytic result is cheap (a handful of Decimal ops) — just compute it each render.
  const result = game
    ? computeBankingEV({
        bank: bankAmount,
        collection,
        base: {
          actionOffered: baseAction,
          edge: game.edge_pct,
          exposureMult: game.exposure_mult || 1,
          sigma: mainSigmaValue,
          exactMoments: baccaratMoments,
        },
        sides: sideLayers.map((l) => ({ actionOffered: l.actionOffered, edge: l.edge, exposureMult: l.exposureMult, sigma: l.sigma })),
        spots: isBaccarat ? 1 : n,
        rho: rhoVal,
      })
    : null;

  // A finished simulation is only valid for the inputs it ran on. Key it to those inputs and only show
  // it while the key still matches, so the panel never displays ruin/drawdown that predates an edit.
  const simKey = `${gameId}|${players}|${bank}|${mainSize}|${baccaratPlayerAction}|${baccaratBankerAction}|${baccaratTieAction}|${JSON.stringify(sideSizes)}|${selectedFeeCasino}|${selectedFeeOption}|${mainSigma}|${sideSigma}|${rho}|${roundsPerSession}`;
  const simResult = !isBaccarat && sim && sim.key === simKey ? sim.result : null;

  function runSim() {
    if (!result) return;
    const layers = [
      { booked: result.base.booked.toNumber(), edge: game!.edge_pct, sigma: mainSigmaValue },
      ...result.sides.map((s, i) => ({ booked: s.booked.toNumber(), edge: sideLayers[i].edge, sigma: sideLayers[i].sigma })),
    ];
    setSim({
      key: simKey,
      result: simulateSessions({
        bank: bankAmount,
        collection,
        layers,
        spots: n,
        rho: rhoVal,
        sessions: SIM_SESSIONS,
        roundsPerSession: Math.max(1, Math.round(num(roundsPerSession, 50))),
        seed: 0x9e3779b1,
      }),
    });
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">EV &amp; SD calculator</h1>
        <p className="text-sm text-muted">
          Pick a game, set each bet size, and get the per-round expectation and volatility — with underbanking modeled
          by settlement order (base funds first, side bets get the leftover bank) and the collection pulled from the
          fee schedule.
        </p>
      </div>

      <Field label="Game">
        <select
          value={gameId}
          onChange={(e) => {
            setGameId(e.target.value);
            setSideSizes({});
            setFeeOption("");
            setFeeCasino("");
            setSim(null);
          }}
          className="h-12 w-full rounded-xl border border-border bg-surface-inset px-3 text-base text-foreground outline-none focus:border-emerald-500/70"
        >
          <option value="" disabled>
            Select a game…
          </option>
          {games.map((g) => (
            <option key={g.game_id} value={g.game_id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>

      {!game ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface/50 p-4 text-sm text-muted">
          Choose a game to load its edge, exposure multiple, side bets, and fee schedule.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {!isBaccarat ? (
              <Field label="Players at table">
                <NumInput value={players} onChange={setPlayers} />
              </Field>
            ) : null}
            <Field label="Buy-in / bank ($)">
              <NumInput value={bank} onChange={setBank} />
            </Field>
          </div>

          <Panel
            title="Main bet"
            subtitle={
              isBaccarat
                ? `exact 8-deck closed form · exposure ×${game.exposure_mult}`
                : `edge ${(game.edge_pct * 100).toFixed(3)}% · exposure ×${game.exposure_mult}`
            }
          >
            {isBaccarat ? (
              <>
                <BetRow label="Player-line TTA ($)" value={baccaratPlayerAction} onChange={setBaccaratPlayerAction} />
                <BetRow label="Banker-line TTA ($)" value={baccaratBankerAction} onChange={setBaccaratBankerAction} />
                {!tieFromSidebet ? (
                  <BetRow label="Tie TTA ($)" value={baccaratTieAction} onChange={setBaccaratTieAction} />
                ) : null}
                <p className="text-xs text-muted">
                  Total Player/Banker action = <span className="num text-muted-strong">{formatMoney(baseAction)}</span>
                  {baccaratTieAmount > 0 ? (
                    <>
                      ; Tie = <span className="num text-muted-strong">{formatMoney(baccaratTieAmount)}</span>
                    </>
                  ) : null}
                  . Player/Banker EV uses the exact imbalance formula; Tie, Dragon, and Panda/Koi use coverage-capped
                  payouts like the UTH bad beat.
                </p>
              </>
            ) : (
              <>
                <BetRow label="Per-player size ($)" value={mainSize} onChange={setMainSize} />
                <p className="text-xs text-muted">
                  Base action = <span className="num text-muted-strong">{formatMoney(baseAction)}</span> ({n} ×{" "}
                  {formatMoney(mainBetAmount)})
                </p>
              </>
            )}
          </Panel>

          <Panel title="Side bets" subtitle={isBaccarat ? "TTA · settle last" : "settle last"}>
            {gameSidebets.length === 0 ? (
              <p className="text-xs text-muted">This game has no side bets recorded.</p>
            ) : (
              <div className="space-y-3">
                {gameSidebets.map((sb) => (
                  <div key={sb.sidebet_id}>
                    <BetRow
                      label={sb.name}
                      hint={
                        sb === bbjSidebet
                          ? `tail ×${(sideExposure.get(sb.sidebet_id) ?? 1).toLocaleString()} · edge from Monte Carlo`
                          : isBaccarat && matchBaccaratSidebet(sb.name)
                            ? `tail ×${(sideExposure.get(sb.sidebet_id) ?? 1).toLocaleString()} · edge from coverage`
                            : `tail ×${(sideExposure.get(sb.sidebet_id) ?? 1).toLocaleString()} · edge ${(sb.edge_pct * 100).toFixed(2)}%`
                      }
                      value={sideSizes[sb.sidebet_id] ?? ""}
                      onChange={(v) => setSideSizes((prev) => ({ ...prev, [sb.sidebet_id]: v }))}
                    />
                  </div>
                ))}
                <p className="text-xs text-muted">
                  {isBaccarat
                    ? "Sizes are total table action, not per-player. Dragon and Panda/Koi use coverage-capped edge like the UTH bad beat. Blank size = not offered."
                    : "Side edge uses each bet's recorded edge_pct (0 = unknown; set it on the game page). Blank size = not offered."}
                </p>
              </div>
            )}
          </Panel>

          {/* Baccarat — coverage-capped edges, same model as the UTH Bad Beat Jackpot */}
          {isBaccarat && (baccaratMainCoverage.length > 0 || baccaratCappedLayers.length > 0) ? (
            <Panel title="Baccarat coverage edges" subtitle="capped by leftover bank">
              <div className="space-y-3">
                {[...baccaratMainCoverage, ...baccaratCappedLayers].map((layer) => {
                  const raised = layer.edge > layer.baseEdge + 0.002;
                  return (
                    <div key={layer.id} className="space-y-2 rounded-xl border border-border bg-surface-inset px-3 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{layer.name}</span>
                        <span className="num text-[11px] text-muted">
                          covers ×{Number.isFinite(layer.cap) ? Math.floor(layer.cap).toLocaleString() : "∞"} of {layer.payout}:1
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Metric
                          label="Full-coverage edge"
                          value={`${(layer.baseEdge * 100).toFixed(layer.baseEdge < 0.03 ? 3 : 1)}%`}
                          base="fully banked"
                        />
                        <Metric
                          label="Realized edge (this setup)"
                          value={`${(layer.edge * 100).toFixed(layer.edge < 0.03 ? 3 : 1)}%`}
                          base={raised ? "raised by underbanking" : "≈ fully banked"}
                          tone={raised ? "warning" : "positive"}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted">
                Player/Banker settle first at even money (closed-form EV above). Tie, then Panda/Koi, then Dragon 7 take
                whatever bank is left and pay min(felt line, cap) on a hit — the same coverage cap as the UTH bad beat.
                A short bank on a 8:1 / 25:1 / 40:1 line keeps the shortfall, so that bet&apos;s edge rises.
              </p>
            </Panel>
          ) : null}

          {/* Bad Beat Jackpot — Monte-Carlo edge, computed from coverage rather than a stored constant */}
          {bbjSidebet && bbjAction > 0 && bbjEdge !== null ? (
            <Panel title="Bad Beat Jackpot edge" subtitle="Monte Carlo · capped by coverage">
              <div className="grid grid-cols-2 gap-4">
                <Metric label="Full-coverage edge" value={`${(bbjBaseEdge * 100).toFixed(1)}%`} base="fully banked" />
                <Metric
                  label="Realized edge (this setup)"
                  value={`${(bbjEdge * 100).toFixed(1)}%`}
                  base={bbjEdge > bbjBaseEdge + 0.002 ? "raised by underbanking" : "≈ fully banked"}
                  tone={bbjEdge > bbjBaseEdge + 0.002 ? "warning" : "positive"}
                />
              </div>
              <p className="text-xs text-muted">
                Bank left for the BBJ after base + other side bets settle:{" "}
                <span className="num text-muted-strong">{formatMoney(bankForBbj)}</span> → covers{" "}
                <span className="num text-muted-strong">×{Number.isFinite(bbjCap) ? Math.floor(bbjCap).toLocaleString() : "∞"}</span> per $1
                bet (vs the 7,500× straight-flush top). Validated against the published ~14.8% house edge; edge rises as the
                bank can&apos;t fully pay a hit.
              </p>
            </Panel>
          ) : null}

          {/* Fee from schedule */}
          <Panel
            title="Collection (from fee schedule)"
            subtitle={feeOptions.length > 1 ? undefined : selectedFeeOption || undefined}
          >
            {feeTiers.length === 0 ? (
              <p className="text-xs text-muted">
                No fee schedule for this game yet — collection treated as $0. Add tiers on the game page.
              </p>
            ) : (
              <div className="space-y-2">
                {feeCasinos.length > 1 ? (
                  <select
                    value={selectedFeeCasino}
                    onChange={(event) => {
                      setFeeCasino(event.target.value);
                      setFeeOption("");
                    }}
                    className="h-10 w-full rounded-lg border border-border bg-surface-inset px-3 text-sm text-foreground outline-none focus:border-emerald-500/70"
                  >
                    {feeCasinos.map((casino) => (
                      <option key={casino} value={casino}>
                        {casino}
                      </option>
                    ))}
                  </select>
                ) : null}
                {feeOptions.length > 1 ? (
                  <select
                    value={selectedFeeOption}
                    onChange={(e) => setFeeOption(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-surface-inset px-3 text-sm text-foreground outline-none focus:border-emerald-500/70"
                  >
                    {feeOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : null}
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted">
                    Table action <span className="num text-muted-strong">{formatMoney(feeBasisTta)}</span> →
                  </span>
                  <span className="num text-lg font-semibold text-foreground">{formatMoney(collection)} fee</span>
                </div>
                <CliffWarning cliff={cliff} isNear={nearCliff} />
              </div>
            )}
          </Panel>

          {/* Assumptions */}
          <button
            onClick={() => setShowAssumptions((v) => !v)}
            className="text-xs font-medium text-emerald-400"
          >
            {showAssumptions ? "− Hide" : "+ Show"} volatility assumptions
          </button>
          {showAssumptions ? (
            <Panel title="Assumptions (estimates)">
              <div className="grid grid-cols-3 gap-3">
                <BetRow label="Main σ / $1" value={mainSigma} onChange={setMainSigma} />
                <BetRow label="Side σ / $1" value={sideSigma} onChange={setSideSigma} />
                <BetRow label="Correlation ρ" value={rho} onChange={setRho} />
              </div>
              <p className="text-xs text-muted">
                σ is the per-$1 standard deviation of a wager outcome; ρ is the cross-seat correlation (an estimate,
                not solved). Side-bet variance uses a normal approximation and understates rare high-payout tails.
              </p>
            </Panel>
          ) : null}

          {/* Analytic results */}
          {result ? (
            <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <div className="grid grid-cols-2 gap-4">
                <Metric
                  label="EV / round"
                  value={formatMoney(result.ev)}
                  tone={result.ev.isZero() ? "neutral" : result.ev.isNegative() ? "negative" : "positive"}
                  size="lg"
                />
                <Metric label="SD / round" value={formatMoney(result.sd)} size="lg" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-inset px-3 py-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Coverage</span>
                <span className={`num text-sm font-semibold ${result.fullyBanked ? "text-emerald-400" : "text-amber-400"}`}>
                  {result.coveragePct.times(100).toFixed(1)}%{result.fullyBanked ? "" : " · underbanked"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="N₀ (rounds to 1 SD)" value={result.n0.isFinite() ? Math.round(result.n0.toNumber()).toLocaleString() : "∞"} />
                <Metric
                  label="Risk of ruin"
                  value={`${result.riskOfRuin.times(100).toFixed(result.riskOfRuin.greaterThan(0.001) ? 1 : 3)}%`}
                  tone={result.riskOfRuin.greaterThan(0.1) ? "warning" : "neutral"}
                />
                <Metric label="Full-Kelly bank" value={result.kellyBank.isFinite() ? formatMoney(result.kellyBank) : "∞"} hint="σ²/EV" />
                <Metric label="Breakeven action" value={result.breakevenActionBase.isFinite() ? formatMoney(result.breakevenActionBase) : "∞"} hint="C/edge, base" />
              </div>
            </section>
          ) : null}

          {/* Baccarat has an exact closed form and must not be simulated. */}
          {!isBaccarat ? <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Monte Carlo</h2>
                <p className="text-xs text-muted">{SIM_SESSIONS.toLocaleString()} sessions</p>
              </div>
              <div className="flex items-end gap-2">
                <label className="block">
                  <span className="text-[11px] text-muted">Rounds / session</span>
                  <NumInput value={roundsPerSession} onChange={setRoundsPerSession} className="h-10 w-24" />
                </label>
                <Button className="h-10 px-4 text-sm" onClick={runSim} disabled={!result}>
                  Run
                </Button>
              </div>
            </div>

            {simResult ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <Metric label="EV / round (sim)" value={formatMoney(simResult.evPerRound)} tone={simResult.evPerRound < 0 ? "negative" : "positive"} />
                  <Metric label="SD / round (sim)" value={formatMoney(simResult.sdPerRound)} />
                  <Metric
                    label={`Risk of ruin`}
                    value={`${(simResult.riskOfRuin * 100).toFixed(1)}%`}
                    hint={`over ${Math.max(1, Math.round(num(roundsPerSession, 50)))} rounds`}
                    tone={simResult.riskOfRuin > 0.1 ? "warning" : "neutral"}
                  />
                  <Metric label="Median session P&L" value={formatMoney(simResult.medianSessionPnl)} tone={simResult.medianSessionPnl < 0 ? "negative" : "positive"} />
                  <Metric label="P5 – P95 session" value={`${formatMoney(simResult.p5SessionPnl)} … ${formatMoney(simResult.p95SessionPnl)}`} />
                  <Metric label="Median max drawdown" value={formatMoney(simResult.medianMaxDrawdown)} />
                </div>
                <p className="text-xs text-muted">
                  The simulated EV should match the analytic EV above (a consistency check); the value the sim adds is
                  the distribution — ruin, drawdown, and the P5–P95 spread over a finite session. Normal-approximation
                  caveat applies to side-bet tails.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted">Run to estimate ruin, drawdown, and the session P&amp;L spread for this setup.</p>
            )}
          </section> : (
            <p className="rounded-2xl border border-border bg-surface p-4 text-xs text-muted">
              Baccarat uses the exact 8-deck expectation and variance above; Monte Carlo is intentionally disabled.
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle ? <span className="num text-xs text-muted">{subtitle}</span> : null}
      </div>
      {children}
    </section>
  );
}

function NumInput({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode="decimal"
      className={`num h-12 w-full rounded-xl border border-border bg-surface-inset px-3 text-base text-foreground outline-none focus:border-emerald-500/70 ${className}`}
    />
  );
}

function BetRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-foreground">{label}</span>
        {hint ? <span className="num text-[11px] text-muted">{hint}</span> : null}
      </span>
      <NumInput value={value} onChange={onChange} className="h-11" />
    </label>
  );
}
