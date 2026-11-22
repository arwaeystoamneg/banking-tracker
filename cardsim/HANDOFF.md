# HANDOFF — cardsim: EV/SD engines for California player-dealer games

*Written for Claude Code · 2026-11-22 · owner: Ray*

This is the single entry point. It covers what exists, what's verified, how the code works, what's assumed, and what to build next, in priority order. Supporting docs:
- `SPEC.md`: research spec with rules, paytables, exact values and sources.
- `README.md`: usage.
- `RESULTS.md`: the latest run outputs.
- `reference_values.json`: machine-readable test targets.

---

## 0. Start here (5 minutes)

```bash
pip install numpy numba                 # numba >= 0.60 (tested 0.63 / numpy 2.x)
PYTHONPATH=. python3 tests/test_core.py # 7 unit tests, ~20 s first run (numba compile, cached after)
python3 validate.py --rounds-scale 0.1  # quick MC-vs-exact gates (~2 min); full scale ~15 min
python3 -m cardsim.run configs/bac_ca_table.json --rounds 5e6
python3 make_results.py                 # rebuild RESULTS.md from reports/*.json
```
**Before you change any engine, run `validate.py`, and run it again after.** It must print `ALL GATES PASSED`.

---

## 1. Context: what this is for

- **The operation.** Ray runs a **California cardroom player-banking operation** with partners, banking the player-dealer (PD) position at LA-area cardrooms: Hollywood Park (HPC), Bicycle, Commerce and Hustler.
- **Why the bank's view matters.** In California, the house can't bank. A player or a licensed TPPPS takes the PD seat, collects losers and pays winners. The cardroom charges a flat **collection fee** per hand. So the question this code answers is: **what does the bank make, with what variance, at a realistic table, after fees and the bank cap?**
- **Both perspectives.** Report the player edge (house edge per bet) and the bank P&L (μ and σ per round, per hour, risk of ruin, Kelly bankroll, session distribution).
- **Correlation is central.** Every bet at a table resolves on the same dealer hand or coup. Bank variance = bᵀΣb, not Σ bᵢ²σᵢ². Two examples:
  - Baccarat Banker vs Player has correlation −0.988. Balanced books are nearly hedged.
  - 3CP seats correlate about 0.20 through the shared dealer hand.
- **Regulatory status.** BGC regulations that would have banned traditional blackjack mechanics and limited TPPPS banking were invalidated by SF Superior Court on **2026-06-30**. The AG appealed on **2026-07-17**, and the case is pending. Keep all BJ rules in configs so a ruling becomes a config change.
- **Lesson from prior work.** On a past project (HPC Two-Way Winner), a house-edge formula error (`ev = R−1` instead of `ev = R−(1−Q)`) produced 29.22% instead of the true 10.03%, and the wrong figure was repeated five times. **Every number in this repo must be reproducible two ways (exact and MC).** The MC has already caught one oracle bug (§9.1).

---

## 2. Repo map

```
cardsim/
  HANDOFF.md            ← this file
  CLAUDE.md             ← short rules for every session
  SPEC.md               ← research spec (rules, paytables, exact values, sources) — rev 2
  README.md             ← usage + Supreme 7 notes
  RESULTS.md            ← generated summary of reports/
  VALIDATION.txt        ← last validate.py output
  reference_values.json ← exact targets (tests read this)
  validate.py           ← MC-vs-exact gates
  make_results.py       ← reports/*.json → RESULTS.md
  cardsim/
    core.py             ← RNG (xoshiro256**), shoe/CSM dealing, settle() bank cap, accumulate()
    baccarat.py         ← coup engine, 18 bet types
    tcp.py              ← Three Card Poker engine, 4 bet types, 4 strategies
    blackjack.py        ← rule-matrix BJ engine (jokers, target 21/22, naturals, over-target rules)
    strategies.py       ← BJ player profiles → int8 strategy arrays
    run.py              ← config loader, runner, summary, report formatter (CLI entry)
  configs/              ← 4 validation + 10 CA table/variant configs
  oracle/               ← exact enumeration: tcp.c, tcp_analyze.py, bac_exact.py (+ older bac.py, ref.py)
  tests/test_core.py    ← settlement, evaluators, BJ resolution matrix, joker modes
  reports/              ← JSON + text output of the last runs
```

---

## 3. Status

