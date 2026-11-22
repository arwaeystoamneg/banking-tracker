"""Config-driven runner: python -m cardsim.run configs/<file>.json [--rounds N] [--seed S] [--out DIR]"""
import argparse, json, math, os, sys, time
import numpy as np
from . import core, baccarat, tcp, blackjack, strategies

BANK_MODES = {"unlimited": 0, "precover": 1, "collect_then_pay": 2}


def _orders(slots, nseats, how):
    """Action-order arrays, one per button position (rotation)."""
    orders = []
    for btn in range(nseats):
        seat_rank = {s: (s - btn) % nseats for s in range(nseats)}
        if how == "bet_type":
            key = lambda k: (slots[k][3], seat_rank[slots[k][0]])  # type priority then seat
        else:
            key = lambda k: (seat_rank[slots[k][0]], slots[k][3])
        orders.append(sorted(range(len(slots)), key=key))
    return np.array(orders, dtype=np.int64)


def build_table(cfg, bet_index, exposure_of):
    t = cfg["table"]
    seats = t["seats"]
    pri = t.get("bet_type_priority", list(bet_index.keys()))
    slots = []  # (seat, btype, amount, priority)
    for si, seat in enumerate(seats):
        for name, amt in seat["bets"].items():
            if name not in bet_index:
                raise ValueError(f"unknown bet {name}; valid: {list(bet_index)}")
            slots.append((si, bet_index[name], float(amt), pri.index(name) if name in pri else 99))
    btype = np.array([s[1] for s in slots], dtype=np.int64)
    seat = np.array([s[0] for s in slots], dtype=np.int64)
    amount = np.array([s[2] for s in slots], dtype=np.float64)
    active = (amount > 0).astype(np.int64)
    exposure = np.array([exposure_of(s[1]) for s in slots], dtype=np.float64)
    orders = _orders(slots, len(seats), t.get("action_order", "seat"))
    return dict(btype=btype, seat=seat, amount=amount, active=active, exposure=exposure,
                orders=orders, rotate=bool(t.get("rotate_button", True)),
                mode=BANK_MODES[t.get("bank_mode", "unlimited")], bank=float(t.get("bank", 1e18)),
                nseats=len(seats))


def pd_fee(cfg, total_action):
    f = cfg["table"].get("fees", {})
    if "pd_tiers" in f:  # [[min_action, fee], ...] ascending
        fee = 0.0
        for lo, v in f["pd_tiers"]:
            if total_action >= lo:
                fee = v
        return float(fee)
    return float(f.get("pd_per_round", 0.0))


def alloc(nchunks, nb, nsess, nslots=1):
    z = lambda *sh: np.zeros(sh)
    return dict(acc_sum=z(nchunks, nb), acc_sq=z(nchunks, nb), acc_w=z(nchunks, nb), acc_n=z(nchunks, nb),
                cov_sum=z(nchunks, nb), cov_x=z(nchunks, nb, nb), bank_sum=z(nchunks), bank_sq=z(nchunks),
                sess_final=np.full((nchunks, max(nsess, 1)), np.nan),
                sess_min=np.full((nchunks, max(nsess, 1)), np.nan), ev_count=z(nchunks, max(nb, 4)),
                slot_sum=z(nchunks, nslots), slot_sq=z(nchunks, nslots), slot_w=z(nchunks, nslots))


