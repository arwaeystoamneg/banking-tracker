"""Three Card Poker Monte Carlo with CA player-dealer settlement.

Bet types per seat:
  0 ante_play   unit = Ante; result includes Play (1x Ante) and Ante Bonus; wager = 1 or 2
  1 pair_plus   on player's 3 cards
  2 six_card    6-Card Bonus, best 5 of player 3 + dealer 3
  3 ca_bonus    California Grand 'Bonus Bet' (mini-royal/SF/trips/str/flush/pair) on player's 3 cards
Strategies: 0 = Q-6-4 (optimal), 1 = mimic dealer (raise Q-high+), 2 = raise everything,
            3 = Q-6-4 plus raise Q-6-3 offsuit (optimal under player-wins-ties)
"""
import numpy as np
from numba import njit, prange
from .core import draw, start_round, settle, accumulate

BETS = [("ante_play", "Ante + Play + Ante Bonus, per unit Ante"),
        ("pair_plus", "Pair Plus"),
        ("six_card", "6-Card Bonus"),
        ("ca_bonus", "CA Grand Bonus Bet")]
NB = len(BETS)
BET_INDEX = {b[0]: i for i, b in enumerate(BETS)}


@njit(cache=True)
def _r(c):  # 0..12, 2 low ... A high
    r = c >> 2
    return 12 if r == 1 else r - 2


@njit(cache=True)
def score3(a, b, c, info):
    """Returns comparable score; info[0]=category (5 SF,4 trips,3 str,2 flush,1 pair,0 high),
    info[1]=1 if mini royal (A-K-Q suited), info[2..4]=sorted ranks desc."""
    x = _r(a); y = _r(b); z = _r(c)
    if y > x: x, y = y, x
    if z > x: x, z = z, x
    if z > y: y, z = z, y
    fl = (a & 3) == (b & 3) and (b & 3) == (c & 3)
    st = False
    hi = x
    if x == y + 1 and y == z + 1:
        st = True
    if x == 12 and y == 1 and z == 0:
        st = True
        hi = 1
    info[1] = 1 if (fl and x == 12 and y == 11 and z == 10) else 0
    info[2] = x; info[3] = y; info[4] = z
    base = 2197 * 13
    if st and fl:
        info[0] = 5; return 5 * base + hi
    if x == z:
        info[0] = 4; return 4 * base + x
    if st:
        info[0] = 3; return 3 * base + hi
    if fl:
        info[0] = 2; return 2 * base + x * 169 + y * 13 + z
    if x == y or y == z:
        p = y
        k = z if x == y else x
        info[0] = 1; return base + p * 13 + k
    info[0] = 0
    return x * 169 + y * 13 + z


@njit(cache=True)
def raises(info, strat, a, b, c):
    if info[0] > 0 or strat == 2:
        return True
    x = info[2]; y = info[3]; z = info[4]
    if strat == 1:
        return x >= 10
    if x > 10:
        return True
    if x < 10:
        return False
    if y > 4:
        return True
    if y < 4:
        return False
    if z >= 2:
        return True
    if strat == 3 and z == 1:  # Q-6-3, all suits different
        sa = a & 3; sb = b & 3; sc = c & 3
        return sa != sb and sb != sc and sa != sc
    return False


@njit(cache=True)
def six_cat(cards):
    """Best-5-of-6 category: 0 none, 1 trips, 2 straight, 3 flush, 4 FH, 5 quads, 6 SF, 7 royal."""
    rc = np.zeros(13, dtype=np.int64)
    sc = np.zeros(4, dtype=np.int64)
    sm = np.zeros(4, dtype=np.int64)
    m = 0
    for i in range(6):
        r = _r(cards[i]); su = cards[i] & 3
        rc[r] += 1; sc[su] += 1; sm[su] |= 1 << r; m |= 1 << r
    best = 0
    for su in range(4):
        if sc[su] >= 5:
            ext = (sm[su] << 1) | ((sm[su] >> 12) & 1)
            for top in range(12, 2, -1):
                need = 0x1F << (top + 1 - 4)
                if (ext & need) == need:
                    cat = 7 if top == 12 else 6
                    if cat > best:
                        best = cat
                    break
            if best < 3:
                best = 3
    q = 0; t = 0; p = 0
    for r in range(13):
        if rc[r] == 4: q += 1
        elif rc[r] == 3: t += 1
        elif rc[r] == 2: p += 1
    if q > 0 and best < 5:
        best = 5
    if (t >= 2 or (t >= 1 and p >= 1)) and best < 4:
        best = 4
    if best < 3:
        ext = (m << 1) | ((m >> 12) & 1)
        for top in range(12, 2, -1):
            need = 0x1F << (top + 1 - 4)
            if (ext & need) == need:
                best = 2
                break
    if best < 1 and t >= 1:
        best = 1
    return best


