# EV / SD Simulator Spec — Three Card Poker, Baccarat, California Blackjack
*Handoff for Claude Code · prepared 2026-11-21 · rev 2 (Supreme 7 added; pair-bet SD corrected; MC engine in cardsim/) · context: California cardroom player-dealer (PD) banking*

Read this whole file before writing any code. Every number marked ✅ has been **independently recomputed by exact enumeration** (scripts in `oracle/`) and matches the published figure. Treat ✅ values as unit-test gates. Values marked ⚠️ are unverified or rule-ambiguous: the sim must compute them, not assume them.

---

## 0. Context and framing

- **Perspective.** All three games are dealt in California as player-dealer ("California games"). The PD collects all losing wagers and pays all winning ones. Report every result from **both** seats: player EV (negative) and PD/bank EV. Bank EV per round = Σ(house edge × wager) − PD collection fee, then corrected for the bank cap (see §1.4).
- **Edge vs. edge after fees.** The house edge is the gross figure. What matters for the bank is the edge after collection fees and after action truncation, and for the player it is the house edge plus the player's own collection fee.
- **Regulatory status (affects BJ only).** On 2026-06-30, SF Superior Court Judge Darwin invalidated the BGC regulations that would have banned traditional blackjack mechanics (21 target, bust, natural bonus) and limited TPPPS banking. The AG filed an appeal on 2026-07-17, so the case is pending. Build BJ rule sets as **parameterized configs** so a future rule change is a new config, not new code.
- **Room rules are the source of truth.** Each room's approved rules are on oag.ca.gov (URLs in §7). OCR in those PDFs is messy and some filings contradict themselves (examples are flagged below). Each config must carry a `source` and `confirmed_on_felt: bool`.
- **Lesson from the HPC Two-Way Winner analysis:** don't trust a repeated figure. A house-edge error there (`ev = R−1` instead of `ev = R−(1−Q)`) gave 29.22% vs. the true 10.03%. Every analytic EV formula needs a matching Monte Carlo check, and the reverse.

---

## 1. Architecture (all games)

### 1.1 Two engines per game
1. **Exact / combinatorial engine.** Enumerate outcomes, or use recursion with card removal, to get the full outcome distribution → EV, SD, skew, and the covariance matrix across bets. Fast for 3CP and baccarat; BJ needs a dealer-probability DP (§4.6).
2. **Monte Carlo engine.** Shoe-level simulation (finite shoe, cut card / CSM option, multiple seats, side bets, collection fees, bank cap and action order). Use it for path-dependent things exact math can't do cheaply: bank truncation, session P&L, risk of ruin, drawdowns, and Kelly/bankroll growth.
3. **Agreement gate.** MC must agree with exact EV within 3 standard errors at ≥10⁸ rounds for every ✅ bet.

### 1.2 Rule configs
YAML/JSON configs. Each config holds: `game`, `variant`, `decks`, `jokers_per_deck`, card-value overrides, paytables, draw rules, tie/over-target resolution matrix, player option flags, `collection_schedule`, `bank_action_order`, `source`, and `confirmed_on_felt`. No game rule is hard-coded outside a config.

### 1.3 Outputs (per bet and per table configuration)
- EV/unit, SD/unit, skew, hit frequency, and the full outcome PMF.
- **Covariance matrix across all bets on the same round** (and across seats). This is required because the PD's P&L is a weighted sum of correlated bets: Var(bank) = bᵀΣb, not Σ bᵢ²σᵢ².
- Per-hour figures: EV/hr and SD/hr given hands/hr, the action profile, and the fee schedule.
- Bank-side: N0 = (SD/EV)² rounds to overcome 1 SD; risk of ruin for a given bankroll (Brownian approximation **and** MC); Kelly fraction ≈ μ/σ² per unit of action, with a fractional-Kelly option.
- Player-strategy sensitivity: bank EV against optimal players vs. realistic strategy profiles (§4.5). Much of the bank's real edge in CA BJ comes from player mistakes.

