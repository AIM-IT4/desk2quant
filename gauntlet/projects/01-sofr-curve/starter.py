"""
Gauntlet Project 01 - Bootstrap an OIS / SOFR discount curve
============================================================

Fill in bootstrap_ois(). Everything else is done for you.

Conventions (from the spec, non-negotiable because grading is numerical):
    day count    ACT/365F  ->  tau = (days_end - days_start) / 365.0
    compounding  continuous ->  DF = exp(-z*T),  z = -ln(DF)/T
    notional     1.0
    fixed leg    one payment per pillar period

Par swap condition, solved forward one pillar at a time:

    r_n * sum_{i=1..n} tau_i * DF_i  =  1 - DF_n

Run me:      python starter.py
Self-check:  python sample_tests.py
"""

import json
import math

DAY_COUNT = 365.0

QUOTES = [
    {"days":  365, "rate": 0.0530},
    {"days":  730, "rate": 0.0505},
    {"days": 1095, "rate": 0.0480},
    {"days": 1460, "rate": 0.0465},
    {"days": 1825, "rate": 0.0455},
]


def bootstrap_ois(quotes):
    """
    Return (dfs, taus).

    dfs[i]  discount factor at pillar i
    taus[i] year fraction of period i (pillar i-1 -> pillar i)

    Hint: rearrange the par swap condition to isolate DF_n. Each new DF
    depends only on discount factors you have already computed, so no
    root-finder or global solver is needed.
    """
    dfs = []
    taus = []
    annuity = 0.0

    for i, q in enumerate(quotes):
        prev_days = 0 if i == 0 else quotes[i - 1]["days"]
        tau = (q["days"] - prev_days) / DAY_COUNT
        taus.append(tau)

        # ------------------------------------------------------------------
        # TODO: compute df for this pillar from q["rate"], tau and annuity.
        #       annuity currently holds sum(tau_i * DF_i) for i < n.
        df = None
        # ------------------------------------------------------------------

        if df is None:
            raise NotImplementedError("bootstrap_ois: fill in the df calculation")

        dfs.append(df)
        annuity += tau * df

    return dfs, taus


def zero_rate(df, days):
    """Continuously-compounded zero rate implied by a discount factor."""
    return -math.log(df) / (days / DAY_COUNT)


def forward_rate(df_start, df_end, tau):
    """Continuously-compounded forward rate between two pillars."""
    return math.log(df_start / df_end) / tau


def build_submission():
    dfs, taus = bootstrap_ois(QUOTES)
    return {
        "dfs": dfs,
        "zeroRates": [zero_rate(df, QUOTES[i]["days"]) for i, df in enumerate(dfs)],
        # 2y -> 3y spans pillar index 1 to 2, so tau is taus[2].
        "forward2y3y": forward_rate(dfs[1], dfs[2], taus[2]),
    }


if __name__ == "__main__":
    submission = build_submission()
    print(json.dumps(submission, indent=2))
    with open("submission.json", "w") as fh:
        json.dump(submission, fh, indent=2)
    print("\nWrote submission.json")
