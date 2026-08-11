import assert from 'node:assert/strict';
import { createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEARCH_ANALYTICS_ROOT = 'https://www.googleapis.com/webmasters/v3/sites';
const DEFAULT_SITE_URL = 'sc-domain:desk2quant.com';
const DEFAULT_REPORT_PATH = 'seo-reports/search-console-weekly.md';
const SEARCH_CONSOLE_TIME_ZONE = 'America/Los_Angeles';
const FINAL_DATA_LAG_DAYS = 3;
const TOP_ROWS_TO_REPORT = 10;
const COMPARISON_SAMPLE_SIZE = 250;

function base64UrlJson(value) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createServiceAccountJwt(credentials, issuedAt = Math.floor(Date.now() / 1000)) {
    const header = { alg: 'RS256', typ: 'JWT' };
    if (credentials.private_key_id) header.kid = credentials.private_key_id;
    const claims = {
        iss: credentials.client_email,
        scope: SEARCH_CONSOLE_SCOPE,
        aud: TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + 3600
    };
    const unsignedToken = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(credentials.private_key).toString('base64url');
    return `${unsignedToken}.${signature}`;
}

function parseCredentials(raw) {
    let credentials;
    try {
        credentials = JSON.parse(raw.replace(/^\uFEFF/, ''));
    } catch {
        throw new Error('GSC_SERVICE_ACCOUNT_JSON is not valid JSON. Store the complete service-account key JSON as the GitHub Actions secret.');
    }
    if (!credentials || credentials.type !== 'service_account') {
        throw new Error('GSC_SERVICE_ACCOUNT_JSON must contain a Google service-account key (type "service_account").');
    }
    for (const field of ['client_email', 'private_key']) {
        if (typeof credentials[field] !== 'string' || !credentials[field].trim()) {
            throw new Error(`GSC_SERVICE_ACCOUNT_JSON is missing the required ${field} field.`);
        }
    }
    return credentials;
}

function dateForSearchConsole(now) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: SEARCH_CONSOLE_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function addUtcDays(date, days) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

function reportingWindows(now = new Date()) {
    const searchConsoleToday = dateForSearchConsole(now);
    const currentEnd = addUtcDays(searchConsoleToday, -FINAL_DATA_LAG_DAYS);
    const currentStart = addUtcDays(currentEnd, -6);
    const previousEnd = addUtcDays(currentStart, -1);
    const previousStart = addUtcDays(previousEnd, -6);
    return {
        current: { startDate: isoDate(currentStart), endDate: isoDate(currentEnd) },
        previous: { startDate: isoDate(previousStart), endDate: isoDate(previousEnd) }
    };
}

function safeErrorMessage(error) {
    return String(error?.message ?? error ?? 'Unknown error')
        .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----/gi, '[private key redacted]')
        .replace(/\bya29\.[A-Za-z0-9._-]+/g, '[access token redacted]')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
        .replace(/\s+/g, ' ')
        .slice(0, 700);
}

async function fetchJson(url, options, label) {
    let response;
    try {
        response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
    } catch (error) {
        throw new Error(`${label} could not connect: ${safeErrorMessage(error)}`);
    }

    const text = await response.text();
    let payload = {};
    if (text) {
        try {
            payload = JSON.parse(text);
        } catch {
            if (response.ok) throw new Error(`${label} returned invalid JSON.`);
        }
    }

    if (!response.ok) {
        const apiMessage = payload?.error?.message ?? payload?.error_description ?? payload?.error ?? response.statusText;
        const permissionHint = response.status === 403
            ? ' Confirm that the Search Console API is enabled and the service account has access to the exact property.'
            : '';
        throw new Error(`${label} failed (${response.status}): ${safeErrorMessage(apiMessage)}.${permissionHint}`);
    }
    return payload;
}

async function getAccessToken(credentials) {
    const assertion = createServiceAccountJwt(credentials);
    const payload = await fetchJson(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion
        }).toString()
    }, 'Google OAuth token request');
    if (typeof payload.access_token !== 'string' || !payload.access_token) {
        throw new Error('Google OAuth token response did not contain an access token.');
    }
    return payload.access_token;
}

