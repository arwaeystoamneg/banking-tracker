# cardsim results

Generated from `reports/*.json`. HE = house edge (player's loss per unit bet). Bank = player-dealer P&L per round after the PD collection fee. ± = 95% CI.

## Baccarat validation: every bet, 8 decks, fresh shoe each coup (matches exact off-the-top math)
*100,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| banker_5pct | 1.0683% | 0.0182% | 0.9274 | 1.0579% | +1.12 |
| banker_ez | 1.0296% | 0.0184% | 0.9392 | 1.0183% | +1.20 |
| banker_super6 | 1.4696% | 0.0182% | 0.9296 | 1.4581% | +1.24 |
| player | 1.2244% | 0.0186% | 0.9511 | 1.2351% | -1.12 |
| tie_8 | 14.3436% | 0.0518% | 2.6411 | 14.3596% | -0.61 |
| tie_9 | 4.8263% | 0.0575% | 2.9345 | 4.8440% | -0.61 |
| dragon7 | 7.5868% | 0.1193% | 6.0857 | 7.6113% | -0.40 |
| panda8 | 10.2182% | 0.0930% | 4.7473 | 10.1876% | +0.64 |
| dragon_bonus_player | 2.6555% | 0.0485% | 2.4739 | 2.6517% | +0.15 |
| dragon_bonus_banker | 9.3965% | 0.0452% | 2.3042 | 9.3731% | +1.02 |
| lucky6 | 16.6616% | 0.0705% | 3.5960 | 16.6836% | -0.61 |
| player_pair | 10.3544% | 0.0618% | 3.1550 | 10.3614% | -0.22 |
| banker_pair | 10.3422% | 0.0618% | 3.1552 | 10.3614% | -0.61 |
| supreme7_mb01 | 7.7481% | 0.2111% | 10.7679 | 7.7797% | -0.29 |
| supreme7_mb02 | 7.2307% | 0.3776% | 19.2651 | 7.2911% | -0.31 |
| supreme7_mb03 | 9.3939% | 0.1867% | 9.5232 | 9.3966% | -0.03 |
| divine9 | 9.3204% | 0.0862% | 4.3986 | 9.3105% | +0.22 |
| eclipse | 2.9823% | 0.0474% | 2.4187 | 2.9664% | +0.66 |

**Bank:** EV/round +1.28 ± 0.01, SD/round 36.3, action/round 18, PD fee 0.00, **+7.10% of action**
N0 805 rounds · full-Kelly bankroll 1,030

## 3CP validation: 1 seat, single deck reshuffled every hand, 5-4-1 / 40-30-6-3-1
*100,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| ante_play | 3.3850% | 0.0321% | 1.6392 | 3.3730% | +0.73 |
| pair_plus | 7.2755% | 0.0559% | 2.8496 | 7.2760% | -0.02 |
| six_card | 8.5589% | 0.1077% | 5.4946 | 8.5610% | -0.04 |
| ca_bonus | 4.3608% | 0.0762% | 3.8883 | 4.3800% | -0.49 |

**Bank:** EV/round +0.24 ± 0.00, SD/round 9.7, action/round 4, PD fee 0.00, **+5.90% of action**
N0 1,676 rounds · full-Kelly bankroll 395
Events: dealer_not_qualify 30.4111%

## BJ engine check: standard Vegas 6D S17 DAS 3:2 no-surrender, Vegas basic strategy (expect ~0.4% HE)
*50,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| main | 0.3937% | 0.0320% | 1.1539 |  |  |
| perfect_pairs | 6.0650% | 0.1079% | 3.8927 | 6.1093% | -0.80 |

**Bank:** EV/round +0.06 ± 0.00, SD/round 4.1, action/round 2, PD fee 0.00, **+3.23% of action**
N0 4,018 rounds · full-Kelly bankroll 259
Events: pd_over_target 28.2037%, pd_natural 4.7510%

## CA no-collection EZ baccarat table, PD banking, 8-deck shoe
*20,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| banker_ez | 1.0129% | 0.0412% | 0.9393 | 1.0183% | -0.25 |
| player | 1.2419% | 0.0417% | 0.9512 | 1.2351% | +0.32 |
| tie_8 | 14.4389% | 0.1157% | 2.6398 | 14.3596% | +1.34 |
| dragon7 | 7.5530% | 0.2668% | 6.0868 | 7.6113% | -0.43 |
| panda8 | 10.2111% | 0.2081% | 4.7475 | 10.1876% | +0.22 |
| player_pair | 10.3374% | 0.1383% | 3.1552 | 10.3614% | -0.34 |
| banker_pair | 10.3884% | 0.1382% | 3.1544 | 10.3614% | +0.38 |
| supreme7_mb01 | 7.4550% | 0.4728% | 10.7875 | 7.7797% | -1.35 |
| divine9 | 9.1756% | 0.1930% | 4.4037 | 9.3105% | -1.37 |
| eclipse | 2.8882% | 0.1060% | 2.4197 | 2.9664% | -1.45 |

| Seat | Bet | Strategy | Amount | House edge | ±95% |
|---|---|---|---|---|---|
| 0 | banker_ez |  | 500 | 1.01% | 0.04% |
| 0 | dragon7 |  | 25 | 7.55% | 0.27% |
| 1 | player |  | 300 | 1.24% | 0.04% |
| 1 | panda8 |  | 25 | 10.21% | 0.21% |
| 2 | banker_ez |  | 200 | 1.01% | 0.04% |
| 2 | tie_8 |  | 10 | 14.44% | 0.12% |
| 2 | supreme7_mb01 |  | 10 | 7.46% | 0.47% |
| 3 | player |  | 200 | 1.24% | 0.04% |
| 3 | eclipse |  | 25 | 2.89% | 0.11% |
| 4 | banker_ez |  | 100 | 1.01% | 0.04% |
| 4 | player_pair |  | 10 | 10.34% | 0.14% |
| 4 | banker_pair |  | 10 | 10.39% | 0.14% |
| 5 | player |  | 150 | 1.24% | 0.04% |
| 5 | divine9 |  | 10 | 9.18% | 0.19% |
| 5 | supreme7_mb01 |  | 5 | 7.46% | 0.47% |

**Bank:** EV/round +26.89 ± 0.12, SD/round 280.7, action/round 1,580, PD fee 0.00, **+1.70% of action**
N0 109 rounds · full-Kelly bankroll 2,929 · RoR (Brownian) $5000: 3.3e-02, $10000: 1.1e-03, $20000: 1.2e-06, $40000: 1.4e-12
Per hour: EV +1,882, SD 2,348
Sessions of 350 rounds: median +9,615, 5th pct +470, 1st pct -3,620, P(losing session) 4.3%; P(drawdown ≥ B): $5000: 4.49%, $10000: 0.29%, $20000: 0.00%, $40000: 0.00%

## CA 3CP table, 6 seats, PD bank with CA Grand coverage rule
*20,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| ante_play | 4.1562% | 0.0736% | 1.6782 |  |  |
| pair_plus | 7.3285% | 0.1247% | 2.8456 | 7.2760% | +0.82 |
| six_card | 8.6790% | 0.2372% | 5.4121 | 8.5610% | +0.98 |

| Seat | Bet | Strategy | Amount | House edge | ±95% |
|---|---|---|---|---|---|
| 0 | ante_play | q64 | 100 | 3.43% | 0.07% |
| 0 | pair_plus | q64 | 25 | 7.38% | 0.12% |
| 1 | ante_play | mimic_dealer | 50 | 3.41% | 0.07% |
| 1 | pair_plus | mimic_dealer | 25 | 7.29% | 0.12% |
| 1 | six_card | mimic_dealer | 10 | 8.57% | 0.24% |
| 2 | ante_play | q64 | 200 | 3.44% | 0.07% |
| 3 | ante_play | raise_all | 25 | 7.75% | 0.08% |
| 3 | pair_plus | raise_all | 25 | 7.32% | 0.12% |
| 3 | six_card | raise_all | 5 | 8.69% | 0.24% |
| 4 | ante_play | mimic_dealer | 100 | 3.53% | 0.07% |
| 4 | pair_plus | mimic_dealer | 50 | 7.32% | 0.12% |
| 5 | ante_play | q64 | 75 | 3.39% | 0.07% |
| 5 | six_card | q64 | 5 | 8.78% | 0.23% |

**Bank:** EV/round +28.91 ± 0.27, SD/round 623.4, action/round 695, PD fee 2.00, **+4.16% of action**
N0 465 rounds · full-Kelly bankroll 13,444 · RoR (Brownian) $10000: 2.3e-01, $20000: 5.1e-02, $40000: 2.6e-03
Per hour: EV +1,301, SD 4,182
Sessions of 250 rounds: median +7,235, 5th pct -9,090, 1st pct -15,860, P(losing session) 22.9%; P(drawdown ≥ B): $10000: 11.93%, $20000: 0.76%, $40000: 0.00%
Events: dealer_not_qualify 30.4066%

## Hustler 21st Century BJ (target 22, joker+any = hard 21, JJ/AA/AJ = Natural 22, JJ pays 2:1) — UNCONFIRMED on felt
*20,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| main | 7.1760% | 0.0462% | 1.0541 |  |  |

| Seat | Bet | Strategy | Amount | House edge | ±95% |
|---|---|---|---|---|---|
| 0 | main | vegas_basic | 100 | 7.43% | 0.05% |
| 1 | main | vegas_shifted | 100 | 3.12% | 0.05% |
| 2 | main | mimic_dealer | 100 | 2.83% | 0.04% |
| 3 | main | never_bust | 100 | 14.78% | 0.04% |
| 4 | main | vegas_basic | 100 | 7.45% | 0.05% |
| 5 | main | vegas_basic | 100 | 7.44% | 0.05% |

**Bank:** EV/round +39.06 ± 0.19, SD/round 435.6, action/round 600, PD fee 4.00, **+6.51% of action**
N0 124 rounds · full-Kelly bankroll 4,858 · RoR (Brownian) $5000: 1.3e-01, $10000: 1.6e-02, $20000: 2.7e-04
Per hour: EV +2,343, SD 3,374
Sessions of 300 rounds: median +11,750, 5th pct -650, 1st pct -5,950, P(losing session) 6.0%; P(drawdown ≥ B): $5000: 10.87%, $10000: 1.12%, $20000: 0.00%
Events: pd_over_target 19.6092%, pd_natural 0.8702%

## Commerce No Bust 21st Century BJ (joker=1/11, JJ natural 2:1, BJ 6:5, PD 3-card 23-25 push) — UNCONFIRMED
*20,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| main | 2.6367% | 0.0468% | 1.0687 |  |  |

| Seat | Bet | Strategy | Amount | House edge | ±95% |
|---|---|---|---|---|---|
| 0 | main | vegas_basic | 100 | 1.04% | 0.05% |
| 1 | main | vegas_shifted | 100 | 0.99% | 0.05% |
| 2 | main | mimic_dealer | 100 | 4.66% | 0.04% |
| 3 | main | never_bust | 100 | 7.13% | 0.04% |
| 4 | main | vegas_basic | 100 | 1.02% | 0.05% |
| 5 | main | vegas_basic | 100 | 0.99% | 0.05% |

**Bank:** EV/round +11.82 ± 0.19, SD/round 442.0, action/round 600, PD fee 4.00, **+1.97% of action**
N0 1,398 rounds · full-Kelly bankroll 16,528 · RoR (Brownian) $5000: 5.5e-01, $10000: 3.0e-01, $20000: 8.9e-02
Per hour: EV +709, SD 3,424
Sessions of 300 rounds: median +3,560, 5th pct -8,980, 1st pct -14,140, P(losing session) 32.1%; P(drawdown ≥ B): $5000: 34.60%, $10000: 9.15%, $20000: 0.24%
Events: pd_over_target 27.8306%, pd_natural 5.7314%

## HPC No Bust 21st C. 4.0a APPROX (no jokers, A+10 natural 6:5, PD wins ties over, PD 3-card 23-25 push, 4+ card bust loses)
*20,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| main | 2.9250% | 0.0470% | 1.0716 |  |  |
| buster | 5.1029% | 0.0862% | 1.9672 |  |  |

| Seat | Bet | Strategy | Amount | House edge | ±95% |
|---|---|---|---|---|---|
| 0 | main | vegas_basic | 100 | 1.19% | 0.05% |
| 0 | buster | vegas_basic | 5 | 5.10% | 0.09% |
| 1 | main | vegas_shifted | 100 | 1.20% | 0.05% |
| 1 | buster | vegas_shifted | 5 | 5.10% | 0.09% |
| 2 | main | mimic_dealer | 100 | 5.48% | 0.04% |
| 2 | buster | mimic_dealer | 5 | 5.10% | 0.09% |
| 3 | main | never_bust | 100 | 7.34% | 0.04% |
| 3 | buster | never_bust | 5 | 5.10% | 0.09% |
| 4 | main | vegas_basic | 100 | 1.20% | 0.05% |
| 4 | buster | vegas_basic | 5 | 5.10% | 0.09% |
| 5 | main | vegas_basic | 100 | 1.15% | 0.05% |
| 5 | buster | vegas_basic | 5 | 5.10% | 0.09% |

**Bank:** EV/round +15.08 ± 0.21, SD/round 481.2, action/round 630, PD fee 4.00, **+2.39% of action**
N0 1,018 rounds · full-Kelly bankroll 15,353 · RoR (Brownian) $5000: 5.2e-01, $10000: 2.7e-01, $20000: 7.4e-02
Per hour: EV +905, SD 3,727
Sessions of 300 rounds: median +4,530, 5th pct -9,170, 1st pct -14,764, P(losing session) 29.3%; P(drawdown ≥ B): $5000: 35.70%, $10000: 10.37%, $20000: 0.35%
Events: pd_over_target 28.5732%, pd_natural 4.7457%

## Hustler LA Blackjack (6D + 4 jokers as 2/12, target 22, AA or joker+10 natural, PD wins 18 ties, PD H S18) — UNCONFIRMED
*20,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| main | 4.9806% | 0.0420% | 0.9581 |  |  |

| Seat | Bet | Strategy | Amount | House edge | ±95% |
|---|---|---|---|---|---|
| 0 | main | vegas_shifted | 100 | 2.68% | 0.04% |
| 1 | main | mimic_dealer | 100 | 1.82% | 0.04% |
| 2 | main | never_bust | 100 | 11.12% | 0.04% |
| 3 | main | vegas_basic | 100 | 4.30% | 0.04% |

**Bank:** EV/round +17.92 ± 0.13, SD/round 293.8, action/round 400, PD fee 2.00, **+4.48% of action**
N0 269 rounds · full-Kelly bankroll 4,815 · RoR (Brownian) $5000: 1.3e-01, $10000: 1.6e-02
Per hour: EV +1,075, SD 2,275
Sessions of 300 rounds: median +5,400, 5th pct -3,000, 1st pct -6,500, P(losing session) 14.3%; P(drawdown ≥ B): $5000: 8.06%, $10000: 0.36%
Events: pd_over_target 28.9667%, pd_natural 1.3229%

## Hustler 21st Century BJ, single seat, profile=vegas_basic
*20,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| main | 7.3847% | 0.0478% | 1.0911 |  |  |
| perfect_pairs | 7.6589% | 0.1702% | 3.8843 |  |  |

**Bank:** EV/round +0.15 ± 0.00, SD/round 4.1, action/round 2, PD fee 0.00, **+7.52% of action**
N0 729 rounds · full-Kelly bankroll 110
Events: pd_over_target 19.6397%, pd_natural 0.8675%

## Hustler 21st Century BJ, single seat, profile=vegas_shifted
*20,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| main | 3.1062% | 0.0501% | 1.1442 |  |  |
| perfect_pairs | 7.7520% | 0.1701% | 3.8820 |  |  |

**Bank:** EV/round +0.11 ± 0.00, SD/round 4.1, action/round 2, PD fee 0.00, **+5.43% of action**
N0 1,409 rounds · full-Kelly bankroll 153
Events: pd_over_target 19.6323%, pd_natural 0.8711%

## Hustler 21st Century BJ, single seat, profile=mimic_dealer
*20,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| main | 2.8199% | 0.0410% | 0.9362 |  |  |
| perfect_pairs | 7.4584% | 0.1704% | 3.8890 |  |  |

**Bank:** EV/round +0.10 ± 0.00, SD/round 4.0, action/round 2, PD fee 0.00, **+5.14% of action**
N0 1,535 rounds · full-Kelly bankroll 158
Events: pd_over_target 19.6175%, pd_natural 0.8726%

## Hustler 21st Century BJ, single seat, profile=never_bust
*20,000,000 rounds*

| Bet | House edge | ±95% | SD/unit | Exact HE | z |
|---|---|---|---|---|---|
| main | 14.7026% | 0.0415% | 0.9480 |  |  |
| perfect_pairs | 7.7493% | 0.1700% | 3.8799 |  |  |

**Bank:** EV/round +0.22 ± 0.00, SD/round 4.0, action/round 2, PD fee 0.00, **+11.23% of action**
N0 322 rounds · full-Kelly bankroll 72
Events: pd_over_target 19.6324%, pd_natural 0.8725%
