"""
Exact Ante/Play analysis of Three Card Poker for the banking app's EV calculator, two rule sets:

STANDARD (dealer's cards all face down): Ante, then Play = 1x Ante or fold. Dealer qualifies Queen-high.
  Not qualified: Ante wins 1:1, Play pushes. Qualified: higher hand wins Ante and Play 1:1, ties push.
  Ante Bonus paid on the Ante whenever the player plays: straight flush / trips / straight (table configurable).
  Anchor: 5/4/1 -> 3.3730% of Ante (2.0147% per total bet), raise 67.42%, SD 1.6393 (Wizard of Odds; cardsim).

FACE-UP (the version in the app's Games tab, gm_3cp): the player also sees one dealer card. No Ante Bonus.
  Not qualified: Play pushes and the player must still beat the dealer to win the Ante (loses it to a better
  dealer hand, pushes a tie). Qualified: as standard.
  No published anchor reproduces these rules (the app quoted 4.2964% / 49.516% raise, which no variant tried
  here gives), so the exact enumeration below IS the reference; the app's Monte Carlo is the second derivation.

Player styles: optimal (per hand; standard optimal = Q-6-4, face-up optimal is carried as one threshold per
up-card rank, which costs 0.002% of Ante), mimic (raise with Queen-high or better), raise_all.

Every deal is enumerated: standard 22,100 x 18,424 dealer hands; face-up 22,100 x 49 x 1,128.
Usage: ../.venv/bin/python tcp_faceup.py [out.json]
"""
import itertools
import json
import sys
import time

import numpy as np
from numba import njit, prange

# Cards 0..51: rank = c // 4 (0 = deuce ... 12 = ace), suit = c % 4.
RANKS = "23456789TJQKA"


