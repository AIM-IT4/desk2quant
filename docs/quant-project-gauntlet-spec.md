# Quant Project Gauntlet — Product Spec

Status: PLAN (nothing built)
Decisions locked: graded via real code execution; separate premium product
alongside the existing Rs.799 45-project pack.

---

## 1. Why this product

Project/lab content is already the strongest category. Measured from 353
purchase rows:

| Product | Units | Revenue |
|---|---|---|
| Ultimate Industry Grade Quant Project Pack (45) | 24 | Rs.17,258 |
| The Stochastic Calculus Visual Lab | 16 | Rs.7,767 |
| Model Validation Quant Case Study Pack | 17 | Rs.12,304 |
| XVA Calculus Lab | 14 | Rs.4,853 |
| Greek Explainer Lab | 8 | Rs.5,353 |
| **Category total** | **79** | **Rs.47,535** |

Only "Quantitative Finance for Absolute Beginners" (38 units) outsells the
project pack as a single item.

High-priced bundles dramatically outperform cheap singles per unit:

| Product | Units | Revenue | Rs./unit |
|---|---|---|---|
| Complete Front Office & Risk Bundle | 12 | Rs.71,988 | ~5,999 |
| Derivatives Master Pack | 16 | Rs.25,387 | ~1,587 |
| Ultimate Project Pack | 24 | Rs.17,258 | ~719 |

Demand for projects is proven, and willingness to pay at the high end is
proven. The opportunity is a premium graded product, not another Rs.799 PDF.

---

## 2. The differentiation constraint (critical)

The existing Rs.799 pack already ships:

- 45 projects across Basic / Moderate / Advanced / Asset Classes
- Full SDE/PDE formulations, proofs, discretizations
- Python analysis code AND industry-grade C++ implementations
- Curve bootstrapping, Heston, Hull-White, LSV, HJM, CVA, VaR
- Calibration methods with optimization workflows
- **Interview prep questions for every project**
- **Resume-ready bullets**
- 600+ pages

So "more projects + rubrics + interview questions + resume bullets" is NOT a
new product. It is a repackage and would cannibalise the #2 seller.

The one thing a PDF structurally cannot do is tell a candidate whether their
implementation is CORRECT. That is the entire basis of this product.

**Value proposition: verification, not content volume.**

Sellable claim: "Anyone can read a derivation. This proves you can build it."

---

## 3. Product definition

Name (working): **Quant Project Gauntlet**
Price: **Rs.2,999** launch, list Rs.3,499
Positioning: separate premium product; owners of the Rs.799 pack can buy
both with zero overlap.

### Deliverables per project
1. Problem spec (desk-framed, deliberately ambiguous like real work)
2. Input dataset (real where licensing allows, else deterministic synthetic)
3. Public sample tests the candidate runs locally
4. **Hidden test suite** used for the official score
5. Reference solution, released only AFTER first passing submission
6. Failure-mode notes: what breaks, why, how the desk catches it
7. Interviewer follow-up questions specific to their submitted numbers

### Scoring
- Numerical correctness within tolerance (primary)
- Edge-case handling (hidden tests)
- Performance ceiling where relevant (e.g. MC convergence)
- Output: pass/fail per test + score + diagnostic explanation

### Portfolio artifact
A verifiable pass report per project (shareable link) a recruiter can check.
This is the "stronger candidate" mechanism and a referral driver.

---

## 4. Project list (8 projects, none in the Rs.799 pack)

Chosen to avoid the existing pack's coverage and to be gradeable numerically.

1. **SOFR curve build + turn-of-year handling** — bootstrap from futures/OIS,
   grade discount factors at hidden pillar dates.
2. **Vol surface arbitrage screen** — detect calendar/butterfly violations,
   grade against seeded arbitrage cases.
3. **XVA on a netting set with collateral** — CVA/DVA under CSA thresholds,
   grade exposure profile quantiles.
4. **Market-making PnL simulator** — inventory risk + adverse selection,
   grade terminal PnL distribution moments.
5. **Bermudan swaption via LSM** — grade early-exercise boundary + price
   within tolerance vs reference lattice.
6. **Model validation challenge (deliberately broken model)** — find the
   seeded bug, grade the corrected outputs.
7. **Basis risk hedge optimiser** — cross-currency basis, grade hedge ratios.
8. **Intraday liquidity / slippage model** — grade execution cost estimates.

Each: 1-3 days of genuine work. Deliberately fewer and harder than 45.

---

## 5. Technical architecture

### 5.1 The blocking constraint
Vercel Hobby allows **12 serverless functions. Currently 12/12 used.**
A grading endpoint therefore cannot be a new file as-is.

Confirmed inventory: admin-auth, create-order, grant-access, interview,
products, razorpay-webhook, reminders, send-email, send-latest-products,
send-promo-latest, send-single-buyer-offers, tts

### 5.2 Recommended resolution
Three campaign routes are **manual/admin-only** — verified not referenced by
any frontend HTML or JS:
- send-latest-products.js (292 lines)
- send-promo-latest.js (395 lines)
- send-single-buyer-offers.js (604 lines)

