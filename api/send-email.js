import { getServiceKey } from '../lib/supabaseAdmin.js';

// Transactional email relay, called from the browser by script.js,
// admin.html, my-bookings.html and desk-simulator.mjs.
//
// SECURITY: this endpoint used to accept `to`, `subject` and `htmlContent`
// straight from the request body with NO auth, NO origin check and NO rate
// limit, then send via Brevo as the site's verified sender. Anyone could mail
// arbitrary HTML to an unlimited recipient list from the site's domain.
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
const FX_LEAD_MAGNET = 'fx_derivatives_workbook';
const FX_BREVO_LIST_NAME = 'Desk2Quant - FX Workbook Leads';
const FX_BREVO_FOLDER_NAME = 'Desk2Quant Lead Magnets';
const CONSENT_TEXT = 'I agree to receive this resource and occasional Desk2Quant quant-finance resources and updates. I can unsubscribe from future marketing emails.';

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

function cleanText(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength) || null;
}

function cleanReferrerHost(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
        return new URL(raw).hostname.toLowerCase().slice(0, 180) || null;
    } catch (_) {
        return raw.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase().slice(0, 180) || null;
    }
}

function brevoHeaders(apiKey) {
    return {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
    };
}

async function getBrevoLists(apiKey) {
    const response = await fetch('https://api.brevo.com/v3/contacts/lists?limit=50&offset=0&sort=desc', {
        headers: brevoHeaders(apiKey)
    });
    if (!response.ok) {
        throw new Error(`Brevo list lookup failed (${response.status})`);
    }
    const data = await response.json();
    return Array.isArray(data?.lists) ? data.lists : [];
}

async function ensureFxBrevoList(apiKey) {
    const configuredId = Number(process.env.BREVO_FX_LEADS_LIST_ID || 0);
    if (Number.isInteger(configuredId) && configuredId > 0) {
        const configured = await fetch(`https://api.brevo.com/v3/contacts/lists/${configuredId}`, {
            headers: brevoHeaders(apiKey)
        });
        if (configured.ok) return configuredId;
        console.warn('BREVO_FX_LEADS_LIST_ID is invalid; falling back to named-list discovery');
    }

    let lists = await getBrevoLists(apiKey);
    const existing = lists.find((list) => String(list?.name || '').trim() === FX_BREVO_LIST_NAME);
    if (existing?.id) return Number(existing.id);

    let folderId = Number(lists.find((list) => Number(list?.folderId) > 0)?.folderId || 0);
    if (!folderId) {
        const folderResponse = await fetch('https://api.brevo.com/v3/contacts/folders', {
            method: 'POST',
            headers: brevoHeaders(apiKey),
            body: JSON.stringify({ name: FX_BREVO_FOLDER_NAME })
        });
        if (!folderResponse.ok) {
            throw new Error(`Brevo folder creation failed (${folderResponse.status})`);
        }
        const folder = await folderResponse.json();
        folderId = Number(folder?.id || 0);
    }

    if (!folderId) throw new Error('Brevo folder ID could not be resolved');

    const createResponse = await fetch('https://api.brevo.com/v3/contacts/lists', {
        method: 'POST',
        headers: brevoHeaders(apiKey),
        body: JSON.stringify({ name: FX_BREVO_LIST_NAME, folderId })
    });

    if (createResponse.ok) {
        const created = await createResponse.json();
        if (Number(created?.id) > 0) return Number(created.id);
    }

    // Handles a rare concurrent first-signup race: another request may have
    // created the named list between our lookup and create call.
    lists = await getBrevoLists(apiKey);
    const raced = lists.find((list) => String(list?.name || '').trim() === FX_BREVO_LIST_NAME);
    if (raced?.id) return Number(raced.id);

    throw new Error(`Brevo list creation failed (${createResponse.status})`);
}