@njit(parallel=True, cache=True)
def run_chunks(shoe0, csm, cut, nchunks, rounds, seeds, nseats, strat, ab, pp, sixt, cab,
               pwt, qual_hi,
               btype, seat, amount, exposure, active, orders, rotate, mode, bank, pd_fee,
               sess_len, acc_sum, acc_sq, acc_w, acc_n, cov_sum, cov_x,
               bank_sum, bank_sq, sess_final, sess_min, ev_count, slot_sum, slot_sq, slot_w):
    nslots = btype.shape[0]
    for ch in prange(nchunks):
        s = seeds[ch].copy()
        shoe = shoe0.copy()
        pos = np.zeros(1, dtype=np.int64)
        pos[0] = 0 if csm else shoe.shape[0]
        ph = np.zeros((nseats, 3), dtype=np.int64)
        info = np.zeros(5, dtype=np.int64)
        dinfo = np.zeros(5, dtype=np.int64)
        six = np.zeros(6, dtype=np.int64)
        seat_r = np.zeros((nseats, NB))
        seat_w = np.ones((nseats, NB))
        res = np.zeros(nslots)
        wager = np.ones(nslots)
        out = np.zeros(nslots)
        s0 = np.zeros(NB)
        cum = 0.0; mn = 0.0; si = 0
        for t in range(rounds):
            start_round(shoe, pos, s, csm, cut)
            for i in range(nseats):
                for j in range(3):
                    ph[i, j] = draw(shoe, pos, s, csm)
            d0 = draw(shoe, pos, s, csm); d1 = draw(shoe, pos, s, csm); d2 = draw(shoe, pos, s, csm)
            ds = score3(d0, d1, d2, dinfo)
            dq = dinfo[0] > 0 or dinfo[2] >= qual_hi
            for i in range(nseats):
                ps = score3(ph[i, 0], ph[i, 1], ph[i, 2], info)
                cat = info[0]
                # ante/play
                if not raises(info, strat[i], ph[i, 0], ph[i, 1], ph[i, 2]):
                    v = -1.0
                    seat_w[i, 0] = 1.0
                else:
                    seat_w[i, 0] = 2.0
                    if not dq:
                        v = 1.0
                    elif ps > ds:
                        v = 2.0
                        ev_count[ch, 0] += 0.0
                    elif ps == ds:
                        v = 2.0 if pwt else 0.0
                    else:
                        v = -2.0
                    if cat == 5: v += ab[0]
                    elif cat == 4: v += ab[1]
                    elif cat == 3: v += ab[2]
                seat_r[i, 0] = v
                # pair plus: pp = [sf, trips, straight, flush, pair]
                if cat == 0:
                    seat_r[i, 1] = -1.0
                else:
                    seat_r[i, 1] = pp[5 - cat]
                # CA bonus: cab = [miniroyal, sf, trips, straight, flush, pair]
                if cat == 0:
                    seat_r[i, 3] = -1.0
                elif cat == 5 and info[1] == 1:
                    seat_r[i, 3] = cab[0]
                else:
                    seat_r[i, 3] = cab[6 - cat]
                # 6-card: sixt = [royal, sf, quads, fh, flush, straight, trips]
                six[0] = ph[i, 0]; six[1] = ph[i, 1]; six[2] = ph[i, 2]
                six[3] = d0; six[4] = d1; six[5] = d2
                c6 = six_cat(six)
                seat_r[i, 2] = -1.0 if c6 == 0 else sixt[7 - c6]
            for k in range(nslots):
                res[k] = seat_r[seat[k], btype[k]]
                wager[k] = seat_w[seat[k], btype[k]]
            if not dq:
                ev_count[ch, 1] += 1.0
            accumulate(ch, res, wager, active, btype, seat, NB, acc_sum, acc_sq, acc_w, acc_n,
                       cov_sum, cov_x, s0, slot_sum, slot_sq, slot_w)
            o = orders[(t % orders.shape[0]) if rotate else 0]
            bnet = settle(res, amount, exposure, o, mode, bank, out) - pd_fee
            bank_sum[ch] += bnet
            bank_sq[ch] += bnet * bnet
            if sess_len > 0:
                cum += bnet
                if cum < mn:
                    mn = cum
                if (t + 1) % sess_len == 0:
                    if si < sess_final.shape[1]:
                        sess_final[ch, si] = cum
                        sess_min[ch, si] = mn
                    si += 1
                    cum = 0.0; mn = 0.0
