// Server-side pricing authority.
//
// WHY THIS FILE EXISTS: create-order.js used to trust whatever `amount` the
// client sent, and razorpay-webhook.js granted access purely because Razorpay
// reported the payment as captured -- neither step ever checked the amount
// against the product/session's real price. That let anyone pay any amount
// (proven live via test-payment.html, a ₹1 checkout) for any product.
//
// This module re-derives the true minimum acceptable INR price for a
// product or session, applying the *same* discount rules the frontend
// already exposes in script.js / product.html, so legitimate discounted
// checkouts still work. It intentionally mirrors those rules 1:1 -- if a
// coupon rule changes on the frontend, it must change here too.

// Server-side reads must use the service-role key: RLS now denies `anon`
// SELECT on products/sessions (sealed columns like enable_ppp), so the old
// inline anon fallback made create-order fail with a 500 and no checkout
// modal ever opened. Fail closed via serviceHeaders() instead.
import { SUPABASE_URL, serviceHeaders } from './supabaseAdmin.js';

// Campaign 20% codes keyed by (substring of) product name -- mirrors
// COUPON_MAP_20 in product.html / script.js exactly.
const COUPON_MAP_20 = {
    'quantitative finance for absolute beginners': 'BEGINNER20',
    'common mistakes in quant interviews': 'MISTAKES20',
    'quant interview problem book': 'PROBLEMS20',
    'greek explainer lab': 'GLAB20',
    'quant models for each asset class master pack': 'MODELS20',
    'the stochastic calculus visual lab': 'STOCHLAB20',
    'complete quant ats friendly resume': 'RESUME20',
    'mental math & market intuition for quants': 'MENTALMATH20',
    'python for quants': 'PYTHON20',
    'derivatives products & pricing master pack': 'DERIVATIVE20',
    'statistics & econometrics for quants': 'STATS20',
    'pnl attribution & desk diagnostics for quants': 'PNL20',
    'equity models': 'EQUITIES20',
    'interest rate models': 'RATES20',
    'machine learning for quants': 'ML20',
    'stochastic calculus for quants': 'STOCHASTIC20',
    'linear algebra & differential equations for quants': 'LADE20',
    'ultimate industry grade quant project pack': 'PROJECT20',
    'greeks,vols,ycurves,numerical meth./mc & xva guide': 'DESK20',
    'credit models': 'CREDITS20',
    'sql for quant interviews': 'SQL20',
    'regulatory & risk frameworks for quants': 'RISK20',
    'probability theory for quants': 'PROBABILITY20',
    'fx models': 'FXD20',
    'c++ for quants': 'CPP20',
    'r for risk quants': 'R20',
    'fixed income math & bond pricing': 'FIXEDINCOME20',
    'exotic options pricing guide': 'EXOTICS20'
};

const LAUNCH15_PRODUCT_ID = '6b78550d-e130-41d1-9409-92335ce82a6c';
export const LIVE_TEST_PRODUCT_ID = '00000000-0000-0000-0000-000000000001';

export const LIVE_TEST_PRODUCT = {
    id: LIVE_TEST_PRODUCT_ID,
    name: 'Live Verification Test Pack (1 INR)',
    price: 1,
    original_price: 99,
    discount_percentage: 0,
    coupon_code: null,
    enable_ppp: false,
    file_url: 'https://desk2quant.com/my-access.html'
};

function normalize(value) {
    return String(value || '').trim().toLowerCase();
}

async function fetchProductById(productId) {
    if (productId === LIVE_TEST_PRODUCT_ID || productId === 'd2q-test-product-1inr') {
        return LIVE_TEST_PRODUCT;
    }
    const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=id,name,price,discount_percentage,coupon_code,enable_ppp`,
        { headers: serviceHeaders() }
    );
    if (!resp.ok) throw new Error(`Supabase products lookup failed: ${resp.status}`);
    const rows = await resp.json();
    return rows && rows[0] ? rows[0] : null;
}

// grant-access.js falls back to this when a payment's notes carry no
// product_id (e.g. a raw Razorpay Checkout call that bypassed create-order.js).
// Without it the price-tamper guard there silently no-ops.
async function fetchProductByName(productName) {
    const want = normalize(productName);
    if (want.includes('verification test pack') || want.includes('live test product') || want.includes('test pack')) {
        return LIVE_TEST_PRODUCT;
    }
    const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/products?select=id,name,price,discount_percentage,coupon_code,enable_ppp`,
        { headers: serviceHeaders() }
    );
    if (!resp.ok) throw new Error(`Supabase products lookup failed: ${resp.status}`);
    const rows = await resp.json();
    if (!Array.isArray(rows)) return null;
    return rows.find((row) => normalize(row.name) === want) || null;
}

