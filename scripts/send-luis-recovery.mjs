// One-off abandoned-cart recovery email for dykahshs@gmail.com (Luis du, BE).
// Failed payment pay_TKGrzgJttVgQ54 - EUR 109.55 cart, 3DS authentication_failed,
// 2026-07-31. Never completed any purchase. Coupon LUIS20 issued + verified.
// Run: node scripts/send-luis-recovery.mjs [--dry-run]

import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/BREVO_API_KEY\s*=\s*"?([^"\n]*)"?/);
const BREVO_API_KEY = m ? m[1].trim() : '';
if (!BREVO_API_KEY) { console.error('BREVO_API_KEY missing'); process.exit(1); }

const TO_EMAIL = 'dykahshs@gmail.com';
const NAME = 'Luis';
const COUPON = 'LUIS20';
const PRODUCT_ID = '164308cd-e3cd-4026-8fdc-337a5955ffff';
const PRODUCT_NAME = 'Complete Front Office & Risk Quant Professional Bundle';
const OLD_EUR = '109.55';
const NEW_EUR = '87.64';
const URL = `https://desk2quant.com/product.html?id=${PRODUCT_ID}`;

const dry = process.argv.includes('--dry-run');

const { buildHtml, buildText } = await import('./luis-recovery-template.mjs');
const args = { name: NAME, couponCode: COUPON, productName: PRODUCT_NAME, oldPrice: OLD_EUR, newPrice: NEW_EUR, productUrl: URL };
const subject = 'Your payment didn\u2019t go through \u2014 here\u2019s 20% off to finish it';

console.log(`${dry ? '[DRY RUN]' : 'Sending'} -> ${TO_EMAIL}`);
console.log(`  subject: ${subject}`);
console.log(`  coupon: ${COUPON} | EUR ${OLD_EUR} -> EUR ${NEW_EUR}`);
console.log(`  url: ${URL}`);
if (dry) { console.log('\n--- TEXT ---\n' + buildText(args)); process.exit(0); }

const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
        sender: { name: 'Amit — Desk2Quant', email: 'desk2quant@gmail.com' },
        replyTo: { email: 'desk2quant@gmail.com', name: 'Amit — Desk2Quant' },
        to: [{ email: TO_EMAIL, name: 'Luis du' }],
        subject,
        htmlContent: buildHtml(args),
        textContent: buildText(args)
    })
});

if (resp.ok) { const j = await resp.json(); console.log('Sent OK. messageId:', j.messageId); }
else { console.error('FAILED', resp.status, await resp.text()); process.exit(1); }
