/**
 * Baccarat Player / Banker / Tie / Dragon 7 / Panda-Koi — coverage-capped bank edge.
 *
 * Same model as uthBadBeat: the bank takes every posted wager and pays min(felt payout, cap) on a
 * hit, where cap = bank left for this bet / $1 of action after earlier settlement. A tighter cap
 * (heavier underbanking) raises the bank's edge because it keeps the shortfall on a win. cap = ∞
 * is the fully-banked published house edge.
 *
 * Probabilities:
 *   Player / Banker / Tie / Dragon 7  — CLAUDE.md 8-deck constants (do not re-derive). Dragon 7 is
 *     the same event as the Banker-line 3-card-7 push, so it uses pBanker3Card7 rather than a second
 *     figure. Wizard of Odds publishes 0.022534 / 7.61% for Dragon 7; the project constant gives
 *     ~7.91%. The gap is the constant, not a second simulation.
 *   Panda / Koi (Panda 8)             — Wizard of Odds 8-deck, 0.034543 at 25:1 → ~10.19%. Not in
 *     CLAUDE.md; this is the solved published figure for Player 3-card 8 beating Banker 7 or less.
 *
 * Paytables default to CA EZ / 21st Century: Player 1:1, Banker 1:1 (Dragon 7 pushes the Banker
 * line — no 5% commission), Tie 8:1, Dragon 7 40:1, Panda 8 25:1. Felt rows override via
 * baccaratBetPayoutFromRows, same as badBeatPayoutsFromRows.
 */

import { payoutMultiple } from "@/lib/payout";
import { BACCARAT_CONSTANTS } from "@/lib/math/baccarat";
import {
  coverageCap,
  coverageEdgeForSize,
  coverageSigma,
  realizedCoverageEdge,
  type CoverageOutcome,
} from "@/lib/math/coverageBet";

export type BaccaratBetKind = "player" | "banker" | "tie" | "dragon" | "pandaKoi";

export interface BaccaratBetModel {
  kind: BaccaratBetKind;
  label: string;
  /** Probability the player wins this wager. */
  winProb: number;
  /** Probability the stake is returned. */
  pushProb: number;
  /** To-1 payout on a win. */
  payout: number;
}

const { pBankerWin, pPlayerWin, pTie, pBanker3Card7 } = BACCARAT_CONSTANTS;

/** Banker even-money wins — Banker wins that are not the Dragon 7 push. */
const pBankerEvenMoney = pBankerWin - pBanker3Card7;

export const BACCARAT_BET_PAYOUTS: Record<BaccaratBetKind, number> = {
  player: 1,
  banker: 1,
  tie: 8,
  dragon: 40,
  pandaKoi: 25,
};

const BET_META: Record<BaccaratBetKind, { label: string; winProb: number; pushProb: number }> = {
  player: { label: "Player line", winProb: pPlayerWin, pushProb: pTie },
  banker: {
    label: "Banker line",
    winProb: pBankerEvenMoney,
    pushProb: pTie + pBanker3Card7,
  },
  tie: { label: "Tie", winProb: pTie, pushProb: 0 },
  dragon: { label: "Dragon 7", winProb: pBanker3Card7, pushProb: 0 },
  pandaKoi: { label: "Panda 8", winProb: 0.034543, pushProb: 0 },
};

export function baccaratBetModel(kind: BaccaratBetKind, payout = BACCARAT_BET_PAYOUTS[kind]): BaccaratBetModel {
  const meta = BET_META[kind];
  return { kind, label: meta.label, winProb: meta.winProb, pushProb: meta.pushProb, payout };
}

function outcomesFromModel(model: BaccaratBetModel): CoverageOutcome[] {
  const outcomes: CoverageOutcome[] = [{ id: "win", probability: model.winProb, payout: model.payout }];
  if (model.pushProb > 0) outcomes.push({ id: "push", probability: model.pushProb, payout: 0 });
  return outcomes;
}

/**
 * Realized bank edge per $1 once wins pay min(payout, capMultiple). cap = ∞ is fully banked;
 * cap ≤ 0 means every win pays 0 (stake pushes) so the edge collapses to P(lose).
 */
export function realizedBaccaratBetEdge(model: BaccaratBetModel, capMultiple: number): number {
  return realizedCoverageEdge(outcomesFromModel(model), capMultiple);
}

/** Per-$1 SD of the bank outcome: +1 lose, 0 push, −min(payout, cap) win. */
export function baccaratBetSigma(model: BaccaratBetModel, capMultiple = Infinity): number {
  return coverageSigma(outcomesFromModel(model), capMultiple);
}

export function baccaratBetCap(bankAvailable: number, betSize: number): number {
  return coverageCap(bankAvailable, betSize);
}

export function baccaratBetEdgeForCoverage(
  kind: BaccaratBetKind,
  bankAvailable: number,
  betSize: number,
  payout = BACCARAT_BET_PAYOUTS[kind],
): number {
  return coverageEdgeForSize(outcomesFromModel(baccaratBetModel(kind, payout)), bankAvailable, betSize);
}

export const BACCARAT_BET_BASE_EDGE: Record<BaccaratBetKind, number> = {
  player: realizedBaccaratBetEdge(baccaratBetModel("player"), Infinity),
  banker: realizedBaccaratBetEdge(baccaratBetModel("banker"), Infinity),
  tie: realizedBaccaratBetEdge(baccaratBetModel("tie"), Infinity),
  dragon: realizedBaccaratBetEdge(baccaratBetModel("dragon"), Infinity),
  pandaKoi: realizedBaccaratBetEdge(baccaratBetModel("pandaKoi"), Infinity),
};

/** Maps a side-bet name onto a coverage-capped baccarat bet. Main (Banker/Player/Tie) is not a single bet. */
export function matchBaccaratSidebet(name: string): BaccaratBetKind | null {
  const s = name.toLowerCase();
  if (/main/.test(s)) return null;
  const panda = /panda|koi/.test(s);
  const dragon = /dragon/.test(s);
  // Combined "Dragon 7 / Panda 8" is a different wager (two mutually exclusive pays on one chip).
  if (panda && dragon) return null;
  if (panda) return "pandaKoi";
  if (dragon) return "dragon";
  if (/\btie\b/.test(s)) return "tie";
  return null;
}

function rowMatchesKind(kind: BaccaratBetKind, outcome: string): boolean {
  const s = outcome.toLowerCase();
  switch (kind) {
    case "player":
      return /player\s*win/.test(s);
    case "banker":
      return /banker\s*win/.test(s);
    case "tie":
      return /\btie\b/.test(s);
    case "dragon":
      return /dragon|3[-\s]*card\s*7|banker.*\b7\b/.test(s);
    case "pandaKoi":
      return /panda|koi|3[-\s]*card\s*8|player.*\b8\b/.test(s);
  }
}

/**
 * Parses a paytable into the to-1 multiple for this bet. Returns null when no row is recognizable
 * so the caller can fall back to the standard payout rather than treating TBD as 0.
 */
export function baccaratBetPayoutFromRows(
  kind: BaccaratBetKind,
  rows: { outcome: string; payout: string }[],
): number | null {
  for (const row of rows) {
    if (!rowMatchesKind(kind, row.outcome)) continue;
    const multiple = payoutMultiple(row.payout);
    if (multiple !== null) return multiple;
  }
  return null;
}
