import type { Game, Sidebet } from "@/lib/validation/schemas";
import { normalizeCasinoKey } from "@/lib/names";

/**
 * Calculators are per *game type*, not per casino listing — except Hollywood Park baccarat,
 * which short-pays 9/7 and 9/1 and gets its own calculator. Bicycle/Commerce baccarat share
 * the generic EZ model. Collection is typed in per round because it varies by room and schedule.
 */

export const KNOWN_FAMILIES = ["baccarat", "baccaratHpc", "uth", "3cp", "paigow", "blackjack", "2ww"] as const;
export type KnownFamily = (typeof KNOWN_FAMILIES)[number];

export const FAMILY_LABEL: Record<KnownFamily, string> = {
  baccarat: "Baccarat",
  baccaratHpc: "Baccarat (Hollywood Park)",
  uth: "Ultimate Texas Hold'em",
  "3cp": "Three Card Poker",
  paigow: "Pai Gow Poker",
  blackjack: "Blackjack / No Bust",
  "2ww": "Two Way Winner",
};

const FAMILY_ORDER = new Map<KnownFamily, number>(KNOWN_FAMILIES.map((id, index) => [id, index]));

/** The Main (Banker/Player/Tie) row is a base wager stored as a side bet for schema convenience. */
export function isMainWagerSidebet(name: string): boolean {
  return /^main\s*\(/i.test(name);
}

/** Bad Beat and Buster are Bicycle-only even when the parent game also spreads at HPC/Commerce. */
export function sidebetAppliesAtCasino(name: string, casino: string): boolean {
  if (/bad\s*beat/i.test(name) || /^buster\b/i.test(name)) {
    return normalizeCasinoKey(casino) === "bicycle";
  }
  if (/44\s*he/i.test(name)) {
    return normalizeCasinoKey(casino) === "hollywood park";
  }
  return true;
}

/**
 * Banker-side scams worth spotting at a glance. Plain 9/7 · 9/1 (Golden Frog 50:1 / 150:1) are
 * ordinary; only the HPC short-pay cloth — tagged 44 HE — is the 44%/42% house.
 */
export function highValueSidebetTag(name: string): "44 HE" | "BBJ" | null {
  if (/44\s*he/i.test(name)) return "44 HE";
  if (/bad\s*beat/i.test(name)) return "BBJ";
  return null;
}

export function isHighValueSidebet(name: string): boolean {
  return highValueSidebetTag(name) !== null;
}

export function detectGameFamily(name: string): KnownFamily | null {
  if (/baccarat|\bbacc\b/i.test(name)) {
    if (/hollywood|hpc/i.test(name)) return "baccaratHpc";
    return "baccarat";
  }
  if (/ultimate\s*texas|\buth\b/i.test(name)) return "uth";
  if (/three\s*card|\b3cp\b|\b3[\s-]*card/i.test(name)) return "3cp";
  if (/pai\s*gow/i.test(name)) return "paigow";
  // No Bust is the CA player-banked blackjack; "BJ" and "No Bust BJ" share one calculator.
  if (/no\s*bust|21st\s*century\s*black|blackjack|\bbj\b/i.test(name)) return "blackjack";
  if (/two\s*way\s*winner|\b2ww\b/i.test(name)) return "2ww";
  return null;
}

export interface CalculatorOption {
  /** Known-family id, or the raw game_id for anything that doesn't collapse. */
  id: string;
  label: string;
  family: KnownFamily | null;
  /** Every catalog row that shares this calculator. */
  gameIds: string[];
  /** The row whose edge, exposure, and side bets drive the calculator. */
  canonicalGameId: string;
}

function scoreCanonical(game: Game, sidebets: Sidebet[], family: KnownFamily | null): number {
  const own = sidebets.filter((sidebet) => sidebet.game_id === game.game_id);
  let score = own.length;
  if (family === "uth" && own.some((sidebet) => /bad\s*beat/i.test(sidebet.name))) score += 10;
  // Prefer a generic name ("Baccarat") over a room-tagged duplicate ("Baccarat Bicycle").
  score -= game.name.length / 1000;
  return score;
}

/**
 * One calculator per known family, plus one entry for every other game. Side bets and the numeric
 * edge come from the richest listing in the family.
 */
export function calculatorOptions(games: Game[], sidebets: Sidebet[]): CalculatorOption[] {
  const buckets = new Map<string, Game[]>();
  for (const game of games) {
    const family = detectGameFamily(game.name);
    const key = family ?? game.game_id;
    const list = buckets.get(key) ?? [];
    list.push(game);
    buckets.set(key, list);
  }

  const options: CalculatorOption[] = [];
  for (const [key, group] of buckets) {
    const family = detectGameFamily(group[0]?.name ?? "") ?? (KNOWN_FAMILIES.includes(key as KnownFamily) ? (key as KnownFamily) : null);
    const canonical = [...group].sort((a, b) => scoreCanonical(b, sidebets, family) - scoreCanonical(a, sidebets, family))[0];
    if (!canonical) continue;
    options.push({
      id: family ?? canonical.game_id,
      label: family ? FAMILY_LABEL[family] : canonical.name,
      family,
      gameIds: group.map((game) => game.game_id),
      canonicalGameId: canonical.game_id,
    });
  }

  return options.sort((a, b) => {
    const aOrder = a.family ? (FAMILY_ORDER.get(a.family) ?? 99) : 99;
    const bOrder = b.family ? (FAMILY_ORDER.get(b.family) ?? 99) : 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.label.localeCompare(b.label);
  });
}
