# Project 00 — Warm-up: bond price and duration (free)

**Free. No purchase, no account.** This project exists so you can run the
entire Gauntlet loop end to end — read a spec, implement it, self-check,
submit, read a scorecard — before you spend anything.

It is deliberately easy. If you have priced a bond before, budget an hour.
The paid projects are one to three days of real work; this is not
representative of their difficulty, only of their *mechanism*.

## The bond

| | |
|---|---|
| Face | 100 |
| Coupon | 5% annual, first payment at t = 1 |
| Maturity | 5 years |
| Yield | 4% flat, annually compounded |

## Conventions (fixed)

Grading is numerical, so these are not negotiable:

```
price    = sum_{t=1..n} c/(1+y)^t + F/(1+y)^n
macaulay = sum_t ( t * PV_t ) / price
modified = macaulay / (1+y)
```

Annual periods. First coupon at t = 1, not t = 0.

## What to submit

Run `python starter.py` and it writes `submission.json`:

```json
{
  "price": 0.0,
  "pricePar": 0.0,
  "macaulayDuration": 0.0,
  "modifiedDuration": 0.0,
  "priceAfter100bp": 0.0
}
```

- `price` — the bond above
- `pricePar` — same bond with a 4% coupon at a 4% yield
- `macaulayDuration`, `modifiedDuration` — for the bond above
- `priceAfter100bp` — a **full reprice** at y = 5%, not the duration estimate

## Grading

100 points across 5 hidden tests at 1e-6 relative tolerance (the par-bond
identity is checked at 1e-9, because it should be exact).

| Test | Points |
|---|---|
| Base price | 25 |
| Par bond prices to face | 15 |
| Macaulay duration | 25 |
| Modified duration | 20 |
| Reprice at +100bp | 15 |

You must pass all five. Partial credit is reported so you can see where you
stand.

Measured against the real hidden tests, so you know the bar is honest:

| Submission | Score | Result |
|---|---|---|
| Correct implementation | 100 | Pass |
| Coupons discounted from t = 0 | 75 | Fail |
| Modified duration missing the /(1+y) | 80 | Fail |
| Duration approximation used to reprice | 85 | Fail |
| Semiannual convention instead of annual | 75 | Fail |

Note how close the failures are to passing. That is the point: small
convention errors are exactly what a desk review catches, and "nearly right"
prices are still wrong prices.

## Self-check first

`python sample_tests.py` runs nine public property checks — par identity,
monotonicity in yield, zero-coupon duration equalling maturity, convexity
sign. They never reveal the expected answers, but if they fail, the graded
suite will fail too.

## Submit

Email `submission.json` to **hello@desk2quant.com**, subject
**`Gauntlet 00 submission`**. You get a scorecard back: pass/fail per test,
your score, and a hint for anything that failed — never the expected value,
because that would make the grader an oracle you could brute-force.

## Then what

If you liked the loop, [Project 01](../01-sofr-curve/README.md) is the real
thing: bootstrap an OIS/SOFR discount curve, graded on discount factors, zero
rates, a forward, and curve monotonicity.
