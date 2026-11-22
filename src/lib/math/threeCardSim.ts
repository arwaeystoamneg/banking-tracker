/**
 * Three Card Poker, dealt card by card — the same idea as the UTH Bad Beat and baccarat sims: real hands from a
 * shuffled single deck, the player's real Play/Fold decision, and Pair Plus / 6 Card Bonus judged on the same
 * cards, so the side bets' long-shot tails and their link to the Ante come from the cards, not a normal curve.
 *
 * Two rule sets (pick the one on the felt):
 *   faceUp   — CA Face-Up (the Games tab's gm_3cp): one dealer card shows, no Ante Bonus; if the dealer doesn't
 *              qualify (Queen-high) the Play pushes and the player must still beat the dealer to win the Ante.
 *   standard — dealer's cards all face down; non-qualifying dealer pays the Ante 1:1, Play pushes; Ante Bonus
 *              on straight / trips / straight flush whenever the player plays.
 *
 * THREE_CARD_EXACT holds the exact figures from enumerating every deal (cardsim/oracle/tcp_faceup.py,
 * 22,100 × 18,424 standard / 1,221,511,200 face-up). The standard ones match the published anchors (5/4/1 optimal
 * 3.3730% of Ante = 2.0147% per total bet, 67.42% raise; mimic 3.45%; raise-all 7.65%). The tests check this
 * Monte Carlo against them — two derivations of every number.
 */

import type { PairPlusHand, SixCardHand } from "@/lib/math/threeCardPoker";

export type ThreeCardRules = "faceUp" | "standard";
export type AnteBonusTable = "5/4/1" | "4/3/1" | "3/2/1" | "none";
/** optimal = best Play/Fold; mimic = plays Queen-high or better (like the dealer); raiseAll = never folds. */
export type PlayerStyle = "optimal" | "mimic" | "raiseAll";

export interface AntePlayExact {
  /** Bank's edge per $1 of Ante. */
  edge: number;
  /** Variance of the bank's Ante/Play result per $1 of Ante. */
  variance: number;
  /** Share of hands the player plays. */
  raiseRate: number;
}

export const ANTE_BONUS: Record<AnteBonusTable, [number, number, number]> = {
  "5/4/1": [5, 4, 1],
  "4/3/1": [4, 3, 1],
  "3/2/1": [3, 2, 1],
  none: [0, 0, 0],
};

/** From cardsim/oracle/tcp_faceup_out.json (exact enumeration). Face-up "optimal" is the per-up-card threshold rule. */
export const THREE_CARD_EXACT: {
  faceUp: Record<PlayerStyle, AntePlayExact>;
  standard: Record<AnteBonusTable, Record<PlayerStyle, AntePlayExact>>;
} = {
  faceUp: {
    optimal: { edge: 0.0459964, variance: 2.411176, raiseRate: 0.709835 },
    mimic: { edge: 0.0873416, variance: 2.427214, raiseRate: 0.695928 },
    raiseAll: { edge: 0.2167312, variance: 3.037642, raiseRate: 1 },
  },
  standard: {
    "5/4/1": {
      optimal: { edge: 0.0337298, variance: 2.68715, raiseRate: 0.674208 },
      mimic: { edge: 0.0344906, variance: 2.731855, raiseRate: 0.695928 },
      raiseAll: { edge: 0.0765384, variance: 3.377378, raiseRate: 1 },
    },
    "4/3/1": {
      optimal: { edge: 0.0382549, variance: 2.635519, raiseRate: 0.674208 },
      mimic: { edge: 0.0390158, variance: 2.680217, raiseRate: 0.695928 },
      raiseAll: { edge: 0.0810634, variance: 3.32536, raiseRate: 1 },
    },
    "3/2/1": {
      optimal: { edge: 0.0427800, variance: 2.592896, raiseRate: 0.674208 },
      mimic: { edge: 0.0435410, variance: 2.637588, raiseRate: 0.695928 },
      raiseAll: { edge: 0.0855882, variance: 3.282351, raiseRate: 1 },
    },
    none: {
      optimal: { edge: 0.0865799, variance: 2.382588, raiseRate: 0.674208 },
      mimic: { edge: 0.0873416, variance: 2.427214, raiseRate: 0.695928 },
      raiseAll: { edge: 0.1293892, variance: 3.068292, raiseRate: 1 },
    },
  },
};

export function antePlayExact(rules: ThreeCardRules, bonus: AnteBonusTable, style: PlayerStyle): AntePlayExact {
  return rules === "faceUp" ? THREE_CARD_EXACT.faceUp[style] : THREE_CARD_EXACT.standard[bonus][style];
}

/** Most the bank can owe per $1 of Ante on Ante + Play (+ the top Ante Bonus). */
export function antePlayExposure(rules: ThreeCardRules, bonus: AnteBonusTable): number {
  return 2 + (rules === "standard" ? ANTE_BONUS[bonus][0] : 0);
}

