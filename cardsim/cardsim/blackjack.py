"""Blackjack-family Monte Carlo (California cardroom variants) with a rule matrix.

Rule ints (RI) index constants below. Naturals table NAT[5,2] = (rank, payout) for combos
JJ (two jokers), AJ (ace+joker), AA, A10 (ace + ten-value), J10 (joker + ten-value); rank 0 = not natural.
Strategy array STRAT[seat, 3, 34, 11] int8:
   [.,0,total,up] hard action, [.,1,total,up] soft action, [.,2,pairclass,up] 1=split
   actions: 0 S, 1 H, 2 D else H, 3 D else S, 5 R else H, 6 R else S
   up index: 0 joker, 1 ace, 2..9, 10 ten-value
Bet types per seat: 0 main, 1 perfect_pairs, 2 buster
"""
import numpy as np
from numba import njit, prange
from .core import draw, start_round, settle, accumulate

TARGET, JOKER_MODE, DEALER_STAND, DEALER_HIT_SOFT, BOTH_OVER, DAS, MAX_HANDS, SPLIT_ACES_ONE, \
    RESPLIT_ACES, SURRENDER, SURR_MAX, DOUBLE_ANY, DOUBLE_NO_JOKER, SPLIT_NO_JOKER, PEEK, \
    NO_OPT_JOKER_UP, JOKER_UP_ENDS, OVER_NCARDS_LOSE, D3_PUSH_LO, D3_PUSH_HI, D_WINS_TIE_TOTAL, \
    MUST_HIT_LE, MUST_STAND_GE, SPLIT_BY_VALUE, D3_PUSH_PMIN, NO_SPLIT_ACES = range(26)
NRI = 26
JJ, AJ, AA, A10, J10 = range(5)

BETS = [("main", "Main wager, per unit initial bet"),
        ("perfect_pairs", "Perfect Pairs 25/12/6 (configurable)"),
        ("buster", "Buster: PD goes over target, pays by # of PD cards")]
NB = len(BETS)
BET_INDEX = {b[0]: i for i, b in enumerate(BETS)}
MAXH = 4


@njit(cache=True)
def _rank(c):
    return c >> 2


@njit(cache=True)
def _add(card, st, i, ri):
    """Add card to hand i of state arrays st (hard, softc, ncards, fixed, jok)."""
    r = card >> 2
    st[i, 2] += 1
    if r == 0:  # joker
        st[i, 4] += 1
        m = ri[JOKER_MODE]
        if m == 1:
            st[i, 3] = 1
        elif m == 2:
            st[i, 0] += 1
            st[i, 1] += 1
        elif m == 3:
            st[i, 0] += 2
            st[i, 1] += 1
        else:
            st[i, 3] = 1
    elif r == 1:
        st[i, 0] += 1
        st[i, 1] += 1
    elif r >= 10:
        st[i, 0] += 10
    else:
        st[i, 0] += r


@njit(cache=True)
def _best(st, i, T):
    """Returns (total, soft). fixed21 hands count 21 hard."""
    if st[i, 3] == 1:
        return 21, False
    h = st[i, 0]
    if st[i, 1] > 0 and h + 10 <= T:
        return h + 10, True
    return h, False


@njit(cache=True)
def _vclass(c):
    r = c >> 2
    if r >= 10:
        return 10
    return r  # 0 joker, 1 ace, 2..9


@njit(cache=True)
def _natural(c1, c2, nat):
    a = c1 >> 2; b = c2 >> 2
    ta = a >= 10; tb = b >= 10
    combo = -1
    if a == 0 and b == 0:
        combo = JJ
    elif (a == 0 and b == 1) or (a == 1 and b == 0):
        combo = AJ
    elif a == 1 and b == 1:
        combo = AA
    elif (a == 1 and tb) or (b == 1 and ta):
        combo = A10
    elif (a == 0 and tb) or (b == 0 and ta):
        combo = J10
    if combo < 0:
        return 0, 0.0
    return nat[combo, 0], nat[combo, 1]


@njit(cache=True)
def _resolve(pt, pn, pnat, ppay, dt, dn, dnat, dhard3, ri):
    if pnat > 0 or dnat > 0:
        if pnat > dnat:
            return ppay
        if pnat < dnat:
            return -1.0
        return 0.0
    T = ri[TARGET]
    pov = pt > T
    dov = dt > T
    if not pov and not dov:
        if pt > dt:
            return 1.0
        if pt < dt:
            return -1.0
        if ri[D_WINS_TIE_TOTAL] > 0 and pt == ri[D_WINS_TIE_TOTAL]:
            return -1.0
        return 0.0
    if pov and not dov:
        return -1.0
    if dov and not pov:
        return 1.0
    # both over
    if ri[OVER_NCARDS_LOSE] > 0 and pn >= ri[OVER_NCARDS_LOSE]:
        return -1.0
    if ri[D3_PUSH_LO] > 0 and dn == 3 and dhard3 and ri[D3_PUSH_LO] <= dt <= ri[D3_PUSH_HI] \
            and pt >= ri[D3_PUSH_PMIN]:
        return 0.0
    mode = ri[BOTH_OVER]
    if mode == 0:
        return -1.0
    if mode == 1:
        return 0.0 if pt < dt else -1.0
    if pt < dt:
        return 1.0
    if pt == dt:
        return 0.0
    return -1.0


