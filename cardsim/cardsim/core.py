"""Shared numba core: RNG, shoe handling, CA bank-cap settlement, accumulators.

Card encoding: code = rank*4 + suit. rank 1=A ... 10, 11=J, 12=Q, 13=K. rank 0 = joker.
"""
import numpy as np
from numba import njit

# ---------------------------------------------------------------- RNG (xoshiro256**)
@njit(cache=True, inline="always")
def _rotl(x, k):
    return (x << np.uint64(k)) | (x >> np.uint64(64 - k))


@njit(cache=True)
def rng_next(s):
    result = _rotl(s[1] * np.uint64(5), 7) * np.uint64(9)
    t = s[1] << np.uint64(17)
    s[2] ^= s[0]
    s[3] ^= s[1]
    s[1] ^= s[2]
    s[0] ^= s[3]
    s[2] ^= t
    s[3] = _rotl(s[3], 45)
    return result


@njit(cache=True)
def rng_below(s, n):
    """Uniform int in [0, n). 53-bit float method; bias < 2^-40 for n < 2^13."""
    u = (rng_next(s) >> np.uint64(11)) * (1.0 / 9007199254740992.0)
    return int(u * n)


def make_seeds(seed, n):
    """Independent xoshiro states via numpy SeedSequence."""
    ss = np.random.SeedSequence(seed)
    out = np.zeros((n, 4), dtype=np.uint64)
    for i, child in enumerate(ss.spawn(n)):
        out[i] = child.generate_state(4, dtype=np.uint64)
        if not out[i].any():
            out[i, 0] = 1
    return out


# ---------------------------------------------------------------- shoe
def build_shoe(decks, jokers_per_deck=0, remove_ranks=()):
    cards = []
    for _ in range(decks):
        for r in range(1, 14):
            if r in remove_ranks:
                continue
            for s in range(4):
                cards.append(r * 4 + s)
        for j in range(jokers_per_deck):
            cards.append(0 * 4 + (j % 4))
    return np.array(cards, dtype=np.int64)


@njit(cache=True)
def shuffle(shoe, s):
    n = shoe.shape[0]
    for i in range(n - 1, 0, -1):
        j = rng_below(s, i + 1)
        t = shoe[i]
        shoe[i] = shoe[j]
        shoe[j] = t


@njit(cache=True)
def draw(shoe, pos, s, csm):
    """Draw one card. pos is a 1-element array (next index).
    csm=True: partial Fisher-Yates from the remaining part of the full shoe; pos reset each round
    by the caller, so every round is dealt from a complete, freshly-shuffled shoe."""
    i = pos[0]
    if csm:
        j = i + rng_below(s, shoe.shape[0] - i)
        t = shoe[i]
        shoe[i] = shoe[j]
        shoe[j] = t
    pos[0] = i + 1
    return shoe[i]


@njit(cache=True)
def start_round(shoe, pos, s, csm, cut):
    if csm:
        pos[0] = 0
    elif pos[0] >= cut:
        shuffle(shoe, s)
        pos[0] = 0


# ---------------------------------------------------------------- settlement
@njit(cache=True)
def settle(res, amount, exposure, order, mode, bank, out):
    """Player net money per slot after the player-dealer bank cap.
    res: unit results (per 1 unit of base amount); amount: money per slot;
    exposure: max payout per unit (for precover); order: slots in action order.
    mode 0 unlimited; 1 precover (CA Grand: walk action order, a slot has action only if
    cumulative amount*exposure fits in bank); 2 collect_then_pay (collect all losers, then pay
    winners in action order until the pool runs out; partial pay on the last, rest no action).
    Returns bank net (= -sum(out))."""
    n = res.shape[0]
    tot = 0.0
    if mode == 0:
        for k in range(n):
            out[k] = res[k] * amount[k]
            tot += out[k]
        return -tot
    if mode == 1:
        cum = 0.0
        for k in range(n):
            out[k] = 0.0
        for i in range(order.shape[0]):
            k = order[i]
            if amount[k] <= 0:
                continue
            need = amount[k] * exposure[k]
            if cum + need <= bank + 1e-9:
                cum += need
                out[k] = res[k] * amount[k]
                tot += out[k]
        return -tot
    # mode 2
    pool = bank
    for k in range(n):
        out[k] = 0.0
        v = res[k] * amount[k]
        if v < 0:
            out[k] = v
            pool -= v
            tot += v
    for i in range(order.shape[0]):
        k = order[i]
        v = res[k] * amount[k]
        if v > 0:
            pay = v if v <= pool else pool
            out[k] = pay
            pool -= pay
            tot += pay
    return -tot


# ---------------------------------------------------------------- accumulation
@njit(cache=True)
def accumulate(ch, res, wager, active, btype, seat, nb, acc_sum, acc_sq, acc_w, acc_n,
               cov_sum, cov_x, s0vec, slot_sum, slot_sq, slot_w):
    """Pool unit results by bet type over all seats where the slot is active.
    cov_x accumulates outer products of seat-0 result vector (bet types) for the covariance."""
    n = res.shape[0]
    for b in range(nb):
        s0vec[b] = 0.0
    for k in range(n):
        if active[k] == 0:
            continue
        b = btype[k]
        v = res[k]
        slot_sum[ch, k] += v
        slot_sq[ch, k] += v * v
        slot_w[ch, k] += wager[k]
        acc_sum[ch, b] += v
        acc_sq[ch, b] += v * v
        acc_w[ch, b] += wager[k]
        acc_n[ch, b] += 1.0
        if seat[k] == 0:
            s0vec[b] = v
    for a in range(nb):
        cov_sum[ch, a] += s0vec[a]
        for b in range(nb):
            cov_x[ch, a, b] += s0vec[a] * s0vec[b]
