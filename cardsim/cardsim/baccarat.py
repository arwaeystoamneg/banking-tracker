"""Baccarat Monte Carlo (punto banco draw rules) with CA player-dealer settlement.

All bet types resolve on the same coup; a table is a list of slots (seat, bet type, amount).
"""
import numpy as np
from numba import njit, prange
from .core import draw, start_round, settle, accumulate, rng_next

BETS = [
    # name, max payout per unit (bank exposure), description
    ("banker_5pct", 1, "Banker pays 0.95"),
    ("banker_ez", 1, "Banker pays 1:1, push when Banker wins with 3-card 7 (EZ / Fortune 7 / CA default)"),
    ("banker_super6", 1, "Banker pays 1:1, but 1:2 when Banker wins with 6"),
    ("player", 1, "Player 1:1"),
    ("tie_8", 8, "Tie 8:1"),
    ("tie_9", 9, "Tie 9:1"),
    ("dragon7", 40, "Dragon 7 / Sun 7 / Lucky 7: Banker wins with 3-card 7, 40:1"),
    ("panda8", 25, "Panda 8 / Moon 8: Player wins with 3-card 8, 25:1"),
    ("dragon_bonus_player", 30, "Dragon Bonus Player 30/10/6/4/2/1, natural win 1, natural tie push"),
    ("dragon_bonus_banker", 30, "Dragon Bonus Banker"),
    ("lucky6", 20, "Lucky 6: Banker wins with 6; 2-card 12:1, 3-card 20:1"),
    ("player_pair", 11, "First two Player cards same rank, 11:1"),
    ("banker_pair", 11, "First two Banker cards same rank, 11:1"),
    ("supreme7_mb01", 200, "Supreme 7 PT MB-01: both hands 3-card 7 = 200:1, both 2-card 7 = 50:1"),
    ("supreme7_mb02", 400, "Supreme 7 PT MB-02: both 3-card 7 = 400:1, both 2-card 7 loses"),
    ("supreme7_mb03", 100, "Supreme 7 PT MB-03: both 2-card 7 = 100:1, both 3-card 7 loses"),
    ("divine9", 75, "Divine 9: both hands 3-card 9 = 75:1, exactly one = 10:1"),
    ("eclipse", 6, "Eclipse: any Sun 7 / Moon 8 / Supreme 7 / Divine 9 event, 6:1"),
]
NB = len(BETS)
BET_INDEX = {b[0]: i for i, b in enumerate(BETS)}
EXPOSURE = np.array([b[1] for b in BETS], dtype=np.float64)


@njit(cache=True)
def _val(c):
    r = c >> 2
    return r if r < 10 else 0


@njit(cache=True)
def _db(win, margin, nat, tie):
    if nat and tie:
        return 0.0
    if not win:
        return -1.0
    if nat:
        return 1.0
    if margin == 9:
        return 30.0
    if margin == 8:
        return 10.0
    if margin == 7:
        return 6.0
    if margin == 6:
        return 4.0
    if margin == 5:
        return 2.0
    if margin == 4:
        return 1.0
    return -1.0


@njit(cache=True)
def play_coup(shoe, pos, s, csm, r):
    """Deal one coup; fill r[NB] with unit results."""
    p1 = draw(shoe, pos, s, csm)
    b1 = draw(shoe, pos, s, csm)
    p2 = draw(shoe, pos, s, csm)
    b2 = draw(shoe, pos, s, csm)
    P = (_val(p1) + _val(p2)) % 10
    B = (_val(b1) + _val(b2)) % 10
    np_, nb = 2, 2
    nat = P >= 8 or B >= 8
    if not nat:
        if P <= 5:
            p3 = _val(draw(shoe, pos, s, csm))
            P = (P + p3) % 10
            np_ = 3
            if (B <= 2) or (B == 3 and p3 != 8) or (B == 4 and 2 <= p3 <= 7) or \
               (B == 5 and 4 <= p3 <= 7) or (B == 6 and (p3 == 6 or p3 == 7)):
                B = (B + _val(draw(shoe, pos, s, csm))) % 10
                nb = 3
        elif B <= 5:
            B = (B + _val(draw(shoe, pos, s, csm))) % 10
            nb = 3
    bw = B > P
    pw = P > B
    tie = P == B
    sun7 = bw and nb == 3 and B == 7
    moon8 = pw and np_ == 3 and P == 8
    s7_3 = P == 7 and B == 7 and np_ == 3 and nb == 3
    s7_2 = P == 7 and B == 7 and np_ == 2 and nb == 2
    d9p = np_ == 3 and P == 9
    d9b = nb == 3 and B == 9
    # main
    r[0] = 0.95 if bw else (-1.0 if pw else 0.0)
    r[1] = (0.0 if sun7 else 1.0) if bw else (-1.0 if pw else 0.0)
    r[2] = (0.5 if B == 6 else 1.0) if bw else (-1.0 if pw else 0.0)
    r[3] = 1.0 if pw else (-1.0 if bw else 0.0)
    r[4] = 8.0 if tie else -1.0
    r[5] = 9.0 if tie else -1.0
    r[6] = 40.0 if sun7 else -1.0
    r[7] = 25.0 if moon8 else -1.0
    r[8] = _db(pw, P - B, nat, tie)
    r[9] = _db(bw, B - P, nat, tie)
    r[10] = ((12.0 if nb == 2 else 20.0) if (bw and B == 6) else -1.0)
    r[11] = 11.0 if (p1 >> 2) == (p2 >> 2) else -1.0
    r[12] = 11.0 if (b1 >> 2) == (b2 >> 2) else -1.0
    r[13] = 200.0 if s7_3 else (50.0 if s7_2 else -1.0)
    r[14] = 400.0 if s7_3 else -1.0
    r[15] = 100.0 if s7_2 else -1.0
    r[16] = 75.0 if (d9p and d9b) else (10.0 if (d9p or d9b) else -1.0)
    r[17] = 6.0 if (sun7 or moon8 or s7_3 or s7_2 or d9p or d9b) else -1.0


@njit(parallel=True, cache=True)
def run_chunks(shoe0, csm, cut, nchunks, rounds, seeds,
               btype, seat, amount, exposure, active, orders, rotate, mode, bank, pd_fee,
               sess_len, acc_sum, acc_sq, acc_w, acc_n, cov_sum, cov_x,
               bank_sum, bank_sq, sess_final, sess_min, ev_count, slot_sum, slot_sq, slot_w):
    nslots = btype.shape[0]
    for ch in prange(nchunks):
        s = seeds[ch].copy()
        shoe = shoe0.copy()
        pos = np.zeros(1, dtype=np.int64)
        pos[0] = shoe.shape[0]  # force shuffle on first round for shoe mode
        if csm:
            pos[0] = 0
        r = np.zeros(NB)
        res = np.zeros(nslots)
        wager = np.ones(nslots)
        out = np.zeros(nslots)
        s0 = np.zeros(NB)
        cum = 0.0
        mn = 0.0
        si = 0
        for t in range(rounds):
            start_round(shoe, pos, s, csm, cut)
            play_coup(shoe, pos, s, csm, r)
            for k in range(nslots):
                res[k] = r[btype[k]]
            accumulate(ch, res, wager, active, btype, seat, NB, acc_sum, acc_sq, acc_w, acc_n,
                       cov_sum, cov_x, s0, slot_sum, slot_sq, slot_w)
            # event counters (for checking exact probabilities)
            for b in range(NB):
                if r[b] > 0:
                    ev_count[ch, b] += 1.0
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
                    cum = 0.0
                    mn = 0.0
