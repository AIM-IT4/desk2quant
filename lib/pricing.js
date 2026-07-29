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

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudGFibXl1cmxybG5vYWpkbmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDEyNjUsImV4cCI6MjA4NTY3NzI2NX0.PYpNd_t_px09zi2d5WGjFVOB23sjb3ZPuAnxagYshe0';

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

function normalize(value) {
    return String(value || '').trim().toLowerCase();
}

async function fetchProductById(productId) {
    const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=id,name,price,discount_percentage,coupon_code,enable_ppp`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!resp.ok) throw new Error(`Supabase products lookup failed: ${resp.status}`);
    const rows = await resp.json();
    return rows && rows[0] ? rows[0] : null;
}

async function fetchSessionById(sessionId) {
    const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(sessionId)}&select=id,name,price,duration,is_active`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
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
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
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
    if (inputCodeUpper === 'BUNDLE15' || inputCodeUpper.endsWith('15')) return 15;

    // 3. Campaign 20% codes keyed by product name.
    const expected20Code = product.coupon_code ? String(product.coupon_code).replace('10', '20').toUpperCase() : null;
    const productName = normalize(product.name);
    const mapKey = Object.keys(COUPON_MAP_20).find(k => productName.includes(k));
    const hardcoded20 = mapKey ? COUPON_MAP_20[mapKey].toUpperCase() : null;
    if (inputCodeUpper === expected20Code || inputCodeUpper === hardcoded20) return 20;

    // 4. Personalised post-purchase/post-booking coupons (e.g. AYAN20),
    //    verified server-side against recommendation_emails via RPC.
    if (/^[A-Z]{3,40}20$/.test(inputCodeUpper)) {
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
    if (inputCodeUpper === 'BUNDLE15' || inputCodeUpper.endsWith('15')) return 15;
    if (/^[A-Z]{3,40}20$/.test(inputCodeUpper)) {
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
        'https://api.frankfurter.app/latest?from=INR',
        'https://open.er-api.com/v6/latest/INR',
        'https://api.exchangerate-api.com/v4/latest/INR'
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
// currency, applying the 1.5x PPP multiplier for strong currencies when
// enablePPP is true. Returns the amount in MAJOR units (e.g. 12.34 USD).
async function convertInrToCurrency(inrAmount, currencyCode, enablePPP) {
    const code = String(currencyCode || 'INR').toUpperCase();
    if (code === 'INR') return inrAmount;

    const rates = await fetchServerExchangeRates();
    const rate = rates[code] || null;
    if (!rate) return null; // unknown currency -- caller must reject

    let converted = inrAmount * rate;
    if (enablePPP && !WEAK_CURRENCIES.has(code)) {
        converted = converted * 1.5;
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
// major unit, no /100 subunit conversion. Mirrors create-order.js today.
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);

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

// True if `claimedMajor` (what the client says it will pay) is acceptably
// close to `expectedMajor` (server-computed floor) -- allows tiny FX drift
// but rejects any real underpayment attempt.
function isWithinTolerance(claimedMajor, expectedMajor) {
    if (expectedMajor <= 0) return claimedMajor <= 0;
    const allowedGap = Math.max(expectedMajor * FX_TOLERANCE, MIN_ABSOLUTE_TOLERANCE_INR);
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
    getSubunitMultiplier,
    isWithinTolerance,
    fetchProductById,
    fetchSessionById,
    resolveProductDiscountPercent,
    resolveSessionDiscountPercent,
    validatePersonalizedCoupon
};
