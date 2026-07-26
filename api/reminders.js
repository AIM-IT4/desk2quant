// Vercel Serverless Function: Automatic Session Reminders
// Called by external cron service (cron-job.org) every 5 minutes

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
    const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_OhbTYIuMYgGgmKPQJ9W7RA_rhKyaad0';
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jha.8@alumni.iitj.ac.in';
    const SENDER_EMAIL = process.env.SENDER_EMAIL || 'jha.8@alumni.iitj.ac.in';
    const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';

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
            return res.status(200).json({
                ...results,
                message: 'No confirmed bookings found'
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

        return res.status(200).json({
            ...results,
            message: `Processed ${bookings.length} bookings`,
            sent24h: results.reminders24h.length,
            sent10m: results.reminders10m.length
        });

    } catch (error) {
        console.error('Reminder cron error:', error);
        return res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// Helper function to send reminder email
async function sendReminder(booking, type, config) {
    const { SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME } = config;

    const meetLink = booking.meet_link || 'https://meet.google.com/hfp-npyq-qho';
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
        htmlBody = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #e0e7ff; color: #3730a3; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Upcoming Session</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${userName}</strong>, you have a session tomorrow.</p>
                        
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Details</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${booking.service_name}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Date</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${booking.booking_date}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${displayTime} IST</td>
                                </tr>
                            </table>
                        </div>
                    </div>
                    <div style="background-color: #1a1a1a; padding: 25px 20px; text-align: center; color: #888; font-size: 12px;">
                        <p style="margin: 0 0 10px 0;">Sent by Desk2Quant</p>
                        <p style="margin: 0;">Have an issue? Reply to this email.</p>
                    </div>
                </div>
            </div>
        `;
    } else if (type === '10m') {
        subject = `Starting Soon: Your Session in 10 Minutes! ⏰`;
        htmlBody = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">⏰ Starts in 10 mins</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${userName}</strong>, your session starts soon.</p>
                        
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Details</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${booking.service_name}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Date</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${booking.booking_date}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${displayTime} IST</td>
                                </tr>
                            </table>
                        </div>

                        <center>
                            <a href="${meetLink}" style="display: inline-block; background: #16a34a; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-size: 16px; margin-bottom: 20px;">Join Meeting</a>
                        </center>
                    </div>
                    <div style="background-color: #1a1a1a; padding: 25px 20px; text-align: center; color: #888; font-size: 12px;">
                        <p style="margin: 0 0 10px 0;">Please be ready with your questions.</p>
                        <p style="margin: 0;">Sent by Desk2Quant</p>
                    </div>
                </div>
            </div>
        `;
    } else if (type === '5m') {
        subject = `🚨 STARTING NOW: Your Session in 5 Minutes!`;
        htmlBody = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 2px solid #ef4444;">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px; text-align: center;">
                            <span style="display: inline-block; background: #fee2e2; color: #991b1b; padding: 6px 12px; border-radius: 4px; font-size: 13px; font-weight: bold; text-transform: uppercase;">🚨 STARTING NOW</span>
                        </div>
                        <p style="font-size: 18px; margin-bottom: 25px; text-align: center;">Hi <strong>${userName}</strong>, please join the meeting immediately!</p>
                        
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <h3 style="margin: 0; font-size: 18px; color: #1a1a1a; text-align: center;">${booking.service_name}</h3>
                        </div>

                        <center>
                            <a href="${meetLink}" style="display: inline-block; background: #ef4444; color: #ffffff; font-weight: bold; text-decoration: none; padding: 16px 36px; border-radius: 6px; font-size: 18px; margin-bottom: 10px;">🚀 JOIN NOW</a>
                        </center>
                    </div>
                </div>
            </div>
        `;
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
