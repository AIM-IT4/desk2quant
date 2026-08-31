// Shared neobrutalism brand shell for every Desk2Quant email.
// Single source of truth for the header/footer so the purchase, booking,
// reminder, scorecard, cancellation, recommendation and promo emails all
// render with the same look -- matching the site's neobrutalism design:
// warm paper canvas, 1px ink borders, hard offset shadows, flat yellow header.
//
// Also exposes escapeHtml(), the ONLY way to interpolate client-controlled
// fields (customer names, product/session titles, free-text messages) into an
// email body. Those fields arrive via Razorpay payment/order notes, which a
// checkout client can set freely -- interpolating them raw would let a buyer
// inject markup into the admin sale alerts.
//
// Email-client notes: Gmail/Apple Mail render box-shadow (the hard offset),
// Outlook desktop ignores it but keeps the 1px ink border -- so the look
// degrades gracefully instead of breaking.

// Design tokens (mirror of launchzone.css)
const INK = '#090909';
const PAPER = '#f7f7f3';
const YELLOW = '#ffca3a';
const SIGNAL = '#0b7f79';
const SIGNAL_SOFT = '#dff2ef';
const DANGER = '#d73f3f';
const MUTED = '#666761';

// HTML-escape a value before interpolating it into an email body.
// Handles the five characters that can break out of text or attributes.
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const LOGO = `<img src="https://desk2quant.com/assets/images/email-logo.png" width="40" height="40" alt="Desk2Quant" style="display:block; width:40px; height:40px; outline:none; text-decoration:none; background:#ffffff; border:1px solid ${INK}; border-radius:2px;">`;

// Customer-facing header: flat yellow block, ink text, hard bottom border.
export const EMAIL_HEADER = `
    <div style="background:${YELLOW}; border-bottom:1px solid ${INK}; padding:26px 24px; text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr>
                <td style="padding-right:12px; vertical-align:middle;">${LOGO}</td>
                <td style="vertical-align:middle; text-align:left;">
                    <div style="color:${INK}; font-size:24px; font-weight:800; letter-spacing:1px; line-height:1.1;">Desk2Quant</div>
                    <div style="color:#4a4a42; font-size:10px; letter-spacing:2px; text-transform:uppercase; margin-top:3px; font-weight:700;">Quant Mentorship &amp; Resources</div>
                </td>
            </tr>
        </table>
    </div>`;

// Admin-facing header: same yellow block, clearly labelled as internal.
export const ADMIN_HEADER = `
    <div style="background:${YELLOW}; border-bottom:1px solid ${INK}; padding:22px 24px; text-align:center;">
        <div style="color:${INK}; font-size:22px; font-weight:800; letter-spacing:1px;">Desk2Quant Admin</div>
        <div style="display:inline-block; margin-top:6px; background:${INK}; color:${YELLOW}; border:1px solid ${INK}; padding:2px 10px; font-size:10px; letter-spacing:2px; text-transform:uppercase; font-weight:700;">Internal Notification</div>
    </div>`;

export const EMAIL_FOOTER = `
    <div style="background:${PAPER}; border-top:1px solid ${INK}; padding:22px 20px; text-align:center;">
        <p style="margin:0 0 10px 0; color:${MUTED}; font-size:12px;">Sent by Desk2Quant &middot; <a href="https://desk2quant.com" style="color:${INK}; text-decoration:underline; font-weight:700;">desk2quant.com</a></p>
        <p style="margin:0; color:${MUTED}; font-size:11px;">Questions? Reply directly to this email.</p>
        <p style="margin:8px 0 0 0; color:${MUTED}; font-size:11px;">&copy; 2026 Desk2Quant. All rights reserved.</p>
    </div>`;

// Successful product/cart receipts include the default My Access purchase block,
// whose eyebrow is "Keep This Forever". Booking-only emails use different copy,
// so this marker lets the shared shell add the Quant Agent onboarding exactly
// where the paid-resource entitlement exists without duplicating checkout code.
function includesPaidResourceEntitlement(body, admin) {
    return !admin && String(body || '').includes('Keep This Forever');
}

