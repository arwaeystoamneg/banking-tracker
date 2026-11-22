import { describe, expect, it } from "vitest";
import {
  antePlayExact,
  antePlayExposure,
  antePlayResult,
  dealThreeCardRound,
  pairPlusHand,
  QUEEN_HIGH,
  score3,
  settleThreeCardRound,
  simulateThreeCardSessions,
  sixCardHand,
  type AnteBonusTable,
  type PlayerStyle,
  type ThreeCardRules,
  type ThreeCardSeat,
  type ThreeCardTable,
  threeCardTableMoments,
} from "@/lib/math/threeCardSim";
import { PAIR_PLUS_PAYOUTS_CA, SIX_CARD_PAYOUTS_TCP6B4, realizedPairPlusEdge, realizedSixCardEdge } from "@/lib/math/threeCardPoker";

// Card = rank * 4 + suit, rank 0 = deuce … 12 = ace.
const card = (rank: string, suit = 0) => "23456789TJQKA".indexOf(rank) * 4 + suit;

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

const table = (rules: ThreeCardRules, style: PlayerStyle, bonus: AnteBonusTable = "5/4/1", seat: Partial<ThreeCardSeat> = {}, count = 1): ThreeCardTable => ({
  rules,
  bonus,
  seats: Array.from({ length: count }, () => ({ ante: 1, pairPlus: 0, sixCard: 0, style, ...seat })),
  pairPlusPayouts: PAIR_PLUS_PAYOUTS_CA,
  sixCardPayouts: SIX_CARD_PAYOUTS_TCP6B4,
});

/** Mean player result per unit over n dealt rounds, with its standard error. */
function measure(t: ThreeCardTable, n: number, pick: "antePlay" | "pairPlus" | "sixCard", seed = 7) {
  const rand = mulberry32(seed);
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < n; i += 1) {
    const r = dealThreeCardRound(rand, t).seats[0][pick];
    sum += r;
    sq += r * r;
  }
  const mean = sum / n;
  return { mean, se: Math.sqrt((sq / n - mean * mean) / n) };
}

describe("hand ranking", () => {
  it("orders 3-card hands the 3CP way (A-2-3 low straight, straight beats flush)", () => {
    const sf = score3(card("4"), card("3"), card("2"));
    const trips = score3(card("A"), card("A", 1), card("A", 2));
    const akq = score3(card("A"), card("K", 1), card("Q", 2));
    const wheel = score3(card("A"), card("2", 1), card("3", 2));
    const flush = score3(card("A"), card("9"), card("2"));
    expect(sf).toBeGreaterThan(trips);
    expect(trips).toBeGreaterThan(akq);
    expect(akq).toBeGreaterThan(wheel);
    expect(wheel).toBeGreaterThan(flush);
    expect(score3(card("Q"), card("3", 1), card("2", 2))).toBe(QUEEN_HIGH + 13 + 0); // Q-3-2 is just above Q-high's floor
  });

  it("classifies side-bet hands", () => {
    expect(pairPlusHand(card("A"), card("K"), card("Q"))).toBe("miniRoyal");
    expect(pairPlusHand(card("9"), card("9", 1), card("2"))).toBe("pair");
    expect(pairPlusHand(card("9"), card("8", 1), card("2"))).toBeNull();
    expect(sixCardHand([card("A"), card("K"), card("Q"), card("J"), card("T"), card("2", 1)])).toBe("royal");
    expect(sixCardHand([card("A"), card("2", 1), card("3"), card("4", 2), card("5"), card("K", 3)])).toBe("straight");
    expect(sixCardHand([card("7"), card("7", 1), card("7", 2), card("2"), card("2", 1), card("K")])).toBe("fullHouse");
    expect(sixCardHand([card("7"), card("7", 1), card("2"), card("3", 1), card("9"), card("K")])).toBeNull();
  });
});

describe("Ante/Play rules", () => {
  it("face-up: non-qualifying dealer pushes the Play and the player must still beat the dealer", () => {
    const up = card("9");
    const dealerNq = score3(up, card("8", 1), card("4", 2)); // 9-high, doesn't qualify
    const better = score3(card("J"), card("5", 1), card("3", 2));
    const worse = score3(card("8", 3), card("6", 1), card("2", 2));
    expect(antePlayResult("faceUp", "none", "raiseAll", better, up, dealerNq).result).toBe(1);
    expect(antePlayResult("faceUp", "none", "raiseAll", worse, up, dealerNq).result).toBe(-1);
    expect(antePlayResult("standard", "none", "raiseAll", worse, up, dealerNq).result).toBe(1); // standard pays the Ante
  });

  it("standard pays the Ante Bonus on a played straight even when the dealer wins", () => {
    const straight = score3(card("5"), card("4", 1), card("3", 2));
    const dealerStraight = score3(card("7", 3), card("6", 1), card("5", 2));
    const trips = score3(card("K"), card("K", 1), card("K", 2));
    expect(antePlayResult("standard", "5/4/1", "optimal", straight, card("K"), trips).result).toBe(-2 + 1);
    expect(antePlayResult("standard", "5/4/1", "optimal", straight, card("7", 3), dealerStraight).result).toBe(-2 + 1);
    // A straight beats a flush in 3CP: the player wins Ante + Play and the bonus.
    expect(antePlayResult("standard", "5/4/1", "optimal", straight, card("K"), score3(card("K"), card("9"), card("2"))).result).toBe(2 + 1);
    expect(antePlayExposure("standard", "5/4/1")).toBe(7);
    expect(antePlayExposure("faceUp", "none")).toBe(2);
  });

  // The Monte Carlo against the exact enumeration (cardsim/oracle/tcp_faceup.py) — second derivation.
  it.each([
    ["standard", "optimal", "5/4/1"],
    ["standard", "raiseAll", "5/4/1"],
    ["standard", "optimal", "none"],
    ["faceUp", "optimal", "none"],
    ["faceUp", "mimic", "none"],
    ["faceUp", "raiseAll", "none"],
  ] as const)("%s %s %s matches the exact edge within 4 SE", (rules, style, bonus) => {
    const { mean, se } = measure(table(rules, style, bonus), 300_000, "antePlay");
    expect(Math.abs(-mean - antePlayExact(rules, bonus, style).edge)).toBeLessThan(4 * se);
  });
});