async function existingFxLead(email, supabaseUrl, serviceKey) {
    const response = await fetch(
        `${supabaseUrl}/rest/v1/lead_captures?email=eq.${encodeURIComponent(email)}`
        + `&lead_magnet=eq.${encodeURIComponent(FX_LEAD_MAGNET)}`
        + '&select=id,brevo_list_id,brevo_synced_at&limit=1',
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!response.ok) throw new Error(`Supabase lead lookup failed (${response.status})`);
    const rows = await response.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function upsertFxLead({ email, listId, req, supabaseUrl, serviceKey }) {
    const now = new Date().toISOString();
    const utmSource = cleanText(req.body?.utmSource, 100);
    const utmMedium = cleanText(req.body?.utmMedium, 100);
    const utmCampaign = cleanText(req.body?.utmCampaign, 120);
    const referrerHost = cleanReferrerHost(req.body?.referrer);
    const source = cleanText(utmSource || req.body?.source || 'resources', 100);

    const response = await fetch(
        `${supabaseUrl}/rest/v1/lead_captures?on_conflict=email,lead_magnet`,
        {
            method: 'POST',
            headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({
                email,
                lead_magnet: FX_LEAD_MAGNET,
                consent_marketing: true,
                consent_text: CONSENT_TEXT,
                source,
                captured_at: now,
                brevo_list_id: listId,
                brevo_synced_at: now,
                utm_source: utmSource,
                utm_medium: utmMedium,
                utm_campaign: utmCampaign,
                referrer_host: referrerHost,
                updated_at: now
            })
        }
    );

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Supabase lead upsert failed (${response.status}): ${detail.slice(0, 180)}`);
    }
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

    const serviceKey = getServiceKey();
    const supabaseUrl = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    if (!serviceKey) {
        console.error('FX lead capture: SUPABASE_SERVICE_ROLE_KEY is not configured');
        return res.status(503).json({ error: 'Lead service is temporarily unavailable. Please try again.' });
    }

    try {
        const priorLead = await existingFxLead(email, supabaseUrl, serviceKey);
        const listId = await ensureFxBrevoList(brevoApiKey);

        const contactResponse = await fetch('https://api.brevo.com/v3/contacts', {
            method: 'POST',
            headers: brevoHeaders(brevoApiKey),
            body: JSON.stringify({ email, updateEnabled: true, listIds: [listId] })
        });

        if (!contactResponse.ok) {
            const detail = await contactResponse.text();
            console.error('Brevo lead capture failed:', contactResponse.status, detail);
            return res.status(502).json({ error: 'Could not save your email. Please try again.' });
        }

        // Explicit list-add makes list membership deterministic even for a
        // pre-existing Brevo contact updated via updateEnabled.
        const listResponse = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts/add`, {
            method: 'POST',
            headers: brevoHeaders(brevoApiKey),
            body: JSON.stringify({ emails: [email] })
        });
        if (!listResponse.ok) {
            const detail = await listResponse.text();
            console.error('Brevo FX list membership failed:', listResponse.status, detail);
            return res.status(502).json({ error: 'Could not subscribe you to the resource list. Please try again.' });
        }

        await upsertFxLead({ email, listId, req, supabaseUrl, serviceKey });

        // A repeated form submission should unlock the same PDF but must not
        // generate another delivery email. Brevo list membership + attribution
        // are still refreshed above.
        if (priorLead) {
            return res.status(200).json({ success: true, downloadUrl: FX_WORKBOOK_URL, alreadyCaptured: true });
        }

        const absoluteDownloadUrl = `https://desk2quant.com${FX_WORKBOOK_URL}`;
        const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: brevoHeaders(brevoApiKey),
            body: JSON.stringify({
                sender: { email: senderEmail, name: senderName },
                replyTo: { email: senderEmail, name: senderName },
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
    } catch (error) {
        console.error('FX lead funnel error:', error.message);
        return res.status(502).json({ error: 'Could not complete the signup. Please try again.' });
    }
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
            headers: brevoHeaders(brevoApiKey),
            body: JSON.stringify({
                sender: { email: senderEmail, name: senderName },
                replyTo: { email: senderEmail, name: senderName },
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