### 1.4 California mechanics the MC engine must model
- **Bank cap:** the PD "may not win or lose more than the amount wagered." If action exceeds the PD's posted bank, bets are settled **in order** until the bank runs out, and the rest get no action.
- **Action order:** clockwise from an action button. In 3CP (California Grand filing) the start seat can be set by the PD's top card. Some baccarat filings settle by bet type: all Player line → all Banker line → Tie → Panda 8 → Dragon 7 (Deuce Lounge EZ Baccarat). Make the order configurable.
- **Coverage check (3CP, CA Grand):** before dealing, required coverage = base wagers + Σ(bonus wager × max payout).
- **Collection fees:** flat per hand (never a % of the wager, by statute), set per seat and per PD, from a posted schedule with ≤5 rates per table. Some schedules charge the PD only, tiered by total table action. Examples (HPC No Bust 21st Century BJ): Schedule 3 ($10–$100) = player $1 / PD $2; Schedule 17 (PD-only, by action) = $2 at $50–$300 … $15 at $5,005+. Model the fee as a function `fee(seat_role, wager, table_action)`.
- **PD rotation / TPPPS:** the bank is offered around the table, and the TPPPS banks when players pass. For the bank's P&L, model the fraction of rounds actually banked by the operation (`bank_share`).

---

## 2. Three Card Poker

### 2.1 Rules (standard; CA PD version identical except banking)
- Decks: 1–8 (the CA Grand filing permits multi-deck). With a single deck there are 22,100 3-card hands.
- Ranking (high to low): straight flush > three of a kind > straight > flush > pair > high card. A-2-3 is the lowest straight; A-K-Q is the highest.
- Bets: Ante (+ Play = 1× Ante, or fold and lose the Ante). Optional Pair Plus, plus an optional bonus or 6-Card Bonus.
- The dealer/PD qualifies with **Q-high or better**. If not qualified: Ante pays 1:1 and Play pushes. If qualified: compare hands; the winner gets 1:1 on Ante and Play, and a tie pushes both.
- Ante Bonus pays on the Ante when the player raises, regardless of the dealer's hand.
- **Optimal strategy: raise with Q-6-4 or better, fold otherwise** (raising Q-6-3 has an expected loss of 1.00255 units vs. 1.0 for folding; raising Q-6-4 loses 0.99338, so it beats folding).

### 2.2 Hand frequencies (1 deck) ✅
| Hand | Combos /22,100 | Prob |
|---|---|---|
| Straight flush (incl. 4 mini-royals AKQs) | 48 | 0.002172 |
| Three of a kind | 52 | 0.002353 |
| Straight | 720 | 0.032579 |
| Flush | 1,096 | 0.049593 |
| Pair | 3,744 | 0.169412 |
| High card | 16,440 | 0.743891 |

### 2.3 Ante/Play results (Q-6-4, single deck, 407,170,400 outcomes) ✅
Outcome frequencies: fold 32.579%, dealer does not qualify 20.997%, win 23.910%, tie 0.0657%, loss 22.448%. Raise frequency 67.42%; average total bet 1.6742 × Ante.

| Ante Bonus (SF/Trips/Str) | HE per Ante | Element of risk | SD per Ante |
|---|---|---|---|
| 5/4/1 (most common) | **3.373%** ✅ | 2.015% ✅ | 1.6393 ✅ |
| 4/3/1 | 3.826% ✅ | 2.285% | 1.6234 |
| 3/2/1 | 4.278% ✅ | 2.555% | 1.6102 |
| 5/3/1 | 3.608% | 2.155% | 1.6317 |
| 5/4/1 + player wins ties (no strategy change) | 3.242% ✅ | 1.936% | 1.6401 |
| No ante bonus | 8.658% | 5.171% | 1.5436 |

Under player-wins-ties, the optimal strategy also raises Q-6-3 when all three suits differ, which lowers the HE slightly below 3.242%. Use the strategy optimizer to confirm.

