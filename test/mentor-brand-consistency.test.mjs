import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mentors = readFileSync(new URL('../mentors.html', import.meta.url), 'utf8');
const mentorCss = readFileSync(new URL('../assets/css/mentors.css', import.meta.url), 'utf8');

test('guest mentors uses the same Desk2Quant brand shell as the homepage', () => {
  for (const token of [
    'class="d2q-reference d2q-launchzone',
    'class="navbar"',
    'class="nav-container"',
    'class="logo"',
    'class="logo-img"',
    'class="logo-text"'
  ]) assert.ok(mentors.includes(token), `missing shared brand token: ${token}`);

  const homeLogo = home.match(/<img src="([^"]*desk2quant-logo\.png\?v=3)"[^>]*class="logo-img"/)?.[1];
  const mentorLogo = mentors.match(/<img src="([^"]*desk2quant-logo\.png\?v=3)"[^>]*class="logo-img"/)?.[1];
  assert.ok(homeLogo && mentorLogo, 'both pages must use the canonical logo asset');
  assert.equal(mentorLogo, homeLogo);

  assert.match(mentors, /href="\/styles\.css"/);
  assert.match(mentors, /href="\/launchzone\.css\?v=17"/);
  assert.match(mentors, /src="\/ui-components\.js\?v=1"/);
  assert.doesNotMatch(mentors, /class="mentor-nav"/);
  assert.doesNotMatch(mentors, />D2Q\s*<span>Desk2Quant<\/span>/);
});

test('mentor-specific CSS extends shared launchzone tokens instead of defining another theme', () => {
  assert.match(mentorCss, /body\.mentor-page/);
  assert.match(mentorCss, /var\(--lz-ink\)/);
  assert.match(mentorCss, /var\(--lz-paper\)/);
  assert.match(mentorCss, /var\(--lz-font-mono\)/);
  assert.doesNotMatch(mentorCss, /:root\s*\{[^}]*--navy:/s);
});
