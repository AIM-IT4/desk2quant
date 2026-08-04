// Dev-only: render the real transactional email templates to standalone HTML
// so the design can be eyeballed without triggering a live purchase.
//
// Extracts each `const ...Html = ` template literal straight from the API
// source and evaluates it against sample data, so what you see is the actual
// shipped markup -- not a hand-copied approximation that can drift.
//
// Run: node scripts/preview-emails.mjs   ->   writes email-preview-generated.html
//
// The output name is deliberately NOT email-preview.html: that name was already
// taken by a stale hand-written artifact, and writing over it meant a `git
// checkout` of that path silently replaced a fresh preview with an outdated
// design. The generated file is gitignored so the two can't be confused again.
import { readFileSync, writeFileSync } from 'node:fs';

// Sample values standing in for the template's interpolations. Anything the
// template references but isn't listed here renders as the placeholder name,
// which makes omissions obvious rather than silent.
const SAMPLE = {
    productName: 'Stochastic Calculus for Quant Interviews',
    customerName: 'Priya Sharma',
    customerEmail: 'priya.sharma@example.com',
    paymentId: 'pay_QhX2mK9vLpQ4Rt',
    orderId: 'order_QhX2mJ8uKoP3Qs',
    amount: '1,499',
    currency: 'INR',
    fileUrl: 'https://drive.google.com/file/d/1a2B3c4D5e6F/view',
    driveLink: 'https://drive.google.com/file/d/1a2B3c4D5e6F/view',
    sessionDate: 'Thursday, 12 August 2026',
    sessionTime: '7:30 PM IST',
    meetingLink: 'https://meet.jit.si/desk2quant-priya-a1b2c3',
    purchaseDate: '4 August 2026',
    // Session-booking path (handleSessionBooking) uses its own variable names.
    sessionName: '1:1 Quant Interview Mock',
    sessionPrice: '2,999',
    sessionDuration: '60',
    displayTime: '7:30 PM IST',
    meetLink: 'https://meet.jit.si/desk2quant-priya-a1b2c3',
    userName: 'Priya Sharma',
    customerPhone: '+91 98765 43210',
    customerMessage: 'Targeting HFT roles, want to focus on brainteasers.',
    downloadLink: 'https://drive.google.com/file/d/1a2B3c4D5e6F/view',
    couponCode: 'THANKYOU20',
    discountPct: 20,
    // Computed at lib/recommendationEmail.js:112 from the trigger type, so it
    // is a module-local const the literal closes over rather than a parameter.
    // Default to the purchase wording; the session wording is substituted by
    // scripts/preview-purchase-flow.mjs for the booking flow.
    triggerText: 'purchasing <strong>Python for Quants: Complete Interview Guide</strong>',
    // Cart path maps over lineResults; empty array renders an empty table.
    lineResults: [
        { name: 'Stochastic Calculus for Quant Interviews', downloadLink: 'https://drive.google.com/file/d/1a2B/view' },
        { name: 'Python for Quants: Complete Interview Guide', downloadLink: 'https://drive.google.com/file/d/3c4D/view' }
    ],
    items: []
};

// The card-list variables are built by a .map() OUTSIDE the template literal,
// so the literal only ever interpolates the finished string. Supplying real
// markup here keeps the preview representative of a multi-product email
// instead of leaving a visible [productCards] placeholder.
const SAMPLE_CARDS = ['Brainteasers for Quant Interviews', 'C++ for Low-Latency Trading', 'Options Pricing Masterclass']
    .map((n, i) => `
        <div style="background:#ffffff; border-radius:12px; margin-bottom:16px; border:1px solid #eef2f6; padding:18px;">
            <h3 style="margin:0 0 6px 0; font-size:15px; color:#0f172a; font-weight:700;">${n}</h3>
            <p style="margin:0 0 10px 0; font-size:13px; color:#64748b;">Sample description for preview purposes only.</p>
            <span style="font-size:13px; color:#999; text-decoration:line-through;">₹${1499 + i * 500}</span>
            <span style="font-size:18px; font-weight:800; color:#0369a1; margin-left:8px;">₹${Math.round((1499 + i * 500) * 0.8)}</span>
        </div>`).join('');

for (const k of ['productCards', 'productCardsHtml']) SAMPLE[k] = SAMPLE_CARDS;

// The cart email's itemsHtml is <tr> rows, not cards -- feeding it card divs
// would render them outside the <table> and break the layout.
SAMPLE.itemsHtml = SAMPLE.lineResults.map((l) => `
                            <tr>
                                <td style="padding:10px 0;border-bottom:1px solid #e5e5e5;">
                                    <strong>${l.name}</strong><br>
                                    <a href="${l.downloadLink}" style="color:#2563eb;text-decoration:underline;font-size:13px;">Download / View Resource</a>
                                </td>
                            </tr>`).join('');

// Every file that builds customer-facing email HTML. Keep this list complete:
// an omission renders as "no such template" rather than an error, so a stale
// list silently under-reports coverage. The three send-* promo files and
// lib/recommendationEmail.js build their own headers separately from the two
// api/ transactional files.
const FILES = [
    'api/razorpay-webhook.js',
    'api/reminders.js',
    'api/send-latest-products.js',
    'api/send-promo-latest.js',
    'api/send-single-buyer-offers.js',
    'lib/recommendationEmail.js'
];
const BACKTICK = String.fromCharCode(96);
const BACKSLASH = String.fromCharCode(92);

