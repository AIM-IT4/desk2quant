// One-off: apply the Design A email header -- logo left, wordmark right, on a
// light bar. All 6 header sites across razorpay-webhook.js and reminders.js are
// byte-identical, so a single literal replace covers them.
//
// Why the bar is light rather than the previous #1a1a1a: the real site mark
// (assets/images/desk2quant-mark.svg) is a rounded #090909 tile, which scores
// 1.14:1 against #1a1a1a -- invisible. On #ffffff it scores 19.9:1. Recolouring
// the mark to suit a dark bar meant dropping the tile and shipping a bare arrow
// that no longer reads as Desk2Quant, so the bar moved instead of the logo.
//
// A 1px bottom border does the work the dark fill used to: the card behind is
// also #ffffff, so without it the header and body would run together.
//
// Email-client constraints baked into the markup:
//   - <table> not flex/inline-block: Outlook's Word rendering engine ignores
//     display:flex and collapses inline-block gaps unpredictably.
//   - width/height as HTML attributes, not just CSS: Outlook renders the image
//     at native 128px otherwise, blowing the 600px card apart. The asset is
//     square (128x128 from a 64x64 viewBox), so these must stay 1:1 -- the
//     earlier 52x32 values were for a wordmark lockup and would squash this.
//   - Absolute https:// src: email clients have no page context for relative paths.
//   - alt text styled dark at the wordmark's size, so a blocked image (Outlook
//     desktop and most corporate gateways block by default) degrades to
//     something that still reads as a header.
//
// Run: node scripts/apply-email-logo.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const OLD_BAR = '<div style="background-color: #1a1a1a; padding: 20px; text-align: center;">';
const NEW_BAR = '<div style="background-color: #ffffff; padding: 20px; text-align: center; border-bottom: 1px solid #e5e5e5;">';

const OLD_LOCKUP = [
    '<img src="https://desk2quant.vercel.app/assets/images/email-logo.png" width="52" height="32" alt="Desk2Quant" style="display: block; width: 52px; height: 32px; border: 0; outline: none; text-decoration: none; color: #ffffff; font-size: 20px; font-weight: bold;">',
    '</td>',
    '<td style="vertical-align: middle;">',
    '<span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>'
].join('');

const NEW_LOCKUP = [
    '<img src="https://desk2quant.vercel.app/assets/images/email-logo.png" width="32" height="32" alt="Desk2Quant" style="display: block; width: 32px; height: 32px; border: 0; outline: none; text-decoration: none; color: #1a1a1a; font-size: 20px; font-weight: bold;">',
    '</td>',
    '<td style="vertical-align: middle;">',
    '<span style="color: #1a1a1a; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>'
].join('');

const FILES = ['api/razorpay-webhook.js', 'api/reminders.js'];
let bars = 0;
let lockups = 0;

for (const file of FILES) {
    let src = readFileSync(file, 'utf8');

    // The footer uses the same #1a1a1a fill but `padding: 25px 20px`, so the
    // header's `padding: 20px` is what keeps this from recolouring both.
    const barHits = src.split(OLD_BAR).length - 1;
    const lockupHits = src.split(OLD_LOCKUP).length - 1;

    if (barHits === 0 && lockupHits === 0) {
        console.log(`  ${file}: 0 hits (already applied?)`);
        continue;
    }

    src = src.split(OLD_BAR).join(NEW_BAR).split(OLD_LOCKUP).join(NEW_LOCKUP);
    writeFileSync(file, src, 'utf8');
    console.log(`  ${file}: ${barHits} bar(s), ${lockupHits} lockup(s)`);
    bars += barHits;
    lockups += lockupHits;
}

console.log(`total: ${bars} bars, ${lockups} lockups`);