async function querySearchAnalytics(accessToken, siteUrl, window, dimension, rowLimit) {
    const body = {
        startDate: window.startDate,
        endDate: window.endDate,
        type: 'web',
        dataState: 'final',
        aggregationType: 'auto',
        rowLimit,
        startRow: 0
    };
    if (dimension) body.dimensions = [dimension];

    const endpoint = `${SEARCH_ANALYTICS_ROOT}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const payload = await fetchJson(endpoint, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify(body)
    }, `Search Console ${dimension || 'property'} query for ${window.startDate} to ${window.endDate}`);
    return Array.isArray(payload.rows) ? payload.rows : [];
}

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function aggregateDailyRows(rows) {
    let clicks = 0;
    let impressions = 0;
    let positionWeight = 0;
    let positionedImpressions = 0;
    for (const row of rows) {
        const rowClicks = finiteNumber(row.clicks);
        const rowImpressions = finiteNumber(row.impressions);
        const rowPosition = Number(row.position);
        clicks += rowClicks;
        impressions += rowImpressions;
        if (rowImpressions > 0 && Number.isFinite(rowPosition)) {
            positionWeight += rowPosition * rowImpressions;
            positionedImpressions += rowImpressions;
        }
    }
    return {
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        position: positionedImpressions > 0 ? positionWeight / positionedImpressions : null,
        daysWithData: rows.length
    };
}

function normalizeDimensionRows(rows) {
    return rows.map((row) => {
        const clicks = finiteNumber(row.clicks);
        const impressions = finiteNumber(row.impressions);
        const position = Number(row.position);
        return {
            key: String(row.keys?.[0] ?? '(not provided)'),
            clicks,
            impressions,
            ctr: Number.isFinite(Number(row.ctr)) ? Number(row.ctr) : (impressions ? clicks / impressions : 0),
            position: Number.isFinite(position) ? position : null
        };
    });
}

async function loadVisibilityData(accessToken, siteUrl, windows) {
    const [currentDaily, previousDaily, currentQueries, previousQueries, currentPages, previousPages] = await Promise.all([
        querySearchAnalytics(accessToken, siteUrl, windows.current, 'date', 7),
        querySearchAnalytics(accessToken, siteUrl, windows.previous, 'date', 7),
        querySearchAnalytics(accessToken, siteUrl, windows.current, 'query', COMPARISON_SAMPLE_SIZE),
        querySearchAnalytics(accessToken, siteUrl, windows.previous, 'query', COMPARISON_SAMPLE_SIZE),
        querySearchAnalytics(accessToken, siteUrl, windows.current, 'page', COMPARISON_SAMPLE_SIZE),
        querySearchAnalytics(accessToken, siteUrl, windows.previous, 'page', COMPARISON_SAMPLE_SIZE)
    ]);
    return {
        current: aggregateDailyRows(currentDaily),
        previous: aggregateDailyRows(previousDaily),
        currentQueries: normalizeDimensionRows(currentQueries),
        previousQueries: normalizeDimensionRows(previousQueries),
        currentPages: normalizeDimensionRows(currentPages),
        previousPages: normalizeDimensionRows(previousPages)
    };
}

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function formatNumber(value) {
    return numberFormatter.format(finiteNumber(value));
}

function signed(value, digits = 1) {
    if (!Number.isFinite(value)) return 'n/a';
    const formatted = Math.abs(value).toFixed(digits);
    return `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatted}`;
}

function formatPercent(value) {
    return `${(finiteNumber(value) * 100).toFixed(2)}%`;
}

function formatPosition(value) {
    return Number.isFinite(value) ? value.toFixed(2) : 'n/a';
}

function countDelta(current, previous) {
    if (previous == null) return 'n/a';
    const difference = current - previous;
    if (previous === 0) return difference === 0 ? '0.0 (0.0%)' : `${signed(difference)} (new from zero)`;
    return `${signed(difference)} (${signed((difference / previous) * 100)}%)`;
}

function ctrDelta(current, previous) {
    if (previous == null) return 'n/a';
    return `${signed((current - previous) * 100, 2)} pp`;
}

function positionDelta(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return 'n/a';
    const difference = current - previous;
    const direction = difference < 0 ? 'improved' : difference > 0 ? 'declined' : 'unchanged';
    return `${signed(difference, 2)} (${direction})`;
}

function escapeMarkdownCell(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r?\n/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/([`*_[\]])/g, '\\$1')
        .replace(/\|/g, '\\|')
        .trim();
}