@njit(cache=True)
def _pp(c1, c2, ppt):
    """Perfect pairs: ppt = [perfect, colored, mixed]. Jokers never pair."""
    a = c1 >> 2; b = c2 >> 2
    if a == 0 or b == 0 or a != b:
        return -1.0
    sa = c1 & 3; sb = c2 & 3
    if sa == sb:
        return ppt[0]
    if (sa < 2) == (sb < 2):
        return ppt[1]
    return ppt[2]


@njit(cache=True)
def play_round(shoe, pos, s, csm, ri, nat, strat, nseats, ppt, bust_t, seat_r, seat_w, evc):
    T = ri[TARGET]
    # initial deal: each seat 2 cards, dealer up + hole (dealt in rotation)
    p1 = np.zeros(nseats, dtype=np.int64)
    p2 = np.zeros(nseats, dtype=np.int64)
    for i in range(nseats):
        p1[i] = draw(shoe, pos, s, csm)
    up = draw(shoe, pos, s, csm)
    for i in range(nseats):
        p2[i] = draw(shoe, pos, s, csm)
    hole = draw(shoe, pos, s, csm)
    upc = _vclass(up)
    dnat, _dpay = _natural(up, hole, nat)
    dst = np.zeros((1, 5), dtype=np.int64)
    _add(up, dst, 0, ri)
    _add(hole, dst, 0, ri)
    joker_up = (up >> 2) == 0
    ends = joker_up and ri[JOKER_UP_ENDS] == 1
    noopt = joker_up and ri[NO_OPT_JOKER_UP] == 1
    peek_end = ri[PEEK] == 1 and dnat > 0
    st = np.zeros((MAXH, 5), dtype=np.int64)
    c1 = np.zeros(MAXH, dtype=np.int64)
    bet = np.zeros(MAXH)
    surr = np.zeros(MAXH, dtype=np.int64)
    fromsplit = np.zeros(MAXH, dtype=np.int64)
    acesplit = np.zeros(MAXH, dtype=np.int64)
    hstore_t = np.zeros((nseats, MAXH), dtype=np.int64)
    hstore_n = np.zeros((nseats, MAXH), dtype=np.int64)
    hstore_nat = np.zeros((nseats, MAXH), dtype=np.int64)
    hstore_pay = np.zeros((nseats, MAXH))
    hstore_bet = np.zeros((nseats, MAXH))
    hstore_surr = np.zeros((nseats, MAXH), dtype=np.int64)
    nh_seat = np.zeros(nseats, dtype=np.int64)
    for i in range(nseats):
        seat_r[i, 1] = _pp(p1[i], p2[i], ppt)
        for h in range(MAXH):
            for k in range(5):
                st[h, k] = 0
            bet[h] = 0.0; surr[h] = 0; fromsplit[h] = 0; acesplit[h] = 0
        nh = 1
        _add(p1[i], st, 0, ri); _add(p2[i], st, 0, ri)
        c1[0] = p1[i]
        bet[0] = 1.0
        pnat, ppay = _natural(p1[i], p2[i], nat)
        hstore_nat[i, 0] = pnat
        hstore_pay[i, 0] = ppay
        second = np.zeros(MAXH, dtype=np.int64)
        second[0] = p2[i]
        h = 0
        while h < nh:
            if h > 0:
                hstore_nat[i, h] = 0
            # split hands need their second card
            if st[h, 2] == 1:
                cc = draw(shoe, pos, s, csm)
                second[h] = cc
                _add(cc, st, h, ri)
            if not (ends or peek_end or (h == 0 and pnat > 0)):
                while True:
                    if st[h, 3] == 1:
                        break
                    tot, soft = _best(st, h, T)
                    if tot >= T:
                        break
                    if acesplit[h] == 1 and ri[SPLIT_ACES_ONE] == 1:
                        break
                    two = st[h, 2] == 2
                    can_opt = two and not noopt
                    # split?
                    if can_opt and nh < ri[MAX_HANDS] and nh < MAXH:
                        a = c1[h]; b = second[h]
                        same = (a >> 2) == (b >> 2) if ri[SPLIT_BY_VALUE] == 0 else _vclass(a) == _vclass(b)
                        isjk = (a >> 2) == 0 or (b >> 2) == 0
                        aces = (a >> 2) == 1
                        ok = same and not (isjk and ri[SPLIT_NO_JOKER] == 1) and \
                            not (aces and fromsplit[h] == 1 and ri[RESPLIT_ACES] == 0) and \
                            not (aces and ri[NO_SPLIT_ACES] == 1)
                        if ok and strat[i, 2, _vclass(a), upc] == 1:
                            # new hand nh gets card b
                            for k in range(5):
                                st[h, k] = 0
                                st[nh, k] = 0
                            _add(a, st, h, ri)
                            _add(b, st, nh, ri)
                            c1[nh] = b
                            bet[nh] = 1.0
                            fromsplit[h] = 1; fromsplit[nh] = 1
                            if aces:
                                acesplit[h] = 1; acesplit[nh] = 1
                            nh += 1
                            cc = draw(shoe, pos, s, csm)
                            second[h] = cc
                            _add(cc, st, h, ri)
                            continue
                    act = strat[i, 1, tot, upc] if soft else strat[i, 0, tot, upc]
                    can_d = can_opt and (fromsplit[h] == 0 or ri[DAS] == 1) and ri[DOUBLE_ANY] == 1 and \
                        not (st[h, 4] > 0 and ri[DOUBLE_NO_JOKER] == 1)
                    can_r = can_opt and fromsplit[h] == 0 and ri[SURRENDER] == 1 and tot <= ri[SURR_MAX]
                    if act == 2:
                        act = 4 if can_d else 1
                    elif act == 3:
                        act = 4 if can_d else 0
                    elif act == 5:
                        act = 7 if can_r else 1
                    elif act == 6:
                        act = 7 if can_r else 0
                    # cardroom must-hit / must-stand constraints
                    if tot <= ri[MUST_HIT_LE] and (act == 0 or act == 7):
                        act = 1
                    if (not soft) and tot >= ri[MUST_STAND_GE] and act != 7:
                        act = 0
                    if act == 0:
                        break
                    if act == 7:
                        surr[h] = 1
                        break
                    if act == 4:
                        bet[h] = 2.0
                        _add(draw(shoe, pos, s, csm), st, h, ri)
                        break
                    _add(draw(shoe, pos, s, csm), st, h, ri)
            tot, soft = _best(st, h, T)
            hstore_t[i, h] = tot
            hstore_n[i, h] = st[h, 2]
            hstore_bet[i, h] = bet[h]
            hstore_surr[i, h] = surr[h]
            h += 1
        nh_seat[i] = nh
    # dealer play
    if not (ends or peek_end):
        while True:
            if dst[0, 3] == 1 or dnat > 0:
                break
            tot, soft = _best(dst, 0, T)
            if tot < ri[DEALER_STAND] or (tot == ri[DEALER_STAND] and soft and ri[DEALER_HIT_SOFT] == 1):
                _add(draw(shoe, pos, s, csm), dst, 0, ri)
            else:
                break
    dt, dsoft = _best(dst, 0, T)
    dn = dst[0, 2]
    dhard3 = not dsoft
    if dt > T:
        evc[0] += 1.0
    if dnat > 0:
        evc[1] += 1.0
    # buster side bet
    if dt > T and dnat == 0:
        idx = dn if dn < 8 else 8
        bv = bust_t[idx]
    else:
        bv = -1.0
    for i in range(nseats):
        tot_r = 0.0
        tot_w = 0.0
        for h in range(nh_seat[i]):
            b = hstore_bet[i, h]
            tot_w += b
            if hstore_surr[i, h] == 1:
                tot_r += -0.5 * b
                continue
            if peek_end and hstore_nat[i, h] == 0:
                tot_r += -1.0 * b
                continue
            v = _resolve(hstore_t[i, h], hstore_n[i, h], hstore_nat[i, h], hstore_pay[i, h],
                         dt, dn, dnat, dhard3, ri)
            tot_r += v * b
        seat_r[i, 0] = tot_r
        seat_w[i, 0] = tot_w
        seat_r[i, 2] = bv