async function fetchSessionById(sessionId) {
    const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(sessionId)}&select=id,name,price,duration,is_active`,
        { headers: serviceHeaders() }
    );
    if (!resp.ok) throw new Error(`Supabase sessions lookup failed: ${resp.status}`);
    const rows = await resp.json();
    return rows && rows[0] ? rows[0] : null;
}

// Look up a personalised post-purchase coupon (e.g. AYAN20) via the same
// RPC the frontend uses (migrations 0006/0008). Returns a discount percent
// (number) or null if the code isn't a valid issued coupon.
async function validatePersonalizedCoupon(code) {
    try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validate_recommendation_coupon_code`, {
            method: 'POST',
            headers: serviceHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ p_code: code })
        });
        if (!resp.ok) return null;
        const result = await resp.json();
        return (typeof result === 'number' && result > 0) ? result : null;
    } catch (_) {
        return null;
    }
}

// Resolve the best discount percent (0-100) a given coupon code legitimately
// grants for a product. Mirrors the branching in product.html / script.js
// coupon handlers exactly, so valid frontend coupons keep working.
async function resolveProductDiscountPercent(product, couponCode) {
    if (!couponCode) return 0;
    const inputCodeUpper = String(couponCode).trim().toUpperCase();
    if (!inputCodeUpper) return 0;

    // 1. Product-specific coupon_code column, or the LAUNCH15 special case.
    if ((product.coupon_code && inputCodeUpper === String(product.coupon_code).toUpperCase()) ||
        (inputCodeUpper === 'LAUNCH15' && product.id === LAUNCH15_PRODUCT_ID)) {
        return inputCodeUpper === 'LAUNCH15' ? 15 : (product.discount_percentage || 0);
    }

    // 2. Sitewide flat coupons.
    if (inputCodeUpper === 'VASUDHA30') return 30;
    if (inputCodeUpper === 'BUNDLE15') return 15;

    // 3. Campaign 20% codes keyed by product name.
    const expected20Code = product.coupon_code ? String(product.coupon_code).replace('10', '20').toUpperCase() : null;
    const productName = normalize(product.name);
    const mapKey = Object.keys(COUPON_MAP_20).find(k => productName.includes(k));
    const hardcoded20 = mapKey ? COUPON_MAP_20[mapKey].toUpperCase() : null;
    if (inputCodeUpper === expected20Code || inputCodeUpper === hardcoded20) return 20;

    // 4. Personalised post-purchase/post-booking coupons (e.g. AYAN20),
    //    verified server-side against recommendation_emails via RPC.
    if (/^[A-Z]{3,40}20(?:[A-F0-9]{8})?$/.test(inputCodeUpper)) {
        const personalized = await validatePersonalizedCoupon(inputCodeUpper);
        if (personalized) return personalized;
    }

    return 0;
}

// Sessions only support the sitewide/personalised coupons (no per-session
// coupon_code column exists), so this is a subset of resolveProductDiscountPercent.
async function resolveSessionDiscountPercent(couponCode) {
    if (!couponCode) return 0;
    const inputCodeUpper = String(couponCode).trim().toUpperCase();
    if (!inputCodeUpper) return 0;

    if (inputCodeUpper === 'VASUDHA30') return 30;
    if (inputCodeUpper === 'BUNDLE15') return 15;
    if (/^[A-Z]{3,40}20(?:[A-F0-9]{8})?$/.test(inputCodeUpper)) {
        const personalized = await validatePersonalizedCoupon(inputCodeUpper);
        if (personalized) return personalized;
    }
    return 0;
}

// --- Server-side FX conversion, mirroring convertPrice() in script.js ---

const WEAK_CURRENCIES = new Set([
    'PKR', 'BDT', 'LKR', 'NPR',
    'NGN', 'EGP', 'KES', 'GHS', 'ZAR',
    'VND', 'IDR', 'PHP', 'MYR', 'THB',
    'TRY', 'RUB', 'UAH',
    'BRL', 'MXN', 'ARS', 'COP', 'CLP', 'PEN'
]);