function displayPage(value) {
    try {
        const url = new URL(value);
        return url.hostname === 'desk2quant.com' ? `${url.pathname}${url.search}` : url.href;
    } catch {
        return value;
    }
}

function technicalStatusRows(statuses) {
    const labels = {
        success: 'Passed',
        failure: 'Failed',
        cancelled: 'Cancelled',
        skipped: 'Skipped'
    };
    return [
        ['Local SEO regression tests', statuses.local],
        ['Search Console reporter self-test', statuses.selfTest],
        ['Live production technical smoke check', statuses.technical]
    ].map(([label, status]) => `| ${label} | ${labels[status] ?? 'Not reported by this runner'} |`).join('\n');
}

function renderTechnicalSection(statuses) {
    return `## Technical SEO health

| Check | Outcome |
|---|---|
${technicalStatusRows(statuses)}`;
}

function renderDimensionTable(title, label, currentRows, previousRows, transformKey = (key) => key) {
    const previousByKey = new Map(previousRows.map((row) => [row.key, row]));
    const rows = currentRows.slice(0, TOP_ROWS_TO_REPORT);
    if (!rows.length) return `### ${title}\n\nNo ${label.toLowerCase()} rows were returned for the current window.`;
    const tableRows = rows.map((row, index) => {
        const previous = previousByKey.get(row.key);
        return `| ${index + 1} | ${escapeMarkdownCell(transformKey(row.key))} | ${formatNumber(row.clicks)} | ${countDelta(row.clicks, previous?.clicks ?? null)} | ${formatNumber(row.impressions)} | ${countDelta(row.impressions, previous?.impressions ?? null)} | ${formatPercent(row.ctr)} | ${ctrDelta(row.ctr, previous?.ctr ?? null)} | ${formatPosition(row.position)} | ${positionDelta(row.position, previous?.position ?? null)} |`;
    }).join('\n');
    return `### ${title}

| # | ${label} | Clicks | Click delta | Impressions | Impression delta | CTR | CTR delta | Avg. position | Position delta |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
${tableRows}`;
}

function renderReport({ siteUrl, windows, data, statuses, generatedAt = new Date() }) {
    return `# Weekly SEO health and Google Search visibility

Generated: ${generatedAt.toISOString()}
Search Console property: \`${escapeMarkdownCell(siteUrl)}\`

${renderTechnicalSection(statuses)}

## Google Search Console visibility

Status: **Checked using the official Search Analytics API with finalized data.**

### Compared windows

- Most recent complete window: **${windows.current.startDate} to ${windows.current.endDate}**
- Previous window: **${windows.previous.startDate} to ${windows.previous.endDate}**
- Dates use ${SEARCH_CONSOLE_TIME_ZONE}; the newest window ends ${FINAL_DATA_LAG_DAYS} complete days behind the Search Console calendar date.

### Performance summary

| Metric | Most recent 7 days | Previous 7 days | Change |
|---|---:|---:|---:|
| Clicks | ${formatNumber(data.current.clicks)} | ${formatNumber(data.previous.clicks)} | ${countDelta(data.current.clicks, data.previous.clicks)} |
| Impressions | ${formatNumber(data.current.impressions)} | ${formatNumber(data.previous.impressions)} | ${countDelta(data.current.impressions, data.previous.impressions)} |
| CTR | ${formatPercent(data.current.ctr)} | ${formatPercent(data.previous.ctr)} | ${ctrDelta(data.current.ctr, data.previous.ctr)} |
| Impression-weighted average position | ${formatPosition(data.current.position)} | ${formatPosition(data.previous.position)} | ${positionDelta(data.current.position, data.previous.position)} |
| Days with returned data | ${data.current.daysWithData}/7 | ${data.previous.daysWithData}/7 | — |

${renderDimensionTable('Top queries', 'Query', data.currentQueries, data.previousQueries)}

${renderDimensionTable('Top pages', 'Page', data.currentPages, data.previousPages, displayPage)}

## Interpretation notes

- Lower average position is better. Position is weighted by impressions across the daily rows returned for each window.
- Query and page tables show the current top ${TOP_ROWS_TO_REPORT} rows. Deltas are marked \`n/a\` when the matching item was not present in the previous API top-${COMPARISON_SAMPLE_SIZE} sample; absence is not reported as zero.
- Search Console can omit anonymized or low-volume dimension rows, so query/page tables should not be summed to reconstruct property totals.
- This is first-party Search Console data, not a scraped Google results page.
`;
}