| Component | State | Evidence |
|---|---|---|
| 3CP exact oracle (1 deck) | ✅ | Ante/Play 3.3730%, PP, 6CB, CA Bonus all match the published figures |
| Baccarat exact oracle (6D, 8D, all 18 bets) | ✅ | Banker 1.0579%, EZ 1.0183%, Player 1.2351%, Tie 14.3596%, D7 7.6113%, P8 10.1876%, Dragon Bonus, Supreme 7, Divine 9, Eclipse |
| Baccarat MC | ✅ | 18/18 bets within \|z\| < 1.3 at 1e8 coups |
| 3CP MC | ✅ | 4/4 bets within \|z\| < 1.1 at 1e8; mimic and raise-all seats reproduce the published 3.45% / 7.65% |
| BJ MC engine | ✅ for standard rules | Vegas 6D S17 DAS 3:2: 0.394% ± 0.032; dealer bust 28.2%; natural 4.75%; SD 1.154; mimic 5.71% (analytic ≈5.69%) |
| BJ CA variant configs | ⚠️ unconfirmed | Rules from OCR'd BGC filings; several self-contradict (§9) |
| BJ optimal strategy for CA rules | ❌ not built | **Top priority** (§10 P1) |
| Bank cap / action order / fees / sessions / RoR / Kelly | ✅ implemented, unit-tested | `tests/test_core.py`, `reports/*` |
| Per-seat stats | ✅ | `per_seat` block in reports |
| Multi-deck 3CP exact | ❌ | MC handles it; the exact oracle is single-deck only |

Throughput after JIT on 2 cores: baccarat ≈2.6M coups/s; 3CP 1 seat ≈3M rounds/s (6 seats ≈0.9M); BJ 1 seat ≈1.3M rounds/s (6 seats ≈0.75M).

---

## 4. Verified reference numbers (the ones to remember)

Everything here is in `reference_values.json` or `SPEC.md`.

**3CP, 1 deck, Q-6-4 strategy.**
- Ante/Play by ante-bonus table: 5/4/1 → **3.373%** (element of risk 2.015%, SD 1.639); 4/3/1 → 3.826%; 3/2/1 → 4.278%.
- Pair Plus: 40/30/6/4/1 → 2.317%; 40/30/6/3/1 → **7.276%**.
- 6-Card Bonus: 1000/200/100/20/15/10/7 → **8.561%**.
- CA Grand Bonus (200/40/30/6/3/1) → 4.380%.
- Raise frequency 67.42%.

**Baccarat, 8 decks.**

| Bet | House edge |
|---|---|
| Banker 5% commission | 1.0579% |
| Banker EZ (3-card-7 win pushes; CA default) | **1.0183%** |
| Super 6 banker | 1.4581% |
| Player | 1.2351% |
| Tie 8:1 | 14.3596% |
| Tie 9:1 | 4.8440% |
| Dragon 7 | 7.6113% |
| Panda 8 | 10.1876% |
| Dragon Bonus Player | 2.6517% |
| Dragon Bonus Banker | 9.3731% |
| Lucky 6 (12/20) | 16.6836% |
| Player/Banker Pair 11:1 | 10.3614% (SD **3.155**) |

**Supreme 7** (Galaxy Gaming, Eternal Baccarat; paytables from Colorado Rule 28).
- Wins only if **both** hands are 2-card 7s or **both** are 3-card 7s. A mixed result loses.

| Paytable (both 3-card / both 2-card) | HE 8D | SD |
|---|---|---|
| MB-01: 200 / 50 | **7.7797%** | 10.77 |
| MB-02: 400 / lose | 7.2911% | 19.26 |
| MB-03: lose / 100 | 9.3966% | 9.52 |

- P(both 3-card 7) = 0.0023119; P(both 2-card 7) = 0.0089706.

**Divine 9 and Eclipse.**
- Divine 9 (75/10): 9.3105%.
- **Eclipse** (6:1 on any Sun 7 / Moon 8 / Supreme 7 / Divine 9 event): **2.9664%**.

**BJ side bets.** Perfect Pairs 25/12/6 with no jokers: 6.109% (6D), 4.096% (8D).

---

## 5. How the engine works

