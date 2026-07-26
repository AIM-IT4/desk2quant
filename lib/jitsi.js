import crypto from 'node:crypto';

/**
 * Produces a stable, unguessable Jitsi room for one paid booking.
 * This runs only on the trusted Razorpay webhook server.
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
        .update(`desk2quant:jitsi:${paymentId}`)
        .digest('hex')
        .slice(0, 32);

    return `https://meet.jit.si/desk2quant-${namePrefix}-${roomToken}`;
}