function renderSetupSummary(siteUrl, statuses) {
    return `# Weekly SEO health and Google Search visibility

${renderTechnicalSection(statuses)}

## Google Search Console visibility

> [!WARNING]
> **Visibility was not checked: Search Console credentials are not configured.** Technical SEO checks still ran and are reported above.

Setup required:

1. Enable the Google Search Console API in a Google Cloud project.
2. Create a service account and add its email as a user of \`${escapeMarkdownCell(siteUrl)}\` in Search Console.
3. Store the complete service-account key JSON in the repository secret \`GSC_SERVICE_ACCOUNT_JSON\`.
4. Optionally set repository variable \`GSC_SITE_URL\`; it defaults to \`${DEFAULT_SITE_URL}\`.

No Search Console report artifact was generated for this run.
`;
}

function renderFailureSummary(message, statuses) {
    return `# Weekly SEO health and Google Search visibility

${renderTechnicalSection(statuses)}

## Google Search Console visibility

> [!CAUTION]
> **The visibility check failed and no Search Console results are claimed for this run.**

\`${escapeMarkdownCell(message)}\`
`;
}

async function appendStepSummary(markdown) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) await appendFile(summaryPath, `${markdown.trim()}\n\n`, 'utf8');
}

async function setGitHubOutput(name, value) {
    const outputPath = process.env.GITHUB_OUTPUT;
    if (!outputPath) return;
    const safeValue = String(value);
    if (/[\r\n]/.test(safeValue)) throw new Error(`Unsafe newline in GitHub output ${name}.`);
    await appendFile(outputPath, `${name}=${safeValue}\n`, 'utf8');
}

function workflowStatuses() {
    return {
        local: process.env.LOCAL_SEO_STATUS,
        selfTest: process.env.GSC_SELF_TEST_STATUS,
        technical: process.env.TECHNICAL_SEO_STATUS
    };
}

