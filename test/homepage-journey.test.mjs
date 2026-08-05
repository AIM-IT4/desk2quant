import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
const css = await readFile(path.join(projectRoot, 'launchzone.css'), 'utf8');

function sectionContent(id) {
    const match = html.match(new RegExp(`<section[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</section>`));
    assert.ok(match, `Expected section #${id}`);
    return match[1];
}

test('hero prioritizes direct mentorship booking and free simulator practice', () => {
    const hero = sectionContent('hero');
    assert.match(hero, /Book direct 1-on-1 mentorship[\s\S]*free Desk Simulator practice/);
    assert.match(hero, /<a href="#contact" class="btn btn-primary">Book 1-on-1 Mentorship/);
    assert.match(hero, /<a href="desk-simulator\.html" class="btn btn-secondary">Try the Free Desk Simulator</);
});

test('the choose-path section offers exactly four independent routes', () => {
    const section = sectionContent('choose-path');
    assert.match(
        html,
        /<section class="home-flow" id="choose-path" aria-labelledby="choose-path-heading">/
    );
    assert.match(section, /<h2 id="choose-path-heading">/);

    const cards = [...section.matchAll(/<a class="flow-card" href="([^"]+)">([\s\S]*?)<\/a>/g)];
    assert.equal(cards.length, 4, 'Choose-path should contain four linked cards');
    assert.deepEqual(
        cards.map((card) => card[1]),
        ['#services', 'desk-simulator.html', 'interview.html', '#products']
    );
    assert.deepEqual(
        cards.map((card) => card[2].match(/<h3>([^<]+)<\/h3>/)?.[1]),
        ['1-on-1 Mentorship', 'Desk Simulator', 'AI Interview', 'Digital Products']
    );
    cards.forEach((card) => {
        assert.match(card[2], /<p>[^<]+<\/p>/);
        assert.match(card[2], /<span class="flow-action">[^<]+/);
    });
});

test('homepage metadata represents all desk-ready learning routes', () => {
    const metadata = [
        html.match(/<meta name="description"\s+content="([^"]+)"/s)?.[1],
        html.match(/<meta property="og:description"\s+content="([^"]+)"/s)?.[1],
        html.match(/<meta property="twitter:description"\s+content="([^"]+)"/s)?.[1]
    ].join(' ').toLowerCase();

    ['mentorship', 'simulat', 'interview', 'product'].forEach((term) => {
        assert.ok(metadata.includes(term), `Expected metadata to include ${term}`);
    });
});

test('path cards retain responsive grid, keyboard focus, and reduced-motion support', () => {
    assert.match(css, /\.flow-grid\s*{\s*display: grid;\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/s);
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.flow-grid\s*{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.flow-grid\s*{\s*grid-template-columns: 1fr;/);
    assert.match(css, /a:focus-visible/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});