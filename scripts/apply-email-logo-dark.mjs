// One-off: add the site mark to the email headers that use a DARK gradient
// bar, which the earlier light-header pass (scripts/apply-email-logo.mjs) did
// not touch.
//
// The mark is a #090909 rounded tile, so it disappears on these dark headers.
// Rather than ship an inverted/recoloured variant -- a different logo -- the
// image sits on a small white chip, so the exact site mark stays intact and
// is guaranteed visible.
//
// Email-client constraints (same as the light-header pass):
//   - <table> not flex: Outlook's Word engine ignores display:flex.
//   - width/height as HTML attributes: Outlook renders at native 128px otherwise.
//   - Absolute https:// src: email clients have no page context for relative paths.
//
// Run: node scripts/apply-email-logo-dark.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const LOGO_CHIP = '<img src="https://desk2quant.com/assets/images/email-logo.png" width="40" height="40" alt="Desk2Quant" style="display:block; width:40px; height:40px; border:0; outline:none; text-decoration:none; background:#ffffff; border-radius:11px;">';

// Promo senders: three files sharing one byte-identical wordmark line.
const OLD_PROMO = '<div style="font-size:28px; font-weight:800; color:#ffffff; letter-spacing:1px; margin-bottom:6px;">Desk2Quant</div>';
const NEW_PROMO = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 6px auto;"><tr><td style="padding-right:12px; vertical-align:middle;">${LOGO_CHIP}</td><td style="vertical-align:middle;"><span style="font-size:28px; font-weight:800; color:#ffffff; letter-spacing:1px;">Desk2Quant</span></td></tr></table>`;

// Recommendation email (lib/, reached from api/reminders.js) uses an <h1>.
const OLD_REC = '<h1 style="color:#ffffff; font-size:26px; font-weight:800; margin:0 0 4px 0;">Desk2Quant</h1>';
const NEW_REC = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 4px auto;"><tr><td style="padding-right:12px; vertical-align:middle;">${LOGO_CHIP}</td><td style="vertical-align:middle;"><span style="color:#ffffff; font-size:26px; font-weight:800;">Desk2Quant</span></td></tr></table>`;

const TARGETS = [
    ['api/send-latest-products.js', OLD_PROMO, NEW_PROMO],
    ['api/send-promo-latest.js', OLD_PROMO, NEW_PROMO],
    ['api/send-single-buyer-offers.js', OLD_PROMO, NEW_PROMO],
    ['lib/recommendationEmail.js', OLD_REC, NEW_REC]
];

let total = 0;
for (const [file, oldStr, newStr] of TARGETS) {
    const src = readFileSync(file, 'utf8');
    const hits = src.split(oldStr).length - 1;
    if (hits !== 1) {
        console.error(`FAIL ${file}: expected 1 header, found ${hits}`);
        process.exit(1);
    }
    writeFileSync(file, src.split(oldStr).join(newStr), 'utf8');
    console.log(`ok   ${file}`);
    total += hits;
}
console.log(`\n${total} dark headers updated`);
