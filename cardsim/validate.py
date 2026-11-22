"""Validation gates: MC must agree with exact values within |z| < 3.5 (18+ bets tested, so a few |z|~2 are expected).
Usage: python3 validate.py [--rounds-scale 1.0]"""
import argparse, json, os, sys
from cardsim.run import run, compare, load_ref, fmt

GATES = [("configs/bac_validate_8d.json", 1e8), ("configs/tcp_validate.json", 1e8),
         ("configs/bj_vegas_validate.json", 5e7)]
BJ_EXPECT = {"configs/bj_vegas_validate.json": ("main", 0.0030, 0.0060)}  # loose band for Vegas HE

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--rounds-scale", type=float, default=1.0)
    a = ap.parse_args()
    root = os.path.dirname(os.path.abspath(__file__))
    fails = 0
    for path, n in GATES:
        cfg = json.load(open(os.path.join(root, path)))
        out = run(cfg, n * a.rounds_scale)
        compare(out, load_ref(cfg, root))
        print(fmt(out))
        for nm, b in out["bets"].items():
            if "z_vs_ref" in b and abs(b["z_vs_ref"]) > 3.5:
                print(f"FAIL {path} {nm} z={b['z_vs_ref']:+.2f}"); fails += 1
        if path in BJ_EXPECT:
            nm, lo, hi = BJ_EXPECT[path]
            he = out["bets"][nm]["house_edge"]
            if not (lo <= he <= hi):
                print(f"FAIL {path} {nm} HE {he:.4%} outside [{lo:.2%},{hi:.2%}]"); fails += 1
        print()
    print("ALL GATES PASSED" if fails == 0 else f"{fails} FAILURES")
    sys.exit(1 if fails else 0)
