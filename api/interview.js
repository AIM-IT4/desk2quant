import https from 'https';
import crypto from 'crypto';
import { isZeroDecimalCurrency } from '../lib/pricing.js';
import { GROQ_CHAT_MODEL } from '../lib/groqModels.js';
import { getServiceKey } from '../lib/supabaseAdmin.js';
import { emailShell, escapeHtml } from '../lib/emailBranding.js';
import { signBookingToken, verifyBookingToken } from '../lib/bookingTokens.js';
import { signAccessToken, verifyAccessToken, normalizeAccessEmail, SESSION_TTL_MS } from '../lib/accessTokens.js';

// --- Interview session tokens ------------------------------------------------
//
// SECURITY: the paywall used to gate only `action: 'start'`. `respond` and
// `evaluate` had no check at all -- and the entire interview runs through
// `respond` -- so a direct POST gave anyone unlimited unauthenticated Groq
// access, and one paid `paymentId` could start unlimited sessions.
//
// `start` now issues a short-lived HMAC-signed token bound to the duration that
// was actually paid for. `respond`/`evaluate` require it. The token expires when
// the purchased time does, so it also stops a single payment being replayed into
// an endless session and caps the free trial to its 10 minutes.
const SESSION_TOKEN_SECRET = process.env.INTERVIEW_SESSION_SECRET
    || process.env.RAZORPAY_KEY_SECRET
    || process.env.CRON_SECRET;

// Interviews run slightly over: allow a grace period past the paid duration so a
// candidate mid-answer is never cut off by the token rather than by the UI.
const SESSION_GRACE_MS = 5 * 60 * 1000;

function signSessionToken(payload) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_TOKEN_SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
}

/** Returns the decoded payload, or null if the token is missing/forged/expired. */
function verifySessionToken(token) {
    if (!token || typeof token !== 'string' || !SESSION_TOKEN_SECRET) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;

    const expected = crypto.createHmac('sha256', SESSION_TOKEN_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload.exp || Date.now() > payload.exp) return null;
        return payload;
    } catch (_) {
        return null;
    }
}

