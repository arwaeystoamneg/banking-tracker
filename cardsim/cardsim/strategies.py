"""Blackjack player strategy profiles -> int8 arrays [3, 34, 11].

Up-card columns: 0 joker, 1 ace, 2..9, 10 ten-value. Actions: 0 S, 1 H, 2 D/H, 3 D/S, 5 R/H, 6 R/S.
Profiles are the *behavior* being simulated. None of them is claimed optimal for CA rules;
deriving optimal play per config is a separate job (SPEC §4.6).
"""
import numpy as np

S, H, DH, DS, RH, RS = 0, 1, 2, 3, 5, 6


def _up_cols(joker_as="ace"):
    """Map strategy-chart columns (2..10, 'A') -> our 11 up indices."""
    return joker_as


def vegas_basic(surrender=True, joker_as="ace"):
    """Standard 4-8 deck, dealer S17, DAS basic strategy (total-dependent), target 21."""
    hard = np.full((34, 11), H, dtype=np.int8)
    soft = np.full((34, 11), H, dtype=np.int8)
    pair = np.zeros((34, 11), dtype=np.int8)

    def cols(lo, hi):  # dealer up values lo..hi where ace=11
        out = []
        for u in range(lo, hi + 1):
            out.append(1 if u == 11 else u)
        return out
    allc = cols(2, 11)
    for t in range(17, 34):
        hard[t, :] = S
    for t in range(13, 17):
        for u in cols(2, 6):
            hard[t, u] = S
    for u in cols(4, 6):
        hard[12, u] = S
    for u in cols(2, 10):
        hard[11, u] = DH
    for u in cols(2, 9):
        hard[10, u] = DH
    for u in cols(3, 6):
        hard[9, u] = DH
    if surrender:
        for u in cols(9, 11):
            hard[16, u] = RH
        hard[15, 10] = RH
    # soft totals (A+x): soft 13..21
    for t in range(19, 34):
        soft[t, :] = S
    for u in cols(5, 6):
        soft[13, u] = DH; soft[14, u] = DH
    for u in cols(4, 6):
        soft[15, u] = DH; soft[16, u] = DH
    for u in cols(3, 6):
        soft[17, u] = DH
    for u in allc:
        soft[18, u] = S
    for u in cols(3, 6):
        soft[18, u] = DS
    for u in cols(9, 11):
        soft[18, u] = H
    # pairs (DAS), index by value class 1=A..10
    for u in allc:
        pair[1, u] = 1; pair[8, u] = 1
    for u in cols(2, 6) + cols(8, 9):
        pair[9, u] = 1
    for u in cols(2, 7):
        pair[7, u] = 1; pair[3, u] = 1; pair[2, u] = 1
    for u in cols(2, 6):
        pair[6, u] = 1
    for u in cols(5, 6):
        pair[4, u] = 1
    # joker up column: treat like the chosen column
    src = {"ace": 1, "ten": 10}[joker_as]
    hard[:, 0] = hard[:, src]; soft[:, 0] = soft[:, src]; pair[:, 0] = pair[:, src]
    return np.stack([hard, soft, pair])


def shifted(base, shift):
    """Re-index a target-21 chart for target 21+shift (treat total t as t-shift)."""
    out = base.copy()
    for k in (0, 1):
        for t in range(34):
            src = t - shift
            out[k, t] = base[k, src] if 0 <= src < 34 else (S if src >= 34 else H)
    return out


def mimic_dealer(stand=17, hit_soft=True):
    hard = np.full((34, 11), H, dtype=np.int8)
    soft = np.full((34, 11), H, dtype=np.int8)
    hard[stand:, :] = S
    soft[stand + (1 if hit_soft else 0):, :] = S
    return np.stack([hard, soft, np.zeros((34, 11), dtype=np.int8)])


def never_bust(target=21):
    hard = np.full((34, 11), S, dtype=np.int8)
    hard[: target - 9, :] = H          # hit only when no card can take you over
    soft = np.full((34, 11), H, dtype=np.int8)
    soft[18:, :] = S
    return np.stack([hard, soft, np.zeros((34, 11), dtype=np.int8)])


def build(profile, target=21, surrender=True, dealer_stand=17, dealer_hit_soft=True, joker_as="ace"):
    """profile names:
    vegas_basic          Vegas chart applied as-is (what many CA players actually do)
    vegas_shifted        Vegas chart re-indexed by (target-21): a 'smarter' player in a 22 game
    mimic_dealer         hit/stand like the PD, no doubles/splits
    never_bust           stand on any hand that could go over target with one card
    """
    if profile == "vegas_basic":
        return vegas_basic(surrender, joker_as)
    if profile == "vegas_shifted":
        return shifted(vegas_basic(surrender, joker_as), target - 21)
    if profile == "mimic_dealer":
        return mimic_dealer(dealer_stand, dealer_hit_soft)
    if profile == "never_bust":
        return never_bust(target)
    raise ValueError(f"unknown profile {profile}")