**Between-seat correlation ✅ (approx.):** Cov(seat i, seat j) ≈ Var over dealer hands of E[result | dealer hand] = 0.5424, so ρ ≈ **0.20**. (This ignores card removal between the two player hands; the exact value needs a 3-hand enumeration or MC.) For n seats each with ante a, the bank variance is a²[nσ² + n(n−1)·0.542]. With 6 seats that is ~2× the variance an independence assumption gives.

Alternative-strategy checks (published): mimic the dealer (raise any Q-high) → 3.45%; raise everything → 7.65%. Use these to test the strategy-profile module.

### 2.4 Pair Plus (pays on player's 3 cards only) ✅ (1 deck)
| Pays SF/Trips/Str/Flush/Pair | HE | SD |
|---|---|---|
| 40/30/6/4/1 (original) | 2.317% ✅ | 2.911 |
| 50/40/6/3/1 | 2.751% | 3.424 |
| 40/25/6/4/1 | 3.493% | 2.797 |
| 35/25/6/4/1 | 4.579% | 2.647 |
| 40/30/5/4/1 | 5.575% | 2.848 |
| 40/30/6/3/1 (most common now) | 7.276% ✅ | 2.850 |
| 40/30/5/3/1 | 10.534% | 2.785 |

**CA Grand "Bonus Bet"** (requires Ante, capped at Ante): mini-royal 200 / SF 40 / trips 30 / straight 6 / flush 3 / pair 1 → **HE 4.380%, SD 3.883** (computed here; treats "Royal" as suited A-K-Q).

### 2.5 6-Card Bonus (best 5 of player 3 + dealer 3 = uniform 6 of 52) ✅
Probabilities: royal 9.234e-6, SF 8.134e-5, quads 7.203e-4, FH 0.008153, flush 0.010108, straight 0.017763, trips 0.035963, lose 0.927202.

| Table (R/SF/4K/FH/Fl/St/3K) | HE | SD |
|---|---|---|
| 1000/200/100/20/15/10/7 | 8.561% | 5.448 |
| 1000/200/50/25/20/10/5 | 10.225% | 5.198 |
| 2000/200/50/25/15/10/5 | 14.356% | 7.276 |
| 1000/200/50/25/15/10/5 | 15.279% | 5.024 |

(One summary of the Wizard of Odds page appeared to give conflicting labels for 8.56% vs 15.28%. This enumeration settles it: 8.56% belongs to the 100-for-quads / 7-for-trips table.)

### 2.6 Multi-deck note
CA rooms may use 1–8 decks. Hand probabilities change with deck count: trips and pairs get more frequent, flushes slightly rarer. **Rerun the enumeration for each deck count**; don't reuse single-deck figures.

---

## 3. Baccarat

