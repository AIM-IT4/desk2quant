import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const loaderSource = readFileSync(new URL('../assets/js/razorpay-loader.js', import.meta.url), 'utf8');
const mentorSource = readFileSync(new URL('../assets/js/mentors.js', import.meta.url), 'utf8');
const mentorHtml = readFileSync(new URL('../mentors.html', import.meta.url), 'utf8');

test('guest mentor page uses the shared lazy Razorpay loader before mentor code', () => {
  assert.doesNotMatch(mentorHtml, /checkout\.razorpay\.com\/v1\/checkout\.js/);
  const loader = mentorHtml.indexOf('/assets/js/razorpay-loader.js');
  const mentor = mentorHtml.indexOf('/assets/js/mentors.js');
  assert.ok(loader >= 0, 'shared Razorpay loader must be included');
  assert.ok(mentor > loader, 'shared loader must execute before mentor checkout code');
});

test('mentor checkout awaits the SDK before creating a Razorpay order', () => {
  const checkoutStart = mentorSource.indexOf("track('mentor_checkout_start'");
  const awaitSdk = mentorSource.indexOf('await window.loadRazorpaySdk()', checkoutStart);
  const createOrder = mentorSource.indexOf("request('/api/create-order'", checkoutStart);
  assert.ok(checkoutStart >= 0 && awaitSdk > checkoutStart, 'checkout must await the SDK');
  assert.ok(createOrder > awaitSdk, 'order creation must happen after the SDK is ready');
});

function loaderHarness(outcomes) {
  let appends = 0;
  const scripts = [];
  const context = vm.createContext({
    window: {},
    Error,
    Promise,
    setTimeout,
    clearTimeout,
    document: {
      querySelector() { return scripts.find(s => !s.removed) || null; },
      createElement() {
        const listeners = new Map();
        return {
          dataset: {},
          addEventListener(name, fn) { listeners.set(name, fn); },
          remove() { this.removed = true; },
          fire(name) { listeners.get(name)?.(); }
        };
      },
      head: {
        appendChild(script) {
          appends += 1;
          scripts.push(script);
          const outcome = outcomes.shift() || 'load';
          queueMicrotask(() => {
            if (outcome === 'load') {
              context.window.Razorpay = class Razorpay {};
              script.fire('load');
            } else {
              script.fire('error');
            }
          });
        }
      }
    }
  });
  vm.runInContext(loaderSource, context);
  return { context, get appends() { return appends; } };
}

test('shared Razorpay loader deduplicates concurrent first loads', async () => {
  const h = loaderHarness(['load']);
  await Promise.all([
    h.context.window.loadRazorpaySdk(),
    h.context.window.loadRazorpaySdk(),
    h.context.window.loadRazorpaySdk()
  ]);
  assert.equal(h.appends, 1);
  assert.equal(typeof h.context.window.Razorpay, 'function');
});

test('shared Razorpay loader resets after a failed load so checkout can retry', async () => {
  const h = loaderHarness(['error', 'load']);
  await assert.rejects(h.context.window.loadRazorpaySdk(), /failed to load/i);
  assert.equal(h.appends, 1);
  await h.context.window.loadRazorpaySdk();
  assert.equal(h.appends, 2);
});
