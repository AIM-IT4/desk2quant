// One-off: swap the wordmark-only email header for the Design A lockup
// (logo left, wordmark right). All 6 header sites across razorpay-webhook.js
// and reminders.js are byte-identical, so a single literal replace covers them.
//
// Email-client constraints baked into the markup below:
//   - <table> not flex/inline-block: Outlook (Word rendering engine) ignores
//     display:flex and collapses inline-block gaps unpredictably.
//   - width/height as HTML attributes, not just CSS: Outlook renders the image
//     at native size otherwise, blowing the 600px card apart.
//   - Absolute https:// src: email clients have no page context for relative paths.
//   - alt text styled white at the wordmark's size, so a blocked image (Outlook
//     desktop and most corporate gateways block by default) degrades to
//     something that still reads as a header rather than a broken-image icon.
//   - assets/images/email-logo.png is a white knockout of the mark: the source
//     logo is dark teal (luminance 64) and would be invisible on the #1a1a1a bar.
//
// Run: node scripts/apply-email-logo.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const OLD = '<span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>';

const NEW = [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">',
    '<tr>',
    '<td style="padding-right: 12px; vertical-align: middle;">',
    '<img src="https://desk2quant.vercel.app/assets/images/email-logo.png" width="52" height="32" alt="Desk2Quant" style="display: block; width: 52px; height: 32px; border: 0; outline: none; text-decoration: none; color: #ffffff; font-size: 20px; font-weight: bold;">',
    '</td>',
    '<td style="vertical-align: middle;">',
    '<span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>',
    '</td>',
    '</tr>',
    '</table>'
].join('');

const FILES = ['api/razorpay-webhook.js', 'api/reminders.js'];
let total = 0;

for (const file of FILES) {
    const before = readFileSync(file, 'utf8');
    const hits = before.split(OLD).length - 1;
    if (hits === 0) {
        console.log(`  ${file}: 0 hits (already applied?)`);
        continue;
    }
    writeFileSync(file, before.split(OLD).join(NEW), 'utf8');
    console.log(`  ${file}: ${hits} header(s) updated`);
    total += hits;
}

console.log(`total: ${total}`);