### 3.1 Draw rules (punto banco, used by all CA EZ-style filings)
- Values: A=1, 2–9 face, 10/J/Q/K=0, total mod 10.
- A natural (either hand's 2-card total is 8 or 9) → both hands stand.
- Player: draws on 0–5, stands on 6–7.
- Banker, if Player stood: draws on 0–5.
- Banker, if Player drew third card p3:
  - 0–2 draw
  - 3 draw unless p3=8
  - 4 draw if p3∈2–7
  - 5 draw if p3∈4–7
  - 6 draw if p3∈6–7
  - 7 stand

### 3.2 Main and side bets — exact, card removal ✅
| Bet | 8-deck HE | 8-deck SD | 6-deck HE |
|---|---|---|---|
| Banker, 5% commission | 1.0579% ✅ | 0.9274 | 1.0558% |
| Banker, no-comm, 3-card-7 win pushes (EZ / "Fortune 7" / HPC 21st Century Baccarat V10) | **1.0183%** ✅ | 0.9393 | 1.0161% |
| Banker, no-comm, win on 6 pays ½ (Super 6 style) | 1.4581% | 0.9296 | 1.4548% |
| Player 1:1 | 1.2351% ✅ | 0.9512 | 1.2374% |
| Tie 8:1 | 14.3596% ✅ | 2.6409 | 14.4382% |
| Tie 9:1 | 4.8440% ✅ | 2.9343 | 4.9313% |
| Dragon 7 / Lucky 7 (Banker 3-card-7 win, 40:1) | 7.6113% ✅ | 6.0849 | 7.6062% |
| Panda 8 (Player 3-card-8 win, 25:1) | 10.1876% ✅ | 4.7481 | 10.2074% |
| Dragon Bonus Player (30/10/6/4/2/1, nat win 1, nat tie push) | 2.6517% ✅ | 2.4736 | 2.6675% |
| Dragon Bonus Banker | 9.3731% ✅ | 2.3045 | 9.3889% |
| Lucky 6 version (Banker wins w/ 6: 2-card 12:1, 3-card 20:1) | 16.6836% | 3.5956 | 16.7163% |
| Player Pair or Banker Pair, 11:1 | 10.3614% | 3.1549 (corrected; was misreported as 3.4163) | 11.2540% |
| **Supreme 7** MB-01 (both 3-card 7 200:1, both 2-card 7 50:1) | 7.7797% ✅ | 10.7651 | 7.7792% |
| Supreme 7 MB-02 (400 / lose) | 7.2911% ✅ | 19.2588 | 7.3180% |
| Supreme 7 MB-03 (lose / 100) | 9.3966% ✅ | 9.5231 | 9.3689% |
| Divine 9 (both 3-card 9 75:1, one 10:1) | 9.3105% ✅ | 4.3977 | 9.2959% |
| Eclipse (any Sun7/Moon8/Supreme7/Divine9 event, 6:1) | 2.9664% ✅ | 2.4188 | 2.9557% |

Event probabilities (8D): Banker win 0.458597, Player win 0.446247, Tie 0.095156, Banker 3-card-7 win 0.022534, Player 3-card-8 win 0.034543, Banker wins on 6 0.053864.

**Covariance is the key to bank variance.** Corr(Banker-EZ, Player) = **−0.988**. Example: with $1 on Banker-EZ and $1 on Player against the PD, bank EV = +2.253¢ (1.13% of action), and bank SD = **0.148** per $2 of action vs. 1.337 if you wrongly assume independence. Balanced books make baccarat banking very low-variance. Lopsided books (whale on one side) look like a single 1:1 bet. The full 11×11 covariance matrices are in `reference_values.json`.

### 3.3 California variants to support
- **EZ-style PD baccarat:** Banker pays 1:1, and a Banker 3-card-7 win pushes. Seen in the HPC 21st Century Baccarat V10, Ace & Vine, Crystal Fortune 7, and Deuce Lounge filings. This is the default config.
- **HPC 21st Century Baccarat V10 side bets** (paytables partly illegible ⚠️):
  - Lucky 7 = Dragon 7 at 40:1.
  - Monster & Buster: final totals 0/1 vs. 8/9; 6-card hand 18:1, 4-card hand 4:1, other cells unclear ⚠️.
  - Lucky Match (best poker combination of the 6 cards): 5–6 of a kind 250, double triplets 100, quads 30, FH 15, trips 6, 2–3 pairs 4. This needs rank-level (13 ranks), not value-level, simulation ⚠️.
- **Commerce "21st Century Baccarat"** is a different game: players get draw/surrender/double options vs. the PD, and the PD wins 0–1 ties. Ray's existing game DB covers it. Implementing it needs a player-decision optimizer like the BJ one. Lower priority; stub the interface.
- **Hustler 21st Century Baccarat with jokers:** 8 decks + 8 jokers. A joker makes the hand an automatic 9, and two jokers make a natural 9. Optional draws on 5 (player) and 5–6 (PD) ⚠️.
- **HPC Pan 9 / Dragon 9:** 7s, 8s, 9s and 10s removed; 4-card optional draws. Dragon 9 Bonus: 4-card 9 suited 100, same color 60, 3-card 9 suited 30, same color 10, any 4-card 9 4 ⚠️.

### 3.4 Validation note
Value-level recursion is exact for every bet that depends only on totals. Pair bets, Lucky Match, and suited bonuses need rank- and suit-level dealing.

---

## 4. California blackjack family

### 4.1 Why this is a family, not a game
Every room files its own version. Engine requirement: **one blackjack engine with a rule matrix.** The dimensions observed in actual filings:

| Dimension | Values seen |
|---|---|
| Deck | 52-card × 1–8; + jokers (1/deck typical; "4 jokers in 56 cards"); Spanish 48-card (10s removed, J/Q/K "bonus" cards); special "No Bust" aces; 9♠ pair = 21.99 |
| Joker value | joker + any card = **hard 21, no draw** (Hustler 21st C.); 1 or 11 (Commerce No Bust); 2 or 12 (Hustler LA BJ); wild |
| Target | 21, 21.5, 21.99, 22 ("Natural 22"), 20½ |
| Natural | 2 jokers (2:1); A+J / A+A / J+J = Natural 22 (Hustler); A+10 "blackjack" 6:5 ranked below 2 jokers (Commerce); No-Bust-Ace + 10 (6:5, though one HPC page also says 6:1 ⚠️) |
| Over-target resolution | player over / PD ≤ target → PD wins. Player ≤ / PD over → player wins. Both over → hand closer to target wins, **except** player closer = push and PD wins ties over target. Exceptions: PD 3-card hard 23–25 → player over pushes (Commerce/HPC No Bust); PD 3-card 26 → push (Normandie) |
| Ties ≤ target | push (most); PD wins ties at 18 (LA BJ); 3-card beats 2-card at equal totals (HPC 2urbo) |
| PD drawing | hit soft 17, stand hard 17 (most common); hit soft 18 / stand hard 18 (LA BJ); PD joker up card → no draw; PD natural ends the hand |
| Player constraints | must hit ≤11, option 12–20, stand soft 21/natural (No Bust); LA BJ table-limit-specific must-hit/stand bands |
| Double | any 2 / no jokers / for-less allowed; after split only (Crystal No Bust) |
| Split | equal rank, ≤3 hands; aces 1 card each; no joker splits; no natural after split |
| Surrender | late, any 2 cards (most); ≤20 only; no surrender when PD first card is joker (Commerce) |
| Insurance | half bet, 2:1 vs PD natural |
| Other | Second Chance (forfeit ½ to replace a hit card, Commerce); "rescue" after double (Pure Spanish 21.5) |

### 4.2 Reference configs to ship (confirm each on the felt ⚠️)
1. **`hustler_21c`** — Hustler 21st Century BJ.
   - 8D + 1 joker/deck. A joker paired with any card = hard 21, no further draws.
   - Natural 22 = JJ, AA, or AJ; JJ pays 2:1.
   - Closest to 22 wins. Both over: closer wins, player closer = push, PD wins ties over.
   - PD hits S17, stands H17. PD joker up → no draw.
   - Double any non-joker 2 cards (for less OK). Split to 3 hands, DAS. Surrender any 2.
   - ⚠️ The filing contradicts itself on the "both over" tie rule; the OCR also reads "there is now draw" where "no draw" is intended.
2. **`commerce_nobust_21c`** — Commerce No Bust 21st Century BJ.
   - 1–8D + jokers ("at least two" vs. "one per deck" ⚠️). Joker = 1/11.
   - Two jokers = Natural 2:1; A+10 = blackjack 6:5.
   - Over-target rules as in 4.1, including the PD 3-card 23–25 push.
   - PD H S17. Double any 2 except Natural/21. Split anything except AA, multiple splits, DAS/surrender after split.
   - Surrender ≤20 before PD's 2nd card. No D/S/R when PD's first card is a joker. Second Chance option.
3. **`hpc_nobust_4_0a`** — HPC No Bust 21st Century BJ 4.0a.
   - No jokers. The No-Bust Ace = 10½ with a 10-value card in the first two cards; 1/11 otherwise.
   - Natural pays 6:5 (one page says 6:1 ⚠️). PD wins ties over a natural.
   - Player 4+ card bust loses; player 3-card 22 with no aces loses.
   - PD H S17. Tens split to 3 hands, aces to 3 hands with 1 card each. Insurance. Surrender.
4. **`hustler_la_bj`** — LA Blackjack.
   - 6D + up to 4 jokers; joker = 2/12. Natural = AA or joker + 10-value.
   - Target 22. Both over → lower total wins. Ties push except 18 (PD wins).
   - PD hits soft 18, stands hard 18. Player must-hit/stand bands depend on table limit.

Also config templates: `pure_21_5` (TXB, natural 6:5), `pure_spanish_21_5` (HPC; player wins natural ties and non-natural 21 ties), `hpc_2urbo` (21.99 natural on 9♠9♠, one-card draw limits).

### 4.3 Side bets to implement
| Bet | Paytable(s) | Status |
|---|---|---|
| Buster Blackjack (PD busts; by # PD cards) | HPC: 3/4 cards 2:1, 5→4, 6→16, 7→50, 8+→200. Crystal: 3→1, 4→3, 5→5, 6→25, 7→100, 8+→500 | ⚠️ compute per config. "Bust" means over the variant's natural/target, so the result depends on PD rules and deck composition |
| Perfect Pairs (first 2 player cards) | 25 perfect / 12 colored / 6 mixed | ✅ no jokers: **4.096% HE (8D), 6.109% (6D)**, SD 3.95 / 3.89. With jokers ⚠️ recompute (jokers don't pair unless the rules say so) |
| HPC 2urbo Bonus | suited BJ 10, suited pair 5, unsuited BJ 4, unsuited pair 3, 20 (no ace) 2; 3-card: suited AAA 200, suited 777 100, any trips 20 | ⚠️ |
| Match the Dealer (Pure Spanish 21.5) | 2 suited 22, suited+unsuited 14, 1 suited 11, 2 unsuited 6, 1 unsuited 3 | ⚠️ 48-card deck |
| Insurance | 2:1 vs PD natural | compute per config |

### 4.4 Validation anchors for the BJ engine
- With the rule matrix set to **standard Vegas** (6D, S17, DAS, 3:2, no surrender, split to 4), the engine must reproduce the Wizard of Odds house-edge calculator to ±0.02% (expected ≈0.4%; look up the exact value, don't trust this approximation). Repeat for an H17 config.
- Per-hand SD for standard BJ ≈ 1.15. Check it.
- Symmetry test: if the player is forced to mimic the PD's drawing rules and every resolution rule is symmetric, EV must be exactly 0.

### 4.5 Strategy layer (critical for CA BJ)
- Compute **player-optimal strategy per config** (total-dependent first, then composition-dependent for the first 2 cards) with the DP in §4.6. Output strategy charts as CSV.
- Bank-side EV must be reported against several **player profiles**:
  - optimal
  - Vegas basic strategy applied blindly (common: players don't adjust for 22 targets, jokers, or push-on-closer)
  - mimic the PD
  - never bust
  - a configurable empirical mix
- The gap between "optimal" and "realistic" is likely the biggest driver of real bank EV. Make it a headline output.

### 4.6 Exact BJ method (infinite deck first, then finite)
1. Dealer final-state distribution given up card (including joker states, "hard 21 via joker" terminal states, and 3-card-count tracking where the over-target pushes depend on card count) → a PMF over (total, #cards, soft/hard, natural flags).
2. Player stand EV vs. each dealer PMF using the config's resolution matrix (a function `resolve(player_state, dealer_state) -> payoff`).
3. Hit, double, split, surrender EVs by backward recursion over player states. Card-count tracking is needed where the rules reference it.
4. Finite shoe: composition-dependent recursion for the first-2-card × up-card cells; MC for the remainder.

---

## 5. Validation gates (CI must pass)
1. 3CP: all ✅ numbers in §2 to 4 decimals (HE) / 3 decimals (SD), single deck.
2. Baccarat: all ✅ numbers in §3.2 for 8D and 6D. Every cell of the covariance matrix within 1e-6 of `reference_values.json`.
3. Perfect Pairs: §4.3 values.
4. MC ↔ exact agreement within 3 SE at ≥1e8 rounds for each ✅ bet.
5. BJ Vegas anchor (§4.4) and the symmetry test.
6. Bank cap / action order: a unit test with hand-built rounds where truncation order changes the result.

## 6. Suggested repo layout and deliverables
```
cardsim/
  configs/{tcp,baccarat,bj}/*.yaml     # one per room/variant, with source + confirmed_on_felt
  engines/exact_{tcp,bac,bj}.py|.rs    # C/Rust where enumeration is heavy
  engines/mc.py                        # shoe, seats, fees, bank cap, action order
  strategy/bj_dp.py                    # optimal + player profiles
  risk/                                # cov aggregation, RoR, Kelly, session P&L
  oracle/                              # the verified scripts shipped with this spec
  tests/                               # gates from §5, reading reference_values.json
  reports/                             # per-config markdown/CSV: EV, SD, cov, per-hour, profile table
```
Deliverables:
- A CLI `cardsim run <config> --seats --bets --fees --hands-per-hour`.
- A per-config report.
- A table-level bank-EV calculator: input the action vector, output μ, σ, N0, RoR, and Kelly.

## 7. Sources
- Wizard of Odds — Three Card Poker (hand counts, ante/play return table, ante-bonus / Pair Plus / 6-Card Bonus tables, Q-6-4 strategy): https://wizardofodds.com/games/three-card-poker/
- Wizard of Odds — Baccarat side bets (Dragon Bonus, Dragon 7, Panda 8, pairs, Super 6): https://wizardofodds.com/games/baccarat/side-bets/
- Las Vegas Advisor — Dragon 7 7.61%, Panda 8 10.19%: https://www.lasvegasadvisor.com/question/ez-baccarat/
- CA BGC game-rule filings (index): https://www.oag.ca.gov/gambling/game
  - Hollywood Park (2urbo BJ, Pan 9, 21st C. Baccarat V10, No Bust 4.0a, Pure Spanish 21.5, fee schedules): https://www.oag.ca.gov/system/files/media/hollywood-park.pdf
  - Hustler (21st C. BJ, LA BJ, 21st C. Baccarat w/ jokers): https://oag.ca.gov/system/files/media/hustler-casino.pdf
  - Commerce (No Bust 21st C. BJ, 21st C. Baccarat): https://oag.ca.gov/system/files/media/commerce.pdf
  - Bicycle: https://oag.ca.gov/system/files/media/bicycle-casino.pdf
  - California Grand 3CP (Q-high qualify, Bonus Bet table, coverage/action order): https://oag.ca.gov/sites/all/files/agweb/pdfs/gambling/ca-grand-three-card-poker-rules.pdf
  - Crystal No Bust 21st C. BJ + Perfect Pairs + Buster: https://oag.ca.gov/sites/all/files/agweb/pdfs/gambling/crystal-no-bust-21st-cent-blackjack-perfect-pairs-rules.pdf
  - Deuce Lounge EZ Baccarat Panda 8 (settlement order by bet type): https://oag.ca.gov/sites/all/files/agweb/pdfs/gambling/deuce-lounge-ez-baccarat-panda-8.pdf
- Regulatory status: Darwin ruling 2026-06-30 (https://www.mto.com/achievement/mto-secures-victory-for-california-gaming-association-in-challenge-to-cardroom-regulations/); AG appeal 2026-07-17 (https://oag.ca.gov/news/press-releases/attorney-general-bonta-appeals-ruling-card-room-regulations-litigation)