async function runSelfTests() {
    const windows = reportingWindows(new Date('2026-08-17T06:17:00Z'));
    assert.deepEqual(windows, {
        current: { startDate: '2026-08-07', endDate: '2026-08-13' },
        previous: { startDate: '2026-07-31', endDate: '2026-08-06' }
    }, 'Date windows must use the Search Console Pacific calendar at the UTC day boundary');

    const aggregate = aggregateDailyRows([
        { clicks: 10, impressions: 100, position: 4 },
        { clicks: 5, impressions: 50, position: 8 }
    ]);
    assert.equal(aggregate.clicks, 15);
    assert.equal(aggregate.impressions, 150);
    assert.equal(aggregate.ctr, 0.1);
    assert.ok(Math.abs(aggregate.position - (800 / 150)) < 1e-10);

    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const credentials = {
        client_email: 'seo-monitor@example.iam.gserviceaccount.com',
        private_key_id: 'self-test-key',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' })
    };
    const jwt = createServiceAccountJwt(credentials, 1_700_000_000);
    const [encodedHeader, encodedClaims, encodedSignature] = jwt.split('.');
    assert.equal(JSON.parse(Buffer.from(encodedHeader, 'base64url')).alg, 'RS256');
    const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url'));
    assert.equal(claims.scope, SEARCH_CONSOLE_SCOPE);
    assert.equal(claims.exp - claims.iat, 3600);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedClaims}`);
    verifier.end();
    assert.equal(verifier.verify(publicKey, Buffer.from(encodedSignature, 'base64url')), true);

    const row = { key: 'quant interview', clicks: 4, impressions: 100, ctr: 0.04, position: 6 };
    const report = renderReport({
        siteUrl: DEFAULT_SITE_URL,
        windows,
        data: {
            current: aggregate,
            previous: { ...aggregate, clicks: 10 },
            currentQueries: [row],
            previousQueries: [{ ...row, clicks: 2 }],
            currentPages: [{ ...row, key: 'https://desk2quant.com/guides/quant-interview-guide.html' }],
            previousPages: []
        },
        statuses: { local: 'success', selfTest: 'success', technical: 'success' },
        generatedAt: new Date('2026-08-17T07:00:00Z')
    });
    assert.match(report, /Impression-weighted average position/);
    assert.match(report, /Top queries/);
    assert.match(report, /Top pages/);
    assert.match(report, /n\/a/);
    assert.doesNotMatch(report, /PRIVATE KEY|seo-monitor@example/);
    console.log('[gsc:self-test] Date windows, weighted metrics, JWT signing, and Markdown rendering passed.');
}

async function main() {
    const siteUrl = (process.env.GSC_SITE_URL || DEFAULT_SITE_URL).trim();
    const reportPath = process.env.GSC_REPORT_PATH || DEFAULT_REPORT_PATH;
    if (!siteUrl) throw new Error('GSC_SITE_URL must not be empty.');
    if (/[\r\n]/.test(reportPath)) throw new Error('GSC_REPORT_PATH must not contain newlines.');
    const statuses = workflowStatuses();
    const rawCredentials = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();

    if (!rawCredentials) {
        const summary = renderSetupSummary(siteUrl, statuses);
        console.warn('[gsc] Visibility was not checked: GSC_SERVICE_ACCOUNT_JSON is not configured. See the workflow summary for setup steps.');
        await appendStepSummary(summary);
        await setGitHubOutput('report_generated', 'false');
        await setGitHubOutput('report_path', reportPath.split(path.sep).join('/'));
        return;
    }

    const credentials = parseCredentials(rawCredentials);
    const windows = reportingWindows();
    const accessToken = await getAccessToken(credentials);
    const data = await loadVisibilityData(accessToken, siteUrl, windows);
    const report = renderReport({ siteUrl, windows, data, statuses });

    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, report, 'utf8');
    await appendStepSummary(report);
    await setGitHubOutput('report_generated', 'true');
    await setGitHubOutput('report_path', reportPath.split(path.sep).join('/'));
    console.log(`[gsc] Search Console visibility checked for ${windows.current.startDate} to ${windows.current.endDate}.`);
    console.log(`[gsc] Markdown report written to ${reportPath}.`);
}

if (process.argv.includes('--self-test')) {
    await runSelfTests();
} else {
    try {
        await main();
    } catch (error) {
        const message = safeErrorMessage(error);
        console.error(`[gsc] Visibility check failed: ${message}`);
        try {
            await appendStepSummary(renderFailureSummary(message, workflowStatuses()));
            await setGitHubOutput('report_generated', 'false');
            await setGitHubOutput('report_path', (process.env.GSC_REPORT_PATH || DEFAULT_REPORT_PATH).split(path.sep).join('/'));
        } catch (summaryError) {
            console.error(`[gsc] Could not write the failure summary: ${safeErrorMessage(summaryError)}`);
        }
        process.exitCode = 1;
    }
}
