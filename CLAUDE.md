# CLAUDE.md — Cardroom Banking Tool

## What this is

A multi-person working tool for California cardroom **player-banked** game banking. Two jobs:

1. **Reference.** Look up a game's rules, banker edge, exposure multiple, collection schedule, and side-bet
   paytables — fast, on a phone, at a table, in bad light.
2. **Log.** Record session and per-round results so realized edge can be separated from fee drag afterward.

The single source of truth is an existing Google Sheet. The app is a nicer read/write layer over it, not a
replacement — users must be able to keep editing the sheet directly on mobile when the app is inconvenient.

**This is a personal analysis tool, not a product.** No signups, billing, or multi-tenancy. A small,
environment-configured group shares one live dataset; a separate read-only demo dataset contains only public
or synthetic data.

---

## Domain primer (read this before touching the math)

California Penal Code §330 bans house-banked games. Cardrooms therefore run "California games" where the
**player-dealer** (a rotating player, or a licensed third-party proposition player service) banks all wagers.
The cardroom makes money on a **collection** — a per-hand fee — not on game outcomes.

Terms used throughout the codebase:

| Term | Meaning |
|---|---|
| **PD** | Player-dealer — the person banking the table. That's the user. |
| **TTA** | Total table action — sum of players' base wagers against the PD |
| **Collection** | Per-round fee paid to the room. May not legally be a % of wagers, so it arrives as a **step function** over TTA tiers |
| **Exposure multiple (m)** | Max payout that must be funded per $1 of base wager. Baccarat ≈ 1.0, blackjack ≈ 2.5–3.0, UTH ≈ 4.5 |
| **Underbanking** | Bank too small to cover all offered action |
| **Settlement order** | The order wagers are paid when the bank runs short. **Base wagers settle first, side bets last.** |
| **Rotation** | The PD button passes after ~2 hands, capping your share of rounds at roughly 1/seats |

**Two facts drive most of the product decisions:**

- The PD pays the **full collection even when underbanked**. Coverage does not reduce the fee.
- Because side bets settle last and carry far more edge than base wagers, an underbanked PD is forced onto
  the *lowest-edge* action on the table. Underbanking is doubly adverse: worst action, full fee.

Working bank is **$8,000**.

---

## Math — use these exactly, do not re-derive

```
action_booked   A  = min(TTA_offered, B / m)
EV per round       = e·A − C                    // C does not scale with coverage
breakeven action A* = C / e
SD, n equal spots  = σ·w·√( n·[1 + ρ(n−1)] )    // ρ = cross-seat correlation
N0                 = (SD / EV)²                 // rounds to one SD of expected win
full-Kelly bank B* = σ² / EV
risk of ruin       ≈ exp( −2·EV·B / σ² )
```

**Baccarat has an exact closed form. Use it rather than simulating.**
Let `p` = Player-line action, `b` = Banker-line action, `d = p − b`:

```
E[X]   = 0.02246·p − 0.01011·d
Var[X] = 0.882384·d² + 0.02246·p² − E[X]²
```

Constants (8-deck): `P(banker win)=0.458597`, `P(player win)=0.446247`, `P(tie)=0.095156`,
`P(banker 3-card 7)=0.02246`.

Consequences worth encoding in the UI: banker edge is **+1.235%** against Player-line action, **+1.011%**
against Banker-line action, **+1.123% of TTA** when balanced. Variance is driven by the **imbalance** `d`,
while the fee is driven by the **total** — a balanced table cuts SD ~12.8× at identical action.

Correlation assumptions currently in use: `ρ ≈ 0.5` for blackjack and UTH (common dealer hand / common
board). These are estimates, not solved values — label them as such anywhere they surface.

---

## Architecture

**Next.js (App Router) on Vercel. Google Sheets as the database. Installable as a PWA.**

Decisions already made — do not relitigate without asking:

