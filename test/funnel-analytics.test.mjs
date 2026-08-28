import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const tracker = fs.readFileSync('funnel-analytics.js', 'utf8');
const diagnostic = fs.readFileSync('diagnostic.html', 'utf8');
const privacy = fs.readFileSync('privacy.html', 'utf8');
const ui = fs.readFileSync('ui-components.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260828133242_create_privacy_safe_funnel_events.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/log-funnel-event/index.ts', 'utf8');

const expectedEvents = [
  'role_path_selected',
  'goal_path_selected',
  'diagnostic_started',
  'diagnostic_completed',
  'diagnostic_recommendation_clicked',
  'product_view_from_diagnostic',
  'sample_opened',
  'purchase_cta_clicked',
  'checkout_opened',
  'purchase_success'
];

test('funnel tracker is valid JavaScript and contains the agreed event dictionary', () => {
  assert.doesNotThrow(() => new vm.Script(tracker));
  for (const event of expectedEvents) assert.match(tracker, new RegExp(`['\"]${event}['\"]`));
});

test('browser payload allowlist excludes direct customer and payment identifiers', () => {
  const allowlistMatch = tracker.match(/const allowed = \[([\s\S]*?)\];/);
  assert.ok(allowlistMatch, 'analytics payload allowlist must be explicit');
  const allowlist = allowlistMatch[1];
  for (const forbidden of ['email', 'name', 'phone', 'payment_id', 'razorpay_payment_id']) {
    assert.doesNotMatch(allowlist, new RegExp(`['\"]${forbidden}['\"]`));
  }
});

test('purchase success requires a recent Razorpay checkout-open context', () => {
  assert.match(tracker, /checkout_opened_at/);
  assert.match(tracker, /Date\.now\(\) - openedAt < 10 \* 60 \* 1000/);
  assert.match(tracker, /purchase_success_sent/);
});

test('diagnostic loads analytics before scoring and disclosure does not overclaim privacy', () => {
  const analyticsIndex = diagnostic.indexOf('/funnel-analytics.js');
  const scoringIndex = diagnostic.indexOf('/diagnostic.js');
  assert.ok(analyticsIndex >= 0 && scoringIndex > analyticsIndex);
  assert.match(diagnostic, /coarse, non-identifying result categories/);
  assert.match(diagnostic, /never your email, name, payment ID or individual answer vector/);
});

test('shared site loader includes funnel analytics without importing transaction modules', () => {
  assert.match(ui, /d2q-funnel-analytics/);
  assert.match(ui, /funnel-analytics\.js/);
  assert.doesNotMatch(ui, /create-order|grant-access|razorpay_payment_id/);
});

test('database telemetry is RLS-sealed and service-role only', () => {
  assert.match(migration, /alter table public\.funnel_events enable row level security/i);
  assert.match(migration, /revoke all on table public\.funnel_events from anon, authenticated/i);
  assert.match(migration, /grant select, insert on table public\.funnel_events to service_role/i);
  assert.doesNotMatch(migration, /grant\s+insert[^;]+\b(?:anon|authenticated)\b/i);
});

test('edge logger is origin-restricted, size-limited, whitelisted and idempotent', () => {
  assert.match(edge, /ALLOWED_HOST_RE/);
  assert.match(edge, /desk2quant\\\.com/);
  assert.doesNotMatch(edge, /\[A-Za-z0-9-\]\+\(\?:-\[A-Za-z0-9-\]\+\)\*\\\.vercel/);
  assert.match(edge, /MAX_BODY_BYTES = 8192/);
  assert.match(edge, /ALLOWED_EVENTS/);
  assert.match(edge, /onConflict: "event_id"/);
  assert.match(edge, /ignoreDuplicates: true/);
});

test('privacy policy explicitly discloses funnel analytics and exclusions', () => {
  assert.match(privacy, /Product Analytics/);
  assert.match(privacy, /random browser-session identifier/);
  assert.match(privacy, /exact diagnostic readiness score/);
  assert.match(privacy, /individual diagnostic answer vector/);
  assert.match(privacy, /Last Updated:<\/strong> August 2026/);
});
