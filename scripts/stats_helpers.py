"""
Session statistics done the way docs/STATS-METHODS.md says. Pure Python (no scipy), so ad-hoc analysis
scripts import this instead of re-deriving the t-distribution each time.

    import sys; sys.path.insert(0, "scripts"); from stats_helpers import *

Every function takes sessions as dicts with `res` (buy_out - buy_in, dollars) and `hrs` (hours played).
Run this file directly to self-check against the printed t table.
"""
import math
import random

# ---------------------------------------------------------------- Student t (exact, via incomplete beta)

def _betacf(a, b, x):
    """Continued fraction for the regularized incomplete beta (Numerical Recipes 6.4)."""
    tiny, qab, qap, qam = 1e-300, a + b, a + 1, a - 1
    c, d = 1.0, 1 - qab * x / qap
    d = 1 / (d if abs(d) > tiny else tiny)
    h = d
    for m in range(1, 300):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1 + aa * d; d = 1 / (d if abs(d) > tiny else tiny)
        c = 1 + aa / c; c = c if abs(c) > tiny else tiny
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1 + aa * d; d = 1 / (d if abs(d) > tiny else tiny)
        c = 1 + aa / c; c = c if abs(c) > tiny else tiny
        delta = d * c
        h *= delta
        if abs(delta - 1) < 1e-14:
            break
    return h


def _betainc(a, b, x):
    if x <= 0: return 0.0
    if x >= 1: return 1.0
    lbt = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1 - x)
    if x < (a + 1) / (a + b + 2):
        return math.exp(lbt) * _betacf(a, b, x) / a
    return 1 - math.exp(lbt) * _betacf(b, a, 1 - x) / b


def t_cdf(t, df):
    """P(T <= t) for Student t with df degrees of freedom."""
    x = df / (df + t * t)
    tail = 0.5 * _betainc(df / 2, 0.5, x)
    return 1 - tail if t >= 0 else tail


def t_ppf(p, df):
    """Inverse of t_cdf (bisection)."""
    lo, hi = -1e3, 1e3
    for _ in range(200):
        mid = (lo + hi) / 2
        if t_cdf(mid, df) < p: lo = mid
        else: hi = mid
    return (lo + hi) / 2


def t_crit(df, conf=0.95):
    """Two-sided critical value: t_crit(44) = 2.015, t_crit(7) = 2.365."""
    return t_ppf(1 - (1 - conf) / 2, df)


def chi2_ppf(p, df):
    """Chi-square quantile (Wilson–Hilferty; within ~1% for df >= 3, which is all we ever use)."""
    z = math.sqrt(2) * _erfinv(2 * p - 1)
    return df * (1 - 2 / (9 * df) + z * math.sqrt(2 / (9 * df))) ** 3


def _erfinv(y):
    lo, hi = -6.0, 6.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if math.erf(mid) < y: lo = mid
        else: hi = mid
    return (lo + hi) / 2

# ---------------------------------------------------------------- session statistics

def win_rate(ss):
    """$/hour: total result over total hours (the weighted estimate; NOT the mean of per-session rates)."""
    return sum(s["res"] for s in ss) / sum(s["hrs"] for s in ss)


def sd_per_hour(ss):
    """σ per √hour: Σ (res − rate·hrs)² / hrs ÷ (n − 1). n = sessions. Needs n >= 2."""
    n = len(ss)
    if n < 2: raise ValueError("need at least 2 sessions for an SD")
    w = win_rate(ss)
    return math.sqrt(sum((s["res"] - w * s["hrs"]) ** 2 / s["hrs"] for s in ss) / (n - 1))


def rate_ci(ss, conf=0.95):
    """CI for the true $/hour: rate ± t(n−1) · σ / √(total hours)."""
    n, H = len(ss), sum(s["hrs"] for s in ss)
    w, se = win_rate(ss), sd_per_hour(ss) / math.sqrt(sum(s["hrs"] for s in ss))
    k = t_crit(n - 1, conf)
    return w - k * se, w + k * se


def t_test(ss, hypothesized_rate=0.0):
    """(t, df, two-sided p) for 'true rate = hypothesized_rate'."""
    n, H = len(ss), sum(s["hrs"] for s in ss)
    t = (win_rate(ss) - hypothesized_rate) / (sd_per_hour(ss) / math.sqrt(H))
    return t, n - 1, 2 * (1 - t_cdf(abs(t), n - 1))


def percentile_vs(ss, hypothesized_rate):
    """Where the actual total sits if the true rate were hypothesized_rate: T_{n−1} CDF, never the normal."""
    n, H = len(ss), sum(s["hrs"] for s in ss)
    t = (sum(s["res"] for s in ss) - hypothesized_rate * H) / (sd_per_hour(ss) * math.sqrt(H))
    return t_cdf(t, n - 1)


def sd_ci_chi2(ss, conf=0.95):
    """CI for σ assuming normal results: σ̂·√(df/χ²_hi) … σ̂·√(df/χ²_lo). Too narrow when tails are heavy."""
    df, s = len(ss) - 1, sd_per_hour(ss)
    a = (1 - conf) / 2
    return s * math.sqrt(df / chi2_ppf(1 - a, df)), s * math.sqrt(df / chi2_ppf(a, df))


def sd_ci_bootstrap(ss, conf=0.95, reps=4000, seed=1):
    """Percentile bootstrap CI for σ. Only meaningful with n >= ~15 sessions."""
    rng = random.Random(seed)
    draws = sorted(sd_per_hour([rng.choice(ss) for _ in ss]) for _ in range(reps))
    a = (1 - conf) / 2
    return draws[int(a * reps)], draws[int((1 - a) * reps) - 1]


def excess_kurtosis(ss):
    """Of the standardized residuals (res − rate·hrs)/√hrs. 0 = normal; > ~2 means heavy tails."""
    w = win_rate(ss)
    z = [(s["res"] - w * s["hrs"]) / math.sqrt(s["hrs"]) for s in ss]
    m = sum(z) / len(z)
    v = sum((x - m) ** 2 for x in z) / len(z)
    return sum((x - m) ** 4 for x in z) / len(z) / v ** 2 - 3


def drop_one_range(ss):
    """σ/hour with each session left out in turn: (min, max). Shows how much one night drives it."""
    vals = [sd_per_hour(ss[:i] + ss[i + 1:]) for i in range(len(ss))]
    return min(vals), max(vals)


if __name__ == "__main__":
    table = {1: 12.706, 2: 4.303, 5: 2.571, 7: 2.365, 10: 2.228, 22: 2.074, 30: 2.042, 44: 2.015, 120: 1.980}
    for df, want in table.items():
        got = t_crit(df)
        assert abs(got - want) < 0.002, (df, got, want)
    assert abs(t_cdf(0, 9) - 0.5) < 1e-12 and abs(t_cdf(2.262, 9) - 0.975) < 1e-4
    assert abs(chi2_ppf(0.975, 44) - 64.20) < 0.3 and abs(chi2_ppf(0.025, 44) - 27.57) < 0.3
    demo = [{"res": r, "hrs": h} for r, h in [(500, 4), (-1200, 5), (2300, 3), (-300, 6), (900, 4)]]
    assert abs(win_rate(demo) - 2200 / 22) < 1e-9
    print("stats_helpers self-check OK")
