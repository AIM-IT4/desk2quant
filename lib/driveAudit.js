// Drive permission audit: finds customer 'writer' grants on master product
// files and downgrades them to 'reader'.
//
// Runs inside Vercel (via api/reminders.js?action=drive-audit) because
// GOOGLE_PRIVATE_KEY is redacted on `vercel env pull` and cannot be read
// locally. Dry-run by default; pass apply=true to modify.
import crypto from 'crypto';

function extractDriveFileId(url) {
    if (!url) return null;
    const s = String(url);
    let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    m = s.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    m = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    return null;
}

function b64url(input) {
    return Buffer.from(input).toString('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(clientEmail, privateKey) {
    let key = String(privateKey).trim();
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1);
    }
    key = key.split(String.fromCharCode(92) + 'r').join('');
    key = key.split(String.fromCharCode(92) + 'n').join(String.fromCharCode(10));
    if (key.indexOf('-----BEGIN') === -1) throw new Error('GOOGLE_PRIVATE_KEY is not a PEM key');
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    }));
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    const sig = b64url(signer.sign(key));
    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: `${header}.${claim}.${sig}`
        })
    });
    if (!resp.ok) throw new Error(`token: ${(await resp.text()).slice(0, 160)}`);
    return (await resp.json()).access_token;
}

async function listPermissions(token, fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`
        + '?fields=permissions(id,emailAddress,type,role)&supportsAllDrives=true';
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error((await resp.text()).slice(0, 160));
    return (await resp.json()).permissions || [];
}

// A file with copyRequiresWriterPermission = true blocks readers (and
// commenters) from downloading, printing or copying it. Buyers get the
// 'reader' role, so this flag makes a paid product unreadable for them
// while writers are unaffected -- which is why it only surfaced after
// c6fc37e changed buyers from writer to reader.
async function getCopyFlag(token, fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}`
        + '?fields=id,name,copyRequiresWriterPermission,mimeType,driveId,ownedByMe,owners(emailAddress),capabilities(canShare,canEdit,canChangeCopyRequiresWriterPermission)&supportsAllDrives=true';
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error((await resp.text()).slice(0, 160));
    return resp.json();
}

async function clearCopyFlag(token, fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`;
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyRequiresWriterPermission: false })
    });
    if (!resp.ok) throw new Error((await resp.text()).slice(0, 160));
}

async function toReader(token, fileId, permissionId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`
        + '?supportsAllDrives=true';
    const resp = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader' })
    });
    if (!resp.ok) throw new Error((await resp.text()).slice(0, 160));
}

// DIAGNOSTIC: can the service account take ownership of the blocked files?
// Google restricts ownership transfer heavily (consumer Gmail -> service
// account is normally refused), so ask the API rather than assume. Reports the
// capability flags and, with attempt=true, tries the transfer and returns the
// real error. Read-only unless attempt=true.
export async function probeOwnership({ clientEmail, privateKey, fileIds, attempt = false }) {
    const token = await getAccessToken(clientEmail, privateKey);
    const out = [];
    for (const id of fileIds) {
        const row = { fileId: id };
        try {
            const metaUrl = `https://www.googleapis.com/drive/v3/files/${id}`
                + '?supportsAllDrives=true&fields=id,name,ownedByMe,driveId,owners(emailAddress),'
                + 'capabilities(canShare,canEdit,canChangeCopyRequiresWriterPermission,canMoveItemOutOfDrive)';
            const mr = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (!mr.ok) throw new Error((await mr.text()).slice(0, 200));
            const m = await mr.json();
            row.name = m.name;
            row.owner = (m.owners || []).map((o) => o.emailAddress).join(',');
            row.ownedByMe = m.ownedByMe;
            row.sharedDriveId = m.driveId || null;
            row.canChangeCopyFlag = !!(m.capabilities && m.capabilities.canChangeCopyRequiresWriterPermission);
            row.canEdit = !!(m.capabilities && m.capabilities.canEdit);

            const perms = await listPermissions(token, id);
            const mine = perms.find((p) => p.emailAddress === clientEmail);
            row.serviceAccountRole = mine ? mine.role : null;
            row.permissionId = mine ? mine.id : null;

            if (attempt && mine) {
                const tUrl = `https://www.googleapis.com/drive/v3/files/${id}/permissions/${mine.id}`
                    + '?transferOwnership=true&supportsAllDrives=true';
                const tr = await fetch(tUrl, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: 'owner' })
                });
                row.transferStatus = tr.status;
                row.transferOk = tr.ok;
                if (!tr.ok) row.transferError = (await tr.text()).slice(0, 300);
            }
        } catch (err) {
            row.error = String(err.message || err).slice(0, 250);
        }
        out.push(row);
    }
    return { serviceAccount: clientEmail, mode: attempt ? 'attempt-transfer' : 'inspect', files: out };
}

