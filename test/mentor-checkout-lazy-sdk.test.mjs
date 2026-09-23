import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const loaderSource = readFileSync(new URL('../assets/js/razorpay-loader.js', import.meta.url), 'utf8');
const mentorSource = readFileSync(new URL('../assets/js/mentors.js', import.meta.url), 'utf8');
const mentorHtml = readFileSync(new URL('../mentors.html', import.meta.url), 'utf8');

function loaderHarness() {
  const appended = [];
  const scripts = [];
  const document = {
    querySelector() {
      return scripts.find(s => !s.removed) || null;
    },
    createElement(tag) {
      assert.equal(tag, 'script');
      const listeners = {};
      const script = {
        dataset: {},
        async: false,
        src: '',
        removed: false,
        addEventListener(type, fn) { listeners[type] = fn; },
        remove() { this.removed = true; },
        emit(type) { listeners[type]?.(); }
      };
      scripts.push(script);
      return script;
    },
    head: {
      appendChild(script) { appended.push(script); }
    }
  };
  const context = vm.createContext({
    window: {},
    document,
    Error,
    Promise,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(loaderSource, context);
  return { context, appended, scripts };
}

test('guest mentor page lazy-loads Razorpay instead of downloading it on page load', () => {
  assert.doesNotMatch(mentorHtml, /https:\/\/checkout\.razorpay\.com\/v1\/checkout\.js/);
  const loaderAt = mentorHtml.indexOf('/assets/js/razorpay-loader.js');
  const mentorAt = mentorHtml.indexOf('/assets/js/mentors.js');
  assert.ok(loaderAt >= 0 && mentorAt > loaderAt);
});

test('guest mentor checkout waits for Razorpay before creating an order', () => {
  const sdkAt = mentorSource.indexOf('await window.loadRazorpaySdk()');
  const orderAt = mentorSource.indexOf("request('/api/create-order'");
  assert.ok(sdkAt >= 0, 'checkout must await the Razorpay loader');
  assert.ok(orderAt > sdkAt, 'order creation must happen only after the SDK is ready');
  assert.match(mentorSource, /No payment was taken/);
});

test('Razorpay loader dedupes concurrent first-load calls', async () => {
  const h = loaderHarness();
  const first = h.context.window.loadRazorpaySdk();
  const second = h.context.window.loadRazorpaySdk();

  assert.equal(first, second);
  assert.equal(h.appended.length, 1);
  assert.equal(h.appended[0].src, 'https://checkout.razorpay.com/v1/checkout.js');

  h.context.window.Razorpay = class {};
  h.appended[0].emit('load');
  await first;

  await h.context.window.loadRazorpaySdk();
  assert.equal(h.appended.length, 1);
});

test('Razorpay loader clears a failed attempt so the next click can retry', async () => {
  const h = loaderHarness();
  const first = h.context.window.loadRazorpaySdk();
  assert.equal(h.appended.length, 1);
  h.appended[0].emit('error');
  await assert.rejects(first, /failed to load/);
  assert.equal(h.appended[0].removed, true);

  const retry = h.context.window.loadRazorpaySdk();
  assert.equal(h.appended.length, 2);
  h.context.window.Razorpay = class {};
  h.appended[1].emit('load');
  await retry;
});
