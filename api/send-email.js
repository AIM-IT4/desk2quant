// Transactional email relay, called from the browser by script.js,
// admin.html, my-bookings.html and desk-simulator.mjs.
//
// SECURITY: this endpoint used to accept `to`, `subject` and `htmlContent`
// straight from the request body with NO auth, NO origin check and NO rate
// limit, then send via Brevo as the site's verified sender. Anyone could mail
// arbitrary HTML to an unlimited recipient list from desk2quant@gmail.com --
// a turnkey phishing/spam vector against the site's own domain reputation.
//
// It cannot simply be given the cron secret, because it is legitimately called
// from unauthenticated browsers. The gate below is therefore defence in depth:
//   1. same-origin only  -- blocks the trivial `curl` abuse case
//   2. recipient cap     -- one request can no longer fan out to a list
//   3. per-IP rate limit -- caps volume even from a forged origin
//   4. size cap          -- bounds the payload
//
// NOTE: the Origin header is forgeable by a non-browser client, so (1) raises
// the bar rather than closing the hole. The durable fix is to move the email
// bodies server-side behind a template allowlist so the caller passes only a
// template id + parameters and can never supply raw HTML. Tracked as follow-up.

const ALLOWED_ORIGIN_HOSTS = [
    'desk2quant.com',
    'www.desk2quant.com',
    'localhost',
    '127.0.0.1'
];

const MAX_RECIPIENTS = 3;
const MAX_HTML_BYTES = 100 * 1024; // 100 KB

// Per-IP sliding window. In-memory, so it is per-instance rather than global --
// with Fluid Compute reusing instances this still meaningfully caps a single
// abusive caller. Not a substitute for the template allowlist above.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimitBuckets = new Map();

function isAllowedOrigin(req) {
    // Prefer Origin; fall back to Referer (some browsers omit Origin on
    // same-origin POSTs made from older code paths).
    const raw = req.headers?.origin || req.headers?.referer;
    if (!raw) return false;
    try {
        return ALLOWED_ORIGIN_HOSTS.includes(new URL(raw).hostname);
    } catch (_) {
        return false;
    }
}

function isRateLimited(req) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '');
    const ip = forwarded.split(',')[0].trim() || 'unknown';
    const now = Date.now();

    const hits = (rateLimitBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    hits.push(now);
    rateLimitBuckets.set(ip, hits);

    // Opportunistic cleanup so the map cannot grow without bound.
    if (rateLimitBuckets.size > 5000) {
        for (const [key, times] of rateLimitBuckets) {
            if (!times.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) rateLimitBuckets.delete(key);
        }
    }

    return hits.length > RATE_LIMIT_MAX;
}

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!isAllowedOrigin(req)) {
        console.warn('Blocked cross-origin send-email attempt from:', req.headers?.origin || req.headers?.referer || 'no origin');
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (isRateLimited(req)) {
        return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }

    try {
        const { to, subject, htmlContent, textContent } = req.body;

        if (!to || !subject || (!htmlContent && !textContent)) {
            return res.status(400).json({ error: 'Missing required email fields' });
        }

        const recipients = String(to)
            .split(',')
            .map((email) => email.trim())
            .filter(Boolean)
            // Reject anything that is not plausibly an address before it reaches Brevo.
            .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

        if (recipients.length === 0) {
            return res.status(400).json({ error: 'No valid recipient address supplied' });
        }

        // A legitimate transactional email goes to one person (occasionally
        // plus an admin copy). Anything beyond that is a list blast.
        if (recipients.length > MAX_RECIPIENTS) {
            console.warn('Blocked send-email fan-out attempt:', recipients.length, 'recipients');
            return res.status(400).json({ error: `Too many recipients (max ${MAX_RECIPIENTS})` });
        }

        if (Buffer.byteLength(String(htmlContent || '') + String(textContent || ''), 'utf8') > MAX_HTML_BYTES) {
            return res.status(413).json({ error: 'Email body is too large' });
        }

        const brevoApiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.SENDER_EMAIL || 'desk2quant@gmail.com';
        const senderName = process.env.SENDER_NAME || 'Desk2Quant';

        if (!brevoApiKey) {
            console.error('SERVER ERROR: BREVO_API_KEY is not configured in Vercel');
            return res.status(500).json({ error: 'Email service configuration error' });
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': brevoApiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { email: senderEmail, name: senderName },
                to: recipients.map((email) => ({ email })),
                subject: subject,
                htmlContent: htmlContent,
                textContent: textContent
            })
        });

        if (response.ok) {
            const data = await response.json();
            return res.status(200).json({ success: true, messageId: data.messageId });
        } else {
            const error = await response.json();
            console.error('Brevo API Error:', error);
            return res.status(response.status).json({ success: false, error: error.message || 'Failed to send email' });
        }
    } catch (error) {
        console.error('Email Sender Function Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
