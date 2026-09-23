import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const start = source.indexOf('async function initSessionPayment(');
const end = source.indexOf('/**\n * Handle successful session payment', start);
assert.ok(start >= 0 && end > start);
const checkout = source.slice(start, end);

function harness(loadSdk) {
  const events = [];
  const context = vm.createContext({
    window: { location: { hash: '', pathname: '/', search: '' }, userCountryCode: 'IN' },
    RAZORPAY_KEY_ID: 'rzp_test_example',
    console: { error() {} }, qmLog() {},
    showToast(message) { events.push(['toast', message]); },
    handleSessionPaymentSuccess() {},
    async fetch(url) {
      events.push(['order', url]);
      return { ok: true, json: async () => ({ order_id: 'order_test', amount: 49900, currency: 'INR' }) };
    },
    async loadRazorpaySdk() {
      events.push(['sdk']);
      await loadSdk();
      context.Razorpay = class {
        constructor(options) { assert.equal(options.order_id, 'order_test'); }
        open() { events.push(['open']); }
      };
    }
  });
  vm.runInContext(checkout, context);
  return { events, run: () => context.initSessionPayment('Test session', 499, 'test@example.invalid', 'INR', 499, { sessionId: 'test-session', name: 'Test' }) };
}

test('first session checkout awaits the lazy SDK before creating an order and opens checkout', async () => {
  let release;
  const h = harness(() => new Promise(resolve => { release = resolve; }));
  const pending = h.run();
  assert.deepEqual(h.events, [['sdk']]);
  // Subsequent loader call finds the SDK already available in production.
  release();
  // Use one resolved loader promise for both calls.
  await new Promise(resolve => setImmediate(resolve));
  release();
  await pending;
  assert.deepEqual(h.events.map(e => e[0]), ['sdk', 'order', 'sdk', 'open']);
});

test('SDK failure shows a recoverable error without creating an order', async () => {
  const h = harness(async () => { throw new Error('network blocked'); });
  await h.run();
  assert.deepEqual(h.events.map(e => e[0]), ['sdk', 'toast']);
  assert.match(h.events[1][1], /No payment was taken/);
});
