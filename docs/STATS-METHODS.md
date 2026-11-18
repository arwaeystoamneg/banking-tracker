# Stats methods: read before any analysis of session results

Ray asked for this file (2026-11-17) because ad-hoc analyses kept slipping on the t-distribution.
For any one-off analysis, **import `scripts/stats_helpers.py`** instead of re-deriving formulas. Its
self-check (`python3 scripts/stats_helpers.py`) tests it against the t table below. The app itself uses
`t95()` in `src/lib/stats/resultStats.ts`.

## The model

Each finished session i has a result rᵢ = buy_out − buy_in and hours hᵢ. We assume rᵢ ≈ w·hᵢ + noise with
variance σ²·hᵢ: swings grow with √time. Everything below follows from that.

| Quantity | Formula | Notes |
|---|---|---|
| Win rate ŵ ($/h) | Σr / Σh | Not the average of per-session $/h. |
| SD per hour σ̂ | √( Σ (rᵢ − ŵhᵢ)² / hᵢ ÷ **(n − 1)** ) | n = **sessions**. One df is used up estimating ŵ. |
| Standard error of ŵ | σ̂ / √Σh | Σh = total hours. |
| CI for the true rate | ŵ ± **t₍n−1₎** · σ̂/√Σh | Never ±1.96 unless n is large (≥ 100). |
| t-stat vs rate w₀ | (ŵ − w₀) / (σ̂/√Σh) | p-value from **t₍n−1₎**, two-sided. |
| Percentile of actual total if true rate = w₀ | **T₍n−1₎** CDF of (Σr − w₀Σh) / (σ̂√Σh) | Not the normal Φ. This is the one that got missed. |
| CI for σ (normal theory) | σ̂·√(df/χ²₀.₉₇₅) to σ̂·√(df/χ²₀.₀₂₅), df = n − 1 | Too narrow with heavy tails, so also report the bootstrap. |
| SD per session | sample SD of rᵢ (n − 1) | A different thing from SD/hour. SD over a night of h hours ≈ σ̂·√h. |
| Per hand | ŵ/15, σ̂/√15 | Damon plays ~15 hands/h. Assumes independent hands; hands aren't recorded. |

## Rules that keep getting broken

1. **Use t, not z, whenever σ is estimated from the same data.** This applies to CIs, p-values,
   percentiles and "how many SDs from X". Degrees of freedom = **sessions − 1**.
2. **df is never hours or hands.** 2,828 hands from 45 sessions is df = 44. Hours set the scale (√Σh);
   sessions set the uncertainty in σ̂ (df).
3. **Divide by n − 1** in every variance estimated around an estimated mean or rate.
4. **Heavy tails:** report excess kurtosis of (rᵢ − ŵhᵢ)/√hᵢ. Above ~2, say the chi-square σ range is too narrow,
   give the bootstrap range (n ≥ ~15 only), and give the drop-one-session range.
5. **Small groups (n < 10):** label them low confidence, show drop-one ranges, and don't bootstrap (it's biased low).
6. **Unknown edge:** never present a win rate as known. Show its CI and t-stat. Risk-of-ruin and bankroll numbers
   take the edge as an *assumption* stated by the user, not a measured value.
7. **Risk of ruin ≈ exp(−2·EV·B/σ²)** assumes known EV, known σ and smooth normal swings. With fat tails and an
   estimated σ the real risk is higher, so present these as minimums. B for a target risk R: σ²·ln(1/R)/(2·EV).
   Kelly bank = σ²/EV. Subtract Damon's pay (~$75/h) from gross EV when Ray asks about his own bankroll.
8. **State the method in the answer:** n, df, which distribution, and weighted vs unweighted.

## What the app shows vs. a raw calculation

The Stats/Casinos/Trips cards (`computeResultStats`) differ from the raw formulas above in one way. A group with
**10 or fewer sessions** has its σ topped up to 10 sessions' worth with what similar-stakes sessions elsewhere
swing: k = 10 − (n − 1) borrowed, σ² = ((n − 1)·s² + k·σ₀²)/(n − 1 + k). The value is shown with "~". With 11+
sessions it's the group's own σ, so it matches a raw calculation. The hourly range still uses t with df = n − 1
(the group's own sessions). When comparing with the app, say which one you're quoting.

"Avg day" = timed hours ÷ distinct (person, session date) pairs.

## t table (two-sided 95%, `t_crit(df)`)

| df | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 12 | 15 | 20 | 22 | 25 | 30 | 40 | 44 | 60 | 120 | ∞ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t | 12.706 | 4.303 | 3.182 | 2.776 | 2.571 | 2.447 | 2.365 | 2.306 | 2.262 | 2.228 | 2.179 | 2.131 | 2.086 | 2.074 | 2.060 | 2.042 | 2.021 | 2.015 | 2.000 | 1.980 | 1.960 |

## Data hygiene

- **Use only finished sessions** (a buy-out plus readable time in and time out). A time out earlier than the time in
  means the session ran past midnight, so add 24 h.
- **Skip rows whose `session_id` cell isn't a `ses_…` id in column A.** Those are misaligned writes
  (see the Oct 30 sync bug).
- **Results are gross,** before Damon's pay.
- **Room groups Ray uses:** M8trix + Bay 101 together. Artichoke Joe's and Bicycle on their own. Multi-room sessions
  ("Hollywood Park | Commerce | Bicycle") belong to no single room.
- **Stakes changed:** buy-ins went from ~$8–10k (Aug) to $14–30k (Nov). Compare SD per dollar of buy-in when
  comparing periods or players.