def score3(cards):
    """3CP hand value, higher wins: category 5 SF, 4 trips, 3 straight, 2 flush, 1 pair, 0 high card, then
    kickers. A-2-3 is the lowest straight (counts as 3-high); A-K-Q the highest."""
    ranks = sorted((c // 4 for c in cards), reverse=True)
    flush = len({c % 4 for c in cards}) == 1
    a, b, c = ranks
    straight, top = False, a
    if a - b == 1 and b - c == 1:
        straight = True
    elif ranks == [12, 1, 0]:
        straight, top = True, 1
    if straight and flush:
        cat, key = 5, (top, 0, 0)
    elif a == b == c:
        cat, key = 4, (a, 0, 0)
    elif straight:
        cat, key = 3, (top, 0, 0)
    elif flush:
        cat, key = 2, (a, b, c)
    elif a == b or b == c:
        cat, key = 1, (b, c if a == b else a, 0)
    else:
        cat, key = 0, (a, b, c)
    return ((cat * 13 + key[0]) * 13 + key[1]) * 13 + key[2]


def code(cat, k1=0, k2=0, k3=0):
    return ((cat * 13 + k1) * 13 + k2) * 13 + k3


QUEEN_HIGH = code(0, 10)
Q64 = code(0, 10, 4, 2)
STRAIGHT, TRIPS, SF = code(3), code(4), code(5)


def describe(s):
    cat, rest = divmod(s, 13 ** 3)
    k1, rest = divmod(rest, 13 ** 2)
    k2, k3 = divmod(rest, 13)
    label = ["high", "pair", "flush", "straight", "trips", "straight flush"][cat]
    return f"{RANKS[k1]}-{RANKS[k2]}-{RANKS[k3]}" if cat == 0 else f"{label} {RANKS[k1]}"


def build():
    combos = list(itertools.combinations(range(52), 3))
    scores = np.array([score3(c) for c in combos], dtype=np.int64)
    hands = np.array(combos, dtype=np.int64)
    lookup = np.full((52, 52, 52), -1, dtype=np.int64)
    for i, c in enumerate(combos):
        for p in itertools.permutations(c):
            lookup[p] = i
    return hands, scores, lookup


@njit(parallel=True, cache=True)
def standard_play(hands, scores, qual):
    """Player's mean and mean-square result per Ante when PLAYING each hand (Ante Bonus excluded)."""
    n = hands.shape[0]
    ev = np.zeros(n)
    sq = np.zeros(n)
    for h in prange(n):
        a, b, c = hands[h, 0], hands[h, 1], hands[h, 2]
        ps = scores[h]
        t = 0.0
        s2 = 0.0
        k = 0
        for d in range(n):
            x, y, z = hands[d, 0], hands[d, 1], hands[d, 2]
            if x == a or x == b or x == c or y == a or y == b or y == c or z == a or z == b or z == c:
                continue
            ds = scores[d]
            if ds < qual:
                r = 1.0
            elif ps > ds:
                r = 2.0
            elif ps < ds:
                r = -2.0
            else:
                r = 0.0
            t += r
            s2 += r * r
            k += 1
        ev[h] = t / k
        sq[h] = s2 / k
    return ev, sq


@njit(parallel=True, cache=True)
def faceup_play(hands, scores, lookup, qual):
    """Player's mean and mean-square result per Ante when PLAYING hand h against up card u (NaN if u is in h)."""
    n = hands.shape[0]
    ev = np.full((n, 52), np.nan)
    sq = np.full((n, 52), np.nan)
    for h in prange(n):
        a, b, c = hands[h, 0], hands[h, 1], hands[h, 2]
        ps = scores[h]
        for u in range(52):
            if u == a or u == b or u == c:
                continue
            t = 0.0
            s2 = 0.0
            k = 0
            for x in range(52):
                if x == a or x == b or x == c or x == u:
                    continue
                for y in range(x + 1, 52):
                    if y == a or y == b or y == c or y == u:
                        continue
                    ds = scores[lookup[u, x, y]]
                    cmp = 1.0 if ps > ds else (-1.0 if ps < ds else 0.0)
                    r = 2.0 * cmp if ds >= qual else cmp
                    t += r
                    s2 += r * r
                    k += 1
            ev[h, u] = t / k
            sq[h, u] = s2 / k
    return ev, sq


def summarize(play, ev, sq, bonus=None):
    """Bank's view per Ante: edge, variance, raise rate, and per total bet. `bonus` adds the Ante Bonus to
    played hands (it doesn't depend on the dealer, so it shifts the mean and cross term exactly)."""
    if bonus is None:
        bonus = np.zeros_like(ev)
    played_mean = ev + bonus
    played_sq = sq + 2 * bonus * ev + bonus ** 2
    mean = np.where(play, played_mean, -1.0).mean()
    second = np.where(play, played_sq, 1.0).mean()
    raise_rate = float(play.mean())
    return {
        "house_edge_per_ante": float(-mean),
        "house_edge_per_total_bet": float(-mean / (1 + raise_rate)),
        "raise_rate": raise_rate,
        "variance_per_ante": float(second - mean ** 2),
        "sd_per_ante": float(np.sqrt(second - mean ** 2)),
    }


def main():
    t0 = time.time()
    hands, scores, lookup = build()
    out = {"score_encoding": "((cat*13+k1)*13+k2)*13+k3; cat 0 high,1 pair,2 flush,3 straight,4 trips,5 SF; rank 0=deuce..12=ace",
           "queen_high": QUEEN_HIGH, "q64": int(Q64), "standard": {}, "faceup": {}}

    ev, sq = standard_play(hands, scores, QUEEN_HIGH)
    styles = {"optimal_q64": scores >= Q64, "mimic": scores >= QUEEN_HIGH, "raise_all": np.ones(len(scores), bool)}
    exact_opt = ev > -1  # per-hand optimum ignoring the bonus; with a bonus only hands that are raised anyway get it
    for table in ([5, 4, 1], [4, 3, 1], [3, 2, 1], [0, 0, 0]):
        bonus = np.where(scores >= SF, table[0], np.where(scores >= TRIPS, table[1], np.where(scores >= STRAIGHT, table[2], 0))).astype(float)
        key = "/".join(map(str, table)) if any(table) else "none"
        out["standard"][key] = {name: summarize(p, ev, sq, bonus) for name, p in styles.items()}
        out["standard"][key]["true_optimal"] = summarize((ev + bonus) > -1, ev, sq, bonus)
    print("standard 5/4/1 optimal:", out["standard"]["5/4/1"]["optimal_q64"])
    print("standard Q-6-4 = true optimum:", bool(np.all((scores >= Q64) == exact_opt)))

    fev, fsq = faceup_play(hands, scores, lookup, QUEEN_HIGH)
    valid = ~np.isnan(fev)
    flat_ev, flat_sq = fev[valid], fsq[valid]
    hand_scores = np.broadcast_to(scores[:, None], fev.shape)[valid]
    up_rank = np.broadcast_to((np.arange(52) // 4)[None, :], fev.shape)[valid]
    thresholds = []
    for r in range(13):
        sel = up_rank == r
        gain = flat_ev[sel] + 1.0
        s = hand_scores[sel]
        order = np.argsort(-s, kind="stable")
        cum = np.cumsum(gain[order])
        ss = s[order]
        # Best threshold = the score at which the running gain (playing everything at or above it) peaks,
        # taken at the end of a run of equal scores.
        last_of_run = np.r_[ss[1:] != ss[:-1], True]
        i = int(np.argmax(np.where(last_of_run, cum, -np.inf)))
        thresholds.append(int(ss[i]))
    rule = hand_scores >= np.array(thresholds)[up_rank]
    out["faceup"] = {
        "true_optimal": summarize(flat_ev > -1, flat_ev, flat_sq),
        "optimal_threshold": summarize(rule, flat_ev, flat_sq),
        "mimic": summarize(hand_scores >= QUEEN_HIGH, flat_ev, flat_sq),
        "raise_all": summarize(np.ones_like(rule), flat_ev, flat_sq),
        "thresholds_by_up_rank_2_to_A": thresholds,
        "thresholds_described": {RANKS[r]: describe(t) for r, t in enumerate(thresholds)},
    }
    print("face-up true optimal:", out["faceup"]["true_optimal"])
    print("face-up threshold rule:", out["faceup"]["optimal_threshold"])
    print("thresholds:", out["faceup"]["thresholds_described"])
    print(f"{time.time() - t0:.1f}s")
    if len(sys.argv) > 1:
        json.dump(out, open(sys.argv[1], "w"), indent=1)


if __name__ == "__main__":
    main()
