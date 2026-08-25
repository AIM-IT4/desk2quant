// Customer access tokens for the My Access library (my-access.html).
//
// Two purposes, both signed with the same HMAC secret but domain-separated by
// the `purpose` baked into the signed payload, so a token minted for one job can
// never be replayed as the other:
//
//   'login'   60 minutes  emailed as a one-tap magic link
//   'session' 30 days     what the login link is exchanged for, held by the page
//
// Deliberately NOT lib/bookingTokens.js. That token is a bare
// HMAC(secret, 'booking:' + email) with no expiry and no revocation -- a
// permanent bearer credential sitting in customers' inboxes forever. It stays
// for the manage links already sent, but nothing new should be built on it.
// These tokens carry an `exp` that verify enforces.
//
// Same secret chain as bookingTokens.js so this needs no new environment
// variable. When no secret is configured, sign returns null and verify fails
// closed -- the library is unreachable rather than open.

import crypto from 'crypto';

const ACCESS_TOKEN_SECRET = process.env.INTERVIEW_SESSION_SECRET
    || process.env.RAZORPAY_KEY_SECRET
    || process.env.CRON_SECRET;

export const LOGIN_TTL_MS = 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PURPOSES = new Set(['login', 'session']);

/** Lowercased/trimmed email -- the form stored in the token and compared on verify. */
export function normalizeAccessEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function hmac(body) {
    return crypto.createHmac('sha256', ACCESS_TOKEN_SECRET).update(body).digest('base64url');
}

/**
 * Mints `base64url(payload).base64url(hmac)`, the same shape as the interview
 * session token. Returns null if the email, purpose or secret is missing.
 */
export function signAccessToken(email, purpose, ttlMs) {
    const sub = normalizeAccessEmail(email);
    if (!sub || !ACCESS_TOKEN_SECRET || !PURPOSES.has(purpose)) return null;
    const ttl = Number(ttlMs) > 0
        ? Number(ttlMs)
        : (purpose === 'login' ? LOGIN_TTL_MS : SESSION_TTL_MS);
    const body = Buffer.from(JSON.stringify({ sub, purpose, exp: Date.now() + ttl }), 'utf8')
        .toString('base64url');
    return `${body}.${hmac(body)}`;
}

/**
 * Returns the decoded payload, or null if the token is missing, forged, expired,
 * of the wrong purpose, or bound to a different email.
 *
 * `purpose` accepts a string or an array (the library read allows either token).
 */
export function verifyAccessToken(email, token, purpose) {
    if (!token || typeof token !== 'string' || !ACCESS_TOKEN_SECRET) return null;
    const allowed = Array.isArray(purpose) ? purpose : [purpose];

    const dot = token.indexOf('.');
    if (dot < 1 || dot === token.length - 1) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const a = Buffer.from(sig);
    const b = Buffer.from(hmac(body));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload || !payload.exp || Date.now() > payload.exp) return null;
        if (!allowed.includes(payload.purpose)) return null;
        if (payload.sub !== normalizeAccessEmail(email)) return null;
        return payload;
    } catch (_) {
        return null;
    }
}
