import test from 'node:test';
import assert from 'node:assert/strict';
import { createJitsiMeetingLink } from '../lib/jitsi.js';

test('creates a stable private Jitsi link for a payment', () => {
    const link = createJitsiMeetingLink('pay_ABC123', 'Amit Kumar Jha', 'webhook-secret');
    assert.equal(link, createJitsiMeetingLink('pay_ABC123', 'Amit Kumar Jha', 'webhook-secret'));
    assert.match(link, /^https:\/\/meet\.jit\.si\/desk2quant-amit-kumar-jha-[a-f0-9]{32}$/);
    assert.equal(link.includes('pay_ABC123'), false);
});

test('creates different links for different payments', () => {
    assert.notEqual(
        createJitsiMeetingLink('pay_ABC123', 'Amit Kumar Jha', 'webhook-secret'),
        createJitsiMeetingLink('pay_XYZ789', 'Amit Kumar Jha', 'webhook-secret')
    );
});

test('sanitizes the customer-name prefix', () => {
    const link = createJitsiMeetingLink('pay_SANITIZE', '  A!mit @ Desk2Quant  ', 'webhook-secret');
    assert.match(link, /^https:\/\/meet\.jit\.si\/desk2quant-a-mit-desk2quant-[a-f0-9]{32}$/);
});
