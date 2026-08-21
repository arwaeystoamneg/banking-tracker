import { Decimal, d } from "@/lib/decimal";
import { CLIFF_WARNING_THRESHOLD_DOLLARS } from "@/lib/fees/constants";

export type FeeBasis = "flat" | "tta";

export interface FeeTier {
  scheduleId: string;
  basis: FeeBasis;
  tierMin: Decimal.Value;
  /** null = open-ended top tier */
  tierMax: Decimal.Value | null;
  pdFee: Decimal.Value;
}

/** Same shape as FeeTier but with every numeric field resolved to a Decimal — what lookups return. */
export interface ResolvedFeeTier {
  scheduleId: string;
  basis: FeeBasis;
  tierMin: Decimal;
  tierMax: Decimal | null;
  pdFee: Decimal;
}
type NormalizedTier = ResolvedFeeTier;

function normalize(tiers: FeeTier[]): NormalizedTier[] {
  return tiers
    .map((t) => ({
      scheduleId: t.scheduleId,
      basis: t.basis,
      tierMin: d(t.tierMin),
      tierMax: t.tierMax === null ? null : d(t.tierMax),
      pdFee: d(t.pdFee),
    }))
    .sort((a, b) => a.tierMin.comparedTo(b.tierMin));
}

function tierContains(tier: NormalizedTier, tta: Decimal): boolean {
  const aboveMin = tta.greaterThanOrEqualTo(tier.tierMin);
  const belowMax = tier.tierMax === null || tta.lessThanOrEqualTo(tier.tierMax);
  return aboveMin && belowMax;
}

/** Finds the tier whose [tierMin, tierMax] range contains the given TTA. Generic over uneven step sizes. */
export function findTierForAction(tiers: FeeTier[], tta: Decimal.Value): ResolvedFeeTier | null {
  const ttaD = d(tta);
  const sorted = normalize(tiers);
  return sorted.find((t) => tierContains(t, ttaD)) ?? null;
}

function findNextTier(sorted: NormalizedTier[], ttaD: Decimal): NormalizedTier | null {
  // The next tier is the one with the smallest tierMin strictly greater than the current TTA's tier ceiling,
  // or simply the smallest tierMin that is > current TTA (works whether TTA sits inside a tier or below all tiers).
  const candidates = sorted.filter((t) => t.tierMin.greaterThan(ttaD));
  if (candidates.length === 0) return null;
  return candidates.reduce((min, t) => (t.tierMin.lessThan(min.tierMin) ? t : min));
}

/**
 * True if TTA is within `thresholdDollars` below the next tier boundary — i.e. a small amount more
 * action would push the round into a higher fee tier. Never fires when already in the top open-ended tier.
 */
export function isNearCliff(
  tta: Decimal.Value,
  tiers: FeeTier[],
  thresholdDollars: Decimal.Value = CLIFF_WARNING_THRESHOLD_DOLLARS,
): boolean {
  const ttaD = d(tta);
  const sorted = normalize(tiers);
  const next = findNextTier(sorted, ttaD);
  if (!next) return false;
  const gap = next.tierMin.minus(ttaD);
  return gap.greaterThan(0) && gap.lessThanOrEqualTo(d(thresholdDollars));
}

/**
 * Marginal rake = delta(fee) / delta(action) across the next tier boundary — i.e. the cost of the
 * smallest amount of extra action that would cross into the next tier. Returns null if there is no
 * next tier (already in the top open-ended tier) or the current/next tiers can't be determined.
 */
export function marginalRake(tiers: FeeTier[], tta: Decimal.Value): Decimal | null {
  const ttaD = d(tta);
  const sorted = normalize(tiers);
  const current = sorted.find((t) => tierContains(t, ttaD));
  const next = findNextTier(sorted, ttaD);
  if (!next) return null;

  // deltaAction is the size of the smallest step that crosses the boundary: from the current tier's
  // ceiling (or, if TTA is below all tiers, from TTA itself) up to the next tier's floor.
  const fromAction = current ? current.tierMax ?? ttaD : ttaD;
  const deltaAction = next.tierMin.minus(fromAction);
  if (deltaAction.lessThanOrEqualTo(0)) return null;

  const currentFee = current ? current.pdFee : d(0);
  const deltaFee = next.pdFee.minus(currentFee);

  return deltaFee.dividedBy(deltaAction);
}

export interface CliffBoundary {
  nextTierMin: Decimal;
  dollarsToCliff: Decimal;
  marginalRake: Decimal;
}

/** Convenience bundle for the fee calculator UI — everything it needs about the upcoming boundary. */
export function describeCliff(tta: Decimal.Value, tiers: FeeTier[]): CliffBoundary | null {
  const ttaD = d(tta);
  const sorted = normalize(tiers);
  const next = findNextTier(sorted, ttaD);
  if (!next) return null;
  const rake = marginalRake(tiers, ttaD);
  if (rake === null) return null;
  return {
    nextTierMin: next.tierMin,
    dollarsToCliff: next.tierMin.minus(ttaD),
    marginalRake: rake,
  };
}
