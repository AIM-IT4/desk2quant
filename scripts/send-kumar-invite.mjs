// One-off dedicated invite email for Kumar3512@gmail.com (Topmate buyer of
// "Quant Finance Starter Pack" + "Statistics for Quants") who hasn't bought
// from desk2quant.com yet. Uses manually curated 5-product list
// (excludes any "...Bundle" product), coupon KUMAR20 already inserted +
// verified against recommendation_emails/lib/pricing.js in chat.
//
// Run: node scripts/send-kumar-invite.mjs [--dry-run]

import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const brevoMatch = envContent.match(/BREVO_API_KEY\s*=\s*"?([^"\n]*)"?/);
const BREVO_API_KEY = brevoMatch ? brevoMatch[1].trim() : '';
if (!BREVO_API_KEY) { console.error('BREVO_API_KEY not found in .env.local'); process.exit(1); }

const SENDER_EMAIL = 'desk2quant@gmail.com';
const SENDER_NAME = 'Desk2Quant';

const SUPABASE_URL = 'https://dntabmyurlrlnoajdnja.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudGFibXl1cmxybG5vYWpkbmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDEyNjUsImV4cCI6MjA4NTY3NzI2NX0.PYpNd_t_px09zi2d5WGjFVOB23sjb3ZPuAnxagYshe0';

const CUSTOMER_EMAIL = 'Kumar3512@gmail.com';
const CUSTOMER_NAME = 'Kumar';
const COUPON_CODE = 'KUMAR20';
const DISCOUNT_PCT = 20;

const PRODUCT_IDS = [
    '73806d69-768b-497e-87b7-d94fa4cfd772',
    '9ad9f8ac-9872-40c3-82b8-1e6168e65062',
    'b6de5381-1399-4c50-a76d-b2709e081834',
    'bd2e57b7-32c4-44ad-8a2a-d156222b7ff7',
    '8b62619c-ce90-4274-9199-022d00a28000',
];

const isDryRun = process.argv.includes('--dry-run');

async function main() {
    const idList = PRODUCT_IDS.map(id => `"${id}"`).join(',');
    const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/products?id=in.(${idList})&select=id,name,description,price,cover_image_url`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!resp.ok) throw new Error(`Products fetch failed: ${resp.status}`);
    const rows = await resp.json();
    const products = PRODUCT_IDS.map(id => rows.find(r => r.id === id)).filter(Boolean);
    if (products.length !== PRODUCT_IDS.length) {
        throw new Error(`Expected ${PRODUCT_IDS.length} products, found ${products.length}`);
    }

    const { buildHtml, buildText } = await import('./kumar-invite-template.mjs');
    const htmlContent = buildHtml({ customerName: CUSTOMER_NAME, couponCode: COUPON_CODE, discountPct: DISCOUNT_PCT, products });
    const textContent = buildText({ customerName: CUSTOMER_NAME, couponCode: COUPON_CODE, discountPct: DISCOUNT_PCT, products });
    const subject = `${CUSTOMER_NAME}, 5 more quant resources picked for you — 20% off`;

    console.log(`${isDryRun ? '[DRY RUN] Would send' : 'Sending'} to ${CUSTOMER_EMAIL} (coupon ${COUPON_CODE})`);
    products.forEach(p => console.log(`  - ${p.name} (Rs.${p.price} -> Rs.${Math.round(p.price * (1 - DISCOUNT_PCT / 100))})`));
    if (isDryRun) return;

    const sendResp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { accept: 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
            sender: { name: SENDER_NAME, email: SENDER_EMAIL },
            to: [{ email: CUSTOMER_EMAIL, name: CUSTOMER_NAME }],
            subject,
            htmlContent,
            textContent
        })
    });

    if (sendResp.ok) {
        const data = await sendResp.json();
        console.log(`Sent OK. Message ID: ${data.messageId}`);
    } else {
        const errText = await sendResp.text();
        console.error(`Failed: ${sendResp.status} ${errText}`);
        process.exit(1);
    }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
