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

// Full email shell: paper canvas + ink-bordered white card with a hard offset
// shadow + yellow header + paper footer. `body` is the template's inner
// content (already HTML-safe -- client-controlled fields must be passed
// through escapeHtml by the caller).
export function emailShell({ body, admin = false }) {
    return `
<div style="font-family:'Space Grotesk','Segoe UI',Arial,sans-serif; font-size:14px; color:${INK}; background-color:${PAPER}; padding:28px 12px;" bgcolor="${PAPER}">
    <div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid ${INK}; border-radius:0; overflow:hidden; box-shadow:8px 8px 0 ${INK};">
        ${admin ? ADMIN_HEADER : EMAIL_HEADER}
        <div style="padding:28px;">
            ${body}
        </div>
        ${EMAIL_FOOTER}
    </div>
</div>`;
}