let ratesCache = null;
let ratesCacheAt = 0;
const RATES_CACHE_MS = 3600000; // 1 hour, same as script.js

async function fetchServerExchangeRates() {
    if (ratesCache && (Date.now() - ratesCacheAt) < RATES_CACHE_MS) return ratesCache;

    const apis = [
        // open.er-api first: it covers 166 currencies including AED and PKR.
        // Frankfurter is ECB-only (29 currencies) and omits both, so while it was
        // primary those buyers hit "Unsupported currency" and could not check out.
        'https://open.er-api.com/v6/latest/INR',
        'https://api.exchangerate-api.com/v4/latest/INR',
        'https://api.frankfurter.dev/v1/latest?from=INR'
    ];

    for (const apiUrl of apis) {
        try {
            const resp = await fetch(apiUrl);
            if (!resp.ok) continue;
            const data = await resp.json();
            const rates = data.rates || data.conversion_rates || null;
            if (rates) {
                ratesCache = rates;
                ratesCacheAt = Date.now();
                return rates;
            }
        } catch (_) { /* try next API */ }
    }
    // All APIs failed -- fall back to INR-only (rate 1), which only matches
    // requests actually priced in INR; anything else will fail the tolerance
    // check below rather than silently under-charging.
    return { INR: 1 };
}

// Mirrors convertPrice() in script.js: converts an INR amount to the target
// currency, applying a 1.5x PPP multiplier for strong currencies and a
// gentler 1.2x for weaker economies when enablePPP is true. Returns the amount in MAJOR units (e.g. 12.34 USD).
async function convertInrToCurrency(inrAmount, currencyCode, enablePPP) {
    const code = String(currencyCode || 'INR').toUpperCase();
    if (code === 'INR') return inrAmount;

    const rates = await fetchServerExchangeRates();
    const rate = rates[code] || null;
    if (!rate) return null; // unknown currency -- caller must reject

    let converted = inrAmount * rate;
    if (enablePPP) {
        // Strong currencies get 1.5x; weaker economies get a gentler 1.2x.
        converted = converted * (WEAK_CURRENCIES.has(code) ? 1.2 : 1.5);
    }
    return converted;
}

// Tolerance for FX-rate drift between the client's quote and the rate we
// fetch moments later (different API polling times / provider rounding).
// This is NOT a discount loophole -- it only forgives small legitimate
// currency-rate movement, and always applies to the post-coupon floor price.
const FX_TOLERANCE = 0.06; // 6%
const MIN_ABSOLUTE_TOLERANCE_INR = 5; // avoid false rejects on tiny INR prices

// Zero-decimal currencies (Razorpay/Stripe convention): smallest unit IS the
// major unit, no /100 subunit conversion. MUST stay identical to the list in
// api/razorpay-webhook.js and api/grant-access.js -- a divergence here makes
// the price-tamper guard compare a 100x-wrong amount.
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'PYG', 'UGX']);

/**
 * Computes the authoritative order for a PRODUCT purchase.
 * @param {string} productId - Supabase products.id (UUID)
 * @param {string} currency - requested payment currency (e.g. 'INR', 'USD')
 * @param {string} couponCode - optional coupon code claimed by the client
 * @returns {Promise<{ok:true, product, currency, amountMajor, amountInr, discountPercent}|{ok:false, error}>}
 */
async function getExpectedProductOrder(productId, currency, couponCode) {
    if (!productId) return { ok: false, error: 'product_id is required' };

    const product = await fetchProductById(productId);
    if (!product) return { ok: false, error: 'Product not found' };

    const basePrice = Number(product.price) || 0;
    if (basePrice <= 0) return { ok: false, error: 'Product is free; no order needed' };

    const discountPercent = await resolveProductDiscountPercent(product, couponCode);
    const inrFloor = Math.max(0, basePrice * (100 - discountPercent) / 100);

    const targetCurrency = String(currency || 'INR').toUpperCase();
    let amountMajor;
    if (targetCurrency === 'INR') {
        amountMajor = inrFloor;
    } else {
        const converted = await convertInrToCurrency(inrFloor, targetCurrency, product.enable_ppp);
        if (converted === null) return { ok: false, error: `Unsupported currency: ${targetCurrency}` };
        amountMajor = converted;
    }

    return {
        ok: true,
        product,
        currency: targetCurrency,
        amountMajor,
        amountInr: inrFloor,
        discountPercent
    };
}

