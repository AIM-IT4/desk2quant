import crypto from 'crypto';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const TIME_ZONE = 'Asia/Kolkata';

function base64Url(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseTime(time) {
    const value = String(time || '').trim();
    const twelveHour = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (twelveHour) {
        let hour = Number(twelveHour[1]) % 12;
        if (twelveHour[3].toUpperCase() === 'PM') hour += 12;
        return { hour, minute: Number(twelveHour[2]) };
    }
    const twentyFourHour = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!twentyFourHour) return null;
    const hour = Number(twentyFourHour[1]);
    const minute = Number(twentyFourHour[2]);
    return hour < 24 && minute < 60 ? { hour, minute } : null;
}

export function buildCalendarEvent({ paymentId, customerEmail, customerName, sessionName, sessionDate, sessionTime, sessionDuration }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sessionDate || ''))) throw new Error('Calendar event requires an ISO booking date');
    const time = parseTime(sessionTime);
    if (!time) throw new Error('Calendar event requires a valid booking time');
    const duration = Math.max(15, Math.min(480, Number.parseInt(sessionDuration, 10) || 60));
    const start = new Date(`${sessionDate}T${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:00+05:30`);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const asDateTime = value => value.toISOString().replace('Z', '+00:00');
    return {
        summary: `Desk2Quant: ${sessionName}`,
        description: `Desk2Quant booking ${paymentId}.`,
        start: { dateTime: asDateTime(start), timeZone: TIME_ZONE },
        end: { dateTime: asDateTime(end), timeZone: TIME_ZONE },
        attendees: customerEmail ? [{ email: customerEmail, displayName: customerName || 'Customer' }] : [],
        conferenceData: { createRequest: {
            requestId: crypto.createHash('sha256').update(String(paymentId)).digest('hex').slice(0, 32),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
        }}
    };
}

async function getAccessToken({ clientEmail, privateKey, delegatedUser }) {
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: clientEmail, scope: CALENDAR_SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
    if (delegatedUser) claims.sub = delegatedUser;
    const input = `${base64Url({ alg: 'RS256', typ: 'JWT' })}.${base64Url(claims)}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(input);
    signer.end();
    const signature = signer.sign(privateKey.replace(/\\n/g, '\n'), 'base64url');
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${input}.${signature}`
    });
    if (!response.ok) throw new Error(`Google Calendar authorization failed: ${await response.text()}`);
    return (await response.json()).access_token;
}

function getMeetLink(event) {
    return event?.hangoutLink || event?.conferenceData?.entryPoints?.find(point => point.entryPointType === 'video')?.uri || null;
}

export async function createUniqueMeetEvent(booking, env = process.env) {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL: clientEmail, GOOGLE_PRIVATE_KEY: privateKey, GOOGLE_CALENDAR_ID: calendarId, GOOGLE_CALENDAR_DELEGATED_USER: delegatedUser } = env;
    if (!clientEmail || !privateKey || !calendarId) return { configured: false, meetLink: null };
    const token = await getAccessToken({ clientEmail, privateKey, delegatedUser });
    const query = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'none' });
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${query}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCalendarEvent(booking))
    });
    if (!response.ok) throw new Error(`Google Calendar event creation failed: ${await response.text()}`);
    let event = await response.json();
    for (let attempt = 0; !getMeetLink(event) && event.id && attempt < 3; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
        const eventResponse = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(event.id) + '?conferenceDataVersion=1',
            { headers: { Authorization: 'Bearer ' + token } }
        );
        if (!eventResponse.ok) break;
        event = await eventResponse.json();
    }
    return { configured: true, meetLink: getMeetLink(event) };
}
