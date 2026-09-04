// Admin auth + (new) live Razorpay revenue lookup.
//
// Extended in place (rather than adding a 13th serverless function — this
// project is at Vercel Hobby's 12-function limit) to also serve accurate
// revenue figures pulled directly from Razorpay's own Payments API. The
// Supabase `purchases` table has two independent data-quality problems that
// make it unsafe to trust for "last N days" dashboard math:
//   1. created_at has been observed storing timestamps ~5.5h in the past
//      (timezone-handling bug on that column), which silently excludes
//      recent real sales from any date-filtered query.
//   2. Every sale is logged twice (frontend + webhook), and historical rows
//      may still carry a stale, pre-discount/pre-FX inr_amount snapshot.
// Razorpay's Payments API has none of these problems: payment.created_at is
// the real capture instant, and payment.base_amount/base_currency is
// Razorpay's own settlement-time INR conversion (matches its dashboard
// exactly). Pulling directly from there gives the admin dashboard a source
// of truth that is correct regardless of what state the purchases table
// is in.

import crypto from 'crypto';

// In-memory sliding-window rate limit for admin authentication attempts
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimitBuckets = new Map();

function isRateLimited(req) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '');
    const ip = forwarded.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const hits = (rateLimitBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    hits.push(now);
    rateLimitBuckets.set(ip, hits);
    if (rateLimitBuckets.size > 5000) {
        for (const [key, times] of rateLimitBuckets) {
            if (!times.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) rateLimitBuckets.delete(key);
        }
    }
    return hits.length > RATE_LIMIT_MAX;
}

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
    const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
    return crypto.timingSafeEqual(ha, hb);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (isRateLimited(req)) {
        return res.status(429).json({ success: false, error: 'Too many requests. Please wait a moment and try again.' });
    }

    const { password, action } = req.body || {};
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        console.error('SERVER ERROR: ADMIN_PASSWORD is not configured in Vercel environment variables');
        return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    if (!password || typeof password !== 'string' || !safeEqual(password, adminPassword)) {
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    if (!action || action === 'login') {
        // Original behaviour: just confirm the password is correct.
        return res.status(200).json({ success: true });
    }

    if (action === 'get-key') {
        // Admin panel bootstrap: after the password is verified, hand over the
        // service-role key IN MEMORY ONLY so the browser's admin client can read
        // and write the RLS-sealed tables (products/sessions/bookings/purchases).
        // The key is never persisted (localStorage/sessionStorage) and is not
        // present in any static file -- it only exists in this response, gated
        // behind the same ADMIN_PASSWORD check as the login itself.
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || null;
        if (!key) {
            console.error('SERVER ERROR: no Supabase service key configured for admin get-key');
            return res.status(500).json({ success: false, error: 'Server configuration error' });
        }
        return res.status(200).json({ success: true, serviceKey: key });
    }

    if (action === 'revenue') {
        return handleRevenueLookup(req, res);
    }

    return res.status(400).json({ success: false, error: 'Unknown action' });
}

async function handleRevenueLookup(req, res) {
    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
        return res.status(500).json({ success: false, error: 'Razorpay credentials not configured' });
    }

    // from/to are unix seconds, provided by the dashboard for the selected range.
    const from = parseInt(req.body.from, 10);
    const to = parseInt(req.body.to, 10);
    if (!from || !to || to <= from) {
        return res.status(400).json({ success: false, error: 'Invalid from/to range' });
    }

    try {
        const auth = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
        let allItems = [];
        let skip = 0;
        const count = 100;

        // Razorpay paginates at 100 items/page; loop until a page comes back short.
        for (let page = 0; page < 20; page++) { // hard cap: 2000 payments per lookup
            const url = `https://api.razorpay.com/v1/payments?from=${from}&to=${to}&count=${count}&skip=${skip}`;
            const resp = await fetch(url, { headers: { Authorization: auth } });
            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`Razorpay API error ${resp.status}: ${errText}`);
            }
            const data = await resp.json();
            allItems = allItems.concat(data.items || []);
            if (!data.items || data.items.length < count) break;
            skip += count;
        }

        const captured = allItems.filter(p => p.status === 'captured');

        let totalInr = 0;
        const byDay = {}; // 'YYYY-MM-DD' (UTC) -> inr total, for chart use
        const products = {}; // product_name (from notes) -> { count, inr }

        captured.forEach(p => {
            const inr = (p.base_currency === 'INR' && typeof p.base_amount === 'number')
                ? p.base_amount / 100
                : (p.currency === 'INR' ? p.amount / 100 : (p.amount / 100)); // last-resort: raw amount, unconverted
            totalInr += inr;

            const day = new Date(p.created_at * 1000).toISOString().slice(0, 10);
            byDay[day] = (byDay[day] || 0) + inr;

            const productName = p.notes?.product_name || p.description || 'Unknown';
            const type = p.notes?.type || 'product';
            if (type === 'product') {
                if (!products[productName]) products[productName] = { count: 0, inr: 0 };
                products[productName].count += 1;
                products[productName].inr += inr;
            }
        });

        return res.status(200).json({
            success: true,
            totalInr: Math.round(totalInr * 100) / 100,
            count: captured.length,
            byDay,
            products,
            from,
            to
        });
    } catch (error) {
        console.error('Revenue lookup error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
