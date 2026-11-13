/**
 * Casino and player names are typed free-form on a phone — the same room shows up as "Hollywood Park",
 * "hollywood park", "HPC", or "Hollywood  Park " depending on autocorrect and which thumb was faster.
 * Left alone, each spelling becomes its own filter chip and its own stats row. These helpers collapse
 * those variants to one canonical form so grouping and lookups behave.
 *
 * Two deliberate limits keep this from over-merging:
 *   - Names group only on an exact *normalized* key (case, accents, punctuation, whitespace, and —
 *     for casinos — a leading "the" or a trailing "casino/cardroom/club").
 *   - Known rooms and their common shorthands/autocorrect forms are snapped to a canonical name via an
 *     explicit, curated alias table — never by algorithmic edit-distance. Auto-fuzzing would wrongly
 *     merge real, one-character-apart rooms (e.g. "Gardens" the room vs "Gardena" the city), so any
 *     typo we want to absorb is added to ALIASES by hand.
 */

/** Lowercase, strip accents, drop punctuation, collapse whitespace. The basis for every key. */
function base(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(key: string): string {
  return key.replace(/\b[a-z0-9]/g, (c) => c.toUpperCase());
}

/** Grouping key for a person's name — case/accent/punctuation/whitespace insensitive. */
export function normalizePersonKey(raw: string): string {
  return base(raw);
}

/** Display form for a person — one consistent capitalization for whatever variants were entered. */
export function canonicalPerson(raw: string): string {
  const key = normalizePersonKey(raw);
  return key ? titleCase(key) : raw.trim();
}

/** Grouping key for a casino — also drops a leading "the" and a trailing venue-type word. */
export function normalizeCasinoKey(raw: string): string {
  return base(raw)
    .replace(/^the\s+/, "")
    .replace(/\s+(casino|cardroom|card room|card club|cardclub|club)$/, "")
    .trim();
}

/**
 * Normalized key → canonical display for the rooms we deal with. Includes hand-picked shorthands and
 * common autocorrect/typo forms. Add real observed misspellings here rather than fuzzy-matching them.
 */
const ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["hollywood park", "Hollywood Park"],
  ["hpc", "Hollywood Park"],
  ["hollywood", "Hollywood Park"],
  ["hollywod park", "Hollywood Park"],
  ["holywood park", "Hollywood Park"],
  ["bicycle", "Bicycle"],
  ["bike", "Bicycle"],
  ["bicyle", "Bicycle"],
  ["commerce", "Commerce"],
  ["commerse", "Commerce"],
  ["hustler", "Hustler"],
  ["gardens", "Gardens"],
  ["m8trix", "M8trix"],
  ["matrix", "M8trix"],
  ["m8", "M8trix"],
  ["artichoke joe s", "Artichoke Joe's"],
  ["artichoke joes", "Artichoke Joe's"],
  ["artichoke", "Artichoke Joe's"],
  ["aj s", "Artichoke Joe's"],
  ["ajs", "Artichoke Joe's"],
  ["oaks", "Oaks"],
  ["bay 101", "Bay 101"],
  ["bay101", "Bay 101"],
  ["bay", "Bay 101"],
];

/** The rooms Ray or admin can tag a session with in one tap, by area. */
export const TAG_CARDROOM_AREAS = [
  { area: "Bay Area", rooms: ["M8trix", "Artichoke Joe's", "Oaks", "Bay 101"] },
  { area: "LA", rooms: ["Hollywood Park", "Bicycle", "Commerce", "Hustler", "Gardens"] },
] as const;
export const TAG_CARDROOMS: readonly string[] = TAG_CARDROOM_AREAS.flatMap((group) => group.rooms);

/** Canonical display names for the rooms we actually visit — used as datalist options, not a closed set. */
export const KNOWN_CASINO_NAMES = Array.from(new Set(ALIASES.map(([, display]) => display)));

/** True when `casino` is one of the rooms listed on this game's pipe-delimited casinos field. */
export function gameIsAtCasino(casinos: string, casino: string): boolean {
  const key = normalizeCasinoKey(casino);
  if (!key) return false;
  return canonicalCasinoList(casinos).some((room) => normalizeCasinoKey(room) === key);
}

/** Placeholders that mean nobody wrote the room down. */
const NO_ROOM = new Set(["unspecified", "unknown", "n a", "na", "none"]);

/** The rooms a session was at (a night across rooms is pipe-delimited), without placeholders. */
export function sessionCardrooms(raw: string): string[] {
  return canonicalCasinoList(raw).filter((room) => !NO_ROOM.has(normalizeCasinoKey(room)));
}

/** The session's cardroom tag, "Hollywood Park + Commerce" for a night across rooms, or "" when none was recorded. */
export function sessionCardroom(raw: string): string {
  return sessionCardrooms(raw).join(" + ");
}

/** Display form for a casino — snaps known rooms and their listed aliases to a canonical name. */
export function canonicalCasino(raw: string): string {
  const key = normalizeCasinoKey(raw);
  if (!key) return raw.trim();
  for (const [aliasKey, display] of ALIASES) if (aliasKey === key) return display;
  return titleCase(key);
}

/**
 * Splits a pipe-delimited casinos field into canonical, de-duplicated room names, order preserved.
 * (`Games.casinos` is pipe-delimited per the data model.)
 */
export function canonicalCasinoList(pipeDelimited: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of pipeDelimited.split("|")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const display = canonicalCasino(trimmed);
    const key = normalizeCasinoKey(display);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out;
}
