// Shared auth gate for cron-triggered endpoints (bulk email senders, reminders).
//
// WHY THIS FILE EXISTS: the three bulk senders each had this check inline:
//
//     if (cronSecret && querySecret !== cronSecret) return 401;
//
// which FAILS OPEN. If CRON_SECRET is unset or empty, `cronSecret &&`
// short-circuits and the check is skipped entirely -- one anonymous GET then
// blasts the whole customer list. CRON_SECRET is also absent from .env.example,
// so any new/preview deployment shipped wide open by default.
//
// This module fails CLOSED instead (missing config = 503, not "allow"), and
// compares with crypto.timingSafeEqual, matching the pattern already used in
// api/razorpay-webhook.js and api/grant-access.js.

import crypto from 'crypto';

/**
 * Constant-time string compare that does not leak length via early return.
 * timingSafeEqual throws on length mismatch, so hash both sides to a fixed
 * width first -- that keeps the comparison itself constant-time regardless of
 * how wrong the supplied value is.
 */
function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
    const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
    return crypto.timingSafeEqual(ha, hb);
}

/**
 * Authorise a cron request. Accepts the secret from the Authorization header
 * (`Bearer <secret>`) or the legacy `?secret=` query param, so existing
 * cron-job.org entries keep working while new ones can use the header (query
 * strings land in access logs and Referer headers).
 *
 * Returns { ok: true } or { ok: false, status, error } -- the caller decides
 * how to respond so each endpoint keeps its own JSON shape.
 */
export function authorizeCronRequest(req) {
    const expected = process.env.CRON_SECRET;

    // Fail CLOSED. An unconfigured secret is a deployment error, never a reason
    // to let an anonymous caller mail the entire customer list.
    if (!expected) {
        console.error('SECURITY: CRON_SECRET is not configured — refusing to run.');
        return {
            ok: false,
            status: 503,
            error: 'This endpoint is not configured. Set CRON_SECRET in the environment.'
        };
    }

    const header = String(req.headers?.authorization || '');
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const supplied = bearer || req.query?.secret;

    if (!supplied || !safeEqual(supplied, expected)) {
        return { ok: false, status: 401, error: 'Unauthorized' };
    }

    return { ok: true };
}
