import crypto from 'node:crypto';

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://desk2quant.com';

function joinSecret() {
    return process.env.INTERVIEW_SESSION_SECRET
        || process.env.RAZORPAY_KEY_SECRET
        || process.env.CRON_SECRET
        || process.env.RAZORPAY_WEBHOOK_SECRET;
}

/**
 * Produces a stable, unguessable Jitsi room for one paid booking.
 * This runs only on the trusted payment-fulfilment server.
 */
export function createJitsiMeetingLink(paymentId, customerName, webhookSecret) {
    if (!paymentId || !webhookSecret) {
        throw new Error('paymentId and webhookSecret are required to create a meeting link');
    }

    const namePrefix = String(customerName || 'guest')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'guest';

    const roomToken = crypto
        .createHmac('sha256', webhookSecret)
        .update(`desk2quant:jitsi:v2:${paymentId}`)
        .digest('hex')
        .slice(0, 32);

    return `https://meet.jit.si/desk2quant-${namePrefix}-${roomToken}`;
}

export function signSessionJoinToken(bookingId, role) {
    const cleanId = String(bookingId || '').trim();
    const cleanRole = role === 'host' ? 'host' : (role === 'attendee' ? 'attendee' : '');
    const secret = joinSecret();
    if (!cleanId || !cleanRole || !secret) return null;
    return crypto
        .createHmac('sha256', secret)
        .update(`desk2quant:session-room:${cleanRole}:${cleanId}`)
        .digest('base64url');
}

export function verifySessionJoinToken(bookingId, role, token) {
    const expected = signSessionJoinToken(bookingId, role);
    if (!expected || !token || typeof token !== 'string') return false;
    const a = Buffer.from(String(token).trim());
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Customer and mentor never receive the raw meet.jit.si URL.
 * Customers receive an attendee gate; mentors/admin receive a host gate.
 */
export function createSessionJoinUrl(bookingId, role) {
    const token = signSessionJoinToken(bookingId, role);
    if (!token) throw new Error('Session join token configuration missing');
    return `${PUBLIC_BASE_URL}/api/interview?action=session-room&id=${encodeURIComponent(bookingId)}&role=${encodeURIComponent(role)}&tk=${encodeURIComponent(token)}`;
}

export function jitsiRoomName(meetLink) {
    try {
        const url = new URL(String(meetLink || ''));
        if (url.hostname !== 'meet.jit.si') return null;
        const room = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        return /^[A-Za-z0-9._-]{8,200}$/.test(room) ? room : null;
    } catch (_) {
        return null;
    }
}