- **Service account auth, not user OAuth.** Create a GCP project, enable the Sheets API, create a service
  account, download the JSON key, then share the spreadsheet with the service account's email exactly as you
  would share it with a person. No consent screen, no OAuth verification, no token refresh, no per-user login.
  For three users this removes most of the work.
- **All Sheets calls happen server-side** (route handlers / server actions). The service account private key
  grants full access to anything the account can see. It must never reach the client — no `NEXT_PUBLIC_`
  prefix, no bundling, ever.
- **Sheets, not Postgres.** The session data already lives in a spreadsheet the users like editing, and Ray's
  Python simulators read the same sheet through the same API. A separate DB would orphan it. Revisit only if
  this outgrows three people.
- **PWA, not native.** Web manifest + service worker, installed via Add to Home Screen. Avoids App Store
  review entirely, which matters because gambling-adjacent apps draw scrutiny even when they handle no money.
- **Access control uses three roles.** Admin retains the shared `APP_PASSPHRASE` and can change all data.
  Environment-configured individual accounts can read all live data but mutate only their own games,
  sessions, and child rows. Demo is read-only and uses `DEMO_SHEET_ID`, never the live sheet.

### Environment

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."   # escape newlines
SHEET_ID=1CUsxBxTXRzuXKhPfquKen19TBX4j2GATu2d-hwmqW0Y
DEMO_SHEET_ID=...
APP_PASSPHRASE=...
AUTH_COOKIE_SECRET=... # independent random value, at least 32 characters
APP_USERS_JSON='[{"id":"ray","name":"Ray Tang","password":"..."}]'
```

Use `googleapis` (`google.sheets({version:'v4'})`) or `google-spreadsheet`. Batch reads with
`spreadsheets.values.batchGet` — quota is 60 read requests/min/user and it is easy to blow through that
rendering a list one row at a time.

---

## Data model

Six tabs. Column order below is authoritative; the app reads by header name, not index, so users can reorder
safely in Sheets.

**`Games`**
`game_id · name · version · casinos (pipe-delimited) · filing · edge_text · edge_pct · verified (TRUE/FALSE) ·
exposure_mult · fee_text · rules · settlement_order · notes · edited_by · edited_at · owner_id`

**`Sidebets`**
`sidebet_id · game_id · name · top_payout · limits · edge_pct · verified · note`

**`Paytables`** — one row per payout line, kept separate so it stays readable in Sheets
`paytable_id · sidebet_id · ordinal · outcome · payout`

**`FeeSchedules`** — one row per tier. This is what powers the cliff warnings.
`schedule_id · casino · game_id · option_label · table_limit · basis (flat|tta) · tier_min · tier_max ·
pd_fee · player_fee`

**`Sessions`**
`session_id · date · casino · buy_in · buy_out · time_in · time_out · game_id · schedule_option · rounds_banked ·
action_offered · action_booked · coverage_pct · bonus_action_booked · collection_paid · gross_wl · net_pnl ·
peak_drawdown · partners · split_terms · notes · logged_by · logged_at · owner_id`

**`Rounds`** — optional granular capture, one row per banked round
`round_id · session_id · seq · tta · booked · bonus_action · fee_tier · fee_paid · result · note`

`coverage_pct = action_booked / action_offered` is the most diagnostically valuable field in the schema. It
is what distinguishes "this game is bad" from "$8k never reached the side-bet layer." Never let a session be
saved without it.

Seed data for `Games`, `Sidebets`, and `Paytables` is in `seed-games.json` — five games across Hollywood Park,
Commerce, and The Bicycle, with filed BGC numbers and captured paytables. Import it once on first setup.

---

## Features, in build order

1. **Game reference.** Scrollable list, search across names/casinos/side-bet names/paytable outcomes, filter
   by casino. Search must hit paytables — at a table you recognize a bet by its top payout before its name.
2. **Direct editing.** Click-to-edit in place for every text field. Paytables need a grid, so those get a
   panel.
3. **Fee calculator with cliff warnings.** Enter TTA, get the fee tier from `FeeSchedules`. **If TTA is within
   ~$50 below a tier boundary, warn loudly.** Compute marginal rake as `Δfee / Δaction` across the boundary
   and surface it — the filed tiers produce genuinely extreme values. Worst cases in the seeded Hollywood Park
   No Bust schedules: option 15 at $500 → $501 costs +$3 fee on +$1 of action (**300% marginal rake**), and
   again at $300 → $301 (200%); options 18 and 19 both hit 120% at their $1,505 and $1,005 boundaries. Note
   that option 15 steps in $1 increments while 16–19 step in $5, so the cliff math is not uniform across
   schedules — derive it from `FeeSchedules`, never hardcode. This is the highest-value feature on a phone at
   a live table.
4. **Session logging.** Start a session, log rounds as you go, close it out with totals. Must work offline.
5. **Roll-ups.** Realized edge, fee load, net edge, $/banked round, and an N₀ significance check. Under
   |t| ≈ 2, show the result as *not yet meaningful* rather than as a verdict — small samples here are
   overwhelmingly noise.

---

## Offline behavior — required, not optional

Cardroom floors have poor signal and rounds get logged live at the table. Losing a session log to a dropped
connection is the worst failure mode this app has.

- Cache the app shell in a service worker and game reference data in IndexedDB. Reference data must be fully
  readable offline.
- Queue writes (round logs, session saves, game edits) in IndexedDB and flush on reconnect.
- Show sync state explicitly: pending write count and last-synced timestamp. Never silently drop a write.
- Sheets writes are last-write-wins. Do a read-modify-write against the live rows so two people editing
  different games don't clobber each other, and surface a conflict rather than overwriting when the same row
  changed underneath.

---

## Conventions and guardrails

- **Never render an unverified number as if it were solved.** Every edge and paytable carries a `verified`
  flag. Unverified values render in a warning color with the estimate range visible. Several current figures
  are placeholders: No Bust 21st Century Blackjack's edge is a `~2.0%` estimate spanning 1.5–2.5%, Two Way
  Winner is entirely unsolved, and most non-Hollywood-Park fee schedules are unfilled.
- **Money and edges are decimals, not floats, anywhere they're summed.** Session PnL that drifts by cents
  across a few hundred rounds destroys the point of the tool.
- **Percentages are stored as decimals** (`0.01123`), formatted at the display layer only.
- **Dark UI.** This gets used in dim rooms. Tap targets sized for one-handed phone use while standing.
- **Do not add a bankroll or bet-sizing recommender.** The tool reports; the user decides.
- Keep the seed dataset importable and the export path working. Users need to be able to snapshot to a file
  and restore.

## Non-goals

Real-money handling, payments, live odds feeds, anything that touches an actual wager. Native app builds.
Self-service signups, account-management screens, password recovery, and multi-tenancy.

## Open questions — ask Ray, don't guess

1. **Does the room require the bank to cover gross winning-side action, or only net?** This is the largest
   unresolved variable in the whole model and it swings the baccarat numbers by roughly 2×.
2. There is an unreconciled **"44% house edge"** figure Ray recalls from Hollywood Park that could not be
   derived from the filed rules. Leading candidate is the Buster Blackjack paytable (4:1 on a five-card
   dealer bust, 200:1 on eight-plus — materially degraded versus the common 9:1 / 5,000:1 schedule). If it
   resolves, it changes game ranking substantially.
3. Fee schedules for Commerce, The Bicycle, Hustler, and Gardens are unfilled. Source is the California AG's
   published cardroom filings at `https://oag.ca.gov/gambling/game/la`.

## Sources

Game rules and collection rates come from California Bureau of Gambling Control filings. Hollywood Park:
`https://oag.ca.gov/system/files/media/hollywood-park.pdf` (BGC IDs GEGA-004413 baccarat, GEGA-003955 No Bust
blackjack, GEGA-004308 2urbo, GEGA-004043 Two Way Winner). Filings update monthly and reflect what the room
submitted, not necessarily what it is spreading today.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
