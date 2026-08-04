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

export function buildSignedDownloadUrl(baseUrl, secret, fileId, email, fileName, isFolder) {
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
    return `${baseUrl}/api/grant-access?${params.toString()}`;
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