/**
 * Computes the authoritative order for a SESSION booking.
 */
async function getExpectedSessionOrder(sessionId, currency, couponCode) {
    if (!sessionId) return { ok: false, error: 'session_id is required' };

    const session = await fetchSessionById(sessionId);
    if (!session || session.is_active === false) return { ok: false, error: 'Session not found or inactive' };

    const basePrice = Number(session.price) || 0;
    if (basePrice <= 0) return { ok: false, error: 'Session is free; no order needed' };

    const discountPercent = await resolveSessionDiscountPercent(couponCode);
    const inrFloor = Math.max(0, basePrice * (100 - discountPercent) / 100);

    const targetCurrency = String(currency || 'INR').toUpperCase();
    let amountMajor;
    if (targetCurrency === 'INR') {
        amountMajor = inrFloor;
    } else {
        // Sessions always request PPP-adjusted conversion (mirrors script.js:
        // convertPrice(sessionInfo.price, userCountryCode, true)).
        const converted = await convertInrToCurrency(inrFloor, targetCurrency, true);
        if (converted === null) return { ok: false, error: `Unsupported currency: ${targetCurrency}` };
        amountMajor = converted;
    }

    return {
        ok: true,
        session,
        currency: targetCurrency,
        amountMajor,
        amountInr: inrFloor,
        discountPercent
    };
}

function getSubunitMultiplier(currencyCode) {
    return ZERO_DECIMAL_CURRENCIES.has(String(currencyCode).toUpperCase()) ? 1 : 100;
}

function isZeroDecimalCurrency(currencyCode) {
    return ZERO_DECIMAL_CURRENCIES.has(String(currencyCode).toUpperCase());
}

/**
 * Computes the authoritative order for a multi-item CART checkout.
 * Re-derives each line item's price server-side (same rules as a single
 * product purchase) and sums them into one combined order -- this is what
 * lets "Add to cart" -> "Checkout" charge exactly once instead of the old
 * one-by-one Buy Now flow, without ever trusting a client-supplied total.
 * @param {{product_id:string, quantity:number, coupon_code?:string}[]} items - each
 *   item MAY carry its own coupon_code (per-product coupon applied in the cart drawer);
 *   falls back to the cart-level couponCode if the item doesn't specify one.
 * @param {string} currency
 * @param {string} couponCode - optional cart-wide fallback coupon
 */
async function getExpectedCartOrder(items, currency, couponCode) {
    if (!Array.isArray(items) || items.length === 0) {
        return { ok: false, error: 'Cart is empty' };
    }
    // Razorpay caps each note VALUE at 256 chars, and create-order.js packs the
    // cart into notes.cart_items as "uuid:qty:coupon" triples. A 36-char UUID
    // plus separators is ~40 chars per item, so only 6 plain items fit (239
    // chars) and fewer once per-item coupons are present. 5 is the largest cap
    // that always fits even when every line carries a long coupon code.
    const MAX_CART_ITEMS = 5;
    if (items.length > MAX_CART_ITEMS) {
        return { ok: false, error: `Too many items in one checkout (max ${MAX_CART_ITEMS}) — please split into two orders` };
    }

    const targetCurrency = String(currency || 'INR').toUpperCase();
    const lineItems = [];
    let totalMajor = 0;
    let totalInr = 0;

    for (const raw of items) {
        const productId = raw && raw.product_id;
        const quantity = Math.max(1, Math.min(20, Number(raw && raw.quantity) || 1));
        if (!productId) return { ok: false, error: 'Each cart item requires product_id' };

        const product = await fetchProductById(productId);
        if (!product) return { ok: false, error: `Product not found: ${productId}` };

        const basePrice = Number(product.price) || 0;
        if (basePrice <= 0) continue; // free items need no payment line

        // Each item can carry its own coupon (applied per-product in the cart
        // drawer); fall back to the cart-level coupon if it doesn't.
        const itemCouponCode = (raw && raw.coupon_code) || couponCode;
        const discountPercent = await resolveProductDiscountPercent(product, itemCouponCode);
        const inrFloorEach = Math.max(0, basePrice * (100 - discountPercent) / 100);

        let amountMajorEach;
        if (targetCurrency === 'INR') {
            amountMajorEach = inrFloorEach;
        } else {
            const converted = await convertInrToCurrency(inrFloorEach, targetCurrency, product.enable_ppp);
            if (converted === null) return { ok: false, error: `Unsupported currency: ${targetCurrency}` };
            amountMajorEach = converted;
        }

        totalMajor += amountMajorEach * quantity;
        totalInr += inrFloorEach * quantity;

        lineItems.push({
            productId: product.id,
            name: product.name,
            quantity,
            unitAmountMajor: amountMajorEach,
            unitAmountInr: inrFloorEach,
            discountPercent,
            couponCode: discountPercent > 0 ? (itemCouponCode || null) : null
        });
    }

    if (lineItems.length === 0) {
        return { ok: false, error: 'Cart has no payable items' };
    }

    return {
        ok: true,
        currency: targetCurrency,
        amountMajor: totalMajor,
        amountInr: totalInr,
        lineItems
    };
}