def run(cfg, rounds=None, seed=None):
    game = cfg["game"]
    rounds = int(float(rounds or cfg.get("rounds", 1e7)))
    seed = int(seed if seed is not None else cfg.get("seed", 1))
    nchunks = int(cfg.get("chunks", 8))
    per = max(1, rounds // nchunks)
    total = per * nchunks
    seeds = core.make_seeds(seed, nchunks)
    csm = cfg.get("shuffle", "csm") == "csm"
    decks = int(cfg.get("decks", 8))
    shoe = core.build_shoe(decks, int(cfg.get("jokers_per_deck", 0)), tuple(cfg.get("remove_ranks", [])))
    if cfg.get("jokers_total"):
        shoe = np.concatenate([shoe, np.arange(int(cfg["jokers_total"]), dtype=np.int64) % 4])
    cut = int(len(shoe) * float(cfg.get("penetration", 0.85)))
    sess = cfg.get("session", {})
    sess_len = int(sess.get("rounds", 0))
    nsess = per // sess_len if sess_len else 0

    if game == "baccarat":
        mod = baccarat
        tb = build_table(cfg, baccarat.BET_INDEX, lambda b: baccarat.EXPOSURE[b])
        A = alloc(nchunks, mod.NB, nsess, len(tb["btype"]))
        fee = pd_fee(cfg, tb["amount"].sum())
        t0 = time.time()
        mod.run_chunks(shoe, csm, cut, nchunks, per, seeds, tb["btype"], tb["seat"], tb["amount"],
                       tb["exposure"], tb["active"], tb["orders"], tb["rotate"], tb["mode"], tb["bank"],
                       fee, sess_len, A["acc_sum"], A["acc_sq"], A["acc_w"], A["acc_n"], A["cov_sum"],
                       A["cov_x"], A["bank_sum"], A["bank_sq"], A["sess_final"], A["sess_min"], A["ev_count"],
                       A["slot_sum"], A["slot_sq"], A["slot_w"])
    elif game == "tcp":
        mod = tcp
        ab = np.array(cfg.get("ante_bonus", [5, 4, 1]), dtype=np.float64)
        pp = np.array(cfg.get("pair_plus", [40, 30, 6, 3, 1]), dtype=np.float64)
        six = np.array(cfg.get("six_card", [1000, 200, 100, 20, 15, 10, 7]), dtype=np.float64)
        cab = np.array(cfg.get("ca_bonus", [200, 40, 30, 6, 3, 1]), dtype=np.float64)
        expo = {0: 2 + ab.max(), 1: pp.max(), 2: six.max(), 3: cab.max()}
        tb = build_table(cfg, tcp.BET_INDEX, lambda b: expo[b])
        smap = {"q64": 0, "mimic_dealer": 1, "raise_all": 2, "q64_pwt": 3}
        strat = np.array([smap[s.get("strategy", "q64")] for s in cfg["table"]["seats"]], dtype=np.int64)
        qual = {"Q": 10, "K": 11, "A": 12, "J": 9}[cfg.get("dealer_qualify", "Q")]
        A = alloc(nchunks, mod.NB, nsess, len(tb["btype"]))
        fee = pd_fee(cfg, tb["amount"].sum())
        t0 = time.time()
        mod.run_chunks(shoe, csm, cut, nchunks, per, seeds, tb["nseats"], strat, ab, pp, six, cab,
                       bool(cfg.get("player_wins_ties", False)), qual,
                       tb["btype"], tb["seat"], tb["amount"], tb["exposure"], tb["active"], tb["orders"],
                       tb["rotate"], tb["mode"], tb["bank"], fee, sess_len, A["acc_sum"], A["acc_sq"],
                       A["acc_w"], A["acc_n"], A["cov_sum"], A["cov_x"], A["bank_sum"], A["bank_sq"],
                       A["sess_final"], A["sess_min"], A["ev_count"],
                       A["slot_sum"], A["slot_sq"], A["slot_w"])
    elif game == "blackjack":
        mod = blackjack
        R = cfg["rules"]
        ri = np.zeros(blackjack.NRI, dtype=np.int64)
        defaults = dict(target=21, joker_mode="none", dealer_stand=17, dealer_hits_soft=True,
                        both_over="dealer_wins", das=True, max_hands=4, split_aces_one_card=True,
                        resplit_aces=False, surrender=False, surrender_max_total=99, double_any_two=True,
                        double_no_joker=True, split_no_joker=True, peek=False, no_options_joker_up=False,
                        joker_up_ends_hand=False, over_ncards_lose=0, dealer3_push=[0, 0, 0],
                        dealer_wins_tie_total=0, player_must_hit_le=0, player_must_stand_hard_ge=99,
                        split_by_value=True, no_split_aces=False)
        r = {**defaults, **R}
        jm = {"none": 0, "fixed21": 1, "one_eleven": 2, "two_twelve": 3}[r["joker_mode"]]
        bo = {"dealer_wins": 0, "player_closer_push": 1, "closer_wins": 2}[r["both_over"]]
        vals = {blackjack.TARGET: r["target"], blackjack.JOKER_MODE: jm,
                blackjack.DEALER_STAND: r["dealer_stand"], blackjack.DEALER_HIT_SOFT: int(r["dealer_hits_soft"]),
                blackjack.BOTH_OVER: bo, blackjack.DAS: int(r["das"]), blackjack.MAX_HANDS: r["max_hands"],
                blackjack.SPLIT_ACES_ONE: int(r["split_aces_one_card"]), blackjack.RESPLIT_ACES: int(r["resplit_aces"]),
                blackjack.SURRENDER: int(r["surrender"]), blackjack.SURR_MAX: r["surrender_max_total"],
                blackjack.DOUBLE_ANY: int(r["double_any_two"]), blackjack.DOUBLE_NO_JOKER: int(r["double_no_joker"]),
                blackjack.SPLIT_NO_JOKER: int(r["split_no_joker"]), blackjack.PEEK: int(r["peek"]),
                blackjack.NO_OPT_JOKER_UP: int(r["no_options_joker_up"]),
                blackjack.JOKER_UP_ENDS: int(r["joker_up_ends_hand"]),
                blackjack.OVER_NCARDS_LOSE: r["over_ncards_lose"],
                blackjack.D3_PUSH_LO: r["dealer3_push"][0], blackjack.D3_PUSH_HI: r["dealer3_push"][1],
                blackjack.D3_PUSH_PMIN: r["dealer3_push"][2],
                blackjack.D_WINS_TIE_TOTAL: r["dealer_wins_tie_total"],
                blackjack.MUST_HIT_LE: r["player_must_hit_le"], blackjack.MUST_STAND_GE: r["player_must_stand_hard_ge"],
                blackjack.SPLIT_BY_VALUE: int(r["split_by_value"]),
                blackjack.NO_SPLIT_ACES: int(r["no_split_aces"])}
        for k, v in vals.items():
            ri[k] = int(v)
        nat = np.zeros((5, 2))
        for combo, (rank, pay) in cfg.get("naturals", {"A10": [1, 1.5]}).items():
            nat[["JJ", "AJ", "AA", "A10", "J10"].index(combo)] = (rank, pay)
        tb = build_table(cfg, blackjack.BET_INDEX, lambda b: 0)
        ppt = np.array(cfg.get("perfect_pairs", [25, 12, 6]), dtype=np.float64)
        bt = np.full(9, -1.0)
        for n, v in cfg.get("buster", {"3": 2, "4": 2, "5": 4, "6": 16, "7": 50, "8": 200}).items():
            bt[int(n)] = v
        expo = {0: float(cfg.get("main_exposure", 1.0)), 1: ppt.max(), 2: bt.max()}
        tb["exposure"] = np.array([expo[b] for b in tb["btype"]], dtype=np.float64)
        strat = np.zeros((tb["nseats"], 3, 34, 11), dtype=np.int8)
        for i, s in enumerate(cfg["table"]["seats"]):
            strat[i] = strategies.build(s.get("strategy", "vegas_basic"), target=r["target"],
                                        surrender=bool(r["surrender"]), dealer_stand=r["dealer_stand"],
                                        dealer_hit_soft=bool(r["dealer_hits_soft"]),
                                        joker_as=cfg.get("joker_up_column", "ace"))
        A = alloc(nchunks, mod.NB, nsess, len(tb["btype"]))
        fee = pd_fee(cfg, tb["amount"].sum())
        t0 = time.time()
        mod.run_chunks(shoe, csm, cut, nchunks, per, seeds, tb["nseats"], ri, nat, strat, ppt, bt,
                       tb["btype"], tb["seat"], tb["amount"], tb["exposure"], tb["active"], tb["orders"],
                       tb["rotate"], tb["mode"], tb["bank"], fee, sess_len, A["acc_sum"], A["acc_sq"],
                       A["acc_w"], A["acc_n"], A["cov_sum"], A["cov_x"], A["bank_sum"], A["bank_sq"],
                       A["sess_final"], A["sess_min"], A["ev_count"],
                       A["slot_sum"], A["slot_sq"], A["slot_w"])
    else:
        raise ValueError(game)
    elapsed = time.time() - t0
    return summarize(cfg, mod, tb, A, total, fee, sess_len, elapsed)


def summarize(cfg, mod, tb, A, total, fee, sess_len, elapsed):
    names = [b[0] for b in mod.BETS]
    n = A["acc_n"].sum(0); s1 = A["acc_sum"].sum(0); s2 = A["acc_sq"].sum(0); w = A["acc_w"].sum(0)
    bets = {}
    for b, nm in enumerate(names):
        if n[b] == 0:
            continue
        m = s1[b] / n[b]; var = s2[b] / n[b] - m * m; sd = math.sqrt(max(var, 0))
        # SE: seats share a dealer hand, so pooled samples are correlated; use rounds-based SE
        # from per-round seat-0 vector when available, else conservative sqrt(var/rounds)
        se = sd / math.sqrt(total)
        bets[nm] = dict(ev=m, house_edge=-m, sd=sd, se=se, ci95=[m - 1.96 * se, m + 1.96 * se],
                        avg_wager_per_unit=w[b] / n[b], element_of_risk=-m / (w[b] / n[b]), samples=n[b])
    cs = A["cov_sum"].sum(0) / total; cx = A["cov_x"].sum(0) / total
    cov = cx - np.outer(cs, cs)
    present = [i for i, nm in enumerate(names) if nm in bets and (tb["seat"][tb["btype"] == i] == 0).any()]
    bm = A["bank_sum"].sum() / total
    bsd = math.sqrt(max(A["bank_sq"].sum() / total - bm * bm, 0))
    bse = bsd / math.sqrt(total)
    action = float(tb["amount"].sum())
    hph = float(cfg.get("hands_per_hour", 0) or 0)
    bank = dict(ev_per_round=bm, sd_per_round=bsd, se=bse, ci95=[bm - 1.96 * bse, bm + 1.96 * bse],
                pd_fee_per_round=fee, table_action_per_round=action,
                ev_per_dollar_action=bm / action if action else None)
    if bm > 0:
        bank["n0_rounds"] = (bsd / bm) ** 2
        bank["full_kelly_bankroll"] = bsd * bsd / bm
        bank["ror_brownian"] = {str(B): math.exp(-2 * bm * B / (bsd * bsd))
                                for B in cfg.get("session", {}).get("bankrolls", [])}
    if hph:
        bank["ev_per_hour"] = bm * hph
        bank["sd_per_hour"] = bsd * math.sqrt(hph)
    sessions = None
    if sess_len:
        f = A["sess_final"].ravel(); mn = A["sess_min"].ravel()
        ok = ~np.isnan(f); f = f[ok]; mn = mn[ok]
        if len(f):
            sessions = dict(rounds_per_session=sess_len, n_sessions=int(len(f)),
                            mean=float(f.mean()), sd=float(f.std()),
                            pct={str(p): float(np.percentile(f, p)) for p in (1, 5, 25, 50, 75, 95, 99)},
                            p_losing_session=float((f < 0).mean()),
                            p_drawdown_exceeds={str(B): float((mn <= -B).mean())
                                                for B in cfg.get("session", {}).get("bankrolls", [])})
    out = dict(name=cfg.get("name"), game=cfg["game"], rounds=total, seconds=elapsed,
               rounds_per_sec=total / elapsed if elapsed else None, bets=bets, bank=bank,
               sessions=sessions,
               seat0_cov=dict(order=[names[i] for i in present], cov=cov[np.ix_(present, present)].tolist()))
    per_seat = []
    ss = A["slot_sum"].sum(0); sq = A["slot_sq"].sum(0); sw = A["slot_w"].sum(0)
    seats_cfg = cfg["table"]["seats"]
    for k in range(len(tb["btype"])):
        if tb["active"][k] == 0:
            continue
        m = ss[k] / total; sd = math.sqrt(max(sq[k] / total - m * m, 0))
        per_seat.append(dict(seat=int(tb["seat"][k]), bet=names[tb["btype"][k]], amount=float(tb["amount"][k]),
                             strategy=seats_cfg[tb["seat"][k]].get("strategy", ""), ev=m, house_edge=-m, sd=sd,
                             se=sd / math.sqrt(total), avg_wager_per_unit=sw[k] / total))
    out["per_seat"] = per_seat
    evc = A["ev_count"].sum(0) / total
    if cfg["game"] == "blackjack":
        out["events"] = dict(pd_over_target=evc[0], pd_natural=evc[1])
    if cfg["game"] == "tcp":
        out["events"] = dict(dealer_not_qualify=evc[1])
    out["player_fee_per_seat_round"] = cfg["table"].get("fees", {}).get("player_per_seat", 0.0)
    return out


def compare(out, ref):
    """Attach z-scores vs exact reference {bet: house_edge}."""
    for nm, he in ref.items():
        if nm in out["bets"]:
            b = out["bets"][nm]
            b["ref_house_edge"] = he
            b["z_vs_ref"] = (b["house_edge"] - he) / b["se"] if b["se"] > 0 else 0.0


def fmt(out):
    L = [f"== {out['name']}  ({out['game']}, {out['rounds']:,} rounds, {out['rounds_per_sec']:,.0f} rounds/s)"]
    L.append(f"{'bet':24s}{'EV/unit':>11s}{'±95%':>10s}{'HouseEdge':>11s}{'SD':>9s}{'EoR':>9s}{'ref HE':>10s}{'z':>7s}")
    for nm, b in out["bets"].items():
        ref = f"{b['ref_house_edge']*100:9.4f}%" if "ref_house_edge" in b else ""
        z = f"{b['z_vs_ref']:+6.2f}" if "z_vs_ref" in b else ""
        L.append(f"{nm:24s}{b['ev']:+11.5f}{1.96*b['se']:10.5f}{b['house_edge']*100:10.4f}%{b['sd']:9.4f}"
                 f"{b['element_of_risk']*100:8.3f}%{ref:>10s}{z:>7s}")
    bk = out["bank"]
    L.append(f"BANK  EV/round {bk['ev_per_round']:+.4f} (±{1.96*bk['se']:.4f})  SD/round {bk['sd_per_round']:.3f}"
             f"  action {bk['table_action_per_round']:.0f}  PD fee {bk['pd_fee_per_round']:.2f}"
             + (f"  EV/$action {bk['ev_per_dollar_action']*100:+.3f}%" if bk.get('ev_per_dollar_action') is not None else ""))
    if "n0_rounds" in bk:
        L.append(f"      N0 {bk['n0_rounds']:,.0f} rounds   full-Kelly bankroll {bk['full_kelly_bankroll']:,.0f}"
                 f"   RoR(Brownian) {', '.join(f'{k}: {v:.2e}' for k,v in bk['ror_brownian'].items())}")
    if "ev_per_hour" in bk:
        L.append(f"      per hour: EV {bk['ev_per_hour']:+,.2f}  SD {bk['sd_per_hour']:,.2f}")
    if out.get("sessions"):
        s = out["sessions"]
        L.append(f"SESSIONS of {s['rounds_per_session']} rounds (n={s['n_sessions']:,}): mean {s['mean']:+,.1f} sd {s['sd']:,.1f}"
                 f"  P(losing) {s['p_losing_session']:.3f}")
        L.append("      pct " + "  ".join(f"p{k}:{v:+,.0f}" for k, v in s["pct"].items()))
        if s["p_drawdown_exceeds"]:
            L.append("      P(drawdown ≥ B) " + "  ".join(f"{k}: {v:.4f}" for k, v in s["p_drawdown_exceeds"].items()))
    if len({p["seat"] for p in out.get("per_seat", [])}) > 1:
        L.append("PER SEAT  " + "  |  ".join(
            f"s{p['seat']} {p['bet']}{'['+p['strategy']+']' if p['strategy'] else ''} ${p['amount']:.0f}: HE {p['house_edge']*100:.2f}%±{1.96*p['se']*100:.2f}"
            for p in out["per_seat"]))
    if out.get("events"):
        L.append("events " + "  ".join(f"{k}={v:.6f}" for k, v in out["events"].items()))
    return "\n".join(L)


def load_ref(cfg, root):
    path = os.path.join(root, "reference_values.json")
    if not os.path.exists(path):
        return {}
    ref = json.load(open(path))
    if "reference_inline" in cfg:
        return dict(cfg["reference_inline"])
    key = cfg.get("reference")
    if not key:
        return {}
    node = ref
    for part in key.split("/"):
        node = node.get(part, {})
    return {k: v["house_edge"] for k, v in node.items() if isinstance(v, dict) and "house_edge" in v}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("config", nargs="+")
    ap.add_argument("--rounds", type=float)
    ap.add_argument("--seed", type=int)
    ap.add_argument("--out", default="reports")
    a = ap.parse_args(argv)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(a.out, exist_ok=True)
    for path in a.config:
        cfg = json.load(open(path))
        out = run(cfg, a.rounds, a.seed)
        compare(out, load_ref(cfg, root))
        print(fmt(out)); print()
        base = os.path.splitext(os.path.basename(path))[0]
        json.dump(out, open(os.path.join(a.out, base + ".json"), "w"), indent=1, default=float)


if __name__ == "__main__":
    main()
