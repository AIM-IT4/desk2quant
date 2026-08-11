import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const html = await readFile(path.join(projectRoot, 'desk-simulator.html'), 'utf8');
const css = await readFile(path.join(projectRoot, 'desk-simulator.css'), 'utf8');
const controller = await readFile(path.join(projectRoot, 'desk-simulator.mjs'), 'utf8');
const indexHtml = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
const sitemap = await readFile(path.join(projectRoot, 'sitemap.xml'), 'utf8');

test('page has unique element IDs and every controller target exists', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'HTML contains a duplicate id');

    const referencedIds = [
        ...controller.matchAll(/getElementById\('([^']+)'\)/g)
    ].map((match) => match[1]);

    referencedIds.forEach((id) => {
        assert.ok(ids.includes(id), `Controller references missing element #${id}`);
    });
});

test('tabs, labels and dialogs reference existing elements', () => {
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
    const references = [
        ...html.matchAll(/\s(?:aria-controls|aria-labelledby|for)="([^"]+)"/g)
    ]
        .flatMap((match) => match[1].split(/\s+/))
        .filter(Boolean);

    references.forEach((id) => {
        assert.ok(ids.has(id), `Markup references missing element #${id}`);
    });
});

test('SEO metadata and structured data describe a free educational application', () => {
    assert.match(
        html,
        /<link rel="canonical" href="https:\/\/desk2quant\.com\/desk-simulator\.html">/
    );
    assert.match(html, /"@type": "SoftwareApplication"/);
    assert.match(html, /"applicationCategory": "EducationalApplication"/);
    assert.match(html, /"isAccessibleForFree": true/);
    assert.match(html, /assets\/images\/desk-simulator-og\.png/);
});

test('all project-local launch assets exist', async () => {
    const assets = [
        'desk-simulator.css',
        'desk-simulator.mjs',
        'desk-simulator-data.mjs',
        'desk-simulator-engine.mjs',
        path.join('assets', 'images', 'desk-simulator-og.png'),
        path.join('assets', 'images', 'desk2quant-logo.png')
    ];
    await Promise.all(assets.map((asset) => access(path.join(projectRoot, asset))));
});

test('the product is discoverable from the homepage and sitemap', () => {
    assert.match(indexHtml, /href="desk-simulator\.html"/);
    assert.match(
        sitemap,
        /<loc>https:\/\/desk2quant\.com\/desk-simulator\.html<\/loc>/
    );
});

test('responsive, keyboard and reduced-motion foundations are present', () => {
    assert.match(html, /class="skip-link"/);
    assert.match(html, /role="tablist"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(css, /@media \(max-width: 720px\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /:focus-visible/);
});

test('Interview Sprint is a discoverable second practice mode', () => {
    assert.match(html, /id="interviewModeButton"/);
    assert.match(html, /data-launch-mode="interview"/);
    assert.match(html, /id="interviewTimer"/);
    assert.match(html, /id="interviewPromptCard"/);
    assert.match(controller, /tickInterviewClock/);
    assert.match(controller, /Communication/);
});
