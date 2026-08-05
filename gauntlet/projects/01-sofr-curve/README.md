# Project 01 — Bootstrap an OIS / SOFR Discount Curve

**Difficulty:** Foundation (start here)
**Expected effort:** 3–6 hours
**Language:** Python (any version with the standard library; numpy optional)

---

## The desk problem

You have joined a rates desk. Before anything can be priced, marked or
risk-managed, the desk needs a discount curve. Your job is to build one from
par OIS swap quotes and expose the outputs the rest of the desk depends on:
discount factors, zero rates, and a forward rate between two pillars.

This is the first thing a rates quant does, and the thing most candidates
get subtly wrong — usually via day count or compounding, not via algebra.

---

## Model conventions (follow these exactly)

Grading is numerical, so the conventions are fixed and non-negotiable:

- **Day count:** ACT/365F — `tau = (days_end - days_start) / 365.0`
- **Compounding:** continuous, so `DF = exp(-z * T)` and `z = -ln(DF) / T`
- **Pillars:** annual, at 365/730/1095/1460/1825 days
- **Notional:** 1.0
- **Fixed leg:** one payment per pillar period
- **Par swap condition:** the fixed rate makes the swap value zero:

```
r_n * sum_{i=1..n} tau_i * DF_i  =  1 - DF_n
```

Solve **forward**, one pillar at a time: each new `DF_n` depends only on
discount factors you have already computed. No global solver is needed.

---

## Input

```python
quotes = [
    {"days":  365, "rate": 0.0530},
    {"days":  730, "rate": 0.0505},
    {"days": 1095, "rate": 0.0480},
    {"days": 1460, "rate": 0.0465},
    {"days": 1825, "rate": 0.0455},
]
```

---

## What to submit

A single JSON object with exactly these keys:

```json
{
  "dfs":          [df_1y, df_2y, df_3y, df_4y, df_5y],
  "zeroRates":    [z_1y,  z_2y,  z_3y,  z_4y,  z_5y],
  "forward2y3y":  0.0
}
```

- `dfs` — discount factor at each pillar, in pillar order
- `zeroRates` — continuously-compounded zero rate at each pillar, as a
  decimal (`0.0442`, **not** `4.42`)
- `forward2y3y` — continuously-compounded forward rate between the 2y and 3y
  pillars: `ln(DF_2y / DF_3y) / tau_3y`

---

## How you are graded

100 points across 6 hidden checks, at a relative tolerance of `1e-6`:

| Check | Points |
|---|---|
| 1y discount factor | 15 |
| 5y discount factor | 20 |
| Full discount factor curve | 25 |
| Discount factors non-increasing | 10 |
| 5y zero rate | 15 |
| 2y→3y forward rate | 15 |

**You must pass all six to pass the project.** Partial credit is reported so
you know where you stand, but "mostly right" is not a passing curve.

`1e-6` is loose enough that any sane floating-point path passes, and tight
enough that a wrong day count (365 vs 360 is roughly a 1.4% error) or
discrete-instead-of-continuous compounding fails immediately.

---

## Self-check before submitting

Your curve must reprice every input swap back to zero value. If it does not,
your bootstrap is wrong and no tolerance will save you:

```python
for n, q in enumerate(quotes):
    annuity = sum(taus[i] * dfs[i] for i in range(n + 1))
    value   = q["rate"] * annuity - (1 - dfs[n])
    assert abs(value) < 1e-12, f"pillar {n} reprices to {value}"
```

Also assert your discount factors strictly decrease.

---

## The three ways candidates fail this

1. **Day count.** Using 360, or `days/365` cumulatively instead of per-period
   `tau`. Produces plausible-looking numbers that are ~1.4% off.
2. **Compounding.** Reporting discrete (`(1/DF)^(1/T) - 1`) zero rates when
   the spec says continuous. The discount factors pass; the zero rate fails.
3. **Annuity.** Forgetting that pillar *n* discounts **all** earlier fixed
   payments, not just its own. The 1y pillar is right, everything after drifts.

---

## Interviewer follow-ups

Be ready for these on your submitted numbers:

- Your 5y DF is ~0.8016. Roughly what continuous zero rate is that, without
  a calculator?
- Why is the 2y→3y forward (~4.18%) **below** the 3y par rate (4.80%)?
- What breaks if OIS quotes are not annual-pay?
- You are asked for a 4.5y discount factor. Which interpolation do you choose,
  and what artefact does each introduce?
- Rates go negative. Which of your assertions fires, and is it still valid?
