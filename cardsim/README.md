# cardsim — Monte Carlo EV/SD for CA player-dealer games

> **Claude Code: start with `HANDOFF.md`.**

Three Card Poker, Baccarat (including **Supreme 7**, Divine 9, Eclipse, Dragon 7, Panda 8, and other side bets), and California blackjack variants. Results are reported from both seats: each bet's EV, SD and house edge, plus **bank (player-dealer) P&L** after collection fees, the bank cap and action order.

```bash
pip install numba numpy            # numba >= 0.60
python3 -m cardsim.run configs/bac_ca_table.json              # one config
python3 -m cardsim.run configs/*.json --rounds 1e7 --seed 7   # override size / seed
PYTHONPATH=. python3 tests/test_core.py                       # unit tests
python3 validate.py                                           # MC vs exact gates (slow: ~15 min)
```
Reports print to stdout and are saved as JSON in `reports/`. Speed on one core: roughly 250–400k rounds/s, scaling across cores via `chunks`.

## Layout
| Path | What |
|---|---|
| `cardsim/core.py` | xoshiro256** RNG, shoe/CSM dealing, bank-cap `settle()`, accumulators |
| `cardsim/baccarat.py` | coup engine, 18 bet types (`BETS` list has payouts/exposures) |
| `cardsim/tcp.py` | 3CP engine: ante/play + ante bonus, Pair Plus, 6-Card Bonus, CA Grand Bonus; 4 strategies |
| `cardsim/blackjack.py` | rule-matrix BJ engine: jokers (fixed-21 / 1-11 / 2-12), target 21/22, natural table, over-target resolution, PD 3-card push windows, splits/doubles/surrender, Perfect Pairs, Buster |
| `cardsim/strategies.py` | BJ player profiles: `vegas_basic`, `vegas_shifted`, `mimic_dealer`, `never_bust` |
| `cardsim/run.py` | config loader, runner, report |
| `oracle/` | exact enumeration scripts (ground truth); `bac_exact.py` covers every baccarat bet incl. Supreme 7 |
| `reference_values.json` | exact values the MC is tested against |
| `configs/` | validation configs + CA table configs |

## Config essentials
```jsonc
{
 "game": "baccarat" | "tcp" | "blackjack",
 "decks": 8, "jokers_per_deck": 0, "jokers_total": 0,
 "shuffle": "csm" | "shoe", "penetration": 0.85,      // csm = fresh shoe every round
 "rounds": 1e8, "seed": 1, "chunks": 8, "hands_per_hour": 60,
 "table": {
   "seats": [{"bets": {"banker_ez": 500, "supreme7_mb01": 10}, "strategy": "..."}],
   "bank_mode": "unlimited" | "precover" | "collect_then_pay", "bank": 20000,
   "action_order": "seat" | "bet_type", "bet_type_priority": ["player","banker_ez","tie_8", "..."],
   "rotate_button": true,
   "fees": {"pd_per_round": 2.0, "player_per_seat": 1.0}   // or "pd_tiers": [[0,2],[301,4],...]
 },
 "session": {"rounds": 300, "bankrolls": [5000, 10000]},
 "reference": "baccarat_exact/8_decks"                    // or "reference_inline": {"bet": house_edge}
}
```
**Bank modes:**
- `precover` is the CA Grand rule: walking the action order, a bet has action only if cumulative amount × max payout still fits in the bank.
- `collect_then_pay`: collect all losers, then pay winners in action order until the pool runs out.

Check which one each room actually uses.

**3CP strategies:** `q64` (optimal), `mimic_dealer`, `raise_all`, `q64_pwt` (optimal when player wins ties).

**BJ profiles are behaviors, not optimal play.** No profile here is optimal for CA rules. Deriving optimal strategy per config is SPEC §4.6, and it's the next build.

## Supreme 7 (Galaxy Gaming, Eternal Baccarat)
- Wins when **both** hands are 2-card 7s or **both** are 3-card 7s. A mixed result (one 2-card 7, one 3-card 7) loses.
- Paytables from Colorado Rule 28 (operator picks one):

| Bet name | Both 3-card 7 | Both 2-card 7 | Exact HE 8D | 6D |
|---|---|---|---|---|
| `supreme7_mb01` | 200 | 50 | **7.780%** | 7.779% |
| `supreme7_mb02` | 400 | lose | 7.291% | 7.318% |
| `supreme7_mb03` | lose | 100 | 9.397% | 9.369% |

- P(both 3-card 7) = 0.0023119; P(both 2-card 7) = 0.0089706 (8D).
- SD per unit: 10.77 / 19.26 / 9.52. These are very high-variance bets for a bank to carry; see the bank SD in `bac_ca_table` output.
- Same family: Divine 9 (75/10) 9.31%; Eclipse (6:1 on any Sun 7 / Moon 8 / Supreme 7 / Divine 9 event) **2.97%**. Eclipse is the cheapest of the Eternal side bets for the player.

## Known limits / to confirm
- **BJ room rules come from OCR'd BGC filings, and several contradict themselves.** Each `bj_*` config name says UNCONFIRMED. Fix the config, not the code.
- **The joker-as-hit-card treatment in `fixed21` mode is an assumption:** a joker anywhere makes the hand a fixed hard 21.
- The **"no peek"** default for CA games means doubled and split bets lose in full to a PD natural.
- **SE for pooled multi-seat bets** uses rounds (conservative), because seats share the dealer hand.
- **Not modeled:** Commerce 21st Century Baccarat player options, Hustler joker baccarat, Pan 9, 2urbo, Pure 21.5, insurance, and Second Chance. Stubs belong in new modules following the same pattern.
