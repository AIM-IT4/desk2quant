"""
Public sample tests for Gauntlet Project 01.

These are NOT the graded tests. They are the checks that must hold for any
correct bootstrap, so you can catch your own errors before submitting.

The graded suite is hidden and checks your actual numbers against a reference
implementation. If these sample tests fail, the graded suite will certainly
fail too.

Run: python sample_tests.py
"""

import math
import sys

from starter import QUOTES, bootstrap_ois, build_submission, zero_rate, forward_rate

passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print("  PASS  " + name)
    else:
        failed += 1
        print("  FAIL  " + name + ("  " + detail if detail else ""))


def main():
    try:
        dfs, taus = bootstrap_ois(QUOTES)
    except NotImplementedError as exc:
        print("bootstrap_ois is not implemented yet:\n  " + str(exc))
        sys.exit(1)

    # 1. Shape
    check("returns one DF per quote", len(dfs) == len(QUOTES),
          "got %d, expected %d" % (len(dfs), len(QUOTES)))

    # 2. Every DF must be a sane discount factor
    check("all DFs in (0, 1]", all(0.0 < df <= 1.0 for df in dfs), str(dfs))

    # 3. Positive rates mean the curve cannot rise
    check("DFs strictly decreasing",
          all(dfs[i] < dfs[i - 1] for i in range(1, len(dfs))), str(dfs))

    # 4. THE decisive check: the curve must reprice every input par swap to
    #    zero value. If this fails your bootstrap is wrong, and no grading
    #    tolerance will rescue it.
    worst = 0.0
    for n, q in enumerate(QUOTES):
        annuity = sum(taus[i] * dfs[i] for i in range(n + 1))
        value = q["rate"] * annuity - (1.0 - dfs[n])
        worst = max(worst, abs(value))
    check("every input swap reprices to zero", worst < 1e-12,
          "worst residual %.3e (want < 1e-12)" % worst)

    # 5. Zero rates must round-trip back to the discount factors
    rt = max(abs(math.exp(-zero_rate(df, QUOTES[i]["days"]) * QUOTES[i]["days"] / 365.0) - df)
             for i, df in enumerate(dfs))
    check("zero rates round-trip to DFs", rt < 1e-12, "worst %.3e" % rt)

    # 6. Submission shape, so you do not fail on a typo
    sub = build_submission()
    check("submission has required keys",
          all(k in sub for k in ("dfs", "zeroRates", "forward2y3y")), str(list(sub)))
    check("zeroRates are decimals not percents",
          all(0.0 < z < 0.5 for z in sub["zeroRates"]),
          "looks like percents: " + str(sub["zeroRates"][:2]))
    check("forward2y3y is finite", math.isfinite(sub["forward2y3y"]))

    print("\n  %d passed, %d failed" % (passed, failed))
    if failed:
        print("  Fix these before submitting.")
        sys.exit(1)
    print("  Sample checks clean. The graded suite checks your values against")
    print("  a reference implementation at 1e-6 relative tolerance.")


if __name__ == "__main__":
    main()