### 5.1 Conventions
- **Card code** = `rank*4 + suit`. rank 1=A … 10, 11=J, 12=Q, 13=K. **rank 0 = joker.** Suits 0–1 red, 2–3 black (used by Perfect Pairs).
- **RNG:** xoshiro256**, one independent state per chunk from `numpy.SeedSequence(seed).spawn(n)`. Runs are reproducible for a given `(seed, chunks, rounds)`.
- **Dealing:**
  - `shuffle: "csm"` deals every round from a fully shuffled shoe (partial Fisher–Yates). This matches exact off-the-top math, so use it for validation.
  - `shuffle: "shoe"` deals through a shoe to `penetration`, then reshuffles. This is realistic and adds a tiny cut-card effect.
- **Parallelism:** `numba.prange` over `chunks`. Each chunk writes only its own row of the accumulators.

### 5.2 Table model
- **Slots.** A table is a list of slots `(seat, bet_type, amount)`. Each round, the game kernel fills `res[slot]` with the **unit result** (net per 1 unit bet, including Play / doubles / splits) and `wager[slot]` (units actually risked).
- **Accumulation.** `accumulate()` pools unit results by bet type across active slots, records per-slot sums, and accumulates the seat-0 cross-product for the covariance matrix.
- **Settlement.** `settle()` applies the PD bank cap and returns bank net. Bank P&L per round = settle() − `pd_fee`. Modes:
  - `unlimited`.
  - `precover` (CA Grand 3CP): walk the action order; a slot has action only if cumulative `amount × exposure` fits in the bank. `exposure` = max payout per unit, from the game's `BETS` / config.
  - `collect_then_pay`: collect all losers into the pool, pay winners in action order until it's empty (partial pay; the rest get no action).
- **Action order:** `"seat"` (clockwise from the button) or `"bet_type"` (by `bet_type_priority`, then seat). With `rotate_button: true`, the button advances each round. Orders are precomputed per button position.

### 5.3 Games
- **`baccarat.py`:**
  - `play_coup` implements punto-banco draw rules and fills all 18 bet results.
  - `BETS` holds the name, max payout (exposure) and description for each bet.
  - To add a bet: append to `BETS`, compute `r[i]` in `play_coup`, add it to `oracle/bac_exact.py`, regenerate the references, and run validate.
- **`tcp.py`:**
  - `score3` ranks hands (A-2-3 is the lowest straight; mini-royal flag). `six_cat` gives the best-5-of-6 category.
  - Strategies: 0 `q64`, 1 `mimic_dealer` (any Q-high), 2 `raise_all`, 3 `q64_pwt` (adds Q-6-3 offsuit).
  - Ante bonus is paid whenever the player raises. Dealer qualifier is configurable (`dealer_qualify`).
  - The CA Bonus is paid even if the player folds. That's an assumption (§9).
- **`blackjack.py`:**
  - `play_round` deals one card per seat, then the PD up card, then second cards, then the hole card.
  - Each seat plays up to `MAXH = 4` hands (splits), using its strategy array. The PD then draws by rule, and `_resolve` settles each hand using the rule matrix.
  - Hand state per hand is `[hard, soft_count, ncards, fixed21, joker_count]`. `_best(st, i, T)` returns `(total, soft)`; soft only if hard+10 ≤ target.
  - Joker modes: `fixed21` (a joker anywhere makes the hand hard 21 with no draws; Hustler); `one_eleven` (joker acts as an ace; Commerce); `two_twelve` (LA BJ).
  - Naturals: `NAT[5,2]` gives `(rank, payout)` for JJ, AJ, AA, A10, J10. Higher rank wins; equal ranks push. Naturals are checked only on the original unsplit hand.
  - `_resolve` order:
    1. Naturals.
    2. Both under target → compare (with the optional PD-wins-tie total).
    3. Player over, PD under → lose. PD over, player under → win.
    4. Both over → `over_ncards_lose`, then the PD 3-card push window `[lo, hi]` (only when player total ≥ `pmin`), then the `both_over` mode: `dealer_wins` / `player_closer_push` / `closer_wins`.
  - Side bets: Perfect Pairs (jokers never pair) and Buster (PD over target with no natural, paid by PD card count; index 8 = 8+ cards).
- **`strategies.py`** profiles describe how players behave; none is claimed optimal:
  - `vegas_basic`: the standard multi-deck S17 DAS chart applied unchanged. This is what many CA players actually do.
  - `vegas_shifted`: the chart re-indexed by target−21.
  - `mimic_dealer`.
  - `never_bust`.
  - Joker up card uses the Ace column by default (`joker_up_column`).