// Cards 0..51: rank = c >> 2 (0 = deuce … 12 = ace), suit = c & 3. Same encoding as the oracle.
const code = (cat: number, k1 = 0, k2 = 0, k3 = 0) => ((cat * 13 + k1) * 13 + k2) * 13 + k3;
export const QUEEN_HIGH = code(0, 10);
export const Q64 = code(0, 10, 4, 2);
const STRAIGHT = code(3);
const TRIPS = code(4);
const STRAIGHT_FLUSH = code(5);
/** Face-up optimal: play when the hand scores at least this, by the dealer's up-card rank (2 … A). */
export const FACE_UP_THRESHOLDS = [1534, 1534, 1547, 1560, 1573, 1586, 1599, 1612, 1447, 1615, 1781, 1950, 2119];

/** 3CP hand value, higher wins (category, then kickers). A-2-3 is the lowest straight, A-K-Q the highest. */
export function score3(c0: number, c1: number, c2: number): number {
  let a = c0 >> 2;
  let b = c1 >> 2;
  let c = c2 >> 2;
  // sort descending
  if (a < b) [a, b] = [b, a];
  if (b < c) [b, c] = [c, b];
  if (a < b) [a, b] = [b, a];
  const flush = (c0 & 3) === (c1 & 3) && (c1 & 3) === (c2 & 3);
  let straight = false;
  let top = a;
  if (a - b === 1 && b - c === 1) straight = true;
  else if (a === 12 && b === 1 && c === 0) {
    straight = true;
    top = 1;
  }
  if (straight && flush) return code(5, top);
  if (a === b && b === c) return code(4, a);
  if (straight) return code(3, top);
  if (flush) return code(2, a, b, c);
  if (a === b) return code(1, a, c);
  if (b === c) return code(1, b, a);
  return code(0, a, b, c);
}

export function plays(rules: ThreeCardRules, style: PlayerStyle, score: number, upCard: number): boolean {
  if (style === "raiseAll") return true;
  if (style === "mimic") return score >= QUEEN_HIGH;
  return rules === "faceUp" ? score >= FACE_UP_THRESHOLDS[upCard >> 2] : score >= Q64;
}

/** Player's Ante/Play result per $1 Ante (negative = bank wins), Ante Bonus included. */
export function antePlayResult(
  rules: ThreeCardRules,
  bonus: AnteBonusTable,
  style: PlayerStyle,
  player: number,
  dealerUp: number,
  dealer: number,
): { result: number; played: boolean } {
  if (!plays(rules, style, player, dealerUp)) return { result: -1, played: false };
  const cmp = player > dealer ? 1 : player < dealer ? -1 : 0;
  let result: number;
  if (dealer >= QUEEN_HIGH) result = 2 * cmp;
  else result = rules === "faceUp" ? cmp : 1;
  if (rules === "standard") {
    const [sf, trips, straight] = ANTE_BONUS[bonus];
    result += player >= STRAIGHT_FLUSH ? sf : player >= TRIPS ? trips : player >= STRAIGHT ? straight : 0;
  }
  return { result, played: true };
}

/** The Pair Plus hand from the player's three cards (Mini Royal = A-K-Q suited), or null for no pair. */
export function pairPlusHand(c0: number, c1: number, c2: number): PairPlusHand | null {
  const score = score3(c0, c1, c2);
  const cat = Math.floor(score / 2197);
  if (cat === 5) return score === code(5, 12) ? "miniRoyal" : "straightFlush";
  return (["pair", "flush", "straight", "trips"] as const)[cat - 1] ?? null;
}

/** Best five-card hand from six cards, for the 6 Card Bonus (trips or better; null below that). */
export function sixCardHand(cards: number[]): SixCardHand | null {
  const rankCount = new Array<number>(13).fill(0);
  const suitCount = [0, 0, 0, 0];
  for (const card of cards) {
    rankCount[card >> 2] += 1;
    suitCount[card & 3] += 1;
  }
  /** Highest straight's top rank, or -1. Top 3 is the wheel: 5-4-3-2 plus the ace playing low. */
  const straightTop = (has: (rank: number) => boolean): number => {
    for (let top = 12; top >= 3; top -= 1) {
      let ok = true;
      for (let k = 0; k < 5 && ok; k += 1) ok = has(top - k < 0 ? 12 : top - k);
      if (ok) return top;
    }
    return -1;
  };
  const flushSuit = suitCount.findIndex((count) => count >= 5);
  if (flushSuit >= 0) {
    const inSuit = new Set(cards.filter((card) => (card & 3) === flushSuit).map((card) => card >> 2));
    const top = straightTop((rank) => inSuit.has(rank));
    if (top === 12) return "royal";
    if (top >= 3) return "straightFlush";
  }
  const counts = rankCount.filter((count) => count > 0).sort((a, b) => b - a);
  if (counts[0] >= 4) return "quads";
  if (counts[0] === 3 && counts[1] >= 2) return "fullHouse";
  if (flushSuit >= 0) return "flush";
  if (straightTop((rank) => rankCount[rank] > 0) >= 3) return "straight";
  if (counts[0] === 3) return "trips";
  return null;
}

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

