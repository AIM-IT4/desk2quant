import crypto from 'crypto';
import { getServiceKey } from '../lib/supabaseAdmin.js';

// Transactional email relay, free-resource capture and FX nurture unsubscribe.
// The FX lead magnet stays in this existing function so it does not consume
// another Vercel Function on the Hobby plan.

const ALLOWED_ORIGIN_HOSTS = [
    'desk2quant.com',
    'www.desk2quant.com',
    'localhost',
    '127.0.0.1'
];

const MAX_RECIPIENTS = 3;
const MAX_HTML_BYTES = 100 * 1024;
const FX_WORKBOOK_URL = '/assets/resources/50_FX_Derivatives_Quant_Interview_Problems.pdf';
const FX_LEAD_MAGNET = 'fx_derivatives_workbook';
const FX_BREVO_LIST_NAME = 'Desk2Quant - FX Workbook Leads';
const FX_BREVO_FOLDER_NAME = 'Desk2Quant Lead Magnets';
const FX_NURTURE_TRIGGERS = ['fx_nurture_1', 'fx_nurture_2', 'fx_nurture_3', 'fx_nurture_4'];
const FX_NURTURE_DELAYS_DAYS = [1, 3, 5, 7];
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

function fxUnsubscribeToken(email) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return null;
    return crypto.createHmac('sha256', secret)
        .update(`${String(email || '').trim().toLowerCase()}|${FX_LEAD_MAGNET}`, 'utf8')
        .digest('hex');
}

function safeHexEqual(a, b) {
    try {
        const aa = Buffer.from(String(a || ''), 'hex');
        const bb = Buffer.from(String(b || ''), 'hex');
        return aa.length === 32 && bb.length === 32 && crypto.timingSafeEqual(aa, bb);
    } catch (_) {
        return false;
    }
}

async function getBrevoLists(apiKey) {
    const response = await fetch('https://api.brevo.com/v3/contacts/lists?limit=50&offset=0&sort=desc', {
        headers: brevoHeaders(apiKey)
    });
    if (!response.ok) throw new Error(`Brevo list lookup failed (${response.status})`);
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
        if (!folderResponse.ok) throw new Error(`Brevo folder creation failed (${folderResponse.status})`);
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

    lists = await getBrevoLists(apiKey);
    const raced = lists.find((list) => String(list?.name || '').trim() === FX_BREVO_LIST_NAME);
    if (raced?.id) return Number(raced.id);
    throw new Error(`Brevo list creation failed (${createResponse.status})`);
}