@njit(parallel=True, cache=True)
def run_chunks(shoe0, csm, cut, nchunks, rounds, seeds, nseats, ri, nat, strat, ppt, bust_t,
               btype, seat, amount, exposure, active, orders, rotate, mode, bank, pd_fee,
               sess_len, acc_sum, acc_sq, acc_w, acc_n, cov_sum, cov_x,
               bank_sum, bank_sq, sess_final, sess_min, ev_count, slot_sum, slot_sq, slot_w):
    nslots = btype.shape[0]
    for ch in prange(nchunks):
        s = seeds[ch].copy()
        shoe = shoe0.copy()
        pos = np.zeros(1, dtype=np.int64)
        pos[0] = 0 if csm else shoe.shape[0]
        seat_r = np.zeros((nseats, NB))
        seat_w = np.ones((nseats, NB))
        res = np.zeros(nslots)
        wager = np.ones(nslots)
        out = np.zeros(nslots)
        s0 = np.zeros(NB)
        evc = np.zeros(4)
        cum = 0.0; mn = 0.0; si = 0
        for t in range(rounds):
            start_round(shoe, pos, s, csm, cut)
            play_round(shoe, pos, s, csm, ri, nat, strat, nseats, ppt, bust_t, seat_r, seat_w, evc)
            for k in range(nslots):
                res[k] = seat_r[seat[k], btype[k]]
                wager[k] = seat_w[seat[k], btype[k]]
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
        for q in range(2):
            ev_count[ch, q] += evc[q]
