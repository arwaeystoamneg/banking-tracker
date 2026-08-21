/**
 * 8-deck baccarat hands + player-dealer settlement.
 *
 * Frequencies come from dealing (same third-card tableau as the felt), not from a leftover-bank
 * story. Dragon 7 is a Banker win with a three-card 7: Player-line loses, Banker-line pushes, Dragon
 * is paid from the tray. Panda 8 is a Player win with a three-card 8: Player is paid, then Koi from
 * what is left. Tie pushes both main lines. Those hands are mutually exclusive — you never reserve
 * main, Tie, Koi, and Dragon against the same round.
 *
 * Settlement is gross: winners are paid from the buy-in in CA filing order (Player, Banker, Tie,
 * Panda/Koi, Dragon), then losers are collected. Same-hand collects do not increase what you can
 * pay — $17k cannot cover a $20k Dragon. Uncovered remainder is a return. Each round starts from
 * the entered buy-in.
 */

import { BACCARAT_BET_PAYOUTS, type BaccaratBetKind } from "@/lib/math/baccaratBets";

export type BaccaratOutcome = "player" | "panda8" | "banker" | "dragon7" | "tie";

export interface BaccaratBets {
  player: number;
  banker: number;
  tie: number;
  dragon: number;
  pandaKoi: number;
}

export interface BaccaratHand {
  outcome: BaccaratOutcome;
  playerTotal: number;
  bankerTotal: number;
  playerCards: number;
  bankerCards: number;
}

const OUTCOMES: BaccaratOutcome[] = ["player", "panda8", "banker", "dragon7", "tie"];
const BETS: (keyof BaccaratBets)[] = ["player", "banker", "tie", "pandaKoi", "dragon"];

/** CA filing order: Player, Banker, Tie, Panda 8, Dragon 7. */
const SETTLE_ORDER: BaccaratBetKind[] = ["player", "banker", "tie", "pandaKoi", "dragon"];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bacValue(card: number): number {
  const rank = card % 13; // 0=A … 12=K
  if (rank >= 9) return 0;
  return rank + 1;
}

function total(cards: number[]): number {
  let s = 0;
  for (const c of cards) s += bacValue(c);
  return s % 10;
}

function bankerDraws(bankerTwoCard: number, playerDrew: boolean, playerThird: number): boolean {
  if (!playerDrew) return bankerTwoCard <= 5;
  if (bankerTwoCard <= 2) return true;
  if (bankerTwoCard === 3) return playerThird !== 8;
  if (bankerTwoCard === 4) return playerThird >= 2 && playerThird <= 7;
  if (bankerTwoCard === 5) return playerThird >= 4 && playerThird <= 7;
  if (bankerTwoCard === 6) return playerThird === 6 || playerThird === 7;
  return false;
}

export function classifyBaccaratHand(playerCards: number[], bankerCards: number[]): BaccaratHand {
  const playerTotal = total(playerCards);
  const bankerTotal = total(bankerCards);
  let outcome: BaccaratOutcome;
  if (playerTotal === bankerTotal) outcome = "tie";
  else if (playerTotal > bankerTotal) {
    outcome = playerCards.length === 3 && playerTotal === 8 ? "panda8" : "player";
  } else {
    outcome = bankerCards.length === 3 && bankerTotal === 7 ? "dragon7" : "banker";
  }
  return {
    outcome,
    playerTotal,
    bankerTotal,
    playerCards: playerCards.length,
    bankerCards: bankerCards.length,
  };
}