async function existingFxLead(email, supabaseUrl, serviceKey) {
    const response = await fetch(
        `${supabaseUrl}/rest/v1/lead_captures?email=eq.${encodeURIComponent(email)}`
        + `&lead_magnet=eq.${encodeURIComponent(FX_LEAD_MAGNET)}`
        + '&select=id,brevo_list_id,brevo_synced_at,captured_at&limit=1',
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

    const response = await fetch(`${supabaseUrl}/rest/v1/lead_captures?on_conflict=email,lead_magnet`, {
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
    });
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Supabase lead upsert failed (${response.status}): ${detail.slice(0, 180)}`);
    }
}

async function ensureFxNurtureQueue(email, supabaseUrl, serviceKey) {
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const lookup = await fetch(
        `${supabaseUrl}/rest/v1/recommendation_emails?customer_email=eq.${encodeURIComponent(email)}`
        + '&trigger_type=in.(fx_nurture_1,fx_nurture_2,fx_nurture_3,fx_nurture_4)&select=trigger_type',
        { headers }
    );
    if (!lookup.ok) throw new Error(`FX nurture lookup failed (${lookup.status})`);
    const existingRows = await lookup.json();
    const existing = new Set((Array.isArray(existingRows) ? existingRows : []).map((r) => r.trigger_type));
    const now = Date.now();
    const rows = FX_NURTURE_TRIGGERS.flatMap((trigger, index) => existing.has(trigger) ? [] : [{
        customer_email: email,
        customer_name: 'Quant Learner',
        purchased_product: '50 FX Derivatives Problems for Quant Interviews',
        send_at: new Date(now + FX_NURTURE_DELAYS_DAYS[index] * 24 * 60 * 60 * 1000).toISOString(),
        sent: false,
        trigger_type: trigger,
        coupon_code: null,
        status: 'pending',
        attempts: 0
    }]);
    if (rows.length === 0) return { queued: 0 };

    const insert = await fetch(`${supabaseUrl}/rest/v1/recommendation_emails`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
    });
    if (!insert.ok) {
        const detail = await insert.text();
        throw new Error(`FX nurture queue insert failed (${insert.status}): ${detail.slice(0, 180)}`);
    }
    return { queued: rows.length };
}

async function handleFxUnsubscribe(req, res, brevoApiKey) {
    const email = String(req.query?.email || '').trim().toLowerCase();
    const suppliedToken = String(req.query?.token || '');
    const expectedToken = fxUnsubscribeToken(email);
    if (!email || !expectedToken || !safeHexEqual(suppliedToken, expectedToken)) {
        return res.status(400).send('<!doctype html><meta charset="utf-8"><title>Invalid link</title><p>This unsubscribe link is invalid or has expired.</p>');
    }

    const serviceKey = getServiceKey();
    const supabaseUrl = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    if (!serviceKey) return res.status(503).send('Unsubscribe service is temporarily unavailable.');
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    try {
        const leadResp = await fetch(
            `${supabaseUrl}/rest/v1/lead_captures?email=eq.${encodeURIComponent(email)}`
            + `&lead_magnet=eq.${encodeURIComponent(FX_LEAD_MAGNET)}&select=brevo_list_id&limit=1`,
            { headers }
        );
        const leads = leadResp.ok ? await leadResp.json() : [];
        const listId = Number(Array.isArray(leads) && leads[0]?.brevo_list_id || 0);

        const leadPatch = await fetch(
            `${supabaseUrl}/rest/v1/lead_captures?email=eq.${encodeURIComponent(email)}`
            + `&lead_magnet=eq.${encodeURIComponent(FX_LEAD_MAGNET)}`,
            {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                body: JSON.stringify({ consent_marketing: false, updated_at: new Date().toISOString() })
            }
        );
        if (!leadPatch.ok) throw new Error(`Consent update failed (${leadPatch.status})`);

        // Cancel any future queued FX nurture sends. A currently claimed row is
        // also marked failed; its sender performs an independent consent check.
        await fetch(
            `${supabaseUrl}/rest/v1/recommendation_emails?customer_email=eq.${encodeURIComponent(email)}`
            + '&trigger_type=in.(fx_nurture_1,fx_nurture_2,fx_nurture_3,fx_nurture_4)&status=in.(pending,sending)',
            {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                body: JSON.stringify({ status: 'failed', last_error: 'Unsubscribed by recipient' })
            }
        );

        if (brevoApiKey && listId > 0) {
            const unlink = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
                method: 'PUT',
                headers: brevoHeaders(brevoApiKey),
                body: JSON.stringify({ unlinkListIds: [listId] })
            });
            if (!unlink.ok && unlink.status !== 404) {
                console.warn('Brevo FX unsubscribe unlink failed:', unlink.status, await unlink.text());
            }
        }

        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed · Desk2Quant</title></head><body style="font-family:Arial,sans-serif;max-width:620px;margin:60px auto;padding:0 20px;line-height:1.6"><h1>You’re unsubscribed.</h1><p>You will no longer receive follow-up emails for the FX Derivatives workbook. Transactional emails for purchases or bookings are unaffected.</p><p><a href="https://desk2quant.com">Return to Desk2Quant</a></p></body></html>');
    } catch (error) {
        console.error('FX unsubscribe error:', error.message);
        return res.status(500).send('We could not process the unsubscribe request. Please try again.');
    }
}

async function captureFreeResourceLead(req, res, brevoApiKey, senderEmail, senderName) {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const consent = req.body?.consent === true;
    const honeypot = String(req.body?.company || '').trim();

    if (honeypot) return res.status(200).json({ success: true });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!consent) return res.status(400).json({ error: 'Consent is required to receive this free resource.' });

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

        await upsertFxLead({ email, listId, req, supabaseUrl, serviceKey });
        const nurture = await ensureFxNurtureQueue(email, supabaseUrl, serviceKey);

        if (priorLead) {
            return res.status(200).json({
                success: true,
                downloadUrl: FX_WORKBOOK_URL,
                alreadyCaptured: true,
                nurtureQueued: nurture.queued
            });
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
                htmlContent: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6"><h2 style="color:#17365d">Your FX Derivatives Quant Interview Workbook</h2><p>Thanks for joining the Desk2Quant free-resource list.</p><p>Your workbook contains <strong>50 FX derivatives interview problems</strong>, a formula reference sheet, and complete worked solutions in the appendix.</p><p style="margin:28px 0"><a href="${absoluteDownloadUrl}" style="background:#17365d;color:white;text-decoration:none;padding:13px 20px;border-radius:7px;display:inline-block">Download the PDF</a></p><p style="font-size:13px;color:#667085">You opted in to occasional Desk2Quant quant-finance resources and updates. Follow-up emails include a one-click unsubscribe link.</p><p>Desk2Quant<br><a href="https://desk2quant.com">desk2quant.com</a></p></div>`,
                textContent: `Your Desk2Quant FX Derivatives Quant Interview Workbook: ${absoluteDownloadUrl}`
            })
        });
        if (!emailResponse.ok) console.error('Free-resource delivery email failed:', emailResponse.status, await emailResponse.text());

        return res.status(200).json({ success: true, downloadUrl: FX_WORKBOOK_URL, nurtureQueued: nurture.queued });
    } catch (error) {
        console.error('FX lead funnel error:', error.message);
        return res.status(502).json({ error: 'Could not complete the signup. Please try again.' });
    }
}

export default async function handler(req, res) {
    // Signed one-click unsubscribe is intentionally GET so email clients can
    // open it directly. It is handled before same-origin POST enforcement.
    if (req.method === 'GET' && req.query?.action === 'unsubscribe-fx') {
        return handleFxUnsubscribe(req, res, process.env.BREVO_API_KEY);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!isAllowedOrigin(req)) {
        console.warn('Blocked cross-origin send-email attempt from:', req.headers?.origin || req.headers?.referer || 'no origin');
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (isRateLimited(req)) return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });

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
        if (!to || !subject || (!htmlContent && !textContent)) return res.status(400).json({ error: 'Missing required email fields' });

        const recipients = String(to).split(',').map((email) => email.trim()).filter(Boolean)
            .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
        if (recipients.length === 0) return res.status(400).json({ error: 'No valid recipient address supplied' });
        if (recipients.length > MAX_RECIPIENTS) return res.status(400).json({ error: `Too many recipients (max ${MAX_RECIPIENTS})` });
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