describe("side bets on real cards", () => {
  it("Pair Plus and 6 Card Bonus edges match the combinatorial ones within 4 SE", () => {
    const t = table("faceUp", "optimal", "none", { pairPlus: 1, sixCard: 1 });
    const pp = measure(t, 300_000, "pairPlus", 11);
    const six = measure(t, 300_000, "sixCard", 13);
    expect(Math.abs(-pp.mean - realizedPairPlusEdge(PAIR_PLUS_PAYOUTS_CA))).toBeLessThan(4 * pp.se);
    expect(Math.abs(-six.mean - realizedSixCardEdge(SIX_CARD_PAYOUTS_TCP6B4))).toBeLessThan(4 * six.se);
  });
});

describe("settlement and sessions", () => {
  it("a short bank pays winners in order until it runs out, then collects losers", () => {
    // Ante/Play wins $200, Pair Plus wins $3,000, 6 Card loses $25, with $1,000 in the bank.
    expect(settleThreeCardRound({ seats: [{ antePlay: 200, pairPlus: 3000, sixCard: -25, played: true }] }, 1000)).toBe(-1000 + 25);
    expect(settleThreeCardRound({ seats: [{ antePlay: -200, pairPlus: -25, sixCard: 0, played: true }] }, 1000)).toBe(225);
    // Every seat's Ante/Play is paid before anyone's Pair Plus.
    const twoSeats = { seats: [{ antePlay: -100, pairPlus: 900, sixCard: 0, played: true }, { antePlay: 200, pairPlus: 0, sixCard: 0, played: true }] };
    expect(settleThreeCardRound(twoSeats, 1000)).toBe(-1000 + 100);
  });

  it("runs sessions and reports the raise rate it played", () => {
    const result = simulateThreeCardSessions({
      bank: 8000,
      collection: 1,
      table: table("faceUp", "optimal", "none", { ante: 100, pairPlus: 25, sixCard: 25 }, 3),
      sessions: 400,
      roundsPerSession: 100,
      seed: 3,
    });
    expect(result.rounds).toBe(40_000);
    expect(result.riskOfRuin).toBeLessThan(0.05);
    expect(Math.abs(result.raiseRate - antePlayExact("faceUp", "none", "optimal").raiseRate)).toBeLessThan(0.01);
  });
});

describe("several players", () => {
  it("each seat gets its own cards and they all face one dealer hand, so their results move together", () => {
    const t = table("faceUp", "optimal", "none", {}, 3);
    const rand = mulberry32(21);
    let sa = 0;
    let sb = 0;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    const n = 200_000;
    for (let i = 0; i < n; i += 1) {
      const round = dealThreeCardRound(rand, t);
      const a = round.seats[0].antePlay;
      const b = round.seats[1].antePlay;
      sa += a;
      sb += b;
      sab += a * b;
      saa += a * a;
      sbb += b * b;
    }
    const cov = sab / n - (sa / n) * (sb / n);
    const corr = cov / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2));
    expect(corr).toBeGreaterThan(0.1);
    expect(corr).toBeLessThan(0.6);
    // Each seat still sits at the single-seat exact edge.
    const se = Math.sqrt(antePlayExact("faceUp", "none", "optimal").variance / n);
    expect(Math.abs(-sb / n - antePlayExact("faceUp", "none", "optimal").edge)).toBeLessThan(4 * se);
  });

  it("table moments: three seats swing more than one but less than three times as much", () => {
    const one = threeCardTableMoments(1e9, table("faceUp", "optimal", "none", { ante: 100 }, 1), 60_000);
    const three = threeCardTableMoments(1e9, table("faceUp", "optimal", "none", { ante: 100 }, 3), 60_000);
    const ratio = Math.sqrt(three.variance / one.variance);
    expect(ratio).toBeGreaterThan(Math.sqrt(3));
    expect(ratio).toBeLessThan(3);
  });
});