/** One hand from a full 8-deck shoe (reset each hand — matches published 8-deck combinatorics). */
export function dealBaccaratHand(rand: () => number): BaccaratHand {
  const deck = new Array<number>(416);
  for (let i = 0; i < 416; i += 1) deck[i] = i % 52;
  for (let i = 0; i < 6; i += 1) {
    const j = i + Math.floor(rand() * (416 - i));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  const player = [deck[0], deck[2]];
  const banker = [deck[1], deck[3]];
  let next = 4;
  const p0 = total(player);
  const b0 = total(banker);
  if (p0 >= 8 || b0 >= 8) return classifyBaccaratHand(player, banker);

  let playerThird: number | null = null;
  if (p0 <= 5) {
    playerThird = bacValue(deck[next]);
    player.push(deck[next]);
    next += 1;
  }
  if (bankerDraws(b0, playerThird !== null, playerThird ?? 0)) banker.push(deck[next]);
  return classifyBaccaratHand(player, banker);
}

export function simulateOutcomeFrequencies(iterations: number, seed = 12345): Record<BaccaratOutcome, number> {
  const rand = mulberry32(seed);
  const counts: Record<BaccaratOutcome, number> = { player: 0, panda8: 0, banker: 0, dragon7: 0, tie: 0 };
  for (let i = 0; i < iterations; i += 1) counts[dealBaccaratHand(rand).outcome] += 1;
  const out = { ...counts };
  for (const k of OUTCOMES) out[k] = counts[k] / iterations;
  return out;
}

/**
 * Outcome mix from a 2,000,000-hand 8-deck deal (seed 12345). Player+panda8, banker+dragon7, and
 * tie match CLAUDE.md to ~0.0004; panda8/dragon7 are the 3-card subsets of those wins.
 * Regenerate with simulateOutcomeFrequencies(2_000_000, 12345).
 */
export const BACCARAT_OUTCOME_PROBABILITIES: Record<BaccaratOutcome, number> = {
  player: 0.4116275,
  panda8: 0.0343535,
  banker: 0.4364655,
  dragon7: 0.0224365,
  tie: 0.095117,
};

type LegResult = "win" | "lose" | "push";

function resultFor(outcome: BaccaratOutcome, bet: BaccaratBetKind): LegResult {
  switch (bet) {
    case "player":
      if (outcome === "player" || outcome === "panda8") return "win";
      if (outcome === "tie") return "push";
      return "lose"; // banker, dragon7
    case "banker":
      if (outcome === "banker") return "win";
      if (outcome === "tie" || outcome === "dragon7") return "push";
      return "lose";
    case "tie":
      return outcome === "tie" ? "win" : "lose";
    case "pandaKoi":
      return outcome === "panda8" ? "win" : "lose";
    case "dragon":
      return outcome === "dragon7" ? "win" : "lose";
  }
}

export interface BaccaratSettlement {
  pnl: number;
  perBet: BaccaratBets;
  /** Realized to-1 multiple paid on a winning leg (0 if the bank couldn't pay). */
  paidMultiple: BaccaratBets;
}

export function settleBaccaratHand(
  outcome: BaccaratOutcome,
  bank: number,
  bets: BaccaratBets,
  payouts: Record<BaccaratBetKind, number> = BACCARAT_BET_PAYOUTS,
): BaccaratSettlement {
  let stack = Math.max(0, bank);
  const perBet: BaccaratBets = { player: 0, banker: 0, tie: 0, dragon: 0, pandaKoi: 0 };
  const paidMultiple: BaccaratBets = { player: 0, banker: 0, tie: 0, dragon: 0, pandaKoi: 0 };
  const actionOf: Record<BaccaratBetKind, number> = {
    player: bets.player,
    banker: bets.banker,
    tie: bets.tie,
    pandaKoi: bets.pandaKoi,
    dragon: bets.dragon,
  };

  // Pay winners from the tray first (gross). Collects wait — they do not fund this hand's payouts.
  for (const bet of SETTLE_ORDER) {
    const action = Math.max(0, actionOf[bet]);
    if (action <= 0) continue;
    if (resultFor(outcome, bet) !== "win") continue;
    const owed = action * payouts[bet];
    const paid = Math.min(owed, stack);
    stack -= paid;
    perBet[bet] -= paid;
    paidMultiple[bet] = action > 0 ? paid / action : 0;
  }
  for (const bet of SETTLE_ORDER) {
    const action = Math.max(0, actionOf[bet]);
    if (action <= 0) continue;
    if (resultFor(outcome, bet) !== "lose") continue;
    stack += action;
    perBet[bet] += action;
  }

  return { pnl: stack - Math.max(0, bank), perBet, paidMultiple };
}

export interface BaccaratBankingMoments {
  ev: number;
  variance: number;
  sd: number;
  edges: BaccaratBets;
  /** On-hit realized multiple for each bet (0 if that bet isn't offered). */
  hitMultiple: BaccaratBets;
}

const EMPTY_BETS: BaccaratBets = { player: 0, banker: 0, tie: 0, dragon: 0, pandaKoi: 0 };

const WIN_OUTCOME: Record<keyof BaccaratBets, BaccaratOutcome> = {
  player: "player",
  banker: "banker",
  tie: "tie",
  dragon: "dragon7",
  pandaKoi: "panda8",
};

export function baccaratBankingMoments(
  bank: number,
  bets: BaccaratBets,
  probabilities: Record<BaccaratOutcome, number> = BACCARAT_OUTCOME_PROBABILITIES,
  payouts: Record<BaccaratBetKind, number> = BACCARAT_BET_PAYOUTS,
): BaccaratBankingMoments {
  let ev = 0;
  let second = 0;
  const perBet: BaccaratBets = { ...EMPTY_BETS };
  for (const outcome of OUTCOMES) {
    const p = probabilities[outcome];
    const settled = settleBaccaratHand(outcome, bank, bets, payouts);
    ev += p * settled.pnl;
    second += p * settled.pnl * settled.pnl;
    for (const bet of BETS) perBet[bet] += p * settled.perBet[bet];
  }
  const variance = Math.max(0, second - ev * ev);
  const edges: BaccaratBets = { ...EMPTY_BETS };
  for (const bet of BETS) edges[bet] = bets[bet] > 0 ? perBet[bet] / bets[bet] : 0;

  const hitMultiple: BaccaratBets = { ...EMPTY_BETS };
  for (const bet of BETS) {
    if (bets[bet] <= 0) continue;
    hitMultiple[bet] = settleBaccaratHand(WIN_OUTCOME[bet], bank, bets, payouts).paidMultiple[bet];
  }

  return { ev, variance, sd: Math.sqrt(variance), edges, hitMultiple };
}

export function sampleBaccaratOutcome(rand: () => number, probabilities = BACCARAT_OUTCOME_PROBABILITIES): BaccaratOutcome {
  let x = rand();
  for (const outcome of OUTCOMES) {
    x -= probabilities[outcome];
    if (x <= 0) return outcome;
  }
  return "tie";
}

export function simulateBaccaratSessions(input: {
  bank: number;
  collection: number;
  bets: BaccaratBets;
  sessions: number;
  roundsPerSession: number;
  seed?: number;
  probabilities?: Record<BaccaratOutcome, number>;
  payouts?: Record<BaccaratBetKind, number>;
}): {
  rounds: number;
  evPerRound: number;
  sdPerRound: number;
  riskOfRuin: number;
  medianSessionPnl: number;
  p5SessionPnl: number;
  p95SessionPnl: number;
  medianMaxDrawdown: number;
} {
  const rand = mulberry32(input.seed ?? 0x9e3779b1);
  const probs = input.probabilities ?? BACCARAT_OUTCOME_PROBABILITIES;
  const payouts = input.payouts ?? BACCARAT_BET_PAYOUTS;
  const sessionPnls: number[] = [];
  const drawdowns: number[] = [];
  let ruined = 0;
  let roundPnlSum = 0;
  let roundPnlSq = 0;
  let rounds = 0;

  for (let s = 0; s < input.sessions; s += 1) {
    let stack = input.bank;
    let peak = stack;
    let maxDd = 0;
    let sessionPnl = 0;
    let hitRuin = false;
    for (let r = 0; r < input.roundsPerSession; r += 1) {
      const outcome = sampleBaccaratOutcome(rand, probs);
      const settled = settleBaccaratHand(outcome, stack, input.bets, payouts);
      const pnl = settled.pnl - input.collection;
      stack += pnl;
      sessionPnl += pnl;
      roundPnlSum += pnl;
      roundPnlSq += pnl * pnl;
      rounds += 1;
      if (stack > peak) peak = stack;
      maxDd = Math.max(maxDd, peak - stack);
      if (stack <= 0) {
        hitRuin = true;
        break;
      }
    }
    if (hitRuin) ruined += 1;
    sessionPnls.push(sessionPnl);
    drawdowns.push(maxDd);
  }

  sessionPnls.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);
  const quantile = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(q * (arr.length - 1))))] ?? 0;
  const mean = rounds > 0 ? roundPnlSum / rounds : 0;
  const variance = rounds > 0 ? Math.max(0, roundPnlSq / rounds - mean * mean) : 0;

  return {
    rounds,
    evPerRound: mean,
    sdPerRound: Math.sqrt(variance),
    riskOfRuin: ruined / input.sessions,
    medianSessionPnl: quantile(sessionPnls, 0.5),
    p5SessionPnl: quantile(sessionPnls, 0.05),
    p95SessionPnl: quantile(sessionPnls, 0.95),
    medianMaxDrawdown: quantile(drawdowns, 0.5),
  };
}