// Helper: HTTP Request (Replace fetch to avoid dependency issues)
function httpRequest(url, options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                } else {
                    reject(new Error(`API Error: ${res.statusCode} ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (postData) req.write(JSON.stringify(postData));
        req.end();
    });
}

// --- Bookings self-service -------------------------------------------------
//
// The `bookings` table is sealed from the anon role by RLS, so my-bookings.html
// and the homepage booking form's slot-collision check can no longer read or
// write it directly from the browser. These actions run with the service-role
// key. They live here -- not in their own route -- because the Vercel Hobby
// plan caps this project at 12 serverless functions and all 12 are already in
// use (same reason the advisor chat lives here).
//
// Every mutation re-fetches the booking first and refuses unless the supplied
// email matches the booking's email, so knowing a booking id no longer lets
// anyone cancel or reschedule someone else's session.
const BOOKINGS_ACTIONS = new Set([
    'my-bookings',             // { email }            -> bookings for that email
    'bookings-slots',          // { date }             -> taken times for a date
    'create-free-booking',     // { booking fields }   -> insert a FREE session booking (deduped)
    'reschedule-booking',      // { bookingId, email, date, time, reason }
    'cancel-booking',          // { bookingId, email, refundAmount, refundPercentage }
    'accept-admin-reschedule', // { bookingId, email }
    'counter-propose'          // { bookingId, email, date, time }
]);

// --- My Access library -----------------------------------------------------
//
// my-access.html: one place a buyer signs in with their email and gets fresh
// download links for everything they bought, plus their sessions. Also lives
// here for the 12-function cap.
const ACCESS_ACTIONS = new Set([
    'access-login',   // { email }         -> always 200; emails a magic link if the address is a customer
    'access-library'  // { email, token }  -> that customer's purchases + bookings + a fresh session token
]);

// --- Lead capture ----------------------------------------------------------
//
// The free-formula-sheet forms (homepage in script.js, and the Desk Simulator
// in desk-simulator.mjs) used to INSERT the lead straight into `purchases` from
// the browser with the anon key. The anon role no longer holds that grant --
// production answers `401 permission denied for table purchases` -- and both
// call sites ended in `.catch(console.error)`, so every signup since the grant
// was revoked was dropped with no visible symptom. The sheet still got emailed,
// so the only casualty was the record of the lead, and nothing else captures
// it.
//
// Lives here for the same reason as the bookings/access actions: Vercel Hobby
// caps this project at 12 serverless functions and all 12 are in use.
const LEAD_ACTIONS = new Set([
    'log-lead'  // { email, origin, download_link? } -> records a free-resource lead
]);

// product_name is chosen HERE from this whitelist, never taken from the request:
// the row lands in the same table as real sales, so a caller must not be able to
// write arbitrary product names into revenue reporting.
const LEAD_ORIGINS = {
    'homepage': 'Quant Formula Sheet (Lead Capture)',
    'desk-simulator': 'Quant Formula Sheet (Lead Capture - Desk Simulator)'
};

/**
 * A booking mutation is authorised by EITHER credential:
 *   - the legacy permanent manage token, already in customers' inboxes, or
 *   - a My Access session token.
 * So old confirmation-email links keep working while My Access gets
 * reschedule/cancel without asking the buyer for a second credential.
 */
function verifyCustomerToken(email, token) {
    return verifyBookingToken(email, token) || !!verifyAccessToken(email, token, 'session');
}

// Columns the my-bookings page renders (plus id/email for mutations). Exposing
// phone / payment_id / message here would leak more customer data than the UI
// needs, so the list is explicit.
const BOOKINGS_PUBLIC_COLUMNS = [
    'id', 'email', 'name', 'service_name', 'service_price', 'service_duration',
    'booking_date', 'booking_time', 'status', 'meet_link',
    'admin_proposed_date', 'admin_proposed_time', 'admin_reschedule_reason',
    'requested_date', 'requested_time', 'refund_amount', 'refund_percentage', 'created_at'
].join(',');

// Light per-IP limiter for the mutating bookings actions, so a rogue page can't
// spam free bookings or reschedule requests. Same in-memory sliding-window
// approach as api/send-email.js (per-instance, not global -- good enough to
// stop the obvious abuse).
const BOOKINGS_RATE_MAX = 20;
const BOOKINGS_RATE_WINDOW_MS = 60 * 1000;
const bookingsRateBuckets = new Map();

function isBookingsRateLimited(req) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '');
    const ip = forwarded.split(',')[0].trim() || 'unknown';
    const now = Date.now();
    const hits = (bookingsRateBuckets.get(ip) || []).filter((t) => now - t < BOOKINGS_RATE_WINDOW_MS);
    hits.push(now);
    bookingsRateBuckets.set(ip, hits);
    if (bookingsRateBuckets.size > 5000) {
        for (const [key, times] of bookingsRateBuckets) {
            if (!times.some((t) => now - t < BOOKINGS_RATE_WINDOW_MS)) bookingsRateBuckets.delete(key);
        }
    }
    return hits.length > BOOKINGS_RATE_MAX;
}

async function handleBookingsAction(req, res, action) {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    const { getServiceKey } = await import('../lib/supabaseAdmin.js');
    const key = getServiceKey();
    if (!key) {
        return res.status(503).json({ error: 'Service is not fully configured. Please contact support.' });
    }
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();

    try {
        // 1. LIST a customer's bookings by email (public columns only).
        // The signed manage token from the confirmation email is required — a
        // bare email alone is not enough to read booking details / meeting links.
        if (action === 'my-bookings') {
            if (!email) return res.status(400).json({ error: 'email is required' });
            if (!verifyCustomerToken(email, body.token)) {
                return res.status(403).json({ error: 'This manage link is invalid or expired. Use the \u201cManage booking\u201d link from your confirmation email, or sign in at /my-access.html.' });
            }
            const resp = await fetch(
                `${SUPABASE_URL}/rest/v1/bookings?email=eq.${encodeURIComponent(email)}&select=${BOOKINGS_PUBLIC_COLUMNS}&order=created_at.desc`,
                { headers }
            );
            if (!resp.ok) return res.status(502).json({ error: 'Failed to load bookings' });
            const rows = await resp.json();
            return res.status(200).json({ success: true, bookings: rows });
        }

        // 2. SLOTS already taken on a date (homepage collision check).
        if (action === 'bookings-slots') {
            const date = String(body.date || '').trim();
            if (!date) return res.status(400).json({ error: 'date is required' });
            const resp = await fetch(
                `${SUPABASE_URL}/rest/v1/bookings?booking_date=eq.${encodeURIComponent(date)}&select=booking_time,status`,
                { headers }
            );
            if (!resp.ok) return res.status(502).json({ error: 'Failed to load slots' });
            const rows = await resp.json();
            return res.status(200).json({ success: true, slots: rows });
        }

        // Mutations get a light rate limit (create, reschedule, cancel, accept,
        // counter-propose all write rows). Reads (list/slots) are free.
        if (['create-free-booking', 'reschedule-booking', 'cancel-booking',
             'accept-admin-reschedule', 'counter-propose'].includes(action)
            && isBookingsRateLimited(req)) {
            return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
        }

        // 3. CREATE a free session booking (deduped by payment_id).
        if (action === 'create-free-booking') {
            const { name, phone, serviceName, servicePrice, serviceDuration, bookingDate, bookingTime, message, paymentId, meetLink } = body;
            if (!email || !serviceName || !bookingDate || !bookingTime) {
                return res.status(400).json({ error: 'Missing required booking fields' });
            }
            const dup = await fetch(
                `${SUPABASE_URL}/rest/v1/bookings?payment_id=eq.${encodeURIComponent(paymentId || '')}&select=id`,
                { headers }
            );
            const dupRows = dup.ok ? await dup.json() : [];
            if (Array.isArray(dupRows) && dupRows.length > 0) {
                return res.status(200).json({ success: true, alreadyExists: true });
            }
            const ins = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
                body: JSON.stringify({
                    email, name, phone,
                    service_name: serviceName,
                    service_price: Number(servicePrice) || 0,
                    service_duration: Number(serviceDuration) || null,
                    booking_date: bookingDate,
                    booking_time: bookingTime,
                    message: message || null,
                    status: 'upcoming',
                    payment_id: paymentId || `FREE_SESSION_${Date.now()}`,
                    meet_link: meetLink || null
                })
            });
            if (!ins.ok) return res.status(502).json({ error: 'Failed to create booking' });
            const created = await ins.json();
            // Return the signed manage token so the client can embed the
            // "Manage booking" link in the confirmation email it sends.
            return res.status(200).json({ success: true, booking: Array.isArray(created) ? created[0] : created, manageToken: signBookingToken(email) });
        }

        // --- Mutations: bookingId + matching email required ---
        const bookingId = String(body.bookingId || '').trim();
        if (!bookingId || !email) return res.status(400).json({ error: 'bookingId and email are required' });

        const updHeaders = { ...headers, 'Content-Type': 'application/json' };

        const fetchBooking = async (select) => {
            const resp = await fetch(
                `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}&select=${select}`,
                { headers }
            );
            const rows = resp.ok ? await resp.json() : [];
            return Array.isArray(rows) ? rows[0] : null;
        };

        const patchBooking = async (payload) => {
            const resp = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}`, {
                method: 'PATCH',
                headers: updHeaders,
                body: JSON.stringify(payload)
            });
            return resp.ok;
        };

        // 4. RESCHEDULE request.
        if (action === 'reschedule-booking') {
            const date = String(body.date || '').trim();
            const time = String(body.time || '').trim();
            const reason = String(body.reason || '').trim();
            if (!date || !time) return res.status(400).json({ error: 'date and time are required' });
            const booking = await fetchBooking('email');
            if (!booking || String(booking.email || '').trim().toLowerCase() !== email || !verifyCustomerToken(email, body.token)) {
                return res.status(403).json({ error: 'Booking not found for this email, or the manage link is invalid. Use the link from your confirmation email.' });
            }
            const ok = await patchBooking({
                requested_date: date,
                requested_time: time,
                reschedule_reason: reason,
                status: 'reschedule_requested'
            });
            if (!ok) return res.status(502).json({ error: 'Failed to save reschedule request' });
            return res.status(200).json({ success: true });
        }

        // 5. CANCEL request (refund amounts computed client-side from the same
        //    policy the page always used; stored server-side for the admin).
        //    The branded confirmation email is sent from here (service side),
        //    so the customer always gets it even if their browser closes.
        if (action === 'cancel-booking') {
            const refundAmount = Number(body.refundAmount) || 0;
            const refundPercentage = Number(body.refundPercentage) || 0;
            const booking = await fetchBooking('email,name,service_name,service_price,booking_date,booking_time');
            if (!booking || String(booking.email || '').trim().toLowerCase() !== email || !verifyCustomerToken(email, body.token)) {
                return res.status(403).json({ error: 'Booking not found for this email, or the manage link is invalid. Use the link from your confirmation email.' });
            }
            const ok = await patchBooking({
                status: 'cancellation_requested',
                cancellation_requested_at: new Date().toISOString(),
                cancellation_reason: 'User requested cancellation',
                refund_amount: refundAmount,
                refund_percentage: refundPercentage,
                refund_status: 'pending'
            });
            if (!ok) return res.status(502).json({ error: 'Failed to save cancellation request' });

            // Branded cancellation confirmation to the customer.
            let emailSent = false;
            try {
                const BREVO_API_KEY = process.env.BREVO_API_KEY;
                if (BREVO_API_KEY) {
                    const SENDER_EMAIL = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
                    const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';
                    const customerName = booking.name || 'there';
                    const customerHtml = emailShell({ body: `
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background:#ffca3a; color:#090909; padding:4px 8px; border:1px solid #090909; border-radius:0; font-size:11px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909;">Cancellation Request</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 20px; color: #090909;">Hi <strong>${escapeHtml(customerName)}</strong>, your cancellation request has been received.</p>

                        <div style="background:#ffffff; padding:18px; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; margin-bottom:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session</p>
                            <h3 style="margin: 0 0 12px 0; font-size: 17px; color: #090909;">${escapeHtml(booking.service_name)}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 4px 0;">Date</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 4px 0; color: #090909;">${escapeHtml(booking.booking_date)}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 4px 0;">Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 4px 0; color: #090909;">${escapeHtml(booking.booking_time)}</td>
                                </tr>
                            </table>
                        </div>

                        <div style="background:#dff2ef; padding:18px; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; margin-bottom:20px;">
                            <p style="font-size: 14px; font-weight: bold; color: #0b7f79; margin: 0 0 10px 0;">💰 Refund Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 4px 0; color: #666761;">Original Amount</td><td style="padding: 4px 0; text-align: right; color: #090909;">₹${escapeHtml(booking.service_price || 0)}</td></tr>
                                <tr><td style="padding: 4px 0; color: #666761;">Refund Percentage</td><td style="padding: 4px 0; text-align: right; color: #090909;">${escapeHtml(refundPercentage)}%</td></tr>
                                <tr style="border-top: 1px solid #d8d8d1;"><td style="padding: 10px 0 0 0; color: #0b7f79; font-weight: bold; font-size: 15px;">Refund Amount</td><td style="padding: 10px 0 0 0; text-align: right; color: #0b7f79; font-weight: bold; font-size: 17px;">₹${escapeHtml(refundAmount)}</td></tr>
                            </table>
                        </div>

                        <div style="background:#fff3c4; padding:14px; border:1px solid #090909; border-radius:0; box-shadow:3px 3px 0 #090909; font-size:13px; color:#7c4a03; line-height:1.5;">
                            ⏱ Refunds are credited to your original payment method within <strong>5-7 business days</strong> after approval.
                        </div>
                    ` });
                    await httpRequest('https://api.brevo.com/v3/smtp/email', {
                        method: 'POST',
                        headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' }
                    }, {
                        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                        replyTo: { email: SENDER_EMAIL, name: SENDER_NAME },
                        to: [{ email: booking.email, name: customerName }],
                        subject: `Cancellation Request Received - Booking ${bookingId}`,
                        htmlContent: customerHtml,
                        textContent: `Hi ${customerName},\n\nYour cancellation request has been received.\n\nSession: ${booking.service_name}\nOriginal Date: ${booking.booking_date} at ${booking.booking_time}\n\nRefund: \u20B9${refundAmount} (${refundPercentage}%)\nStatus: Pending admin approval\nProcessing: 5-7 business days after approval\n\nSent by Desk2Quant`
                    });
                    emailSent = true;
                }
            } catch (err) {
                console.error('Cancellation email failed (booking still cancelled):', err.message);
            }

            return res.status(200).json({ success: true, emailSent });
        }

        // 6. ACCEPT the admin's proposed reschedule.
        if (action === 'accept-admin-reschedule') {
            const booking = await fetchBooking('email,admin_proposed_date,admin_proposed_time,meet_link,name,service_name');
            if (!booking || String(booking.email || '').trim().toLowerCase() !== email || !verifyCustomerToken(email, body.token)) {
                return res.status(403).json({ error: 'Booking not found for this email, or the manage link is invalid. Use the link from your confirmation email.' });
            }
            if (!booking.admin_proposed_date || !booking.admin_proposed_time) {
                return res.status(400).json({ error: 'No admin-proposed schedule to accept' });
            }
            const ok = await patchBooking({
                booking_date: booking.admin_proposed_date,
                booking_time: booking.admin_proposed_time,
                status: 'confirmed',
                customer_response: 'accepted',
                admin_proposed_date: null,
                admin_proposed_time: null,
                admin_reschedule_reason: null,
                admin_reschedule_requested_at: null
            });
            if (!ok) return res.status(502).json({ error: 'Failed to accept new schedule' });
            return res.status(200).json({ success: true, booking });
        }

        // 7. COUNTER-propose a different time.
        if (action === 'counter-propose') {
            const date = String(body.date || '').trim();
            const time = String(body.time || '').trim();
            if (!date || !time) return res.status(400).json({ error: 'date and time are required' });
            const booking = await fetchBooking('email');
            if (!booking || String(booking.email || '').trim().toLowerCase() !== email || !verifyCustomerToken(email, body.token)) {
                return res.status(403).json({ error: 'Booking not found for this email, or the manage link is invalid. Use the link from your confirmation email.' });
            }
            const ok = await patchBooking({
                requested_date: date,
                requested_time: time,
                status: 'reschedule_requested',
                customer_response: 'counter_proposed',
                admin_proposed_date: null,
                admin_proposed_time: null,
                admin_reschedule_reason: null
            });
            if (!ok) return res.status(502).json({ error: 'Failed to save counter-proposal' });
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Unknown bookings action' });
    } catch (err) {
        console.error('Bookings action error:', err.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

// Per-email limiter for the magic-link send, on top of the per-IP one. Without
// it, anyone could use this endpoint to flood a stranger's inbox from a fresh IP
// each time. Per-instance and in-memory like every other limiter here.
const ACCESS_LINK_MAX = 3;
const ACCESS_LINK_WINDOW_MS = 60 * 60 * 1000;
const accessLinkBuckets = new Map();

function isAccessLinkRateLimited(email) {
    const now = Date.now();
    const hits = (accessLinkBuckets.get(email) || []).filter((t) => now - t < ACCESS_LINK_WINDOW_MS);
    hits.push(now);
    accessLinkBuckets.set(email, hits);
    if (accessLinkBuckets.size > 5000) {
        for (const [k, times] of accessLinkBuckets) {
            if (!times.some((t) => now - t < ACCESS_LINK_WINDOW_MS)) accessLinkBuckets.delete(k);
        }
    }
    return hits.length > ACCESS_LINK_MAX;
}

/**
 * Keeps only the rows whose `column` is exactly this email, ignoring case.
 *
 * The queries above use PostgREST `ilike.` so that historical rows stored with
 * different casing still surface. `ilike` treats `_` as a single-character
 * wildcard and `_` is legal in an email local part, so the database filter on
 * its own could return a different customer's rows. This is the narrowing step.
 */
function exactMatches(rows, column, email) {
    if (!Array.isArray(rows)) return [];
    return rows.filter((row) => normalizeAccessEmail(row && row[column]) === email);
}

async function handleAccessAction(req, res, action) {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://desk2quant.com';
    const key = getServiceKey();
    if (!key) {
        return res.status(503).json({ error: 'Service is not fully configured. Please contact support.' });
    }
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const body = req.body || {};
    const email = normalizeAccessEmail(body.email);
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required' });

    try {
        // 1. Email a sign-in link.
        //
        // Deliberately returns the SAME response whether or not the address
        // belongs to a customer. Reporting "no purchases found" would turn this
        // into an oracle for testing whether any given email bought from us.
        if (action === 'access-login') {
            const genericOk = {
                success: true,
                message: 'If that email has purchases or sessions with us, a sign-in link is on its way. Check your inbox (and spam).'
            };
            if (isBookingsRateLimited(req) || isAccessLinkRateLimited(email)) {
                return res.status(429).json({ error: 'Too many sign-in requests. Please wait a few minutes and try again.' });
            }

            // Case-insensitive match: legacy rows were written with whatever
            // casing the payment gateway or the booking form supplied, so an
            // `eq.` on the lowercased address would hide a real buyer's history.
            // `ilike.` widens the query, then exactMatches() narrows it back --
            // `_` is a LIKE wildcard and appears in legitimate addresses, so the
            // database filter alone could match a different account.
            const [purchaseResp, bookingResp] = await Promise.all([
                fetch(`${SUPABASE_URL}/rest/v1/purchases?customer_email=ilike.${encodeURIComponent(email)}&select=customer_email&limit=20`, { headers }),
                fetch(`${SUPABASE_URL}/rest/v1/bookings?email=ilike.${encodeURIComponent(email)}&select=email&limit=20`, { headers })
            ]);
            const hasPurchase = purchaseResp.ok && exactMatches(await purchaseResp.json(), 'customer_email', email).length > 0;
            const hasBooking = bookingResp.ok && exactMatches(await bookingResp.json(), 'email', email).length > 0;
            if (!hasPurchase && !hasBooking) return res.status(200).json(genericOk);

            const loginToken = signAccessToken(email, 'login');
            const BREVO_API_KEY = process.env.BREVO_API_KEY;
            if (!loginToken || !BREVO_API_KEY) {
                console.error('access-login: cannot send link', { hasToken: !!loginToken, hasBrevo: !!BREVO_API_KEY });
                return res.status(200).json(genericOk);
            }

            const SENDER_EMAIL = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
            const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';
            const linkUrl = `${PUBLIC_BASE_URL}/my-access.html?email=${encodeURIComponent(email)}&tk=${encodeURIComponent(loginToken)}`;
            const html = emailShell({ body: `
                <div style="margin-bottom:20px;">
                    <span style="display:inline-block; background:#ffca3a; color:#090909; padding:4px 8px; border:1px solid #090909; font-size:11px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909;">Sign In</span>
                </div>
                <p style="font-size:16px; margin:0 0 20px 0; color:#090909;">Here is your sign-in link for <strong>My Access</strong> — your downloads and mentorship sessions, all in one place.</p>
                <p style="margin:0 0 24px 0;">
                    <a href="${escapeHtml(linkUrl)}" style="display:inline-block; background:#ffca3a; color:#090909; padding:14px 26px; border:1px solid #090909; box-shadow:4px 4px 0 #090909; font-size:15px; font-weight:800; text-decoration:none;">Open My Access</a>
                </p>
                <div style="background:#fff3c4; padding:14px; border:1px solid #090909; box-shadow:3px 3px 0 #090909; font-size:13px; color:#7c4a03; line-height:1.5;">
                    ⏱ This link works for <strong>60 minutes</strong> and signs in this one browser for 30 days. Don't forward it — anyone with the link can see your purchases.
                </div>
                <p style="margin:20px 0 0 0; font-size:12px; color:#666761; line-height:1.5;">Didn't ask for this? Someone typed your address into the sign-in form. Nothing has been shared — you can ignore this email.</p>
            ` });
            // Send failures must not change the response: a 500 here only ever
            // happens for an address that IS a customer, which would restore the
            // enumeration oracle the generic 200 exists to prevent.
            try {
                await httpRequest('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' }
                }, {
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    replyTo: { email: SENDER_EMAIL, name: SENDER_NAME },
                    to: [{ email }],
                    subject: 'Your Desk2Quant sign-in link',
                    htmlContent: html,
                    textContent: `Here is your sign-in link for My Access -- your downloads and mentorship sessions:\n\n${linkUrl}\n\nThe link works for 60 minutes and signs in this one browser for 30 days. Don't forward it.\n\nDidn't ask for this? You can ignore this email.\n\nSent by Desk2Quant`
                });
            } catch (mailErr) {
                console.error('access-login: Brevo send failed', mailErr.message);
            }
            return res.status(200).json(genericOk);
        }

        // 2. The library itself: what this customer bought, and their sessions.
        //
        // The purchases rows are a DISCOVERY HINT ONLY. `purchases` is
        // anon-INSERTable (script.js still writes it with the anon key), so its
        // contents -- including `source` -- are forgeable. Nothing here is
        // downloadable: the browser has to call POST /api/grant-access per
        // payment id, which verifies against Razorpay and mints a fresh signed
        // link. `download_link` is deliberately not selected -- stored links
        // expired after DOWNLOAD_LINK_TTL_MS (2 days) anyway.
        if (action === 'access-library') {
            if (!verifyAccessToken(email, body.token, ['login', 'session'])) {
                return res.status(403).json({ error: 'This sign-in link is invalid or has expired. Request a new one.' });
            }

            const [purchaseResp, bookingResp] = await Promise.all([
                fetch(`${SUPABASE_URL}/rest/v1/purchases?customer_email=ilike.${encodeURIComponent(email)}`
                    + '&payment_id=like.pay_*'
                    + '&select=customer_email,product_name,amount,currency,payment_id,created_at&order=created_at.desc', { headers }),
                fetch(`${SUPABASE_URL}/rest/v1/bookings?email=ilike.${encodeURIComponent(email)}`
                    + `&select=${BOOKINGS_PUBLIC_COLUMNS}&order=created_at.desc`, { headers })
            ]);
            if (!purchaseResp.ok) return res.status(502).json({ error: 'Failed to load your purchases' });
            // See exactMatches(): ilike widened the query for casing, this narrows
            // it back to exactly this address so a `_` wildcard cannot leak someone
            // else's order history.
            const purchases = exactMatches(await purchaseResp.json(), 'customer_email', email)
                .map(({ customer_email, ...rest }) => rest);
            const bookings = bookingResp.ok
                ? exactMatches(await bookingResp.json(), 'email', email)
                : [];

            return res.status(200).json({
                success: true,
                email,
                purchases,
                bookings,
                // Fresh 30-day credential, so the one-time login token is never
                // the thing the page holds on to.
                sessionToken: signAccessToken(email, 'session', SESSION_TTL_MS),
                sessionExpiresAt: Date.now() + SESSION_TTL_MS
            });
        }

        return res.status(400).json({ error: 'Unknown access action' });
    } catch (err) {
        console.error('Access action error:', err.message);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

/**
 * Records a free-resource lead. Server-side because `purchases` is sealed from
 * the anon role.
 *
 * Deliberately NOT authenticated: it is the same open form it always was, so the
 * only protections are the per-IP limiter, the origin whitelist, and the fact
 * that every field written here is either validated or chosen server-side.
 * amount is hard-coded to 0 so a lead can never inflate revenue.
 */
async function handleLeadAction(req, res) {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    const key = getServiceKey();
    if (!key) {
        console.error('log-lead: SUPABASE_SERVICE_ROLE_KEY is not set — lead not recorded');
        return res.status(503).json({ error: 'Service is not fully configured.' });
    }

    if (isBookingsRateLimited(req)) {
        return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }

    const body = req.body || {};
    const email = normalizeAccessEmail(body.email);
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'A valid email is required' });
    }

    const productName = LEAD_ORIGINS[String(body.origin || '')];
    if (!productName) {
        return res.status(400).json({ error: 'Unknown lead origin' });
    }

    // Only store a link that points at our own storage/Drive, so this can never
    // be used to park an attacker-controlled URL on a row the admin panel and
    // the recommendation mailer both read back.
    const rawLink = typeof body.download_link === 'string' ? body.download_link.trim() : '';
    const downloadLink = /^https:\/\/(dntabmyurlrlnoajdnja\.supabase\.co|drive\.google\.com|docs\.google\.com|desk2quant\.com)\//.test(rawLink)
        ? rawLink
        : null;

    const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
    };

    try {
        // Re-submitting the form (or a double click) must not add a second row.
        // Best-effort: if this check fails we still record the lead, because a
        // duplicate row is far cheaper than a lost lead.
        try {
            const existing = await fetch(
                `${SUPABASE_URL}/rest/v1/purchases?customer_email=eq.${encodeURIComponent(email)}`
                + `&product_name=eq.${encodeURIComponent(productName)}&select=id&limit=1`,
                { headers }
            );
            if (existing.ok) {
                const rows = await existing.json();
                if (Array.isArray(rows) && rows.length > 0) {
                    return res.status(200).json({ success: true, deduped: true });
                }
            }
        } catch (dedupeErr) {
            console.warn('log-lead: dedupe check failed, inserting anyway:', dedupeErr.message);
        }

        // payment_id carries a random suffix as well as the timestamp: migration
        // 0010 puts a unique index on (payment_id) for non-cart rows, and two
        // leads inside the same millisecond would otherwise collide.
        const paymentId = `LEAD_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

        const resp = await fetch(`${SUPABASE_URL}/rest/v1/purchases`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                customer_email: email,
                product_name: productName,
                amount: 0,
                currency: 'INR',
                payment_id: paymentId,
                source: 'lead_capture',
                download_link: downloadLink,
                // Explicit UTC: the created_at DEFAULT on this table has been
                // observed storing timestamps ~5.5h in the past.
                created_at: new Date().toISOString()
            })
        });

        if (!resp.ok) {
            const detail = await resp.text();
            console.error('log-lead: Supabase insert failed', resp.status, detail.slice(0, 300));
            return res.status(502).json({ error: 'Could not record the lead' });
        }

        console.log('log-lead: recorded', { email, origin: body.origin });
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('log-lead error:', err.message);
        return res.status(500).json({ error: 'Something went wrong.' });
    }
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Bookings self-service and the My Access library run before the Groq gate:
    // they need the service-role key, not Groq.
    const reqAction = req.body && req.body.action;
    if (typeof reqAction === 'string' && BOOKINGS_ACTIONS.has(reqAction)) {
        return handleBookingsAction(req, res, reqAction);
    }
    if (typeof reqAction === 'string' && ACCESS_ACTIONS.has(reqAction)) {
        return handleAccessAction(req, res, reqAction);
    }
    if (typeof reqAction === 'string' && LEAD_ACTIONS.has(reqAction)) {
        return handleLeadAction(req, res);
    }

    console.log('--- API Request Received ---');
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    console.log('GROQ_KEY_EXISTS:', !!GROQ_API_KEY);

    if (!GROQ_API_KEY) {
        console.error('CRITICAL: GROQ_API_KEY is missing in environment variables');
        return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    }

    const { action, messages, topic, difficulty, paymentId, durationMinutes, email, name, interviewerGender, sessionToken } = req.body;
    console.log('Action:', action, 'Topic:', topic, 'Gender:', interviewerGender);

    // --- Product recommendation assistant --------------------------------
    // Lives here rather than in its own route: the Vercel Hobby plan caps this
    // project at 12 serverless functions and all 12 are already in use.
    if (action === 'chat') {
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
            || req.socket?.remoteAddress || 'unknown';
        const { rateLimit, fetchCatalog, buildSystemPrompt, sanitizeHistory, askAdvisor } =
            await import('../lib/advisor.js');
    
        const gate = rateLimit(ip);
        if (!gate.ok) {
            res.setHeader('Retry-After', String(gate.retryAfter));
            return res.status(429).json({ error: 'Too many messages. Give it a moment.', retryAfter: gate.retryAfter });
        }
    
        const history = sanitizeHistory(messages);
        if (!history.length) return res.status(400).json({ error: 'messages required' });
    
        try {
            const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
            // RLS denies `anon` on products, so the old inline anon-key fallback
            // here made the advisor answer from an empty catalog instead of erroring.
            const SUPABASE_KEY = getServiceKey();
            if (!SUPABASE_KEY) {
                console.error('CONFIG: SUPABASE_SERVICE_ROLE_KEY is not set — advisor cannot read the catalog.');
                return res.status(503).json({ error: 'Advisor unavailable right now.' });
            }
            const catalog = await fetchCatalog(SUPABASE_URL, SUPABASE_KEY);
            const result = await askAdvisor({
                groqKey: GROQ_API_KEY,
                systemPrompt: buildSystemPrompt(catalog),
                history
            });
            if (result.rateLimited) {
                res.setHeader('Retry-After', String(result.retryAfter));
                return res.status(429).json({ error: 'Busy right now. Try again shortly.', retryAfter: result.retryAfter });
            }
            return res.status(200).json({ reply: result.reply });
        } catch (err) {
            console.error('advisor error:', err.message);
            return res.status(500).json({ error: 'Advisor unavailable right now.' });
        }
    }

    // SECURITY: verify the payment is real/captured/matches the claimed
    // duration before starting a paid interview. Previously `paymentId` was
    // accepted and merely logged -- never checked against Razorpay -- so a
    // fabricated/unrelated paymentId (or none at all) still started the
    // paid session for free.
    if (action === 'start' && Number(durationMinutes) > 10) {
        const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
        const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            return res.status(500).json({ error: 'Payment gateway not configured on server' });
        }
        if (!paymentId || String(paymentId).startsWith('FREE_TRIAL_')) {
            return res.status(402).json({ error: 'Payment required for this interview duration' });
        }
        try {
            const { getExpectedInterviewOrder, isWithinTolerance } = await import('../lib/pricing.js');
            const authHeader = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
            const payResp = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
                headers: { Authorization: authHeader }
            });
            if (!payResp.ok) {
                return res.status(402).json({ error: 'Payment not found or invalid' });
            }
            const payment = await payResp.json();
            if (payment.status !== 'captured') {
                return res.status(402).json({ error: `Payment not captured (status: ${payment.status})` });
            }
            const expected = await getExpectedInterviewOrder(durationMinutes, payment.currency);
            const capturedMajor = isZeroDecimalCurrency(payment.currency)
                ? payment.amount
                : payment.amount / 100;
            if (!expected.ok || !(await isWithinTolerance(capturedMajor, expected.amountMajor, payment.currency))) {
                console.error('🚨 Interview payment amount mismatch:', { paymentId, durationMinutes, capturedMajor, expected });
                return res.status(402).json({ error: 'Payment amount does not match the selected interview duration' });
            }
        } catch (err) {
            console.error('Interview payment verification error:', err.message);
            return res.status(500).json({ error: 'Could not verify payment. Please try again.' });
        }
    }

    // The conversation itself runs through `respond`, and the scorecard through
    // `evaluate`. Both must present the token minted by `start` -- without this
    // the paywall above only ever protected the opening greeting.
    if (action === 'respond' || action === 'evaluate') {
        if (!SESSION_TOKEN_SECRET) {
            console.error('CRITICAL: no secret available to verify interview session tokens');
            return res.status(500).json({ error: 'Server configuration error' });
        }
        const session = verifySessionToken(sessionToken);
        if (!session) {
            return res.status(401).json({
                error: 'Your interview session has expired or is invalid. Please start a new interview.',
                sessionExpired: true
            });
        }
    }

    // Determine interviewer persona based on gender
    const isFemale = interviewerGender === 'female';
    const interviewerTitle = isFemale ? 'a senior female quant strategist' : 'a senior male quant strategist';
    const pronounHe = isFemale ? 'She' : 'He';
    const pronounHis = isFemale ? 'Her' : 'His';

    // System prompt — the quant interviewer persona
    const systemPrompt = `You are ${interviewerTitle} at a top-tier investment bank or quantitative hedge fund (Goldman Sachs / Citadel / Two Sigma / Jane Street level). You are conducting a live mock interview for a quantitative finance role.

INTERVIEW RULES:
- PHASE 1: INTRODUCTION. Start by introducing yourself with a realistic name matching your gender. State your title (e.g., "Senior Quant Strategist" or "VP, Quantitative Research"). Ask the candidate to briefly introduce themselves and their background.
- PHASE 2: WARM-UP. After introductions, ask 1-2 lighter questions to ease in (e.g., "What attracted you to quant finance?" or "Walk me through a recent project.").
- PHASE 3: TECHNICAL CORE. Progressively increase difficulty. Ask rigorous, interview-grade questions.
- SPEAK LIKE A HUMAN: Use natural fillers ("Hmm", "Right", "Okay", "Interesting", "Walk me through that"). Pause naturally. This helps voice synthesis sound realistic.
- Ask ONE question at a time. Wait for the candidate's response before proceeding.
- Questions must be realistic, unique, and desk-relevant — the kind asked in actual quant interviews.
- Mix question types: probability puzzles, mental math, stochastic calculus, pricing theory, coding logic, brain teasers, and practical desk scenarios.
- After the candidate answers, give brief, varied feedback (1-2 lines) then ask the next question.
- Track performance internally. Adjust difficulty based on how well the candidate answers.
- Never reveal the full solution immediately — guide with hints if they're stuck.
- SPEECH RECOGNITION CONTEXT: Input comes from live speech-to-text. Expect phonetic errors (e.g., "Mote Carlo" = Monte Carlo, "E toe" = Itô). Contextually infer the intended technical term WITHOUT mentioning the error.

TOPIC FOCUS: ${topic || 'General Quant'}
DIFFICULTY: ${difficulty || 'Mid-level'}

DIFFICULTY GUIDELINES:
- ENTRY-LEVEL: Basic probability (coin flips, dice), simple expected values, Black-Scholes intuition, basic Greeks, simple coding questions, fundamental statistics.
- MID-LEVEL: Conditional probability, Bayes theorem applications, option pricing derivations, basic stochastic calculus (Itô's lemma), Monte Carlo methods, moderate brain teasers, real interview-style questions from top firms.
- SENIOR-LEVEL: Advanced stochastic calculus, exotic option pricing, jump-diffusion models, PDE methods, measure theory intuition, complex brain teasers (e.g., "How many trailing zeros in 100!?"), system design for quant strategies, market microstructure.

IMPORTANT:
- Questions should feel like a REAL quant interview at Goldman Sachs or Citadel, NOT a textbook quiz.
- For mental math, give specific numbers and expect quick approximate answers. Example: "Quick — what's 17 × 23? You have 5 seconds."
- For probability, give concrete scenarios. Example: "You roll two dice. Given that the sum is greater than 7, what's the probability both dice show the same number?"
- For coding, ask about approach/pseudocode, not full syntax.
- Do NOT start every response with "Good job" or "Great answer". Be varied: "Right.", "Okay.", "Hmm, not quite.", "Let's move on.", or just ask the next question directly.
- If the candidate is vague, push back: "Why? Walk me through the reasoning." or "Can you be more precise?"
- If they're wrong, say so directly but diplomatically: "That's not quite right. Think about it differently."
- Maintain the persona of a busy, sharp practitioner — encouraging but demanding. ${pronounHe} has done hundreds of these interviews.`;

    try {
        let conversation = [];

        // 1. START INTERVIEW
        if (action === 'start') {
            conversation = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Begin the interview. Introduce yourself briefly (Name, Role at Bank) and ask the candidate to introduce themselves. Do NOT ask a technical question yet.' }
            ];

            // Log payment if present (future use)
            if (paymentId) console.log(`Starting interview for ${email} (${name}), Payment: ${paymentId}`);

            // Log to Supabase
            const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
            // Service role: RLS denies `anon` INSERT on interview_sessions, so the
            // old anon-key fallback silently dropped every session log.
            const SUPABASE_KEY = getServiceKey();
            if (SUPABASE_URL && SUPABASE_KEY) {
                try {
                    // Log to Supabase (Await ensures completion in serverless environments)
                    await fetch(`${SUPABASE_URL}/rest/v1/interview_sessions`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({
                            email: email || 'anonymous',
                            name: name || 'Anonymous',
                            topic: topic,
                            difficulty: difficulty,
                            payment_id: paymentId,
                            created_at: new Date().toISOString()
                        })
                    });
                    console.log('Logged to Supabase Successfully');
                } catch (e) {
                    console.error('Supabase Setup Error:', e);
                }
            }

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: GROQ_CHAT_MODEL,
                    messages: conversation,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Groq API Start Error: ${response.status} ${errText}`);
            }

            const data = await response.json();

            // Mint the session token that `respond`/`evaluate` require. Bound to
            // the duration actually paid for, so the session cannot outlive it.
            const minutes = Number(durationMinutes) > 0 ? Number(durationMinutes) : 10;
            const token = SESSION_TOKEN_SECRET
                ? signSessionToken({
                    minutes,
                    paid: minutes > 10,
                    exp: Date.now() + (minutes * 60 * 1000) + SESSION_GRACE_MS
                })
                : null;

            return res.status(200).json({ reply: data.choices[0].message.content, sessionToken: token });
        }

        // 2. EVALUATE (END)
        if (action === 'evaluate') {
            // Generate Scorecard
            const evalConversation = [
                { role: 'system', content: systemPrompt },
                ...messages,
                { role: 'user', content: 'The interview is over. Generate a detailed performance scorecard in Markdown. Include: 1. Topic-wise rating (1-10), 2. Strengths, 3. Weaknesses, 4. Actionable study plan. Do not ask any more questions. Just the report.' }
            ];

            const data = await callGroqAPI(evalConversation, 0.3, GROQ_API_KEY);
            const markdownReport = data.choices[0].message.content;

            // Send Email
            if (email) {
                try {
                    await sendEmailReport(email, name || 'Candidate', markdownReport);
                } catch (emailErr) {
                    console.error('Failed to send email:', emailErr);
                }
            }

            return res.status(200).json({ reply: "Report generated and sent." });
        }

        // 2. RESPOND TO CANDIDATE
        if (action === 'respond') {
            console.log('Sending chat context to Groq...');
            // Prepend system prompt to ensure LLM stays in persona, remembers difficulty and topic constraints
            const fullHistory = [
                { role: 'system', content: systemPrompt },
                ...messages
            ];
            
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: GROQ_CHAT_MODEL,
                    messages: fullHistory,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Groq API Respond Error: ${response.status} ${errText}`);
            }

            const data = await response.json();
            return res.status(200).json({ reply: data.choices[0].message.content });
        }
        // Default action if not start/evaluate/respond (should not be reached if all actions are handled)
        return res.status(400).json({ error: 'Invalid action specified' });

    } catch (error) {
        console.error('API Error:', error);
        // RETURN ACTUAL ERROR TO FRONTEND FOR DEBUGGING
        return res.status(500).json({ error: error.message || 'AI service error' });
    }
}

// Helper: Call Groq API
async function callGroqAPI(messages, temperature, apiKey) {
    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    };
    const body = {
        model: GROQ_CHAT_MODEL,
        messages: messages,
        temperature: temperature,
        // The scorecard is the paid deliverable and reasoning models bill their
        // internal reasoning against this same budget, so leave headroom.
        max_tokens: 2048
    };
    return await httpRequest('https://api.groq.com/openai/v1/chat/completions', options, body);
}

// Helper: Simple Markdown to HTML for Email
function markdownToHtml(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^### (.*$)/gm, '<h3 style="color:#0b7f79;margin-top:20px;">$1</h3>')
        .replace(/^## (.*$)/gm, '<h2 style="color:#1e40af;margin-top:25px;border-bottom:1px solid #ddd;padding-bottom:5px;">$1</h2>')
        .replace(/^- (.*$)/gm, '<li style="margin-bottom:5px;">$1</li>')
        .replace(/\n/g, '<br>');
}

// Helper: Send Email via Brevo
async function sendEmailReport(toEmail, toName, reportMarkdown) {
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_API_KEY) {
        console.warn('BREVO_API_KEY missing, skipping email');
        return;
    }

    const htmlReport = markdownToHtml(reportMarkdown);
    const htmlContent = emailShell({ body: `
        <p style="font-size:16px; color:#090909; margin:0 0 12px 0;">Hi <strong>${escapeHtml(toName)}</strong>,</p>
        <p style="font-size:14px; color:#44453f; margin:0 0 20px 0;">Here is the detailed scorecard from your recent mock interview.</p>
        <hr style="border:0; border-top:1px solid #d8d8d1; margin:20px 0;">

        <div style="background:#ffffff; padding:20px; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; overflow-wrap:anywhere; word-break:break-word; max-width:100%;">
            ${htmlReport}
        </div>

        <div style="margin-top:28px; text-align:center; font-size:0.9em; color:#666761;">
            <p>Keep practicing! <a href="https://desk2quant.com" style="color:#0b7f79;">Book a 1:1 session</a> for personalized feedback.</p>
        </div>
    ` });

    const options = {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
        }
    };

    const body = {
        sender: { email: process.env.SENDER_EMAIL || 'hello@desk2quant.com', name: process.env.SENDER_NAME ? `${process.env.SENDER_NAME} AI` : 'Desk2Quant AI' },
        to: [{ email: toEmail, name: toName }],
        subject: 'Your AI Interview Scorecard 📊',
        htmlContent: htmlContent,
        textContent: `Hi ${toName},\n\nHere is your AI Interview Scorecard:\n\n${reportMarkdown}\n\nKeep practicing! Book a 1:1 session for personalized feedback.`
    };

    await httpRequest('https://api.brevo.com/v3/smtp/email', options, body);
    console.log(`Email sent to ${toEmail}`);
}
