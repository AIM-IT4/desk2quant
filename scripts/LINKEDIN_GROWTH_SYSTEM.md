# Desk2Quant LinkedIn Viral Growth & High-Converting Sales Playbook

This document defines the strict standard for all Desk2Quant LinkedIn content, algorithmic optimization, and technical posting automation to maximize reach, engagement, and digital product sales.

---

## 1. LinkedIn Algorithm Ranking Signals (How to Maximize Reach)

1. **Dwell Time is #1:**
   - Pure text posts have an average dwell time of ~5-10 seconds.
   - Document Carousels (PDFs) average 45-90 seconds as readers swipe through 6-8 slides.
   - LinkedIn's ranking algorithm interprets high dwell time as exceptional value, catapulting the post from 1st-degree connections into 2nd and 3rd-degree feeds.

2. **The "See More" Click Signal:**
   - The first 200–210 characters (lines 1 to 3) are all that appear before LinkedIn's `...see more` fold.
   - A click on `...see more` within the first 60 minutes of posting is one of the highest weighted user intent signals.
   - **Rule:** The first 2 lines must pose a high-stakes scenario, a counter-intuitive market insight, or a common misconception. Never waste line 1 on pleasantries or generic AI fluff.

3. **Saves & Bookmarks (The Secret Virality Multiplier):**
   - Posts containing cheat-sheets, discrete formulas, and diagnostic checklists receive high bookmark/save rates.
   - Saves trigger continuous algorithmic push days and weeks after the initial post.

---

## 2. High-Converting Copywriting Architecture (Turning Reach into Buyers)

Every post must follow the **5-Part Desk-First Formula**:

```
[PART 1: THE DISRUPTIVE HOOK] (< 200 chars, before '...see more')
Real desk or interview scenario where a standard academic answer fails.

[PART 2: THE ANATOMY OF THE FAILURE]
Why the candidate was wrong. The difference between continuous theory and discrete trading reality.

[PART 3: THE PRACTITIONER INSIGHT & MATH]
The actual formula or framework used on desks (e.g. PnL attribution, discrete gamma, skew twist).
Formatted with clean, readable ASCII math.

[PART 4: THE VISUAL ANCHOR]
"Swipe through the slides below for the complete breakdown:"
Directs attention to the 6-slide carousel.

[PART 5: THE NATURAL SALES BRIDGE & CTAs]
Direct, bulleted links to the exact matching Desk2Quant products + verified URLs + coupon codes.
```

### Prohibited Patterns (Never Do These):
- No AI Clichés: Never begin with "Most quant candidates don't fail because they don't know the math", "In the fast-paced world of quantitative finance", or "Let's dive in".
- No Raw LaTeX: Never write `$\Delta$` or `$\frac{\partial V}{\partial S}$` in post text (LinkedIn does not render LaTeX).
- No Broken Links: Every single URL must be pre-verified to return `HTTP 200 OK`.

---

## 3. Technical Safeguards & Publishing Rules

To prevent any truncation, broken characters, or API failures:

1. **100% Clean ASCII Text:**
   - Never use multi-byte 4-byte emojis or smart quotes directly in API commentary. LinkedIn's REST API parsers can silently truncate text at non-ASCII boundaries.
   - Use safe ASCII equivalents: `~`, `'`, `*`, `^2`, `-`.

2. **File-Based Execution:**
   - Never pass multi-line copy directly through bash CLI strings (`node -e '...'`).
   - Always write copy to `scripts/post_text.txt` and read with `fs.readFileSync`.

3. **Carousel Specifications:**
   - **Dimensions:** 1080 × 1350 px (4:5 vertical portrait for maximum screen real estate on mobile).
   - **Theme:** High-contrast dark mode (`#0B0F17` background, `#00E599` emerald accents, `#00B4D8` cyan highlights, `#FFFFFF` crisp text).
   - **Slide Count:** 5 to 7 slides maximum.
   - **Slide 1:** Bold hook headline.
   - **Final Slide:** Clear Desk2Quant roadmap, product lineup, and coupon code.

4. **API Versioning:**
   - Always specify `'Linkedin-Version': '202503'` and `'X-Restli-Protocol-Version': '2.0.0'`. Older versions (e.g. `202401`) are rejected with `426 NONEXISTENT_VERSION`.

---

## 4. Key Product Matrix & Verified Links

| Product | Target Audience | Direct Verified URL | Active Coupon |
| :--- | :--- | :--- | :--- |
| **Common Mistakes Edition** | Interview candidates, intermediate quants | `https://desk2quant.com/products/common-mistakes-in-quant-interviews-desk-fixes-edition.html` | `MISTAKES10` |
| **Absolute Beginners Notes** | Students, career switchers, math/CS grads | `https://desk2quant.com/products/quantitative-finance-for-absolute-beginners-from-desk-to-quant.html` | `BEGINNER10` |
| **Derivatives Master Pack (6 PDFs)** | Rates, FX, Equity, Credit derivative traders | `https://desk2quant.com/products/derivatives-products-and-pricing-master-pack-6-pdfs-ir-fx-equity-credi.html` | `MISTAKES10` |
| **Vol Surface Construction Playbook** | Vol quants, exotics pricing | `https://desk2quant.com/products/the-vol-surface-construction-playbook-svi-ssvi-static-arbitrage-and-du.html` | `MISTAKES10` |
| **Full 40-Guide Catalog** | General traffic, bundle buyers | `https://desk2quant.com/products/` | `MISTAKES10` |
| **Interactive Storefront** | Direct 1-click Razorpay checkout | `https://desk2quant.com/#products` | `MISTAKES10` |
