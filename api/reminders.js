// Vercel Serverless Function: Automatic Session Reminders
// Called by external cron service (cron-job.org) every 5 minutes
//
// Also sweeps the `recommendation_emails` queue (see lib/recommendationQueue.js
// and lib/recommendationEmail.js) so post-purchase/post-booking recommendation
// emails are actually sent + retried, instead of the old fire-and-forget call
// inside the Razorpay webhook that had no completion guarantee on serverless.

import { sendRecommendationEmail } from '../lib/recommendationEmail.js';
import { getServiceKey, blockIfUnconfigured } from '../lib/supabaseAdmin.js';
import { emailShell, escapeHtml } from '../lib/emailBranding.js';

// Module-scope constants so sendReminder can access them
const REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL || process.env.SENDER_EMAIL || 'hello@desk2quant.com';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

    // Verify secret to prevent unauthorized calls
    const secret = req.query.secret || req.headers['x-cron-secret'];
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
        return res.status(500).json({
            error: 'CRON_SECRET not configured in environment variables'
        });
    }

    if (secret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Configuration from environment variables
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    // Service role: RLS denies `anon` on bookings/purchases and the
    // recommendation_emails queue, so the old inline anon-key fallback made every
    // reminder sweep a silent no-op.
    if (blockIfUnconfigured(res, 'reminders')) return;
    const SUPABASE_KEY = getServiceKey();
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!process.env.ADMIN_EMAIL) {
        console.warn('CONFIG: ADMIN_EMAIL not set - reminder alerts fall back to hello@desk2quant.com');
    }
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@desk2quant.com';
    const SENDER_EMAIL = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
    const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';

    // --- One-off Drive permission audit -------------------------------
    // Past buyers were granted role:'writer' on the master product files.
    // Runs here because GOOGLE_PRIVATE_KEY is redacted by `vercel env pull`
    // and cannot be used from a local machine. Guarded by CRON_SECRET above.
    if (req.query.action === 'drive-audit') {
        try {
            const { runDriveAudit } = await import('../lib/driveAudit.js');
            const result = await runDriveAudit({
                clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                privateKey: process.env.GOOGLE_PRIVATE_KEY,
                supabaseUrl: SUPABASE_URL,
                supabaseKey: SUPABASE_KEY,
                apply: req.query.apply === 'true'
            });
            return res.status(200).json(result);
        } catch (err) {
            return res.status(500).json({ error: String(err.message || err) });
        }
    }

    // --- Buyer access check (verify one buyer's Drive access) -----------
    // Confirms a specific buyer holds a 'reader' grant on a product file and
    // that no file (or folder child) blocks reader download via
    // copyRequiresWriterPermission. apply=true grants reader + clears flags
    // where the service account is allowed to. Guarded by CRON_SECRET above.
    if (req.query.action === 'buyer-access') {
        try {
            const { auditBuyerAccess } = await import('../lib/driveAudit.js');
            const fileIds = (req.query.fileIds
                ? String(req.query.fileIds).split(',')
                : []).map((x) => x.trim()).filter(Boolean);
            if (!fileIds.length) {
                return res.status(400).json({ error: 'fileIds required (comma-separated)' });
            }
            const result = await auditBuyerAccess({
                clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                privateKey: process.env.GOOGLE_PRIVATE_KEY,
                buyerEmail: req.query.email,
                fileIds,
                apply: req.query.apply === 'true'
            });
            return res.status(200).json(result);
        } catch (err) {
            return res.status(500).json({ error: String(err.message || err) });
        }
    }

    // --- Ownership probe (diagnostic) -----------------------------------
    // Five product files have copyRequiresWriterPermission = true, which hides
    // Download/Print/Copy from readers, and the service account cannot clear it
    // because it is not the owner. Before asking for an ownership transfer, ask
    // Drive whether such a transfer is even permitted. Inspect-only unless
    // attempt=true. Guarded by CRON_SECRET above.
    if (req.query.action === 'ownership-probe') {
        try {
            const { probeOwnership } = await import('../lib/driveAudit.js');
            const ids = (req.query.fileIds
                ? String(req.query.fileIds).split(',')
                : [
                    '13JzCKxxRXKSp7rC00gxdmkrr_ZiuOk_F',
                    '1Rz_8G6TsV-6wzf58_JHThgM2Ataf37jK',
                    '1QNoTQNauNT7a-uXfzmC2f6q4Kv2JWbES',
                    '1O9-GnC6GhKKkxu9J3VaDJ3quYy-UJ6Yq',
                    '1I-ALHHi7k8VuYVrspEn-SSuuCmGfVYMY'
                ]).map((x) => x.trim()).filter(Boolean);
            const result = await probeOwnership({
                clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                privateKey: process.env.GOOGLE_PRIVATE_KEY,
                fileIds: ids,
                attempt: req.query.attempt === 'true'
            });
            return res.status(200).json(result);
        } catch (err) {
            return res.status(500).json({ error: String(err.message || err) });
        }
    }

    if (!BREVO_API_KEY) {
        return res.status(500).json({ error: 'BREVO_API_KEY not configured' });
    }

    const results = {
        timestamp: new Date().toISOString(),
        reminders24h: [],
        reminders10m: [],
        errors: []
    };

    try {
        // Fetch confirmed/upcoming bookings (status can be 'confirmed' or 'upcoming')
        const today = new Date().toISOString().split('T')[0];

        const supabaseResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/bookings?status=in.(confirmed,upcoming)&booking_date=gte.${today}&select=*`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!supabaseResponse.ok) {
            throw new Error(`Supabase fetch failed: ${supabaseResponse.status}`);
        }

        const bookings = await supabaseResponse.json();

        if (!bookings || bookings.length === 0) {
            const recResultsEarly = await processRecommendationQueue({
                SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME
            });
            const bounceCheckEarly = await checkHardBounces({ BREVO_API_KEY, ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME });
            return res.status(200).json({
                ...results,
                message: 'No confirmed bookings found',
                recommendationQueue: recResultsEarly,
                bounceAlerts: bounceCheckEarly
            });
        }

        const now = new Date();

        for (const booking of bookings) {
            try {
                // Parse session datetime - assuming IST timezone (+05:30)
                // Add IST offset to make it timezone-aware
                const sessionStart = new Date(`${booking.booking_date}T${booking.booking_time}+05:30`);
                const timeDiff = sessionStart - now; // milliseconds
                const hoursDiff = timeDiff / (1000 * 60 * 60);
                const minutesDiff = timeDiff / (1000 * 60);

                // 24-Hour Reminder (23 to 25 hours before)
                if (hoursDiff >= 23 && hoursDiff <= 25 && !booking.reminder_24h_sent) {
                    await sendReminder(booking, '24h', {
                        SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY,
                        ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME
                    });
                    results.reminders24h.push(booking.email);
                }

                // 10-Minute Reminder (5 to 15 minutes before)
                else if (minutesDiff > 5 && minutesDiff <= 15 && !booking.reminder_10m_sent) {
                    await sendReminder(booking, '10m', {
                        SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY,
                        ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME
                    });
                    results.reminders10m.push(booking.email);
                }

                // 5-Minute Reminder (0 to 5 minutes before)
                else if (minutesDiff > 0 && minutesDiff <= 5 && !booking.reminder_5m_sent) {
                    await sendReminder(booking, '5m', {
                        SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY,
                        ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME
                    });
                    results.reminders5m = results.reminders5m || [];
                    results.reminders5m.push(booking.email);
                }

            } catch (bookingError) {
                results.errors.push({
                    bookingId: booking.id,
                    error: bookingError.message
                });
            }
        }

        // Sweep the recommendation-email queue on the same cron tick.
        const recResults = await processRecommendationQueue({
            SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME
        });

        // Alert the owner when a transactional confirmation email hard-bounces
        // (a paid customer whose confirmation bounced has no download link by
        // email; the success modal only covers buyers who stay on the page).
        const bounceCheck = await checkHardBounces({ BREVO_API_KEY, ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME });

        return res.status(200).json({
            ...results,
            message: `Processed ${bookings.length} bookings`,
            sent24h: results.reminders24h.length,
            sent10m: results.reminders10m.length,
            recommendationQueue: recResults,
            bounceAlerts: bounceCheck
        });

    } catch (error) {
        console.error('Reminder cron error:', error);
        return res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// Process due, pending rows in the recommendation_emails queue: send, then
// mark sent/failed with attempts + last_error so every attempt is auditable.
// Rows that fail MAX_ATTEMPTS times are left as 'failed' (not retried further)
// so a permanently-broken row doesn't loop forever burning Brevo credits.
const MAX_ATTEMPTS = 3;

// Poll Brevo for transactional emails that hard-bounced in the last 6 minutes
// and alert the owner. Runs on the same 5-minute cron, so a given bounce is
// seen by at most two ticks (rarely more than one alert per bounce). Never
// throws — a monitoring failure must not fail the cron itself.
async function checkHardBounces({ BREVO_API_KEY, ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME }) {
    const outcome = { checked: 0, alerts: 0, bounces: [] };
    if (!BREVO_API_KEY) return outcome;
    const since = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    try {
        const resp = await fetch('https://api.brevo.com/v3/smtp/statistics/events?days=1&limit=100', {
            headers: { 'api-key': BREVO_API_KEY }
        });
        if (!resp.ok) {
            outcome.bounces.push(`Brevo events fetch failed: ${resp.status}`);
            return outcome;
        }
        const data = await resp.json();
        const rows = Array.isArray(data?.events) ? data.events : [];
        const recent = rows.filter(r => r.event === 'hardBounces' && r.date && new Date(r.date) >= new Date(since));
        // One alert per bounced address (not per event).
        const byEmail = new Map();
        for (const r of recent) byEmail.set(r.email, r);
        outcome.checked = recent.length;
        if (byEmail.size === 0) return outcome;

        const lines = [...byEmail.values()].map(r =>
            `• ${r.email || '?'} — ${(r.subject || 'no subject').slice(0, 90)} (${(r.date || '').slice(0, 16)})`
        ).join('\n');
        const html = `<p style="font-size:15px;margin:0 0 14px 0;">Hard-bounced transactional email(s) in the last 6 minutes — these customers paid but their confirmation/download email did not deliver. Check their Drive/storage access manually:</p><pre style="background:#f5f5f0;border:1px solid #090909;padding:14px;font-size:13px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(lines)}</pre>`;
        const alertResp = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                to: ADMIN_EMAIL.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
                subject: `🚨 Hard bounce: ${byEmail.size} customer confirmation(s) not delivered`,
                htmlContent: emailShell({ body: html })
            })
        });
        if (alertResp.ok) {
            outcome.alerts = byEmail.size;
            outcome.bounces = [...byEmail.keys()];
            console.log(`📨 Hard-bounce alert sent (${byEmail.size} bounced)`);
        } else {
            outcome.bounces.push(`Alert email failed: ${await alertResp.text()}`);
        }
    } catch (err) {
        outcome.bounces.push(`Hard-bounce check threw: ${err.message}`);
    }
    return outcome;
}

