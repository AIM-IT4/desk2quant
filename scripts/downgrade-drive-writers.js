/**
 * Remediation Tool: downgrade-drive-writers.js
 *
 * Historical buyers were granted role='writer' on the shared product files
 * (fixed forward in api/razorpay-webhook.js and api/grant-access.js). A code
 * change does not touch grants that already exist in Drive, so this script
 * walks every product file and downgrades lingering customer 'writer'
 * permissions to 'reader'.
 *
 * 'reader' still allows view / download / copy / print, so offline reading is
 * unaffected. It removes delete / rename / modify, which matters because these
 * are shared master files -- not per-buyer copies.
 *
 * The service account's own permission and the file owner are never touched;
 * the SA needs writer to manage shares at all.
 *
 * Dry run (default -- reports what it would change, changes nothing):
 *   node scripts/downgrade-drive-writers.js
 *
 * Apply:
 *   node scripts/downgrade-drive-writers.js --apply
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APPLY = process.argv.includes('--apply');

// 1. Parse and load .env file into process.env
try {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) {
        throw new Error('.env file not found');
    }
    const envContent = fs.readFileSync(envPath, 'utf8');
    const regex = /^([A-Z0-9_]+)\s*=\s*(.*)$/gm;
    let match;
    while ((match = regex.exec(envContent)) !== null) {
        let key = match[1];
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
            val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
    }
    console.log('✓ Loaded environment variables from .env');
} catch (err) {
    console.error('✖ Error loading .env configuration:', err.message);
    process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';

// The anon key is not in local .env, but scripts/verify-drive-links.js already
// carries it as a committed fallback. Read it from there instead of duplicating
// the literal. Anon keys are public by design (RLS is the actual gate), but
// there is no reason to have two copies drift apart.
function resolveSupabaseKey() {
    if (process.env.SUPABASE_KEY) return process.env.SUPABASE_KEY;
    if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY;
    try {
        const peer = fs.readFileSync(path.join(__dirname, 'verify-drive-links.js'), 'utf8');
        const match = peer.match(/SUPABASE_KEY\s*=\s*process\.env\.SUPABASE_KEY\s*\|\|\s*'([^']+)'/);
        if (match) return match[1];
    } catch { /* fall through to null */ }
    return null;
}

const SUPABASE_KEY = resolveSupabaseKey();
const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY;

if (!clientEmail || !privateKey) {
    console.error('✖ GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY not set in .env');
    process.exit(1);
}

// Static links mirrored from razorpay-webhook.js. Deduped by file ID below, so
// the many-names-to-one-ID aliasing in the webhook is harmless here.
const STATIC_LINKS = {
    'Quant Interview Problem Book (1000+ Problems with solutions)': 'https://drive.google.com/uc?export=download&id=1sp48XJi8VZt5ufw4o6pHgg_EwBA0nkVJ',
    'Quant Models for Each Asset Class Master Pack: IR, FX, Credits, Equity': 'https://drive.google.com/uc?export=download&id=1CvriZOEfqiGkSRiKwR33kC3ny1T2oQSs',
    'Derivatives Products & Pricing Master Pack (6 PDFs): IR, FX, Equity, Credit, Inflation & Commodities': 'https://drive.google.com/uc?export=download&id=1kf_Qln0AFRi_Z1zvzaRHMojmZ152tY0j',
    'Ultimate Industry Grade Quant Project Pack (45 Projects)': 'https://drive.google.com/uc?export=download&id=1jktrsnX880xtd3RVBw0nwC18beSc-toz',
    'Complete Front Office & Risk Quant Professional Bundle (40+ PDFs & 60+ scripts)': 'https://drive.google.com/uc?export=download&id=1XrgmUHRy-QjCt5IOTWg1e0WTM_4_Kaid',
    'Python for Quants: Complete Interview Guide': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing'
};

function extractDriveFileId(url) {
    if (!url) return null;
    let match = url.match(/[?&]id=([^&]+)/);
    if (match) return match[1];
    match = url.match(/\/file\/d\/([^/]+)/);
    if (match) return match[1];
    match = url.match(/\/drive\/folders\/([^/?]+)/);
    if (match) return match[1];
    match = url.match(/\/open\?id=([^&]+)/);
    if (match) return match[1];
    return null;
}