### 5.4 Reports
- `run.py` writes `reports/<config>.json`:
  - `bets`: pooled EV, house edge, SD, SE, CI, element of risk, `z_vs_ref`.
  - `per_seat`.
  - `bank`: μ, σ, SE, EV per $ action, N0, full-Kelly bankroll σ²/μ, Brownian RoR, per-hour figures.
  - `sessions`: percentiles, P(losing), P(drawdown ≥ B).
  - `seat0_cov`.
  - `events`.
- SE uses `sd/√rounds`. That's right for one seat. For pooled multi-seat bets it's an approximation, because seats share the dealer hand; use `per_seat` for exact per-seat SE.

---

## 6. Config reference

```jsonc
{
  "name": "...", "game": "baccarat|tcp|blackjack",
  "decks": 8, "jokers_per_deck": 0, "jokers_total": 0, "remove_ranks": [],
  "shuffle": "csm|shoe", "penetration": 0.85,
  "rounds": 1e8, "seed": 1, "chunks": 8, "hands_per_hour": 60,
  "reference": "baccarat_exact/8_decks",          // path into reference_values.json
  "reference_inline": {"ante_play": 0.03373},      // or inline {bet: house_edge}
  "table": {
    "seats": [{"bets": {"<bet>": amount}, "strategy": "<profile>"}],
    "bank_mode": "unlimited|precover|collect_then_pay", "bank": 20000,
    "action_order": "seat|bet_type", "bet_type_priority": ["player", "banker_ez"],
    "rotate_button": true,
    "fees": {"pd_per_round": 2.0, "player_per_seat": 1.0, "pd_tiers": [[0, 2], [301, 4]]}
  },
  "session": {"rounds": 300, "bankrolls": [5000, 10000]}
}
```

**3CP keys** (defaults shown):
- `"ante_bonus": [5,4,1]` (SF, trips, straight)
- `"pair_plus": [40,30,6,3,1]`
- `"six_card": [1000,200,100,20,15,10,7]`
- `"ca_bonus": [200,40,30,6,3,1]`
- `"player_wins_ties": false`
- `"dealer_qualify": "Q"`
- Strategies: `q64 | mimic_dealer | raise_all | q64_pwt`.

**Baccarat bets:** `banker_5pct banker_ez banker_super6 player tie_8 tie_9 dragon7 panda8 dragon_bonus_player dragon_bonus_banker lucky6 player_pair banker_pair supreme7_mb01 supreme7_mb02 supreme7_mb03 divine9 eclipse`.

**BJ keys:**
- `rules`: { `target`, `joker_mode` (none|fixed21|one_eleven|two_twelve), `dealer_stand`, `dealer_hits_soft`, `both_over` (dealer_wins|player_closer_push|closer_wins), `das`, `max_hands` (≤4), `split_aces_one_card`, `resplit_aces`, `no_split_aces`, `split_by_value`, `split_no_joker`, `double_any_two`, `double_no_joker`, `surrender`, `surrender_max_total`, `peek`, `no_options_joker_up`, `joker_up_ends_hand`, `over_ncards_lose`, `dealer3_push: [lo,hi,player_min]`, `dealer_wins_tie_total`, `player_must_hit_le`, `player_must_stand_hard_ge` }
- `"naturals": {"JJ":[rank,pay], "AJ":…, "AA":…, "A10":…, "J10":…}`
- `"perfect_pairs": [25,12,6]`
- `"buster": {"3":2,…,"8":200}`
- `"main_exposure": 1.0`
- `"joker_up_column": "ace|ten"`
- Seat `strategy` ∈ `vegas_basic | vegas_shifted | mimic_dealer | never_bust`.

---

## 7. Results snapshot (2e7 rounds; full tables in RESULTS.md)

