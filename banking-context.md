# Domain context: California cardroom banking

**Purpose of this document.** You are working on UI for an app used by a private player-banker in California cardrooms. This explains the domain well enough that you can make good layout, hierarchy, and affordance decisions without guessing. Read it before touching the interface — most of the design mistakes available here come from assuming this is a Las Vegas casino app. It is not.

---

## 1. Why "banking" exists at all

California Penal Code §330 prohibits **house-banked** games. A licensed cardroom cannot take a stake in the outcome of a hand. It cannot win when you lose.

So California cardrooms run **player-banked** games. Every hand has a **player-dealer** (also called *the bank* or *the button*) — a seated participant who covers every other player's wager at that table. If the players collectively win the round, the bank pays out of its own money. If they lose, the bank collects. The cardroom itself is neutral; it makes money by charging a **collection** (a flat fee per hand) from each seat, win or lose.

The button **rotates**. It is offered to each seat in order, typically for two hands, then passes on. Most recreational players decline it — covering a full table requires more cash than they carry. Whoever is willing and funded takes it.

That gap is the business. A funded person who takes the button every time it comes around, and who plays the banker's side correctly, is running a small positive-expectation operation.

**Two ways to do it:**

- **Solo banking** — an individual sits down, takes the button when offered, pays the collection like anyone else. No license required. This is what the app's user does.
- **TPPPS** (Third Party Provider of Proposition Player Services) — a licensed corporation that contracts with the cardroom to bank games continuously and professionally. Licensed by the California Bureau of Gambling Control. TPPPS crews are physically present at most tables and are the solo banker's main competition for button share.

---

## 2. Where the money comes from

The banker's edge is **structural**, not a rake. It comes from rule asymmetries baked into each game's filed rules:

- Players act first and lose busts outright before the dealer acts.
- The player-dealer wins ties in some games.
- Specific push rules — e.g. a Banker three-card 7 in 21st Century Baccarat pushes one betting line and wins against the other. In that game roughly 2.2% of hands carry the entire edge.

Against that edge sits the **collection**, paid every hand regardless of outcome. Edges here are small — typically 1–2% of action — so the fee is a large fraction of gross profit, not a rounding error.