export async function runDriveAudit({ clientEmail, privateKey, supabaseUrl, supabaseKey, apply = false }) {
    if (!clientEmail || !privateKey) throw new Error('Google service account credentials missing');

    const resp = await fetch(`${supabaseUrl}/rest/v1/products?select=name,file_url`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    if (!resp.ok) throw new Error(`product fetch ${resp.status}`);

    const files = {};
    for (const p of await resp.json()) {
        const id = extractDriveFileId(p.file_url);
        if (id && !files[id]) files[id] = p.name;
    }

    const token = await getAccessToken(clientEmail, privateKey);
    const ids = Object.keys(files);

    const details = [];
    const emails = new Set();
    let writersFound = 0, changed = 0;
    const copyBlocked = [];
    let copyFixed = 0;
    const errors = [];

    for (const fileId of ids) {
        let perms;
        try {
            perms = await listPermissions(token, fileId);
        } catch (e) {
            errors.push({ fileId, product: files[fileId], error: e.message });
            continue;
        }
        const writers = perms.filter(p =>
            p.type === 'user' && p.role === 'writer' &&
            String(p.emailAddress).toLowerCase() !== String(clientEmail).toLowerCase());

        // Readers cannot download when this flag is set, so check every file --
        // including ones with no writer grants, which the guard below skips.
        try {
            const meta = await getCopyFlag(token, fileId);
            if (meta.copyRequiresWriterPermission) {
                copyBlocked.push({ product: String(files[fileId]).slice(0, 70), fileId, fixed: false, ownedByMe: meta.ownedByMe, owner: (meta.owners||[]).map(o=>o.emailAddress).join(","), driveId: meta.driveId || null, canChange: (meta.capabilities||{}).canChangeCopyRequiresWriterPermission });
                if (apply) {
                    await clearCopyFlag(token, fileId);
                    copyFixed++;
                    copyBlocked[copyBlocked.length - 1].fixed = true;
                }
            }
        } catch (e) {
            errors.push({ fileId, product: files[fileId], error: 'copyFlag: ' + e.message });
        }

        if (!writers.length) continue;
        writersFound += writers.length;

        const fixed = [], failed = [];
        for (const w of writers) {
            emails.add(String(w.emailAddress).toLowerCase());
            if (!apply) continue;
            try { await toReader(token, fileId, w.id); changed++; fixed.push(w.emailAddress); }
            catch (e) { failed.push({ email: w.emailAddress, error: e.message }); }
        }
        details.push({
            product: String(files[fileId]).slice(0, 70),
            fileId,
            writers: writers.map(w => w.emailAddress),
            downgraded: fixed,
            failed
        });
    }

    return {
        mode: apply ? 'apply' : 'dry-run',
        filesScanned: ids.length,
        filesWithWriters: details.length,
        writerGrantsFound: writersFound,
        uniqueCustomers: emails.size,
        downgraded: changed,
        filesBlockingReaderDownload: copyBlocked.length,
        copyFlagsCleared: copyFixed,
        copyBlocked,
        details,
        errors
    };
}