Consolidate into one `api/campaigns.js` multiplexed by `?action=`, mirroring
the precedent in `api/interview.js` (already branches on action: chat /
start / evaluate / respond).

Net effect: 12 -> 10 functions, freeing 2 slots. Prerequisite task, low risk
because nothing in the frontend calls them.

### 5.3 Why code execution must NOT run on Vercel
Executing buyer-submitted Python on our own infrastructure means arbitrary
remote code execution: sandbox escape, crypto-mining, credential and data
exfiltration (Supabase keys and the Google service account live in that env).
Vercel functions are not a security sandbox and have no syscall isolation.

**Decision: never execute untrusted code in our Vercel runtime.**

### 5.4 Execution design
Use a dedicated third-party sandbox as the execution layer. Our function only
orchestrates: authenticate the buyer, forward code + hidden tests, receive
the result, persist the score, email the scorecard.

| Option | Model | Notes |
|---|---|---|
| **Judge0** (self-host or RapidAPI) | container per run | Purpose-built; Python; simple REST |
| **Piston** | container per run | Open source, lighter, free to self-host |
| **E2B / Modal** | managed sandbox | Better for heavy numeric runs, paid |

Hard limits per submission: CPU <= 10s, memory <= 512MB, **no network**,
read-only FS except a temp dir, output truncated.

Numeric stack constraint: these projects need numpy/scipy/pandas. Stock
Judge0 images are bare, so a **custom image with the numeric stack is
required**. Real setup work; do not underestimate.

### 5.5 Grading flow
1. Buyer submits code from a gated page (`/gauntlet.html`)
2. `api/gauntlet.js?action=submit` verifies entitlement (purchase lookup)
3. Rate limit per buyer (cost control); reject oversized payloads
4. Forward code + hidden tests to sandbox; await result
5. Compare outputs to reference within per-test tolerance
6. Persist attempt + score; return diagnostics
7. Email scorecard using the branded template + `hello@` sender

### 5.6 Data model (new tables)
```
gauntlet_projects(id, slug, title, difficulty, spec_url, active)
gauntlet_submissions(id, project_id, customer_email, submitted_at,
                     score, passed, tests_total, tests_passed,
                     runtime_ms, verdict, diagnostics_json)
gauntlet_certificates(id, customer_email, project_id, issued_at,
                      public_token, revoked)
```
Hidden tests and reference solutions are **server-side only** — never in a
table readable by the anon key, never shipped to the browser.

### 5.7 Security prerequisite (must be fixed first)
Open issue: the Supabase anon key can PATCH `products`, and 346 purchase rows
are readable. Entitlement checks for a paid grading product must not sit on a
database anon can write to, or buyers could grant themselves access and forge
certificates.

**Blocker: add `SUPABASE_SERVICE_ROLE_KEY` + RLS before launch.**

---

## 6. Build plan

**Phase 0 — prerequisites**
- [ ] Consolidate 3 campaign routes into `api/campaigns.js` (frees 2 slots)
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY`; RLS so anon cannot write
- [ ] Choose sandbox provider; stand up custom numeric image

**Phase 1 — one project end to end (thin slice)**
- [ ] Author project #1 (spec, data, public + hidden tests, reference)
- [ ] Create the 3 tables
- [ ] `api/gauntlet.js`: submit + entitlement + rate limit + sandbox call
- [ ] `/gauntlet.html` gated submission UI
- [ ] Scorecard email
- [ ] Verify: correct passes, subtly-wrong fails, malicious code contained

**Phase 2 — content scale-out**
- [ ] Author projects 2-8 (true bottleneck: reference + hidden tests)

**Phase 3 — commerce**
- [ ] Add product to Supabase; SEO page via existing generator
- [ ] Coupon `GAUNTLET20` (NB: only NAME20 works; NAME10 silently gives 0%)
- [ ] Certificates + public verification page

**Phase 4 — launch**
- [ ] Email the 24 existing project-pack buyers first (warmest segment)
- [ ] LinkedIn launch post

---

## 7. Honest risks

1. **Content authoring is the real cost.** Hidden tests + reference solutions
   for 8 non-trivial quant projects is the bulk of the effort. Underestimating
   this is the most likely failure mode.
2. **Sandbox cost scales with attempts, not sales.** Rate limiting and attempt
   caps are mandatory.
3. **New support load.** "Works locally, fails your grader" becomes a
   recurring ticket. Public sample tests reduce but do not eliminate this.
4. **Numeric tolerance is genuinely hard.** Too tight = correct solutions fail
   and buyers are angry; too loose = wrong solutions pass and the product's
   only claim collapses. Needs calibration against multiple independent
   implementations.
5. **Scope fallback.** If Phases 0-2 prove too heavy, fall back to
   submission-of-results grading (no code execution, no sandbox). Keeps most
   of the perceived value and ships on the current stack. Hold in reserve.

---

## 8. Financial sketch

Conservative first 90 days: 10-15 units at Rs.2,999 = **Rs.30,000-45,000**.
Sandbox cost at ~8 attempts/buyer is a small monthly bill if self-hosting
Piston/Judge0; higher on managed providers.

Strategic value exceeds direct revenue: it is the only product in the
catalogue that cannot be pirated as a PDF, because the value lives in the
grader, not the document.