async function getAccessToken() {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claimSet = {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const base64Encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const tokenInput = `${base64Encode(header)}.${base64Encode(claimSet)}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.write(tokenInput);
    signer.end();
    const signature = signer.sign(privateKey.replace(/\\n/g, '\n'), 'base64url');

    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${tokenInput}.${signature}`
    });
    if (!resp.ok) throw new Error('Google token exchange failed: ' + await resp.text());
    return (await resp.json()).access_token;
}

// Collect every distinct Drive file ID we hand out, from both sources.
async function collectFileIds() {
    const files = {};

    for (const [name, url] of Object.entries(STATIC_LINKS)) {
        const fileId = extractDriveFileId(url);
        if (fileId && !files[fileId]) files[fileId] = name;
    }

    // Hard-fail rather than degrade to static-only. A partial scan that prints
    // a clean summary is worse than no scan: it reads as "all files checked"
    // when the dynamically-listed products were never looked at.
    if (!SUPABASE_KEY) {
        throw new Error('No Supabase key available -- cannot enumerate dynamic products. '
            + 'Set SUPABASE_KEY in .env and re-run.');
    }

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/products?select=name,file_url`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    if (!resp.ok) {
        throw new Error(`Supabase product fetch failed (${resp.status}) -- refusing to report a `
            + `partial scan. Body: ${(await resp.text()).substring(0, 200)}`);
    }

    const products = await resp.json();
    console.log(`✓ Fetched ${products.length} products from Supabase`);
    for (const prod of products) {
        const fileId = extractDriveFileId(prod.file_url);
        if (fileId && !files[fileId]) files[fileId] = prod.name;
    }
    return files;
}

async function listPermissions(token, fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`
        + '?fields=permissions(id,emailAddress,type,role)&supportsAllDrives=true';
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(await resp.text());
    return (await resp.json()).permissions || [];
}

async function downgrade(token, fileId, permissionId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`
        + '?supportsAllDrives=true';
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader' })
    });
    if (!resp.ok) throw new Error(await resp.text());
}

async function main() {
    console.log(APPLY
        ? '\n=== APPLY MODE -- permissions will be modified ===\n'
        : '\n=== DRY RUN -- nothing will be modified. Re-run with --apply to commit. ===\n');

    const token = await getAccessToken();
    console.log('✓ Google access token generated');

    const files = await collectFileIds();
    const ids = Object.keys(files);
    console.log(`\nScanning ${ids.length} unique Drive file(s)...\n`);

    let writersFound = 0;
    let downgraded = 0;
    const errors = [];

    for (const fileId of ids) {
        const label = files[fileId].substring(0, 52);
        let permissions;
        try {
            permissions = await listPermissions(token, fileId);
        } catch (err) {
            console.log(`✖ ${label}\n   └─ ${fileId} -- permission list failed: ${err.message.substring(0, 120)}`);
            errors.push({ fileId, name: files[fileId], reason: 'list failed' });
            continue;
        }

        // Only customer grants. The SA itself must stay writer to manage shares,
        // and an owner permission cannot be demoted via PATCH anyway.
        const customerWriters = permissions.filter(p =>
            p.type === 'user'
            && p.role === 'writer'
            && String(p.emailAddress).toLowerCase() !== String(clientEmail).toLowerCase()
        );

        if (customerWriters.length === 0) {
            console.log(`✓ ${label}\n   └─ ${fileId} -- clean (no customer writers)`);
            continue;
        }

        writersFound += customerWriters.length;
        console.log(`⚠ ${label}\n   └─ ${fileId} -- ${customerWriters.length} customer writer(s)`);

        for (const perm of customerWriters) {
            if (!APPLY) {
                console.log(`      would downgrade: ${perm.emailAddress}`);
                continue;
            }
            try {
                await downgrade(token, fileId, perm.id);
                downgraded++;
                console.log(`      downgraded: ${perm.emailAddress}`);
            } catch (err) {
                errors.push({ fileId, email: perm.emailAddress, reason: err.message.substring(0, 120) });
                console.log(`      FAILED: ${perm.emailAddress} -- ${err.message.substring(0, 120)}`);
            }
        }
    }

    console.log('\n' + '-'.repeat(72));
    console.log(`Files scanned:            ${ids.length}`);
    console.log(`Customer writers found:   ${writersFound}`);
    console.log(APPLY
        ? `Downgraded to reader:     ${downgraded}`
        : `Would downgrade:          ${writersFound}  (re-run with --apply)`);
    if (errors.length) console.log(`Errors:                   ${errors.length}`);
    console.log('-'.repeat(72) + '\n');

    if (errors.length) process.exit(1);
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
