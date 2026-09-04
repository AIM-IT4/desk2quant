import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function loadCredentials() {
    // 1. Try google-service-account.json if present
    const jsonPath = path.join(ROOT, 'google-service-account.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            if (data.client_email && data.private_key) {
                return {
                    email: data.client_email,
                    privateKey: data.private_key
                };
            }
        } catch {}
    }

    // 2. Fall back to .env.local
    const envPath = path.join(ROOT, '.env.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        let email = null;
        let privateKey = null;
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('GOOGLE_SERVICE_ACCOUNT_EMAIL=')) {
                email = trimmed.slice('GOOGLE_SERVICE_ACCOUNT_EMAIL='.length).trim();
            } else if (trimmed.startsWith('GOOGLE_PRIVATE_KEY=')) {
                let k = trimmed.slice('GOOGLE_PRIVATE_KEY='.length).trim();
                if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
                    k = k.slice(1, -1);
                }
                privateKey = k.split('\\n').join('\n');
            }
        }
        if (email && privateKey) {
            return { email, privateKey };
        }
    }

    throw new Error('Google Service Account credentials not found in google-service-account.json or .env.local');
}

function b64url(input) {
    return Buffer.from(input).toString('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function getGoogleDriveAccessToken() {
    const { email, privateKey } = loadCredentials();
    let key = String(privateKey).trim();
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1);
    }
    key = key.split(String.fromCharCode(92) + 'r').join('');
    key = key.split(String.fromCharCode(92) + 'n').join(String.fromCharCode(10));
    if (key.indexOf('-----BEGIN') === -1) {
        throw new Error('Google private key is not a valid PEM RSA key');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({
        iss: email,
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

    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(`Google OAuth error (${resp.status}): ${JSON.stringify(data)}`);
    }

    return data.access_token;
}

export async function driveRequest(endpoint, options = {}) {
    const token = await getGoogleDriveAccessToken();
    const url = endpoint.startsWith('http') ? endpoint : `https://www.googleapis.com/drive/v3${endpoint}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Drive API error (${res.status}): ${JSON.stringify(data)}`);
    }
    return data;
}

async function main() {
    const [,, command = 'test', ...args] = process.argv;

    if (command === 'test') {
        console.log('Testing Google Drive connection via Service Account...');
        const token = await getGoogleDriveAccessToken();
        console.log('✅ Acquired OAuth2 access token successfully!');
        const data = await driveRequest('/about?fields=user,storageQuota');
        console.log('Google Drive connected user:', data.user?.emailAddress || 'Service Account');
        console.log('Storage info:', data.storageQuota || 'N/A');
    } else if (command === 'list') {
        const limit = args[0] || 10;
        const data = await driveRequest(`/files?pageSize=${limit}&fields=files(id,name,mimeType,size,modifiedTime)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
        console.log(`Found ${data.files?.length || 0} files:`);
        console.table(data.files || []);
    } else if (command === 'search') {
        const query = args.join(' ');
        if (!query) {
            console.error('Usage: node scripts/drive.mjs search <filename>');
            process.exit(1);
        }
        const encodedQ = encodeURIComponent(`name contains '${query.replace(/'/g, "\\'")}' and trashed = false`);
        const data = await driveRequest(`/files?q=${encodedQ}&fields=files(id,name,mimeType,size,modifiedTime)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
        console.log(`Matches for "${query}":`);
        console.table(data.files || []);
    } else if (command === 'permissions') {
        const fileId = args[0];
        if (!fileId) {
            console.error('Usage: node scripts/drive.mjs permissions <fileId>');
            process.exit(1);
        }
        const data = await driveRequest(`/files/${fileId}/permissions?fields=permissions(id,emailAddress,type,role)&supportsAllDrives=true`);
        console.log(`Permissions for file ${fileId}:`);
        console.table(data.permissions || []);
    } else {
        console.log(`Unknown command: ${command}`);
        console.log('Available commands: test, list [limit], search <filename>, permissions <fileId>');
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(err => {
        console.error('Drive Error:', err.message);
        process.exitCode = 1;
    });
}
