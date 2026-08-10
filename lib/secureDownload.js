// Signed, expiring download tokens + a Drive share helper with a secure
// fallback for buyers whose email has no Google Account.
//
// Google Drive can only grant NAMED access to emails tied to a Google
// Account. When it rejects a share with cannotInviteNonGoogleUser, the
// caller must NOT fall back to making the file public ('anyone with the
// link') — that would let anyone who obtains the link access a paid
// product, not just the buyer. Instead this module issues a signed,
// HMAC'd, expiring URL that streams the file through our own server
// (via handleSignedDownload in api/grant-access.js), scoped to that one
// file + email pair and unforgeable without the server secret.
import crypto from 'crypto';

export const DOWNLOAD_LINK_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

export function signDownloadToken(secret, fileId, email, expires) {
    return crypto
        .createHmac('sha256', secret)
        .update(`${fileId}:${String(email).toLowerCase()}:${expires}`)
        .digest('hex');
}

export function buildSignedDownloadUrl(baseUrl, secret, fileId, email, fileName, isFolder, store) {
    const expires = Date.now() + DOWNLOAD_LINK_TTL_MS;
    const sig = signDownloadToken(secret, fileId, email, expires);
    const params = new URLSearchParams({
        action: 'download',
        fileId,
        email,
        expires: String(expires),
        sig,
    });
    if (fileName) params.set('name', fileName);
    if (isFolder) params.set('isFolder', '1');
    // store=sb routes the proxy at Supabase Storage instead of Drive. The value
    // is NOT part of the HMAC: the signature already binds fileId+email+expires,
    // and fileId is unambiguous between the two backends (a Drive id never
    // contains a '/', a storage path always does).
    if (store) params.set('store', store);
    return `${baseUrl}/api/grant-access?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Supabase Storage
//
// The `resources` and `product-covers` buckets used to be PUBLIC, which meant
// every paid file in them was downloadable by anyone who read products.file_url
// -- no payment, no token, no auth. They are private now, so delivery has to go
// through a signed, expiring URL the same way the Drive fallback does.
// ---------------------------------------------------------------------------

const SUPABASE_PUBLIC_MARKER = '/storage/v1/object/public/';

export function isSupabaseStorageUrl(url) {
    return typeof url === 'string' && url.includes('/storage/v1/object/');
}

/**
 * Pulls the "<bucket>/<path/to/file.zip>" object key out of a Supabase Storage
 * URL. Handles both the public form and an already-signed form. Returns null
 * when the URL is not a storage URL at all.
 */
export function parseSupabaseStorageUrl(url) {
    if (!isSupabaseStorageUrl(url)) return null;
    const clean = String(url).trim().split('?')[0];
    const marker = clean.includes(SUPABASE_PUBLIC_MARKER)
        ? SUPABASE_PUBLIC_MARKER
        : '/storage/v1/object/';
    const idx = clean.indexOf(marker);
    if (idx === -1) return null;
    let objectKey = clean.slice(idx + marker.length);
    // A signed URL is /object/sign/<bucket>/<path>; drop the leading verb.
    objectKey = objectKey.replace(/^(sign|authenticated)\//, '');
    if (!objectKey) return null;
    const slash = objectKey.indexOf('/');
    if (slash <= 0) return null;
    return {
        objectKey: decodeURIComponent(objectKey),
        bucket: decodeURIComponent(objectKey.slice(0, slash)),
        fileName: decodeURIComponent(objectKey.slice(objectKey.lastIndexOf('/') + 1)),
    };
}

/**
 * Streams a private Storage object back through our own response, using the
 * service-role key. Mirrors the Drive branch of handleSignedDownload: the
 * bucket credential never leaves the server and the buyer only ever sees our
 * own signed URL.
 */
export async function streamSupabaseStorageObject({ supabaseUrl, serviceKey, objectKey, res, fileName }) {
    const encodedKey = String(objectKey).split('/').map(encodeURIComponent).join('/');
    const resp = await fetch(`${supabaseUrl}/storage/v1/object/${encodedKey}`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!resp.ok) {
        throw new Error(`Supabase Storage fetch failed (${resp.status}): ${await resp.text()}`);
    }

    res.setHeader('Content-Type', resp.headers.get('content-type') || 'application/octet-stream');
    const contentLength = resp.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const safeName = String(fileName || objectKey.split('/').pop() || 'download.zip')
        .replace(/[^\w.\- ]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

    const reader = resp.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
    }
    return res.end();
}

export async function getDriveAccessToken(clientEmail, privateKey) {
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
    const formattedKey = privateKey.replace(/\\n/g, '\n');
    const signature = signer.sign(formattedKey, 'base64url');
    const jwt = `${tokenInput}.${signature}`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    if (!tokenResponse.ok) throw new Error(`Drive auth failed: ${await tokenResponse.text()}`);
    const { access_token } = await tokenResponse.json();
    return access_token;
}

// Folder-type product links list several loose files instead of one
// downloadable file. Drive's alt=media download only works on individual
// files, so for the signed-download fallback we resolve the folder to the
// single best file to serve: prefer the largest zip (sellers typically
// already bundle a folder's contents into one zip), otherwise the
// largest file of any type.
export async function resolveServableDriveFile(token, fileId, isFolder) {
    if (!isFolder) return { fileId, fileName: null };
    const listUrl = `https://www.googleapis.com/drive/v3/files?q='${fileId}'+in+parents&fields=files(id,name,mimeType,size)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const listResp = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!listResp.ok) throw new Error(`Drive folder listing failed: ${await listResp.text()}`);
    const { files = [] } = await listResp.json();
    if (!files.length) throw new Error('Drive folder is empty; nothing to serve');
    const zips = files.filter(f => f.mimeType === 'application/zip' || /\.zip$/i.test(f.name));
    const pool = zips.length ? zips : files;
    const best = pool.reduce((a, b) => (Number(b.size || 0) > Number(a.size || 0) ? b : a));
    return { fileId: best.id, fileName: best.name };
}

// Shares a Drive file/folder with customerEmail as a named 'reader'. If
// Drive rejects the share because the email has no Google Account,
// returns { fallback: 'signed_download_url' } instead of throwing or
// making the file public — the caller should then use
// buildSignedDownloadUrl() to hand out a secure link instead.
export async function grantDrivePermissionOrSignedFallback(clientEmail, privateKey, fileId, customerEmail) {
    const token = await getDriveAccessToken(clientEmail, privateKey);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const permissionsUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,emailAddress,type)&supportsAllDrives=true`;
    const listResponse = await fetch(permissionsUrl, { headers });
    if (!listResponse.ok) throw new Error(`Drive permission lookup failed: ${await listResponse.text()}`);

    const { permissions = [] } = await listResponse.json();
    const existing = permissions.find(permission => permission.type === 'user' && String(permission.emailAddress).toLowerCase() === String(customerEmail).toLowerCase());
    const permissionUrl = existing
        ? `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${existing.id}?supportsAllDrives=true`
        : `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`;
    const permissionResponse = await fetch(permissionUrl, {
        method: existing ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(existing ? { role: 'reader' } : { role: 'reader', type: 'user', emailAddress: customerEmail })
    });
    if (!permissionResponse.ok) {
        const errorText = await permissionResponse.text();
        if (errorText.includes('cannotInviteNonGoogleUser')) {
            return { fallback: 'signed_download_url' };
        }
        throw new Error(`Drive permission update failed: ${errorText}`);
    }
    return permissionResponse.json();
}