| Table (sample action) | Bank EV % of action | Bank EV/hr | SD/hr | Notes |
|---|---|---|---|---|
| CA EZ baccarat, 6 seats, $1,580/round, no fee | **+1.70%** | +$1,882 | $2,348 | N0 = 109 rounds; balanced book; P(losing 350-round session) 4.3% |
| CA 3CP, 6 seats, $695/round, PD fee $2 | +4.16% | +$1,301 | $4,182 | P(losing 250-round session) 22.9% |
| Hustler 21st C. BJ, 6 seats ⚠️ | +6.51% | +$2,343 | $3,374 | Vegas-basic seats give 7.4%, mimic 2.8%, never-bust 14.8% |
| Commerce No Bust BJ ⚠️ | +1.97% | +$709 | $3,424 | Vegas-basic seats only ~1.0%; thin game |
| HPC No Bust (approx) ⚠️ | +2.39% | +$905 | $3,727 | Buster 5.10% |
| Hustler LA BJ ⚠️ | +4.48% | +$1,075 | $2,275 | Mimic seat 1.82%, Vegas basic 4.30% |

**Finding:** in California BJ, **player style moves the edge more than any rule difference**. Vegas basic strategy applied unchanged to a 22-target game costs players about 7% at Hustler. Optimal play for these rules is unknown until P1 is built.

---

## 8. Invariants (do not break)

1. Every new bet or game ships with an **exact oracle or published anchor**, and a validate gate (|z| < 3.5).
2. Rules live in configs. No room-specific `if` statements in engine code.
3. Unit results are per 1 unit of base bet. Money only appears in `settle()` / reports.
4. Each chunk writes only its own accumulator row (`prange` safety).
5. Never quote an edge in docs without the run or oracle that produced it.
6. Keep `reference_values.json` generated by scripts, never hand-edited.

---

## 9. Known issues, assumptions, open questions

1. **Fixed bug (keep the test):** the old `oracle/bac.py` and the spec rev 1 used 144 instead of 121 for the 11:1 pair-bet variance (SD 3.416 → correct 3.155). Both oracles are now fixed. Add a regression test that checks pair SD against MC.
2. **BJ room configs are unconfirmed.** They come from BGC filings with OCR damage:
   - Hustler 21st C.: the filing contradicts itself on the both-over tie rule, and the "no draw" text is garbled.
   - Commerce: unclear whether there are 2 jokers or 1 per deck; whether joker+10 counts as a 6:5 "blackjack" (assumed yes); and whether aces can be split (assumed no).
   - HPC No Bust 4.0a: the natural is printed as both 6:5 and 6:1, and the no-bust-ace mechanics are only approximated.
   - LA BJ: natural payout assumed 1:1; double and split assumed unavailable; the "must hit soft 18" constraint is not modeled.

   Each config needs `source` (URL + page) and `confirmed_on_felt` fields, then confirmation at the table.
3. **`fixed21` joker as a hit card** makes the hand hard 21. That's an assumption.
4. **No peek** is the CA default, so doubled and split bets lose in full to a PD natural. Confirm per room.
5. **3CP CA Bonus pays even on a fold.** That's an assumption; the CA Grand filing is ambiguous.
6. **Buster** depends on target and deck. It was removed from the Hustler configs because it isn't in that filing and the 21-target paytable is meaningless at 22.
7. **Bank-cap semantics:** which of `precover` / `collect_then_pay` each room uses is unverified. The Deuce Lounge filing settles by bet type: Player → Banker → Tie → Panda → Dragon.
8. **Pooled SE in multi-seat runs is approximate.** Use per-seat numbers.
9. **Single-deck 3CP with 6 seats** deals 21 of 52 cards. Per-seat edges shift slightly from the 1-seat value (q64 seats ran 3.39–3.44% against 3.373%). That's real card removal, not a bug, but quantify it exactly (P3).
10. **Fees:** a flat PD fee per round is supported, and so are tiers by total action. Player fees are reported but not netted into the per-seat player EV.

---

## 10. Roadmap (priority order, with acceptance criteria)

**P1: BJ optimal strategy per config (SPEC §4.6).** This is the biggest unknown in the bank's real edge.
- Build an exact infinite-deck DP:
  1. PD final-state PMF by up card. States carry `(total, ncards, soft/hard, natural, fixed21)`, because the rules depend on card count (3-card push windows, 4+ card losses).
  2. Stand EV via `_resolve` semantics.
  3. Hit, double, split and surrender EVs by backward recursion.
- Then add composition-dependent first-2-card × up-card for a finite shoe.
- Output a strategy CSV and an `optimal` profile in `strategies.py`.
- **Accept when:**
  - The DP reproduces the standard Vegas infinite-deck house edge, looked up from a published source.
  - The MC with the `optimal` profile agrees with the DP EV within 3 SE for every CA config.
  - The optimal profile beats every existing profile on each config.