function extractTemplates(src, file) {
    const found = [];
    // Two shapes in this codebase:
    //   1. `const customerHtml = \`` (api/razorpay-webhook.js) and bare
    //      reassignment `htmlBody = \`` (api/reminders.js, which declares
    //      `let subject, htmlBody` up front and assigns per branch).
    //   2. `return \`` straight out of a build function (the send-* promo
    //      files), where the markup is never bound to a variable at all.
    // Missing shape 2 is what made an earlier run silently under-report the
    // promo senders while still printing a plausible-looking template count.
    const re = new RegExp(
        '(?:(?:const\\s+|let\\s+|var\\s+)?(\\w*[Hh]tml\\w*)\\s*=|(return))\\s*' + BACKTICK,
        'g'
    );
    let m;
    while ((m = re.exec(src))) {
        // Walk to the matching closing backtick. These templates nest --
        // ${items.map(i => `<tr>...`)} puts whole template literals inside
        // interpolations -- so a naive "first unescaped backtick" scan stops
        // early and yields unbalanced markup. Track ${...} depth and treat any
        // backtick seen inside an interpolation as opening a nested literal.
        const start = m.index + m[0].length;
        let k = start;
        let interp = 0; // open ${ count
        let nested = 0; // open nested backtick count
        while (k < src.length) {
            const c = src[k];
            if (c === BACKSLASH) { k += 2; continue; }
            if (c === '$' && src[k + 1] === '{') { interp += 1; k += 2; continue; }
            if (c === '}' && interp > 0) { interp -= 1; k += 1; continue; }
            if (c === BACKTICK) {
                if (interp > 0) { nested += nested > 0 ? -1 : 1; k += 1; continue; }
                if (nested > 0) { k += 1; continue; }
                break; // real terminator
            }
            k += 1;
        }
        if (k >= src.length) continue;
        const body = src.slice(start, k);
        // Both shapes over-match: `priceHtml` / `coverImg` are small inline
        // fragments, not whole emails. Keep anything that opens its own
        // top-level document/section -- that covers the branded card templates
        // AND the plain admin alerts (a bare `<div>` wrapping an `<h2>`, no
        // card wrapper). Filtering on the card wrapper alone silently dropped
        // all five admin alerts.
        const isEmail = /<!DOCTYPE|<body|max-width:\s*\d+px/i.test(body)
            || /^\s*<div[^>]*font-family/i.test(body);
        if (!isEmail) { re.lastIndex = k; continue; }
        // For `return \`` matches, label by the nearest preceding function name.
        let name = m[1];
        if (!name) {
            const decls = src.slice(0, m.index).match(/function\s+(\w+)/g);
            name = decls ? decls[decls.length - 1].replace(/function\s+/, '') : 'return';
        }
        found.push({ file, name, body });
        re.lastIndex = k;
    }
    return found;
}

// Helpers the templates call. The literal is evaluated outside its module, so
// the module's own functions aren't in scope -- without these the Proxy returns
// a string for `escapeHtml` and the render dies on "not a function".
const HELPERS = {
    escapeHtml: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    )),
    stripHtml: (s) => String(s ?? '').replace(/<[^>]*>/g, '')
};

// Render by evaluating the literal with SAMPLE keys in scope. Unknown
// identifiers resolve via a Proxy to their own name so a missing sample value
// shows up as visible text instead of throwing.
function render(body) {
    const scope = new Proxy({ ...SAMPLE, ...HELPERS }, {
        has: () => true,
        get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? `[${k}]` : undefined))
    });
    const fn = new Function('scope', `with (scope) { return ${BACKTICK}${body}${BACKTICK}; }`);
    try {
        return fn(scope);
    } catch (err) {
        return `<pre style="color:#b91c1c">render failed: ${err.message}</pre>`;
    }
}

// The templates point at the production URL, which 404s until the asset is
// deployed -- so in a local preview the logo would render as a broken image and
// look like a template bug. Swap in a base64 data URI for preview only.
const LOGO_URL = 'https://desk2quant.vercel.app/assets/images/email-logo.png';
const LOGO_DATA = 'data:image/png;base64,' + readFileSync('assets/images/email-logo.png').toString('base64');

const templates = FILES.flatMap((f) => extractTemplates(readFileSync(f, 'utf8'), f));
const failures = [];

const sections = templates.map(({ file, name }, i) => {
    const html = render(templates[i].body).split(LOGO_URL).join(LOGO_DATA);
    // A failed render previously showed only as small red text inside one
    // section, which is easy to scroll past -- and did get scrolled past,
    // making two logo-bearing templates look like they had no logo. Collect
    // failures and exit non-zero instead.
    if (html.includes('render failed:')) failures.push(`${file} -> ${name}`);
    return `
    <div style="max-width: 760px; margin: 0 auto 12px;">
      <p style="font: 600 13px Arial; color: #111; margin: 32px 0 4px;">${file} &rarr; ${name}</p>
    </div>
    <div style="max-width: 760px; margin: 0 auto 40px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; background: #fff;">
      ${html}
    </div>`;
}).join('\n');

writeFileSync('email-preview-generated.html', `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Email template preview</title></head>
<body style="margin:0; background:#eceae4; padding:24px 0; font-family:Arial,sans-serif;">
<div style="max-width:760px; margin:0 auto 8px;">
  <h1 style="font-size:18px; margin:0 0 6px;">Transactional email templates</h1>
  <p style="font-size:13px; color:#555; margin:0;">Rendered from live source with sample data. ${templates.length} templates.</p>
</div>
${sections}
</body></html>`, 'utf8');

console.log(`rendered ${templates.length} templates:`);
for (const t of templates) console.log(`  ${t.file} -> ${t.name}`);

if (failures.length) {
    console.error(`\n${failures.length} template(s) FAILED to render:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
}