// True if `claimedMajor` (what Razorpay actually captured, in MAJOR units of
// the payment currency) is acceptably close to `expectedMajor` (server-computed
// floor, same units) -- allows tiny FX drift but rejects any real underpayment.
// FX_TOLERANCE is a fraction (currency-agnostic); MIN_ABSOLUTE_TOLERANCE_INR is
// in INR and is converted for non-INR payments -- otherwise a £2.32 session
// would get a £5 absolute floor and the guard would pass any non-negative
// payment. The webhook call sites pass INR amounts (amountInr), so INR stays on
// the plain path.
async function isWithinTolerance(claimedMajor, expectedMajor, currencyCode = 'INR') {
    if (expectedMajor <= 0) return claimedMajor <= 0;
    const code = String(currencyCode || 'INR').toUpperCase();
    const relativeGap = expectedMajor * FX_TOLERANCE;
    let absoluteGap = MIN_ABSOLUTE_TOLERANCE_INR;
    if (code !== 'INR') {
        const rates = await fetchServerExchangeRates();
        const rate = rates[code];
        if (!rate) return claimedMajor >= (expectedMajor - relativeGap); // unknown currency — no absolute floor
        absoluteGap = MIN_ABSOLUTE_TOLERANCE_INR * rate;
    }
    const allowedGap = Math.max(relativeGap, absoluteGap);
    return claimedMajor >= (expectedMajor - allowedGap);
}

// --- AI mock-interview durations (interview.html) ---
// Not stored in Supabase -- fixed catalog mirroring the onclick(mins, price)
// values in interview.html's duration picker. Keep these in sync if the
// pricing on that page ever changes.
const INTERVIEW_DURATION_PRICES_INR = { 10: 0, 30: 499, 45: 799 };

/**
 * Computes the authoritative order for an AI mock-interview session.
 * No coupons/discounts apply to this product.
 */
async function getExpectedInterviewOrder(durationMinutes, currency) {
    const minutes = Number(durationMinutes);
    if (!(minutes in INTERVIEW_DURATION_PRICES_INR)) {
        return { ok: false, error: 'Invalid interview duration' };
    }

    const inrFloor = INTERVIEW_DURATION_PRICES_INR[minutes];
    if (inrFloor <= 0) return { ok: false, error: 'Free trial; no order needed' };

    const targetCurrency = String(currency || 'INR').toUpperCase();
    let amountMajor;
    if (targetCurrency === 'INR') {
        amountMajor = inrFloor;
    } else {
        const converted = await convertInrToCurrency(inrFloor, targetCurrency, false);
        if (converted === null) return { ok: false, error: `Unsupported currency: ${targetCurrency}` };
        amountMajor = converted;
    }

    return { ok: true, currency: targetCurrency, amountMajor, amountInr: inrFloor, discountPercent: 0 };
}

export {
    getExpectedProductOrder,
    getExpectedSessionOrder,
    getExpectedInterviewOrder,
    getExpectedCartOrder,
    getSubunitMultiplier,
    isZeroDecimalCurrency,
    isWithinTolerance,
    fetchProductById,
    fetchProductByName,
    fetchSessionById,
    resolveProductDiscountPercent,
    resolveSessionDiscountPercent,
    validatePersonalizedCoupon
};