**P2: Pin down room rules.** For HPC, Hustler, Commerce and Bicycle, extract each BJ / baccarat / 3CP game from the BGC filings (URLs in §11) into configs, with page references. Add a `confirmed_on_felt` checklist that Ray fills in. **Accept when** every config has a source and a list of open questions.

**P3: 3CP exactness.**
- Multi-deck exact oracle (1–8 decks).
- Exact multi-seat covariance (3-hand enumeration, or a large MC with CSM).
- **Accept when** the per-seat 6-seat-single-deck edge is reproduced exactly.

**P4: Missing games and bets**, each with an oracle:
- Commerce **21st Century Baccarat** (player draw/double/surrender vs PD; PD wins 0–1 ties). Needs a player-decision optimizer like P1.
- Hustler joker baccarat (8 jokers; joker = 9).
- HPC Pan 9 / Dragon 9 bonus.
- 2urbo BJ (21.99 natural, 3-card beats 2-card) and its bonus.
- Pure 21.5 and Pure Spanish 21.5 with Match the Dealer.
- Lucky Match and Monster & Buster. These need rank-level 6-card baccarat evaluation.

**P5: Fees and bank economics.**
- Per-room fee schedules as data (e.g., HPC schedule 3 and the PD-only tiered schedule 17).
- Player fee netted into player EV.
- `bank_share`: the fraction of rounds banked under rotation / TPPPS.
- EV after fees per hour for the operation.

**P6: Risk tooling.**
- An analytic fast path: given an action vector, compute μ and σ from `reference_values.json` means plus the covariance matrix, without MC.
- A multi-table / multi-game portfolio aggregator.
- Kelly sizing with fractional-Kelly and drawdown constraints.
- Session sims with stop-loss / stop-win.
- **Accept when** the analytic μ and σ match MC within 1%.

**P7: Integration.** Export a compact JSON (game, config, μ, σ per $ action, covariance) for Ray's existing session-logging PWA (Next.js + Google Sheets) to compare realized vs expected results.

**P8: Engineering.**
- Convert tests to pytest and add CI that runs `validate.py --rounds-scale 0.05`.
- Add a pair-SD regression test.
- Measure the cut-card effect (shoe vs CSM).
- Optional: move the hot loops to Rust or C if throughput becomes a bottleneck.

---

## 11. Sources

- Wizard of Odds, Three Card Poker: https://wizardofodds.com/games/three-card-poker/
- Wizard of Odds, baccarat side bets: https://wizardofodds.com/games/baccarat/side-bets/
- Galaxy Gaming, Eternal Baccarat (Supreme 7 rules): https://www.galaxygaming.com/products/eternal-baccarat
- Colorado LGCC Rule 28 (Eternal Baccarat paytables MB-01/02/03): https://sbg.colorado.gov/sites/sbg/files/Rule%2028%20redline.pdf
- BGC game rules index: https://www.oag.ca.gov/gambling/game
  - HPC: https://www.oag.ca.gov/system/files/media/hollywood-park.pdf
  - Hustler: https://oag.ca.gov/system/files/media/hustler-casino.pdf
  - Commerce: https://oag.ca.gov/system/files/media/commerce.pdf
  - Bicycle: https://oag.ca.gov/system/files/media/bicycle-casino.pdf
  - CA Grand 3CP: https://oag.ca.gov/sites/all/files/agweb/pdfs/gambling/ca-grand-three-card-poker-rules.pdf
  - Crystal No Bust + Perfect Pairs + Buster: https://oag.ca.gov/sites/all/files/agweb/pdfs/gambling/crystal-no-bust-21st-cent-blackjack-perfect-pairs-rules.pdf
  - Deuce Lounge EZ Baccarat (settlement order): https://oag.ca.gov/sites/all/files/agweb/pdfs/gambling/deuce-lounge-ez-baccarat-panda-8.pdf
- Regulatory: ruling 2026-06-30: https://www.mto.com/achievement/mto-secures-victory-for-california-gaming-association-in-challenge-to-cardroom-regulations/ · AG appeal 2026-07-17: https://oag.ca.gov/news/press-releases/attorney-general-bonta-appeals-ruling-card-room-regulations-litigation
