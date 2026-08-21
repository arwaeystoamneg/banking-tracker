/**
 * Ultimate Texas Hold'em Bad Beat Bonus — Monte Carlo model of the California player-banked side bet.
 *
 * Rule (Stones Gambling Hall / M8trix filings, per Wizard of Vegas): the bonus pays on the *losing*
 * hand of the player-vs-player-dealer showdown whenever that loser is three-of-a-kind or better; a
 * five-card tie loses. Payout is a to-1 multiple on the beaten hand's category:
 *
 *   straight flush 7,500 · four of a kind 500 · full house 50 · flush 30 · straight 20 · trips 9
 *
 * There is no clean closed form (it's a two-hand 7-card comparison), so we simulate. The fully-banked
 * house edge is a solved published figure (~14.8%, Stephen How) — the sim is validated against it.
 *
 * Folds barely matter here: you never fold three-of-a-kind-or-better, and the "beat the dealer's
 * 3-of-a-kind+" branch requires a hand you'd never fold — so an always-showdown model matches the
 * published edge. Card frequencies are exact combinatorics, not invented.
 */

import { payoutMultiple } from "@/lib/payout";

export type BadBeatCategory = "straightFlush" | "quads" | "fullHouse" | "flush" | "straight" | "trips";

export const BAD_BEAT_PAYOUTS: Record<BadBeatCategory, number> = {
  straightFlush: 7500,
  quads: 500,
  fullHouse: 50,
  flush: 30,
  straight: 20,
  trips: 9,
};

export interface BadBeatProbabilities {
  probabilities: Record<BadBeatCategory, number>;
  /** Fraction of showdowns that produce no qualifying bad beat (BBJ loses). */
  noBeat: number;
  /** Fully-banked house edge = −EV per $1 with uncapped payouts. */
  baseEdge: number;
  iterations: number;
}

/* ---- 7-card hand evaluation ---- */

function straightHigh(present: boolean[]): number {
  // present indexed by rank 1..14 (ace also mirrored to 1 for the wheel).
  let run = 0;
  let best = 0;
  for (let r = 1; r <= 14; r += 1) {
    if (present[r]) {
      run += 1;
      if (run >= 5) best = r;
    } else {
      run = 0;
    }
  }
  return best;
}

/** Encodes category (0 high .. 8 straight flush) + up to 5 kicker ranks into one comparable number. */
function encode(category: number, kickers: number[]): number {
  let v = category;
  for (let i = 0; i < 5; i += 1) v = v * 15 + (kickers[i] ?? 0);
  return v;
}

function topRanksExcept(rankCount: number[], exclude: number[], count: number): number[] {
  const out: number[] = [];
  for (let r = 14; r >= 2 && out.length < count; r -= 1) {
    if (rankCount[r] > 0 && !exclude.includes(r)) out.push(r);
  }
  return out;
}

