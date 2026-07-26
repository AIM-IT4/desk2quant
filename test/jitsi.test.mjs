import test from 'node:test';
import assert from 'node:assert/strict';
import { createJitsiMeetingLink } from '../lib/jitsi.js';

test('creates a stable private Jitsi link for a payment', () => {
    const link = createJitsiMeetingLink('pay_ABC123', 'webhook-secret');
    assert.equal(link, createJitsiMeetingLink('pay_ABC123', 'webhook-secret'));
    assert.match(link, /^https:\/\/meet\.jit\.si\/desk2quant-[a-f0-9]{32}$/);
    assert.equal(link.includes('pay_ABC123'), false);
});

test('creates different links for different payments', () => {
    assert.notEqual(
        createJitsiMeetingLink('pay_ABC123', 'webhook-secret'),
        createJitsiMeetingLink('pay_XYZ789', 'webhook-secret')
    );
});
