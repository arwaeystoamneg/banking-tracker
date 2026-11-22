"""Build RESULTS.md from reports/*.json."""
import json, glob, os

order = ["bac_validate_8d", "tcp_validate", "bj_vegas_validate", "bac_ca_table", "tcp_ca_table",
         "bj_hustler_21c", "bj_commerce_nobust", "bj_hpc_nobust_approx", "bj_la_blackjack",
         "bj_hustler_21c_vegas_basic", "bj_hustler_21c_vegas_shifted", "bj_hustler_21c_mimic_dealer",
         "bj_hustler_21c_never_bust"]
L = ["# cardsim results", "", "Generated from `reports/*.json`. HE = house edge (player's loss per unit bet). "
     "Bank = player-dealer P&L per round after the PD collection fee. ± = 95% CI.", ""]
for name in order:
    f = f"reports/{name}.json"
    if not os.path.exists(f):
        continue
    o = json.load(open(f))
    L.append(f"## {o['name']}")
    L.append(f"*{o['rounds']:,} rounds*")
    L.append("")
    L.append("| Bet | House edge | ±95% | SD/unit | Exact HE | z |")
    L.append("|---|---|---|---|---|---|")
    for nm, b in o["bets"].items():
        ref = f"{b['ref_house_edge']*100:.4f}%" if "ref_house_edge" in b else ""
        z = f"{b['z_vs_ref']:+.2f}" if "z_vs_ref" in b else ""
        L.append(f"| {nm} | {b['house_edge']*100:.4f}% | {1.96*b['se']*100:.4f}% | {b['sd']:.4f} | {ref} | {z} |")
    seats = o.get("per_seat", [])
    if len({p["seat"] for p in seats}) > 1:
        L.append("")
        L.append("| Seat | Bet | Strategy | Amount | House edge | ±95% |")
        L.append("|---|---|---|---|---|---|")
        for p in seats:
            L.append(f"| {p['seat']} | {p['bet']} | {p['strategy']} | {p['amount']:.0f} | {p['house_edge']*100:.2f}% | {1.96*p['se']*100:.2f}% |")
    bk = o["bank"]
    L.append("")
    line = (f"**Bank:** EV/round {bk['ev_per_round']:+,.2f} ± {1.96*bk['se']:.2f}, SD/round {bk['sd_per_round']:,.1f}, "
            f"action/round {bk['table_action_per_round']:,.0f}, PD fee {bk['pd_fee_per_round']:.2f}")
    if bk.get("ev_per_dollar_action") is not None:
        line += f", **{bk['ev_per_dollar_action']*100:+.2f}% of action**"
    L.append(line)
    if "n0_rounds" in bk:
        L.append(f"N0 {bk['n0_rounds']:,.0f} rounds · full-Kelly bankroll {bk['full_kelly_bankroll']:,.0f}"
                 + (" · RoR (Brownian) " + ", ".join(f"${k}: {v:.1e}" for k, v in bk['ror_brownian'].items()) if bk.get('ror_brownian') else ""))
    if "ev_per_hour" in bk:
        L.append(f"Per hour: EV {bk['ev_per_hour']:+,.0f}, SD {bk['sd_per_hour']:,.0f}")
    s = o.get("sessions")
    if s:
        L.append(f"Sessions of {s['rounds_per_session']} rounds: median {s['pct']['50']:+,.0f}, "
                 f"5th pct {s['pct']['5']:+,.0f}, 1st pct {s['pct']['1']:+,.0f}, P(losing session) {s['p_losing_session']:.1%}; "
                 + "P(drawdown ≥ B): " + ", ".join(f"${k}: {v:.2%}" for k, v in s["p_drawdown_exceeds"].items()))
    if o.get("events"):
        L.append("Events: " + ", ".join(f"{k} {v:.4%}" for k, v in o["events"].items()))
    L.append("")
open("RESULTS.md", "w").write("\n".join(L))
print("wrote RESULTS.md")
