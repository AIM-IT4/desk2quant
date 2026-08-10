// Signed booking-management tokens.
//
// The bookings self-service (my-bookings.html + the bookings actions in
// api/interview.js) used to authenticate purely by "the request says this
// email" — anyone who knew or guessed a customer's email could list their
// bookings, read the meeting link, and fire cancel/reschedule requests.
//
// The confirmation emails now carry a signed manage link
// (my-bookings.html?email=..&tk=..). The token is a capability the customer
// holds: it is minted server-side, cannot be derived from the email alone,
// and is verified with a constant-time compare.
//
// The token is keyed to the email (one token manages all bookings of that
// email) and shares the same secret family as the interview session tokens,
// so no extra environment configuration is needed.
import crypto from 'crypto';

const BOOKING_TOKEN_SECRET = process.env.INTERVIEW_SESSION_SECRET
    || process.env.RAZORPAY_KEY_SECRET
    || process.env.CRON_SECRET;

/** Returns the signed token for an email, or null if no secret is configured. */
export function signBookingToken(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !BOOKING_TOKEN_SECRET) return null;
    return crypto
        .createHmac('sha256', BOOKING_TOKEN_SECRET)
        .update('booking:' + normalized)
        .digest('base64url');
}

/** True when `token` is a valid signature for `email`. */
export function verifyBookingToken(email, token) {
    if (!token || typeof token !== 'string') return false;
    const expected = signBookingToken(email);
    if (!expected) return false;
    const a = Buffer.from(String(token).trim());
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