async function processRecommendationQueue({ SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME }) {
    const outcome = { checked: 0, sent: 0, failed: 0, errors: [] };

    if (!SUPABASE_URL || !SUPABASE_KEY || !BREVO_API_KEY) {
        outcome.errors.push('Missing SUPABASE_URL/SUPABASE_KEY/BREVO_API_KEY');
        return outcome;
    }

    let due = [];
    try {
        const nowIso = new Date().toISOString();
        const resp = await fetch(
            `${SUPABASE_URL}/rest/v1/recommendation_emails?status=eq.pending&send_at=lte.${nowIso}&attempts=lt.${MAX_ATTEMPTS}&select=*&order=send_at.asc&limit=25`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        if (!resp.ok) {
            outcome.errors.push(`Queue fetch failed: ${resp.status}`);
            return outcome;
        }
        due = await resp.json();
    } catch (err) {
        outcome.errors.push(`Queue fetch threw: ${err.message}`);
        return outcome;
    }

    outcome.checked = due.length;

    for (const row of due) {
        // Atomically claim the row (pending -> sending) so two overlapping cron
        // ticks can't both fetch it and both send. A tick that loses the claim
        // sees zero rows updated and skips. This is what stopped the duplicate
        // sends observed at 08-10 13:31 IST: two ticks sent the same pending
        // row, producing 2 emails for a row that ended with attempts: 1.
        let claimed;
        try {
            const claimResp = await fetch(
                `${SUPABASE_URL}/rest/v1/recommendation_emails?id=eq.${row.id}&status=eq.pending`,
                {
                    method: 'PATCH',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({ status: 'sending' })
                }
            );
            const body = claimResp.ok ? await claimResp.json() : [];
            claimed = Array.isArray(body) ? body : (body && typeof body === 'object' ? [body] : []);
        } catch (err) {
            outcome.errors.push(`Claim failed for row ${row.id}: ${err.message}`);
            continue;
        }
        if (claimed.length === 0) {
            // Another tick claimed or completed this row first — skip.
            continue;
        }

        const result = await sendRecommendationEmail({
            customerEmail: row.customer_email,
            customerName: row.customer_name,
            purchasedProductName: row.purchased_product,
            trigger: row.trigger_type,
            couponCode: row.coupon_code,
            SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME
        });

        const nextAttempts = (row.attempts || 0) + 1;
        const patch = result.ok
            ? { status: 'sent', attempts: nextAttempts, sent_at: new Date().toISOString(), sent: true, brevo_message_id: result.messageId || null, last_error: result.skipped ? (result.reason || null) : null }
            : { status: nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending', attempts: nextAttempts, last_error: result.error };

        try {
            await fetch(`${SUPABASE_URL}/rest/v1/recommendation_emails?id=eq.${row.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(patch)
            });
        } catch (err) {
            outcome.errors.push(`Failed to update queue row ${row.id}: ${err.message}`);
        }

        if (result.ok) {
            outcome.sent++;
            console.log(`✅ Recommendation email sent to ${row.customer_email} [${row.coupon_code}]`);
        } else {
            outcome.failed++;
            outcome.errors.push(`${row.customer_email}: ${result.error}`);
            console.error(`❌ Recommendation email failed for ${row.customer_email} (attempt ${nextAttempts}/${MAX_ATTEMPTS}):`, result.error);
        }
    }

    return outcome;
}

// Helper function to send reminder email
async function sendReminder(booking, type, config) {
    const { SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME } = config;

    const meetLink = booking.meet_link;
    if (!meetLink) {
        console.warn('Skipping reminder without a private session link:', booking.id);
        return;
    }
    const userName = booking.name || 'Learner';

    let displayTime = booking.booking_time || '';
    if (displayTime && !displayTime.toLowerCase().match(/am|pm/)) {
        const parts = displayTime.split(':');
        if (parts.length >= 2) {
            let hour = parseInt(parts[0], 10);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            hour = hour % 12 || 12;
            displayTime = `${hour}:${parts[1]} ${ampm}`;
        }
    }

    let subject, htmlBody;

    if (type === '24h') {
        subject = `Reminder: Session Tomorrow - ${booking.service_name}`;
        htmlBody = emailShell({ body: `
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background:#ffca3a; color:#090909; padding:4px 8px; border:1px solid #090909; border-radius:0; font-size:11px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909;">Upcoming Session</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${escapeHtml(userName)}</strong>, you have a session tomorrow.</p>
                        
                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:20px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Details</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #090909; border-bottom: 1px solid #d8d8d1; padding-bottom: 15px;">${escapeHtml(booking.service_name)}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Date</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${booking.booking_date}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${displayTime} IST</td>
                                </tr>
                            </table>
                        </div>
        ` });
    } else if (type === '10m') {
        subject = `Starting Soon: Your Session in 10 Minutes! ⏰`;
        htmlBody = emailShell({ body: `
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background:#0b7f79; color:#ffffff; padding:4px 8px; border:1px solid #090909; border-radius:0; font-size:11px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909;">⏰ Starts in 10 mins</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${escapeHtml(userName)}</strong>, your session starts soon.</p>
                        
                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:25px;">
                            <p style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Details</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #090909; border-bottom: 1px solid #d8d8d1; padding-bottom: 15px;">${escapeHtml(booking.service_name)}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Date</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${booking.booking_date}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666761; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${displayTime} IST</td>
                                </tr>
                            </table>
                        </div>

                        <center>
                            <a href="${escapeHtml(meetLink)}" style="display: inline-block; background:#ffca3a; color:#090909; font-weight:800; text-decoration:none; padding:14px 30px; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; font-size:16px; margin-bottom:20px;">Join Meeting</a>
                        </center>
        ` });
    } else if (type === '5m') {
        subject = `🚨 STARTING NOW: Your Session in 5 Minutes!`;
        htmlBody = emailShell({ body: `
                        <div style="margin-bottom: 20px; text-align: center;">
                            <span style="display: inline-block; background:#d73f3f; color:#ffffff; padding:6px 12px; border:1px solid #090909; border-radius:0; font-size:13px; font-weight:800; text-transform:uppercase; box-shadow:2px 2px 0 #090909;">🚨 STARTING NOW</span>
                        </div>
                        <p style="font-size: 18px; margin-bottom: 25px; text-align: center;">Hi <strong>${escapeHtml(userName)}</strong>, please join the meeting immediately!</p>
                        
                        <div style="background:#ffffff; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; padding:20px; margin-bottom:25px;">
                            <h3 style="margin: 0; font-size: 18px; color: #090909; text-align: center;">${escapeHtml(booking.service_name)}</h3>
                        </div>

                        <center>
                            <a href="${escapeHtml(meetLink)}" style="display: inline-block; background:#d73f3f; color:#ffffff; font-weight:800; text-decoration:none; padding:16px 36px; border:1px solid #090909; border-radius:0; box-shadow:4px 4px 0 #090909; font-size:18px; margin-bottom:10px;">🚀 JOIN NOW</a>
                        </center>
        ` });
    }

    // Send email via Brevo
    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { name: SENDER_NAME, email: SENDER_EMAIL },
            replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
            to: [{ email: booking.email, name: userName }],
            subject: subject,
            htmlContent: htmlBody
        })
    });

    if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        throw new Error(`Brevo email failed: ${errorText}`);
    }

    // Send admin notification
    await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { name: SENDER_NAME, email: SENDER_EMAIL },
            replyTo: { email: REPLY_TO_EMAIL, name: SENDER_NAME },
            to: ADMIN_EMAIL.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
            subject: `Admin Alert: ${type} Reminder Sent`,
            htmlContent: `<p>${type} Reminder sent to ${booking.email} for ${booking.service_name}</p><p>Meeting Link: ${meetLink}</p>`
        })
    });

    // Update database to mark reminder as sent
    const updateField = type === '24h' ? 'reminder_24h_sent' : (type === '10m' ? 'reminder_10m_sent' : 'reminder_5m_sent');

    await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking.id}`,
        {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ [updateField]: true })
        }
    );

    console.log(`✅ ${type} reminder sent to ${booking.email}`);
}
