"""
Gauntlet Project 00 - Free warm-up: bond price and duration
===========================================================

This one is small on purpose. It exists so you can run the entire loop --
read the spec, implement, self-check, submit, read a scorecard -- before you
pay for anything. Budget an hour.

Conventions (fixed, because grading is numerical):
    annual coupons, first one at exactly t = 1 year
    flat annually-compounded yield y
    price   = sum_{t=1..n} c/(1+y)^t  +  F/(1+y)^n
    macaulay = sum_t ( t * PV_t ) / price
    modified = macaulay / (1+y)

The bond under test: face 100, 5% annual coupon, 5 years, yield 4%.

Run me:      python starter.py
Self-check:  python sample_tests.py
"""

import json

BOND = {"face": 100.0, "coupon_rate": 0.05, "years": 5, "yield": 0.04}


def bond_price(face, coupon_rate, years, y):
    """
    Present value of the bond.

    TODO: sum the discounted coupons, then add the discounted face redemption.
    """
    # ------------------------------------------------------------------
    raise NotImplementedError("bond_price: implement me")
    # ------------------------------------------------------------------


def macaulay_duration(face, coupon_rate, years, y):
    """
    PV-weighted average time to cash flow, in years.

    TODO: weight each t by its PV, divide by the total price. Do not forget
          the face redemption at t = years.
    """
    # ------------------------------------------------------------------
    raise NotImplementedError("macaulay_duration: implement me")
    # ------------------------------------------------------------------


def modified_duration(face, coupon_rate, years, y):
    """Macaulay duration adjusted for annual compounding."""
    # ------------------------------------------------------------------
    raise NotImplementedError("modified_duration: implement me")
    # ------------------------------------------------------------------


def build_submission():
    b = BOND
    return {
        "price": bond_price(b["face"], b["coupon_rate"], b["years"], b["yield"]),
        # Par bond: coupon rate equal to the yield. Must come out at face.
        "pricePar": bond_price(b["face"], 0.04, b["years"], 0.04),
        "macaulayDuration": macaulay_duration(b["face"], b["coupon_rate"], b["years"], b["yield"]),
        "modifiedDuration": modified_duration(b["face"], b["coupon_rate"], b["years"], b["yield"]),
        # Full reprice at y + 100bp. Not the duration approximation.
        "priceAfter100bp": bond_price(b["face"], b["coupon_rate"], b["years"], b["yield"] + 0.01),
    }


if __name__ == "__main__":
    submission = build_submission()
    print(json.dumps(submission, indent=2))
    with open("submission.json", "w") as fh:
        json.dump(submission, fh, indent=2)
    print("\nWrote submission.json")
