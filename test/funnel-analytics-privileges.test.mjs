import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const grantsMigration = fs.readFileSync(
  'supabase/migrations/20260828134100_restrict_funnel_events_service_role_privileges.sql',
  'utf8'
);

test('final funnel telemetry grants are least-privilege', () => {
  assert.match(grantsMigration, /revoke all on table public\.funnel_events from service_role/i);
  assert.match(grantsMigration, /grant select, insert on table public\.funnel_events to service_role/i);
  assert.doesNotMatch(grantsMigration, /grant[^;]+\b(?:update|delete|truncate)\b/i);
  assert.match(grantsMigration, /revoke all on sequence public\.funnel_events_id_seq from service_role/i);
  assert.match(grantsMigration, /grant usage, select on sequence public\.funnel_events_id_seq to service_role/i);
});
