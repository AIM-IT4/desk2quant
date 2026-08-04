// Dev-only: render just the CUSTOMER-FACING emails triggered by the two real
// money events -- a product/cart purchase, and a session booking -- in the
// order the customer receives them.
//
// Separate from scripts/preview-emails.mjs (which dumps all 15 templates,
// including internal admin alerts and manual promo blasts) because the question
// "what does a buyer actually see" was getting lost in that noise.
//
// Run: node scripts/preview-purchase-flow.mjs  ->  email-preview-flow.html
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Reuse the extractor by shelling out to the existing script, then pick the
// sections we want out of its output. Keeps one copy of the fragile
// template-literal scanning logic rather than forking it.
execFileSync(process.execPath, ['scripts/preview-emails.mjs'], { stdio: 'inherit' });
const all = readFileSync('email-preview-generated.html', 'utf8');

const SPLIT = '<div style="max-width: 760px; margin: 0 auto 12px;">';
const parts = all.split(new RegExp('(?=' + SPLIT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')'));
const head = parts[0];
const sections = parts.slice(1);

function pick(file, name, nth) {
    const matches = sections.filter((s) => s.includes(file) && s.includes('&rarr; ' + name));
    if (!matches[nth]) throw new Error(`missing ${file} -> ${name} #${nth}`);
    return matches[nth];
}

// Order matters: this is the customer's actual timeline.
//
// razorpay-webhook.js emits customerHtml three times -- index 0 is the cart
// path (productType 'cart'), 1 is the single-product path, 2 is the session
// booking path (handleSessionBooking). Verified against the branch order at
// api/razorpay-webhook.js:159 / :180 / :206.
const FLOW = [
    ['Buys ONE product', 'Instant receipt', 'api/razorpay-webhook.js', 'customerHtml', 1],
    ['Buys ONE product', '~1 hour later: recommendations', 'lib/recommendationEmail.js', 'htmlContent', 0],
    ['Buys a CART (2+ items)', 'Instant receipt', 'api/razorpay-webhook.js', 'customerHtml', 0],
    ['Buys a CART (2+ items)', '~1 hour later: recommendations', 'lib/recommendationEmail.js', 'htmlContent', 0],
    ['Books a SESSION', 'Instant confirmation', 'api/razorpay-webhook.js', 'customerHtml', 2],
    ['Books a SESSION', '~1 hour later: recommendations', 'lib/recommendationEmail.js', 'htmlContent', 0]
];

let out = head
    .replace('Transactional email templates', 'What the customer receives')
    .replace(/\d+ templates\./, `${FLOW.length} emails across 3 purchase flows.`);

let lastFlow = null;
for (const [flow, when, file, name, nth] of FLOW) {
    if (flow !== lastFlow) {
        out += `\n<div style="max-width:760px; margin:48px auto 8px;"><h2 style="font:700 20px Arial; color:#0f172a; margin:0; padding-bottom:8px; border-bottom:3px solid #0f172a;">${flow}</h2></div>`;
        lastFlow = flow;
    }
    let body = pick(file, name, nth);
    // All three recommendation rows reuse the one rendered section, which was
    // built with the purchase wording. Swap in the session wording for the
    // booking flow so it reads the way the customer will actually get it
    // (lib/recommendationEmail.js:112 picks this off the trigger type).
    if (flow.includes('SESSION') && file === 'lib/recommendationEmail.js') {
        body = body.replace(
            /purchasing <strong>[^<]*<\/strong>/,
            'completing a mentorship session with us'
        );
    }
    // Relabel the section header with the customer-timeline caption, keeping the
    // source path visible so a rendering question can be traced back to a file.
    out += body.replace(
        /<p style="font: 600 13px Arial[^>]*>[\s\S]*?<\/p>/,
        `<p style="font:600 13px Arial; color:#111; margin:24px 0 4px;">${when} &nbsp;<span style="font-weight:400; color:#777;">${file}</span></p>`
    );
}

writeFileSync('email-preview-flow.html', out, 'utf8');
console.log(`\nwrote email-preview-flow.html (${FLOW.length} emails)`);
