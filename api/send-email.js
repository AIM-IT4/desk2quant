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
// The free-resource lead magnet is handled here as a server-owned template so
// it does not consume another Vercel Function and cannot accept arbitrary HTML.

const ALLOWED_ORIGIN_HOSTS = [
    'desk2quant.com',
    'www.desk2quant.com',
    'localhost',
    '127.0.0.1'
];

const MAX_RECIPIENTS = 3;
const MAX_HTML_BYTES = 100 * 1024; // 100 KB
const FX_WORKBOOK_URL = '/assets/resources/50_FX_Derivatives_Quant_Interview_Problems.pdf';

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimitBuckets = new Map();

function isAllowedOrigin(req) {
    const raw = req.headers?.origin || req.headers?.referer;
    if (!raw) return false;
    try {
        const host = new URL(raw).hostname.toLowerCase();
        return ALLOWED_ORIGIN_HOSTS.includes(host) || host.endsWith('.vercel.app');
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

    if (rateLimitBuckets.size > 5000) {
        for (const [key, times] of rateLimitBuckets) {
            if (!times.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) rateLimitBuckets.delete(key);
        }
    }
    return hits.length > RATE_LIMIT_MAX;
}

async function captureFreeResourceLead(req, res, brevoApiKey, senderEmail, senderName) {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const consent = req.body?.consent === true;
    const honeypot = String(req.body?.company || '').trim();

    if (honeypot) return res.status(200).json({ success: true });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (!consent) {
        return res.status(400).json({ error: 'Consent is required to receive this free resource.' });
    }

    const listId = Number(process.env.BREVO_LEADS_LIST_ID || 0);
    const contactPayload = { email, updateEnabled: true };
    if (Number.isInteger(listId) && listId > 0) contactPayload.listIds = [listId];

    const contactResponse = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify(contactPayload)
    });

    if (!contactResponse.ok) {
        console.error('Brevo lead capture failed:', contactResponse.status, await contactResponse.text());
        return res.status(502).json({ error: 'Could not save your email. Please try again.' });
    }

    const absoluteDownloadUrl = `https://desk2quant.com${FX_WORKBOOK_URL}`;
    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { email: senderEmail, name: senderName },
            to: [{ email }],
            subject: 'Your free FX Derivatives Quant Interview Workbook',
            htmlContent: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6"><h2 style="color:#17365d">Your FX Derivatives Quant Interview Workbook</h2><p>Thanks for joining the Desk2Quant free-resource list.</p><p>Your workbook contains <strong>50 FX derivatives interview problems</strong>, a formula reference sheet, and complete worked solutions in the appendix.</p><p style="margin:28px 0"><a href="${absoluteDownloadUrl}" style="background:#17365d;color:white;text-decoration:none;padding:13px 20px;border-radius:7px;display:inline-block">Download the PDF</a></p><p style="font-size:13px;color:#667085">You opted in to occasional Desk2Quant quant-finance resources and updates. Future marketing emails will include an unsubscribe option.</p><p>Desk2Quant<br><a href="https://desk2quant.com">desk2quant.com</a></p></div>`,
            textContent: `Your Desk2Quant FX Derivatives Quant Interview Workbook: ${absoluteDownloadUrl}`
        })
    });

    if (!emailResponse.ok) {
        console.error('Free-resource delivery email failed:', emailResponse.status, await emailResponse.text());
    }

    return res.status(200).json({ success: true, downloadUrl: FX_WORKBOOK_URL });
}

export default async function handler(req, res) {
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
        const brevoApiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
        const senderName = process.env.SENDER_NAME || 'Desk2Quant';

        if (!brevoApiKey) {
            console.error('SERVER ERROR: BREVO_API_KEY is not configured in Vercel');
            return res.status(500).json({ error: 'Email service configuration error' });
        }

        if (req.body?.action === 'free-resource-lead') {
            return await captureFreeResourceLead(req, res, brevoApiKey, senderEmail, senderName);
        }

        const { to, subject, htmlContent, textContent } = req.body;

        if (!to || !subject || (!htmlContent && !textContent)) {
            return res.status(400).json({ error: 'Missing required email fields' });
        }

        const recipients = String(to)
            .split(',')
            .map((email) => email.trim())
            .filter(Boolean)
            .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

        if (recipients.length === 0) {
            return res.status(400).json({ error: 'No valid recipient address supplied' });
        }

        if (recipients.length > MAX_RECIPIENTS) {
            console.warn('Blocked send-email fan-out attempt:', recipients.length, 'recipients');
            return res.status(400).json({ error: `Too many recipients (max ${MAX_RECIPIENTS})` });
        }

        if (Buffer.byteLength(String(htmlContent || '') + String(textContent || ''), 'utf8') > MAX_HTML_BYTES) {
            return res.status(413).json({ error: 'Email body is too large' });
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'api-key': brevoApiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { email: senderEmail, name: senderName },
                to: recipients.map((email) => ({ email })),
                subject,
                htmlContent,
                textContent
            })
        });

        if (response.ok) {
            const data = await response.json();
            return res.status(200).json({ success: true, messageId: data.messageId });
        }

        const error = await response.json();
        console.error('Brevo API Error:', error);
        return res.status(response.status).json({ success: false, error: error.message || 'Failed to send email' });
    } catch (error) {
        console.error('Email Sender Function Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