export interface ThreeCardTable {
  rules: ThreeCardRules;
  bonus: AnteBonusTable;
  style: PlayerStyle;
  ante: number;
  pairPlus: number;
  sixCard: number;
  pairPlusPayouts: Record<PairPlusHand, number>;
  sixCardPayouts: Record<SixCardHand, number>;
}

export interface ThreeCardRound {
  /** Player's result per bet in dollars (positive = player won). */
  antePlay: number;
  pairPlus: number;
  sixCard: number;
  played: boolean;
}

/** Deals one round from a fresh single deck: player 3, dealer 3 (dealer's first card is the up card). */
export function dealThreeCardRound(rand: () => number, table: ThreeCardTable, deck = Array.from({ length: 52 }, (_, i) => i)): ThreeCardRound {
  for (let i = 0; i < 6; i += 1) {
    const j = i + Math.floor(rand() * (52 - i));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  const player = score3(deck[0], deck[1], deck[2]);
  const dealer = score3(deck[3], deck[4], deck[5]);
  const ap = antePlayResult(table.rules, table.bonus, table.style, player, deck[3], dealer);
  let pairPlus = 0;
  if (table.pairPlus > 0) {
    const hand = pairPlusHand(deck[0], deck[1], deck[2]);
    // A paytable without a Mini Royal line pays it as a straight flush.
    const key = hand === "miniRoyal" && !(table.pairPlusPayouts.miniRoyal > 0) ? "straightFlush" : hand;
    const pay = key ? table.pairPlusPayouts[key] ?? 0 : 0;
    pairPlus = pay > 0 ? pay * table.pairPlus : -table.pairPlus;
  }
  let sixCard = 0;
  if (table.sixCard > 0) {
    const hand = sixCardHand([deck[0], deck[1], deck[2], deck[3], deck[4], deck[5]]);
    const pay = hand ? table.sixCardPayouts[hand] ?? 0 : 0;
    sixCard = pay > 0 ? pay * table.sixCard : -table.sixCard;
  }
  return { antePlay: ap.result * table.ante, pairPlus, sixCard, played: ap.played };
}

/**
 * Bank's P&L for one round, paying winners from the stack in settlement order (Ante/Play, then Pair Plus, then
 * 6 Card Bonus) before collecting losers, so a short bank can't pay the side bets in full — same gross
 * settlement as the baccarat sim. Returns the bank's change.
 */
export function settleThreeCardRound(round: ThreeCardRound, bank: number): number {
  let stack = Math.max(0, bank);
  const legs = [round.antePlay, round.pairPlus, round.sixCard];
  for (const leg of legs) if (leg > 0) stack -= Math.min(leg, stack);
  for (const leg of legs) if (leg < 0) stack += -leg;
  return stack - Math.max(0, bank);
}

export interface ThreeCardSimResult {
  rounds: number;
  evPerRound: number;
  sdPerRound: number;
  riskOfRuin: number;
  medianSessionPnl: number;
  p5SessionPnl: number;
  p95SessionPnl: number;
  medianMaxDrawdown: number;
  /** Share of rounds the player played (checks the strategy against THREE_CARD_EXACT). */
  raiseRate: number;
}

export function simulateThreeCardSessions(input: {
  bank: number;
  collection: number;
  table: ThreeCardTable;
  sessions: number;
  roundsPerSession: number;
  seed?: number;
}): ThreeCardSimResult {
  const rand = mulberry32(input.seed ?? 0x9e3779b1);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const sessionPnls: number[] = [];
  const drawdowns: number[] = [];
  let ruined = 0;
  let sum = 0;
  let sumSq = 0;
  let rounds = 0;
  let played = 0;

  for (let s = 0; s < input.sessions; s += 1) {
    let stack = input.bank;
    let peak = stack;
    let maxDd = 0;
    let sessionPnl = 0;
    let broke = false;
    for (let r = 0; r < input.roundsPerSession; r += 1) {
      const round = dealThreeCardRound(rand, input.table, deck);
      if (round.played) played += 1;
      const pnl = settleThreeCardRound(round, stack) - input.collection;
      stack += pnl;
      sessionPnl += pnl;
      sum += pnl;
      sumSq += pnl * pnl;
      rounds += 1;
      if (stack > peak) peak = stack;
      maxDd = Math.max(maxDd, peak - stack);
      if (stack <= 0) {
        broke = true;
        break;
      }
    }
    if (broke) ruined += 1;
    sessionPnls.push(sessionPnl);
    drawdowns.push(maxDd);
  }

  sessionPnls.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);
  const quantile = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(q * (arr.length - 1))))] ?? 0;
  const mean = rounds > 0 ? sum / rounds : 0;
  return {
    rounds,
    evPerRound: mean,
    sdPerRound: Math.sqrt(Math.max(0, rounds > 0 ? sumSq / rounds - mean * mean : 0)),
    riskOfRuin: ruined / input.sessions,
    medianSessionPnl: quantile(sessionPnls, 0.5),
    p5SessionPnl: quantile(sessionPnls, 0.05),
    p95SessionPnl: quantile(sessionPnls, 0.95),
    medianMaxDrawdown: quantile(drawdowns, 0.5),
    raiseRate: rounds > 0 ? played / rounds : 0,
  };
}
