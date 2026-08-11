import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const config = JSON.parse(await readFile(path.join(projectRoot, 'vercel.json'), 'utf8'));
const redirects = config.redirects ?? [];

const CANONICAL_ORIGIN = 'https://desk2quant.com';
const NONCANONICAL_HOSTS = ['www.desk2quant.com', 'desk2quant.vercel.app', 'quant-mentor.vercel.app'];
const LEGACY_PRODUCT_ALIASES = new Map([
    [
        '/products/quant-interview-problem-book-1000-plus-problems-with-solutions.html',
        '/products/quant-interview-problem-book.html'
    ],
    ['/products/c-plus-plus-for-quants-desk-ready-notes.html', '/products/cpp-for-quants.html'],
    ['/products/python-for-quants-complete-interview-guide.html', '/products/python-for-quants.html'],
    [
        '/products/stochastic-calculus-for-quants-interview-playbook.html',
        '/products/stochastic-calculus-for-quants.html'
    ],
    [
        '/products/numerical-methods-for-quants-the-master-field-manual.html',
        '/products/numerical-methods-for-quants.html'
    ],
    ['/products/model-validation-quant-case-study-pack.html', '/products/model-validation-quant-interview.html'],
    [
        '/products/pnl-attribution-and-desk-diagnostics-for-quants.html',
        '/products/pnl-attribution-for-quants.html'
    ],
    [
        '/products/xva-calculus-lab-master-counterparty-credit-risk.html',
        '/products/xva-calculus-lab.html'
    ]
]);

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileSource(source) {
    const names = [];
    let pattern = '';
    let cursor = 0;
    const parameter = /:([A-Za-z0-9_]+)([+*?]?)/g;

    for (const match of source.matchAll(parameter)) {
        pattern += escapeRegExp(source.slice(cursor, match.index));
        names.push(match[1]);
        pattern += match[2] === '*'
            ? '(.*?)'
            : match[2] === '+'
                ? '(.+?)'
                : match[2] === '?'
                    ? '([^/]*)'
                    : '([^/]+)';
        cursor = match.index + match[0].length;
    }

    pattern += escapeRegExp(source.slice(cursor));
    return { regex: new RegExp(`^${pattern}$`), names };
}

function matchesHost(rule, hostname) {
    const hostConditions = (rule.has ?? []).filter((condition) => condition.type === 'host');
    return hostConditions.length === 0 || hostConditions.every((condition) => {
        if (condition.value && typeof condition.value === 'object') {
            if (Array.isArray(condition.value.inc)) {
                return condition.value.inc.some((value) => value.toLowerCase() === hostname.toLowerCase());
            }
            if (typeof condition.value.eq === 'string') {
                return condition.value.eq.toLowerCase() === hostname.toLowerCase();
            }
            if (typeof condition.value.re === 'string') {
                return new RegExp(condition.value.re, 'i').test(hostname);
            }
            return false;
        }
        try {
            return new RegExp(`^(?:${condition.value})$`, 'i').test(hostname);
        } catch {
            return condition.value.toLowerCase() === hostname.toLowerCase();
        }
    });
}

function firstRedirectFor(hostname, requestTarget) {
    const requestUrl = new URL(requestTarget, `https://${hostname}`);

    for (const [index, rule] of redirects.entries()) {
        if (!matchesHost(rule, hostname)) continue;

        const { regex, names } = compileSource(rule.source);
        const match = regex.exec(requestUrl.pathname);
        if (!match) continue;

        const captures = Object.fromEntries(names.map((name, captureIndex) => [name, match[captureIndex + 1]]));
        const destination = rule.destination.replace(
            /:([A-Za-z0-9_]+)[+*?]?/g,
            (_, name) => captures[name] ?? ''
        );
        const location = new URL(destination, requestUrl);

        // Vercel carries through request query parameters when a redirect
        // destination does not replace them explicitly.
        if (!location.search && requestUrl.search) location.search = requestUrl.search;

        return { index, rule, location };
    }

    return null;
}

function expectedCanonical(requestTarget) {
    const input = new URL(requestTarget, CANONICAL_ORIGIN);
    if (input.pathname === '/index.html') input.pathname = '/';
    input.pathname = LEGACY_PRODUCT_ALIASES.get(input.pathname) ?? input.pathname;
    input.host = 'desk2quant.com';
    input.protocol = 'https:';
    return input;
}

test('noncanonical hosts redirect every important path directly and permanently', () => {
    const cases = [
        '/',
        '/index.html',
        '/guides/quant-interview-guide.html',
        '/guides/quant-interview-guide.html/',
        ...[...LEGACY_PRODUCT_ALIASES.keys()].map((pathname, index) =>
            index === 0 ? `${pathname}?seo_monitor=1` : pathname
        )
    ];

    for (const hostname of NONCANONICAL_HOSTS) {
        for (const requestTarget of cases) {
            const result = firstRedirectFor(hostname, requestTarget);
            assert.ok(result, `Expected a redirect for https://${hostname}${requestTarget}`);
            assert.equal(
                result.rule.permanent,
                true,
                `First matching redirect #${result.index + 1} for https://${hostname}${requestTarget} must be permanent`
            );
            assert.ok(
                (result.rule.has ?? []).some((condition) => condition.type === 'host') &&
                    matchesHost(result.rule, hostname),
                `A host-specific ${hostname} rule must precede generic rules for ${requestTarget}`
            );
            assert.equal(
                result.location.href,
                expectedCanonical(requestTarget).href,
                `https://${hostname}${requestTarget} must redirect to the final canonical URL in one hop`
            );
        }
    }
});

test('canonical /index.html normalization remains permanent and same-host', () => {
    const result = firstRedirectFor('desk2quant.com', '/index.html');
    assert.ok(result, 'Expected /index.html to normalize to the root URL');
    assert.equal(result.rule.permanent, true);
    assert.equal(result.location.href, 'https://desk2quant.com/');
});
