import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Umami loader is production-only and uses the Desk2Quant property', () => {
  const code = read('umami-analytics.js');
  assert.match(code, /umami-analytics-p9pt\.onrender\.com\/script\.js/);
  assert.match(code, /1a30fbff-9eea-4902-840d-0c5a2d63366e/);
  assert.match(code, /PRODUCTION_HOST = 'desk2quant\.com'/);
  assert.match(code, /data-website-id/);
});

test('shared and generated pages load the local Umami bootstrap', () => {
  assert.match(read('ui-components.js'), /\/umami-analytics\.js\?v=20261002a/);
  for (const file of [
    'scripts/seo-template.js',
    'scripts/seo-guide-template.js',
    'scripts/blog-seo-template.js',
    'scripts/build-seo.js'
  ]) {
    const source = read(file);
    assert.match(source, /\/umami-analytics\.js\?v=20261002a/);
    assert.doesNotMatch(source, /\\n<\/head>/, 'template must not emit literal \\n before </head>');
  }
});

test('privacy-minimized funnel events are mirrored without browser identifiers', () => {
  const code = read('funnel-analytics.js');
  assert.match(code, /window\.umami\.track\(eventName, eventData\)/);
  assert.match(code, /d2q:umami-ready/);
  const fields = code.match(/const UMAMI_EVENT_FIELDS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(fields, 'expected explicit Umami event field allowlist');
  assert.doesNotMatch(fields[1], /session_id|event_id|diagnostic_id/);
});
