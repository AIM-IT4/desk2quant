"""
Public sample tests for the free warm-up.

These are not the graded tests. They are properties that must hold for any
correct implementation, so you can catch your own errors first. They never
reveal the expected answers.

Run: python sample_tests.py
"""

import sys

from starter import BOND, bond_price, macaulay_duration, modified_duration, build_submission

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
        p = bond_price(100.0, 0.05, 5, 0.04)
    except NotImplementedError as exc:
        print("Not implemented yet:\n  " + str(exc))
        sys.exit(1)

    # 1. A premium bond: coupon above yield must price above face.
    check("5% coupon at 4% yield prices above 100", p > 100.0, "got %.6f" % p)

    # 2. Par bond identity. This is the single most useful check here: if the
    #    coupon equals the yield the price must be exactly face.
    par = bond_price(100.0, 0.04, 5, 0.04)
    check("par bond prices to exactly 100", abs(par - 100.0) < 1e-9,
          "got %.10f" % par)

    # 3. Discount bond: coupon below yield must price below face.
    disc = bond_price(100.0, 0.02, 5, 0.04)
    check("2% coupon at 4% yield prices below 100", disc < 100.0, "got %.6f" % disc)

    # 4. Price must fall as yield rises.
    check("price is monotonically decreasing in yield",
          bond_price(100.0, 0.05, 5, 0.03) > p > bond_price(100.0, 0.05, 5, 0.05))

    # 5. A zero-coupon bond's Macaulay duration equals its maturity exactly.
    zc = macaulay_duration(100.0, 0.0, 7, 0.03)
    check("zero-coupon Macaulay duration equals maturity", abs(zc - 7.0) < 1e-9,
          "got %.10f (want 7)" % zc)

    # 6. A coupon bond's duration must be strictly less than its maturity.
    mac = macaulay_duration(100.0, 0.05, 5, 0.04)
    check("coupon bond duration is below maturity", 0 < mac < 5.0, "got %.6f" % mac)

    # 7. Modified duration is Macaulay discounted once.
    mod = modified_duration(100.0, 0.05, 5, 0.04)
    check("modified duration is below Macaulay", mod < mac,
          "mod %.6f vs mac %.6f" % (mod, mac))

    # 8. Convexity: the first-order duration estimate must overstate the loss
    #    from a yield rise, so the true repriced value is a little higher.
    approx = p - mod * p * 0.01
    actual = bond_price(100.0, 0.05, 5, 0.05)
    check("duration approximation overstates the loss", actual > approx,
          "actual %.6f vs approx %.6f" % (actual, approx))

    # 9. Submission shape.
    sub = build_submission()
    need = ("price", "pricePar", "macaulayDuration", "modifiedDuration", "priceAfter100bp")
    check("submission has required keys", all(k in sub for k in need), str(list(sub)))

    print("\n  %d passed, %d failed" % (passed, failed))
    if failed:
        print("  Fix these before submitting.")
        sys.exit(1)
    print("  Clean. Hit Grade in the playground, or run 'python starter.py'")
    print("  locally to write submission.json.")


if __name__ == "__main__":
    main()
