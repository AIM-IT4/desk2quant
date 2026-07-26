import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildCalendarEvent, createUniqueMeetEvent } from '../lib/google-calendar.js';

test('creates a unique Google Meet request per payment', () => {
    const base = { customerEmail: 'customer@example.com', customerName: 'Customer', sessionName: 'Mentoring', sessionDate: '2026-08-02', sessionTime: '2:30 PM', sessionDuration: '60' };
    const first = buildCalendarEvent({ ...base, paymentId: 'pay_123' });
    const second = buildCalendarEvent({ ...base, paymentId: 'pay_456' });
    assert.equal(first.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
    assert.equal('attendees' in first, false);
    assert.equal(first.start.timeZone, 'Asia/Kolkata');
    assert.notEqual(first.conferenceData.createRequest.requestId, second.conferenceData.createRequest.requestId);
    assert.notEqual(first.id, second.id);
    assert.equal(first.id, buildCalendarEvent({ ...base, paymentId: 'pay_123' }).id);
});

test('never falls back to a shared room when Calendar is unconfigured', async () => {
    assert.deepEqual(await createUniqueMeetEvent({}, {}), { configured: false, meetLink: null });
});


test('reuses the existing event when a webhook retry gets a conflict', async () => {
    const originalFetch = global.fetch;
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const calls = [];
    global.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), method: options.method || 'GET' });
        if (String(url).includes('oauth2.googleapis.com')) {
            return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
        }
        if (options.method === 'POST') return new Response('', { status: 409 });
        return new Response(JSON.stringify({ id: 'desk2quantretry', hangoutLink: 'https://meet.google.com/abc-defg-hij' }), { status: 200 });
    };
    try {
        const result = await createUniqueMeetEvent({
            paymentId: 'pay_retry', customerEmail: 'customer@example.com', customerName: 'Customer',
            sessionName: 'Mentoring', sessionDate: '2026-08-02', sessionTime: '2:30 PM', sessionDuration: '60'
        }, {
            GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.iam.gserviceaccount.com',
            GOOGLE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
            GOOGLE_CALENDAR_ID: 'calendar@example.com'
        });
        assert.equal(result.meetLink, 'https://meet.google.com/abc-defg-hij');
        assert.equal(calls.filter(call => call.method === 'POST' && call.url.includes('/calendar/v3/')).length, 1);
        assert.equal(calls.filter(call => call.method === 'GET' && call.url.includes('/calendar/v3/')).length, 1);
    } finally {
        global.fetch = originalFetch;
    }
});
