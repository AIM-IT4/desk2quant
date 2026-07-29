// One-time backfill: reconstruct recommendation_emails rows for customers who
// received a FIRSTNAME20 coupon by email BEFORE the durable queue table
// existed (commit 45ebdf9, merged 2026-07-28). Before that, coupons were
// generated and emailed synchronously from the webhook but never persisted
// anywhere — so product.html's validate_recommendation_coupon() RPC (added in
// cba0c1f) has no row to match them against, and the customer's real,
// already-emailed code shows as "invalid".
//
// Window: from e88f369 (2026-07-19T19:51:00Z, when FIRSTNAME20 emails began)
// to 45ebdf9 (2026-07-28T14:39:00Z, when the reliable queue took over).
//
// Safe to re-run: skips any email already present in recommendation_emails.
//
// Usage: node scripts/backfill-recommendation-coupons.js [--dry-run]

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudGFibXl1cmxybG5vYWpkbmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDEyNjUsImV4cCI6MjA4NTY3NzI2NX0.PYpNd_t_px09zi2d5WGjFVOB23sjb3ZPuAnxagYshe0';

const WINDOW_START = '2026-07-19T19:51:00Z';
const WINDOW_END = '2026-07-28T14:39:00Z';
const DRY_RUN = process.argv.includes('--dry-run');

// Excludes the site owner's own smoke-test rows so we don't pollute the table.
const TEST_PATTERNS = /test|sandbox|delete me|debug|remove after/i;
const OWNER_EMAILS = new Set([
    'iitamit97@gmail.com',
    'jha.8@alumni.iitj.ac.in',
    'jha.8@iitj.ac.in',
    'rashmijha1234567@gmail.com'
]);

function firstNameCoupon(name) {
    const firstName = (name || 'Customer').split(' ')[0].replace(/[^a-zA-Z]/g, '').toUpperCase() || 'FRIEND';
    return `${firstName}20`;
}

async function sb(path) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    if (!resp.ok) throw new Error(`${path} -> ${resp.status}: ${await resp.text()}`);
    return resp.json();
}

async function insertRow(row) {
    if (DRY_RUN) {
        console.log('[dry-run] would insert:', row);
        return;
    }
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/recommendation_emails`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
        },
        body: JSON.stringify(row)
    });
    if (!resp.ok) throw new Error(`Insert failed for ${row.customer_email}: ${resp.status} ${await resp.text()}`);
    console.log(`✅ inserted ${row.customer_email} [${row.coupon_code}]`);
}

async function main() {
    console.log(`Backfilling recommendation_emails for window ${WINDOW_START} .. ${WINDOW_END}${DRY_RUN ? ' (DRY RUN)' : ''}`);

    const existing = await sb('recommendation_emails?select=customer_email');
    const alreadyCovered = new Set(existing.map(r => (r.customer_email || '').toLowerCase()));
    console.log(`${alreadyCovered.size} email(s) already have a row — will skip those.`);

    const purchases = await sb(
        `purchases?select=customer_email,product_name,created_at&created_at=gte.${WINDOW_START}&created_at=lt.${WINDOW_END}&order=created_at.asc`
    );
    const bookings = await sb(
        `bookings?select=email,name,service_name,created_at,status&created_at=gte.${WINDOW_START}&created_at=lt.${WINDOW_END}&status=neq.cancelled&order=created_at.asc`
    );

    // customer_name isn't stored on purchases; bookings has a real name. Build
    // a name lookup from bookings first, fall back to deriving from email.
    const nameByEmail = new Map();
    for (const b of bookings) {
        if (b.email) nameByEmail.set(b.email.toLowerCase(), b.name);
    }

    const candidates = new Map(); // email(lower) -> { email, name, product, created_at, trigger }

    for (const p of purchases) {
        const email = (p.customer_email || '').trim();
        const product = p.product_name || '';
        if (!email || !email.includes('@')) continue;
        if (TEST_PATTERNS.test(product) || TEST_PATTERNS.test(email) || OWNER_EMAILS.has(email.toLowerCase())) continue;
        const isBundle = product.toLowerCase().includes('complete') && product.toLowerCase().includes('bundle');
        if (isBundle) continue; // webhook skips recs for bundle buyers
        const key = email.toLowerCase();
        if (alreadyCovered.has(key) || candidates.has(key)) continue;
        candidates.set(key, {
            email, name: nameByEmail.get(key) || email.split('@')[0],
            product, created_at: p.created_at, trigger: 'product_purchase'
        });
    }

    for (const b of bookings) {
        const email = (b.email || '').trim();
        const service = b.service_name || '';
        if (!email || !email.includes('@')) continue;
        if (TEST_PATTERNS.test(service) || TEST_PATTERNS.test(email) || OWNER_EMAILS.has(email.toLowerCase())) continue;
        const key = email.toLowerCase();
        if (alreadyCovered.has(key) || candidates.has(key)) continue;
        candidates.set(key, {
            email, name: b.name || email.split('@')[0],
            product: service, created_at: b.created_at, trigger: 'session_booking'
        });
    }

    console.log(`${candidates.size} candidate(s) to backfill.`);

    for (const c of candidates.values()) {
        const couponCode = firstNameCoupon(c.name);
        await insertRow({
            customer_email: c.email,
            customer_name: c.name,
            purchased_product: c.product,
            trigger_type: c.trigger,
            coupon_code: couponCode,
            send_at: c.created_at,
            status: 'sent',
            sent: true,
            sent_at: c.created_at,
            attempts: 1
        });
    }

    console.log('Done.');
}

main().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
