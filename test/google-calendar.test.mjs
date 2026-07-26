import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarEvent, createUniqueMeetEvent } from '../api/google-calendar.js';

test('creates a unique Google Meet request per payment', () => {
    const base = { customerEmail: 'customer@example.com', customerName: 'Customer', sessionName: 'Mentoring', sessionDate: '2026-08-02', sessionTime: '2:30 PM', sessionDuration: '60' };
    const first = buildCalendarEvent({ ...base, paymentId: 'pay_123' });
    const second = buildCalendarEvent({ ...base, paymentId: 'pay_456' });
    assert.equal(first.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
    assert.equal(first.attendees[0].email, 'customer@example.com');
    assert.equal(first.start.timeZone, 'Asia/Kolkata');
    assert.notEqual(first.conferenceData.createRequest.requestId, second.conferenceData.createRequest.requestId);
});

test('never falls back to a shared room when Calendar is unconfigured', async () => {
    assert.deepEqual(await createUniqueMeetEvent({}, {}), { configured: false, meetLink: null });
});
