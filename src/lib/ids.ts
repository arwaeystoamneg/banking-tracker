const PREFIXES = {
  game: "gm",
  sidebet: "sb",
  paytable: "pt",
  feeSchedule: "fs",
  session: "ses",
  round: "rnd",
  lossReport: "lr",
  lossEvidence: "le",
  auditEntry: "ae",
} as const;

export type IdKind = keyof typeof PREFIXES;

/**
 * Client-generated, final (not temporary) id — used both for the optimistic local row and the row
 * that eventually lands in the repository, so a create() never needs an id swap once synced. This is
 * what lets the session detail page stay at the same URL whether the write has flushed yet or not.
 */
export function makeId(kind: IdKind): string {
  return `${PREFIXES[kind]}_${crypto.randomUUID()}`;
}