A second, separate source of profit is **leak**: the amount real players lose by deviating from optimal play. In games with a genuine decision (Two Way Winner, Ultimate Texas Hold'em) leak can exceed the structural edge. Leak is measured empirically, not derived.

**Filed rules are public.** Every California cardroom game has rules and a collection schedule filed with the Bureau of Gambling Control under a **GEGA number** (e.g. `GEGA-004413`). These are the authoritative source for any game's mechanics. The app stores them.

---

## 3. The quantities that matter

This is the vocabulary the UI must express precisely.

| Term | Meaning |
|---|---|
| **TTA** | Total Table Action — the sum of all wagers the bank is covering on a hand. The denominator for most edge figures. |
| **Edge** | The banker's expected return. Small (~1–2%). **Always signed and always relative to a stated base.** |
| **Exposure multiple** | Bankroll needed per dollar of action. Baccarat ≈ 1.0×. Blackjack variants ≈ 2.5–3.0×. Two Way Winner ≈ 4–5×. This determines what the bank can actually sit at. |
| **Collection / fee** | Per-hand charge. Either flat or **tiered** by action level. |
| **Fee cliff** | A tier boundary where a tiny increase in action triggers a fee jump. Marginal rates at a cliff can exceed 100% — one real schedule charges +$6 on +$5 of additional action. Knowing where the boundary sits is an operational decision made at the table. |
| **Settlement order** | The fixed sequence in which wagers are paid: base wagers first, then bonus/side bets in a specified order. **This matters because an underfunded bank pays in order until the money runs out.** A side bet that settles last may effectively never be booked. |
| **Imbalance (d)** | In two-sided games, the difference between money on each side. Risk scales with imbalance; the fee scales with total. A balanced table is a good table. |
| **Leak** | Player deviation from optimal, in % of their action. Measured, not derived. |
| **Kelly / risk of ruin** | Standard bankroll sizing. The relevant framing is always *bankroll vs. exposure*, never bankroll in isolation. |
| **Rotation share** | How often the button actually reaches you — depends on table size, TPPPS presence, and how many seats decline. |

### The unit trap — read this twice

The single most common error in this domain is quoting an edge against the wrong base. "2%" can mean:

- 2% of **TTA**
- 2% of **base action** (excluding side bets)
- 2% of **antes posted** — and some games require *two* antes plus a Play wager, so this base is 2–4× smaller than TTA

The same underlying edge can be quoted as 0.5% or 2.0% depending on the denominator. **A number without its base is not a number.** Any UI element showing an edge must show what it's a percentage *of*, in the same visual unit, non-truncated, non-tooltip. Do not abbreviate `+1.123% of TTA balanced` down to `+1.12%` to make a card fit — restructure the card instead.

---

## 4. Data confidence is a first-class property

Much of the data in this app is **not verified**. It exists in three states, and they are routinely mixed within a single record:

1. **Derived from filed rules** — authoritative, has a GEGA number.
2. **Standard published figures** — reliable for the base game, but the California variant's rules may differ.
3. **Placeholder or estimate** — flagged with `VERIFY`, a plausible range, or an explicit "unsolved."

Records carry a `verified` boolean, and prose fields contain inline `VERIFY` markers and hedged ranges.

**Design consequence:** unverified numbers must be visually distinguishable from verified ones at a glance, not on inspection. The user makes money decisions from this screen. A confident-looking estimate is worse than no estimate. Do not "clean up" hedged strings into crisp-looking figures — the hedging is the information. Never let a UI refactor drop a `VERIFY` flag, a range, or a source note.

**Never invent a number.** If a field is empty, render the empty state. Do not fill gaps with plausible values from general gambling knowledge.

---

## 5. Physical context of use

Design for the actual moment of use:

- **On a phone, at a table, in low light, one-handed.** Dark UI is a functional requirement, not a style choice.
- **Lookups are seconds long.** The realistic query is "the button is coming to me at this table — what's the fee tier here, what's my exposure multiple, is there a tail side bet I can't cover?" Everything needed for that decision should be reachable without deep navigation.
- **Data entry happens later**, off the floor, with time and both hands. Entry and editing flows can be dense and thorough; lookup flows cannot.
- **Scanning across games** matters as much as reading one. Comparing exposure multiples or fee structures across a room's offerings is a real task.
- The user is quantitatively sophisticated. Do not oversimplify, do not add explanatory hand-holding, do not round for readability. Do make dense information legible.

---

## 6. Misconceptions to avoid

You will pattern-match to casino apps. These are the specific ways that goes wrong:

- **This is not house-banked gambling.** There is no "house edge" in the Vegas sense. The user *is* the bank, temporarily, by rotation.
- **The fee is not a rake.** It is a fixed per-hand charge unrelated to pot size or outcome, and it is paid by seats, including the bank.
- **The user is not a gambler seeking a game.** They are running an operation with a bankroll, an exposure model, and a fee structure. Frame accordingly — no luck imagery, no win/loss celebration states, no red/green emotional coding of outcomes. Green and red should encode *sign of edge* or *verified vs unverified*, consistently, and nothing else.
- **Side bets are a liability, not a feature.** From the bank's side, a 200:1 side bet is tail exposure that can exceed the entire bankroll on one hand. Paytables should read as risk disclosure, not as prizes. The max-exposure figure is often more important than the top payout.
- **Bigger action is not straightforwardly better.** More action means more fee revenue but also more required coverage, and past a cliff the marginal fee can be punitive.

---

## 7. Quick glossary

- **Bank / button / player-dealer** — the rotating seat covering all wagers.
- **Collection** — the cardroom's per-hand fee.
- **BGC / GEGA number** — California Bureau of Gambling Control filing identifier for a game's rules.
- **TPPPS** — licensed corporate banking service; the professional competition.
- **TTA** — total table action.
- **Coverage** — whether the bank has enough money to pay all winning wagers this hand.
- **Route election** — in Two Way Winner, the player's choice of which game their two cards play as. A free option held by the player, which widens edge dispersion.
- **Session** — one continuous stretch at a table; the unit of PnL tracking and of tax accounting.