/** Returns { category, rank } where rank is a total order (higher wins). Cards are 0..51. */
export function evaluate7(cards: number[]): { category: number; rank: number } {
  const rankCount = new Array(15).fill(0);
  const suitCount = [0, 0, 0, 0];
  const suitRanks: number[][] = [[], [], [], []];

  for (const c of cards) {
    const r = (c % 13) + 2; // 2..14
    const s = (c / 13) | 0; // 0..3
    rankCount[r] += 1;
    suitCount[s] += 1;
    suitRanks[s].push(r);
  }

  // Straight flush
  let sf = 0;
  for (let s = 0; s < 4; s += 1) {
    if (suitCount[s] >= 5) {
      const present = new Array(15).fill(false);
      for (const r of suitRanks[s]) {
        present[r] = true;
        if (r === 14) present[1] = true;
      }
      sf = Math.max(sf, straightHigh(present));
    }
  }
  if (sf) return { category: 8, rank: encode(8, [sf]) };

  const byCount: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (let r = 14; r >= 2; r -= 1) if (rankCount[r]) byCount[rankCount[r]].push(r);

  if (byCount[4].length) {
    const q = byCount[4][0];
    return { category: 7, rank: encode(7, [q, topRanksExcept(rankCount, [q], 1)[0]]) };
  }

  if (byCount[3].length && (byCount[2].length || byCount[3].length > 1)) {
    const t = byCount[3][0];
    const p = byCount[2].length ? byCount[2][0] : byCount[3][1];
    return { category: 6, rank: encode(6, [t, p]) };
  }

  for (let s = 0; s < 4; s += 1) {
    if (suitCount[s] >= 5) {
      const top5 = suitRanks[s].slice().sort((a, b) => b - a).slice(0, 5);
      return { category: 5, rank: encode(5, top5) };
    }
  }

  const present = new Array(15).fill(false);
  for (let r = 2; r <= 14; r += 1) {
    if (rankCount[r]) {
      present[r] = true;
      if (r === 14) present[1] = true;
    }
  }
  const st = straightHigh(present);
  if (st) return { category: 4, rank: encode(4, [st]) };

  if (byCount[3].length) {
    const t = byCount[3][0];
    return { category: 3, rank: encode(3, [t, ...topRanksExcept(rankCount, [t], 2)]) };
  }
  if (byCount[2].length >= 2) {
    const [p1, p2] = byCount[2];
    return { category: 2, rank: encode(2, [p1, p2, topRanksExcept(rankCount, [p1, p2], 1)[0]]) };
  }
  if (byCount[2].length === 1) {
    const p = byCount[2][0];
    return { category: 1, rank: encode(1, [p, ...topRanksExcept(rankCount, [p], 3)]) };
  }
  return { category: 0, rank: encode(0, topRanksExcept(rankCount, [], 5)) };
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

const CATEGORY_TO_BADBEAT: Record<number, BadBeatCategory | undefined> = {
  8: "straightFlush",
  7: "quads",
  6: "fullHouse",
  5: "flush",
  4: "straight",
  3: "trips",
};

/** Deals player(2) + player-dealer(2) + board(5) repeatedly and tallies the losing-hand bad beats. */
export function simulateBadBeatProbabilities(iterations: number, seed = 0xc0ffee): BadBeatProbabilities {
  const rand = mulberry32(seed);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const counts: Record<BadBeatCategory, number> = {
    straightFlush: 0,
    quads: 0,
    fullHouse: 0,
    flush: 0,
    straight: 0,
    trips: 0,
  };
  let noBeat = 0;

  for (let it = 0; it < iterations; it += 1) {
    for (let i = 0; i < 9; i += 1) {
      const j = i + Math.floor(rand() * (52 - i));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    const board = [deck[4], deck[5], deck[6], deck[7], deck[8]];
    const pe = evaluate7([deck[0], deck[1], ...board]);
    const de = evaluate7([deck[2], deck[3], ...board]);

    if (pe.rank === de.rank) {
      noBeat += 1;
      continue;
    }
    const loser = pe.rank < de.rank ? pe : de;
    const cat = CATEGORY_TO_BADBEAT[loser.category];
    if (cat) counts[cat] += 1;
    else noBeat += 1;
  }

  const probabilities = {} as Record<BadBeatCategory, number>;
  let grossWin = 0;
  for (const cat of Object.keys(counts) as BadBeatCategory[]) {
    const p = counts[cat] / iterations;
    probabilities[cat] = p;
    grossWin += p * BAD_BEAT_PAYOUTS[cat];
  }
  const winProb = 1 - noBeat / iterations;
  // Net EV per $1 = Σ p·payout − P(lose); house edge = −EV.
  const baseEdge = 1 - winProb - grossWin;

  return { probabilities, noBeat: noBeat / iterations, baseEdge, iterations };
}

/**
 * Realized bank edge on the BBJ once payouts are capped at `capMultiple` per $1 (the largest multiple
 * the bank can actually pay after base wagers have settled). cap = ∞ gives the fully-banked edge; a
 * smaller cap — heavier underbanking — raises the edge because the bank keeps the shortfall on a hit.
 *
 * `payouts` defaults to the standard Stones paytable but can be the room's actual paytable (parsed via
 * badBeatPayoutsFromRows) so the edge tracks whatever payouts are on the felt. Only the *rule* (which
 * fixes the probabilities) is assumed standard.
 */
export function realizedBadBeatEdge(
  probabilities: Record<BadBeatCategory, number>,
  capMultiple: number,
  payouts: Record<BadBeatCategory, number> = BAD_BEAT_PAYOUTS,
): number {
  let grossWin = 0;
  let winProb = 0;
  for (const cat of Object.keys(probabilities) as BadBeatCategory[]) {
    const p = probabilities[cat] ?? 0;
    winProb += p;
    grossWin += p * Math.min(payouts[cat] ?? 0, capMultiple);
  }
  return 1 - winProb - grossWin;
}

/** Maps a paytable outcome string to a bad-beat category (SF checked before flush/straight). */
export function classifyBadBeatHand(outcome: string): BadBeatCategory | null {
  const s = outcome.toLowerCase();
  if (/straight\s*flush|royal/.test(s)) return "straightFlush";
  if (/four of a kind|4 of a kind|quad/.test(s)) return "quads";
  if (/full house|boat/.test(s)) return "fullHouse";
  if (/flush/.test(s)) return "flush";
  if (/straight/.test(s)) return "straight";
  if (/three of a kind|3 of a kind|trip|set/.test(s)) return "trips";
  return null;
}

/**
 * Parses paytable rows into a bad-beat payout map (unlisted categories pay 0). Returns null when no row
 * is recognizable, so the caller can fall back to the standard paytable rather than a 0-payout table.
 */
export function badBeatPayoutsFromRows(
  rows: { outcome: string; payout: string }[],
): Record<BadBeatCategory, number> | null {
  const map: Record<BadBeatCategory, number> = { straightFlush: 0, quads: 0, fullHouse: 0, flush: 0, straight: 0, trips: 0 };
  let recognized = false;
  for (const row of rows) {
    const cat = classifyBadBeatHand(row.outcome);
    const mult = payoutMultiple(row.payout);
    if (cat && mult !== null) {
      map[cat] = mult;
      recognized = true;
    }
  }
  return recognized ? map : null;
}

/**
 * Bad-beat category probabilities from a 4,000,000-hand Monte Carlo (seed 12345). Validation: these
 * give a fully-banked house edge of 14.71%, matching the published ~14.8% (Stephen How's analysis of
 * this exact Stones/M8trix paytable). The straight-flush line (~4e-6) is rare and noisy, but it is
 * capped away under any real underbanking, so its imprecision barely moves the realized edge.
 * Regenerate with `simulateBadBeatProbabilities()` if the paytable/rule changes.
 */
export const BAD_BEAT_PROBABILITIES: Record<BadBeatCategory, number> = {
  straightFlush: 0.000004,
  quads: 0.00016925,
  fullHouse: 0.00301125,
  flush: 0.00704375,
  straight: 0.0065015,
  trips: 0.02296675,
};

/** Fully-banked (uncapped) house edge ≈ 0.147. */
export const BAD_BEAT_BASE_EDGE = realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, Infinity);

/**
 * Realized BBJ edge for the EV calculator: cap = the bank left for the side bet (after base wagers
 * settle) per $1 of BBJ action. cap ≤ 0 → the bank can't pay even the smallest line, so it keeps every
 * wager (edge → 1). Uses the validated probabilities above.
 */
export function badBeatEdgeForCoverage(
  bankAvailableForBadBeat: number,
  badBeatBetSize: number,
  payouts: Record<BadBeatCategory, number> = BAD_BEAT_PAYOUTS,
): number {
  if (badBeatBetSize <= 0) return realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, Infinity, payouts);
  const cap = Math.max(0, bankAvailableForBadBeat) / badBeatBetSize;
  return realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, cap, payouts);
}

/**
 * Per-$1 standard deviation of the BBJ outcome (win pays +min(payout,cap), otherwise −1). The 7,500:1
 * line makes this large — that's the point — but coverage capping shrinks it, so it's cap-aware too.
 */
export function badBeatSigma(
  probabilities: Record<BadBeatCategory, number>,
  capMultiple = Infinity,
  payouts: Record<BadBeatCategory, number> = BAD_BEAT_PAYOUTS,
): number {
  let firstMoment = 0;
  let secondMoment = 0;
  let winProb = 0;
  for (const cat of Object.keys(probabilities) as BadBeatCategory[]) {
    const p = probabilities[cat] ?? 0;
    const payout = Math.min(payouts[cat] ?? 0, capMultiple);
    winProb += p;
    firstMoment += p * payout;
    secondMoment += p * payout * payout;
  }
  const loseProb = 1 - winProb;
  const mean = firstMoment - loseProb; // losing pays −1
  const meanSquare = secondMoment + loseProb; // (−1)² = 1
  return Math.sqrt(Math.max(0, meanSquare - mean * mean));
}
