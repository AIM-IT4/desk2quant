import { buildSignedDownloadUrl } from '../lib/secureDownload.js';

// Transactional email relay, called from the browser by script.js,
// admin.html, my-bookings.html and desk-simulator.mjs.
//
// SECURITY: this endpoint accepts browser-originated requests, so keep the
// same-origin check, recipient cap and rate limit in place. The FX workbook
// lead magnet is handled by a server-side allowlisted template so the browser
// never supplies arbitrary mail content for that flow.

const ALLOWED_ORIGIN_HOSTS = [
    'desk2quant.com',
    'www.desk2quant.com',
    'localhost',
    '127.0.0.1'
];

const MAX_RECIPIENTS = 3;
const MAX_HTML_BYTES = 100 * 1024; // 100 KB
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimitBuckets = new Map();

const FX_WORKBOOK_FILE_ID = '1d1aSlBTMts0pT_2YD612CVJi0zhJNh-E';
const FX_WORKBOOK_FILE_NAME = '50 FX Derivatives Problems for Quant Interviews.pdf';

function isAllowedOrigin(req) {
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

    if (rateLimitBuckets.size > 5000) {
        for (const [key, times] of rateLimitBuckets) {
            if (!times.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) rateLimitBuckets.delete(key);
        }
    }

    return hits.length > RATE_LIMIT_MAX;
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

async function handleFxWorkbookLead(req, res) {
    const { email, name, consent, website } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim().slice(0, 80);

    // Honeypot: humans never see/fill this field. Return a neutral success to
    // avoid teaching basic bots how the filter works.
    if (String(website || '').trim()) {
        return res.status(200).json({ success: true });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (consent !== true) {
        return res.status(400).json({ error: 'Consent is required to receive the free workbook and Desk2Quant emails.' });
    }

    const brevoApiKey = process.env.BREVO_API_KEY;
    const signingSecret = process.env.RAZORPAY_KEY_SECRET;
    const senderEmail = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
    const senderName = process.env.SENDER_NAME || 'Desk2Quant';

    if (!brevoApiKey || !signingSecret) {
        console.error('FX workbook lead flow missing BREVO_API_KEY or RAZORPAY_KEY_SECRET');
        return res.status(503).json({ error: 'The free-resource service is temporarily unavailable.' });
    }

    const contactBody = {
        email: normalizedEmail,
        updateEnabled: true
    };
    const listId = Number(process.env.BREVO_LEADS_LIST_ID || 0);
    if (Number.isInteger(listId) && listId > 0) contactBody.listIds = [listId];

    const contactResp = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify(contactBody)
    });

    if (!contactResp.ok) {
        const detail = await contactResp.text();
        console.error('Brevo lead capture failed:', contactResp.status, detail);
        return res.status(502).json({ error: 'We could not save your email. Please try again.' });
    }

    const baseUrl = `https://${req.headers.host}`;
    const downloadUrl = buildSignedDownloadUrl(
        baseUrl,
        signingSecret,
        FX_WORKBOOK_FILE_ID,
        normalizedEmail,
        FX_WORKBOOK_FILE_NAME,
        false
    );

    const greeting = cleanName ? `Hi ${escapeHtml(cleanName)},` : 'Hi,';
    const htmlContent = `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#172033;line-height:1.6">
            <h2 style="margin-bottom:8px">Your FX Derivatives Quant Interview Workbook</h2>
            <p>${greeting}</p>
            <p>Here is your free Desk2Quant workbook with <strong>50 FX derivatives interview problems</strong> and a complete worked-solutions appendix.</p>
            <p><a href="${downloadUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">Download the PDF</a></p>
            <p style="font-size:13px;color:#64748b">For security, this download link expires in 48 hours. You can request a fresh link from the free-resource page at any time.</p>
            <p>Topics include FX forwards and swaps, NDFs, Garman-Kohlhagen, delta conventions, smile/RR/BF, barriers, quanto, collateral and basis, calibration, P&amp;L explain, Monte Carlo and PDE methods.</p>
            <p>— Desk2Quant</p>
            <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">
            <p style="font-size:12px;color:#64748b">You requested this resource and agreed to receive Desk2Quant quant resources and occasional product updates. You can unsubscribe from marketing emails at any time.</p>
        </div>`;

    const textContent = `${cleanName ? `Hi ${cleanName},` : 'Hi,'}\n\nYour free Desk2Quant FX Derivatives Quant Interview Workbook is ready:\n${downloadUrl}\n\nThe link expires in 48 hours.\n\n— Desk2Quant`;

    const mailResp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { email: senderEmail, name: senderName },
            to: [{ email: normalizedEmail, ...(cleanName ? { name: cleanName } : {}) }],
            subject: 'Your free FX Derivatives Quant Interview Workbook',
            htmlContent,
            textContent
        })
    });

    if (!mailResp.ok) {
        console.error('FX workbook delivery email failed:', mailResp.status, await mailResp.text());
        // The lead is already captured; do not block the on-page download.
    }

    return res.status(200).json({ success: true, downloadUrl });
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

    if (req.query?.action === 'fx-workbook') {
        res.setHeader('Cache-Control', 'no-store');
        try {
            return await handleFxWorkbookLead(req, res);
        } catch (error) {
            console.error('FX workbook lead error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
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

        const brevoApiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
        const senderName = process.env.SENDER_NAME || 'Desk2Quant';

        if (!brevoApiKey) {
            console.error('SERVER ERROR: BREVO_API_KEY is not configured in Vercel');
            return res.status(500).json({ error: 'Email service configuration error' });
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
