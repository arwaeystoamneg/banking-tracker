"""Unit tests: bank-cap settlement, evaluators, rule resolution. Run: python3 -m pytest -q tests"""
import numpy as np
from cardsim import core, tcp, blackjack as bj


def test_settle_unlimited():
    res = np.array([1.0, -1.0, 8.0]); amt = np.array([100.0, 50.0, 10.0])
    out = np.zeros(3)
    bank = core.settle(res, amt, np.ones(3), np.arange(3), 0, 0.0, out)
    assert np.allclose(out, [100, -50, 80]) and bank == -130


def test_settle_precover_truncates_in_action_order():
    # bank 150; exposures: slot0 100*1, slot1 100*1 -> only first fits; slot2 10*8=80 doesn't fit after slot0
    res = np.array([1.0, 1.0, 8.0]); amt = np.array([100.0, 100.0, 10.0]); expo = np.array([1.0, 1.0, 8.0])
    out = np.zeros(3)
    core.settle(res, amt, expo, np.array([0, 1, 2]), 1, 150.0, out)
    assert np.allclose(out, [100, 0, 0])
    core.settle(res, amt, expo, np.array([2, 1, 0]), 1, 150.0, out)  # order changes who gets action
    assert np.allclose(out, [0, 0, 80])


def test_settle_collect_then_pay():
    # losers 50 collected, bank 100 -> pool 150; winners in order: slot2 wants 80, slot0 wants 100 -> gets 70
    res = np.array([1.0, -1.0, 8.0]); amt = np.array([100.0, 50.0, 10.0])
    out = np.zeros(3)
    bank = core.settle(res, amt, np.ones(3), np.array([2, 0, 1]), 2, 100.0, out)
    assert np.allclose(out, [70, -50, 80]) and abs(bank + 100) < 1e-9  # bank loses exactly its stake


def test_tcp_ranks():
    info = np.zeros(5, dtype=np.int64)
    c = lambda r, s: r * 4 + s
    a23 = tcp.score3(c(1, 0), c(2, 1), c(3, 2), info); assert info[0] == 3
    akq = tcp.score3(c(1, 0), c(13, 1), c(12, 2), info); assert info[0] == 3 and akq > a23
    mr = tcp.score3(c(1, 0), c(13, 0), c(12, 0), info); assert info[0] == 5 and info[1] == 1
    trips = tcp.score3(c(2, 0), c(2, 1), c(2, 2), info); assert info[0] == 4 and mr > trips
    # Q-6-4 raises, Q-6-3 folds under strategy 0
    tcp.score3(c(12, 0), c(6, 1), c(4, 2), info); assert tcp.raises(info, 0, c(12, 0), c(6, 1), c(4, 2))
    tcp.score3(c(12, 0), c(6, 1), c(3, 2), info); assert not tcp.raises(info, 0, c(12, 0), c(6, 1), c(3, 2))


def test_six_card_categories():
    c = lambda r, s: r * 4 + s
    royal = np.array([c(1, 0), c(13, 0), c(12, 0), c(11, 0), c(10, 0), c(2, 1)])
    assert tcp.six_cat(royal) == 7
    wheel_sf = np.array([c(1, 2), c(2, 2), c(3, 2), c(4, 2), c(5, 2), c(9, 1)])
    assert tcp.six_cat(wheel_sf) == 6
    two_trips = np.array([c(5, 0), c(5, 1), c(5, 2), c(9, 0), c(9, 1), c(9, 2)])
    assert tcp.six_cat(two_trips) == 4


def _ri(**kw):
    ri = np.zeros(bj.NRI, dtype=np.int64)
    ri[bj.TARGET] = 22; ri[bj.BOTH_OVER] = 1; ri[bj.MUST_STAND_GE] = 99
    for k, v in kw.items():
        ri[getattr(bj, k)] = v
    return ri


def test_bj_resolution_matrix():
    ri = _ri()
    # (pt, pn, pnat, ppay, dt, dn, dnat, dhard3)
    assert bj._resolve(20, 2, 0, 0, 19, 2, 0, True, ri) == 1
    assert bj._resolve(24, 3, 0, 0, 20, 2, 0, True, ri) == -1   # player over, PD under
    assert bj._resolve(20, 2, 0, 0, 25, 3, 0, True, ri) == 1    # PD over, player under
    assert bj._resolve(23, 3, 0, 0, 25, 3, 0, True, ri) == 0    # both over, player closer -> push
    assert bj._resolve(25, 3, 0, 0, 25, 3, 0, True, ri) == -1   # PD wins ties over
    assert bj._resolve(20, 2, 1, 2.0, 22, 2, 0, True, ri) == 2  # natural pays
    ri2 = _ri(TARGET=21, BOTH_OVER=0, D3_PUSH_LO=23, D3_PUSH_HI=25, D3_PUSH_PMIN=23)
    assert bj._resolve(24, 3, 0, 0, 24, 3, 0, True, ri2) == 0   # Commerce 3-card 23-25 push
    assert bj._resolve(22, 3, 0, 0, 24, 3, 0, True, ri2) == -1  # player 22 excluded
    ri3 = _ri(D_WINS_TIE_TOTAL=18)
    assert bj._resolve(18, 2, 0, 0, 18, 3, 0, True, ri3) == -1


def test_bj_joker_modes():
    st = np.zeros((1, 5), dtype=np.int64)
    ri = _ri(JOKER_MODE=1)
    bj._add(0 * 4, st, 0, ri); bj._add(5 * 4, st, 0, ri)
    assert bj._best(st, 0, 22) == (21, False)
    st[:] = 0; ri = _ri(JOKER_MODE=3)
    bj._add(0, st, 0, ri); bj._add(10 * 4, st, 0, ri)
    assert bj._best(st, 0, 22) == (22, True)  # joker 12 + ten
    nat = np.zeros((5, 2)); nat[bj.J10] = (1, 1.0)
    assert bj._natural(0, 40, nat)[0] == 1


if __name__ == "__main__":
    import sys
    fns = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for f in fns:
        f(); print("ok", f.__name__)