export const QUANT_AGENT_PURCHASE_GUIDE = `
    <div style="background:${INK}; color:#ffffff; border:1px solid ${INK}; border-radius:0; box-shadow:4px 4px 0 ${YELLOW}; padding:22px; margin:24px 0 0 0;">
        <p style="font-size:11px; color:${YELLOW}; text-transform:uppercase; font-weight:800; margin:0 0 10px 0; letter-spacing:0.8px;">Included With Your Purchase</p>
        <h3 style="font-size:19px; line-height:1.3; margin:0 0 10px 0; color:#ffffff;">Desk2Quant Quant Agent CLI Access</h3>
        <p style="font-size:14px; line-height:1.6; margin:0 0 16px 0; color:#f4f4ef;">
            Your paid Desk2Quant resource purchase also unlocks the <strong>Desk2Quant Quant Agent</strong> for learning, rigorous problem solving, interview practice, project design and adaptive assessments. Access is tied to the <strong>same email address you used at checkout</strong>.
        </p>

        <div style="background:#171717; border:1px solid #565656; padding:14px; margin:0 0 16px 0; font-family:Consolas,'Courier New',monospace; font-size:13px; line-height:1.7; color:#ffffff; overflow-wrap:anywhere;">
            <div><span style="color:${YELLOW};">1.</span> Install Node.js 20+ if needed</div>
            <div><span style="color:${YELLOW};">2.</span> npm install -g @desk2quant/cli</div>
            <div><span style="color:${YELLOW};">3.</span> d2q login YOUR-PURCHASE-EMAIL</div>
        </div>

        <p style="font-size:13px; line-height:1.6; margin:0 0 14px 0; color:#f4f4ef;">
            After <strong>d2q login</strong>, check that same inbox for the Desk2Quant My Access magic link and paste the complete link into the terminal when prompted. The server verifies your captured purchase before issuing the agent session.
        </p>

        <div style="background:${SIGNAL_SOFT}; color:${INK}; border:1px solid ${INK}; padding:14px; margin:0 0 14px 0;">
            <p style="font-size:11px; color:${SIGNAL}; text-transform:uppercase; font-weight:800; margin:0 0 8px 0; letter-spacing:0.5px;">Try These Commands</p>
            <div style="font-family:Consolas,'Courier New',monospace; font-size:12px; line-height:1.75; overflow-wrap:anywhere;">
                d2q learn "Ito's lemma"<br>
                d2q solve "derive E[S_T^2] under GBM"<br>
                d2q practice "conditional probability"<br>
                d2q interview "quant research"<br>
                d2q project "Heston calibration"<br>
                d2q assess probability<br>
                d2q skills
            </div>
        </div>

        <p style="font-size:12px; line-height:1.55; margin:0; color:#d9d9d2;">
            Your purchase entitlement remains attached to your checkout email. If an agent session expires, simply run <strong>d2q login</strong> again with that same email to obtain a fresh verified session.
        </p>
    </div>`;

// Brevo can rewrite clickable hrefs through its sendibt3.com click-tracking
// domain. That is fine for marketing links but awkward for CLI authentication:
// the CLI needs the actual Desk2Quant URL carrying email + tk. For the dedicated
// sign-in email, surface the original href as selectable TEXT as well. Email
// providers may rewrite the button href, but they do not rewrite visible text.
function rawCliMagicLinkBlock(body, admin) {
    if (admin) return '';
    const source = String(body || '');
    if (!source.includes('>Sign In</span>') || !source.includes('Open My Access')) return '';
    const match = source.match(/href="(https:\/\/desk2quant\.com\/my-access\.html\?[^\"]+)"/i);
    if (!match) return '';
    const visibleUrl = match[1]; // already HTML-escaped by the caller (e.g. &amp;)
    return `
        <div style="background:#eef6ff; border:1px solid ${INK}; box-shadow:3px 3px 0 ${INK}; padding:16px; margin:20px 0 0 0;">
            <p style="font-size:11px; color:#1d4ed8; text-transform:uppercase; font-weight:800; margin:0 0 8px 0; letter-spacing:0.5px;">Using the Quant Agent CLI?</p>
            <p style="font-size:13px; line-height:1.55; margin:0 0 10px 0; color:${INK};">
                Copy the full URL printed below as text and paste it at <strong>Magic link &gt;</strong>. Do <strong>not</strong> right-click the yellow button: email click tracking may wrap that button in a sendibt3.com URL.
            </p>
            <div style="background:#ffffff; border:1px solid #b7c8e6; padding:10px; font-family:Consolas,'Courier New',monospace; font-size:11px; line-height:1.5; color:${INK}; word-break:break-all; user-select:all;">${visibleUrl}</div>
            <p style="font-size:11px; line-height:1.5; margin:10px 0 0 0; color:${MUTED};">Treat this URL like a temporary password. Do not share or forward it.</p>
        </div>`;
}

// Full email shell: paper canvas + ink-bordered white card with a hard offset
// shadow + yellow header + paper footer. `body` is the template's inner
// content (already HTML-safe -- client-controlled fields must be passed
// through escapeHtml by the caller).
export function emailShell({ body, admin = false }) {
    const quantAgentGuide = includesPaidResourceEntitlement(body, admin)
        ? QUANT_AGENT_PURCHASE_GUIDE
        : '';
    const cliMagicLinkGuide = rawCliMagicLinkBlock(body, admin);

    return `
<div style="font-family:'Space Grotesk','Segoe UI',Arial,sans-serif; font-size:14px; color:${INK}; background-color:${PAPER}; padding:28px 12px;" bgcolor="${PAPER}">
    <div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid ${INK}; border-radius:0; overflow:hidden; box-shadow:8px 8px 0 ${INK};">
        ${admin ? ADMIN_HEADER : EMAIL_HEADER}
        <div style="padding:28px;">
            ${body}
            ${cliMagicLinkGuide}
            ${quantAgentGuide}
        </div>
        ${EMAIL_FOOTER}
    </div>
</div>`;
}
