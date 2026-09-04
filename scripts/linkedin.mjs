import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function loadConfig() {
    let clientId = process.env.LINKEDIN_CLIENT_ID;
    let clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    let redirectUri = process.env.LINKEDIN_REDIRECT_URI || 'https://desk2quant.com/api/auth/linkedin/callback';
    let accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
    let personUrn = process.env.LINKEDIN_PERSON_URN;
    let authorName = process.env.LINKEDIN_AUTHOR_NAME;

    const envPath = path.join(ROOT, '.env.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
            const idx = line.indexOf('=');
            if (idx !== -1) {
                const key = line.slice(0, idx).trim();
                const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
                if (key === 'LINKEDIN_CLIENT_ID' && !clientId) clientId = val;
                if (key === 'LINKEDIN_CLIENT_SECRET' && !clientSecret) clientSecret = val;
                if (key === 'LINKEDIN_REDIRECT_URI') redirectUri = val;
                if (key === 'LINKEDIN_ACCESS_TOKEN' && !accessToken) accessToken = val;
                if (key === 'LINKEDIN_PERSON_URN' && !personUrn) personUrn = val;
                if (key === 'LINKEDIN_AUTHOR_NAME' && !authorName) authorName = val;
            }
        }
    }

    return {
        clientId: clientId || '7783myta62ckmf',
        clientSecret: clientSecret || '',
        redirectUri: redirectUri || 'https://desk2quant.com/api/auth/linkedin/callback',
        accessToken,
        personUrn,
        authorName
    };
}

export function saveConfig(updates) {
    const envPath = path.join(ROOT, '.env.local');
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    for (const [key, val] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
            content = content.replace(regex, `${key}=${val}`);
        } else {
            content += (content.endsWith('\n') ? '' : '\n') + `${key}=${val}\n`;
        }
    }

    fs.writeFileSync(envPath, content, 'utf8');
}

export function getAuthorizationUrl(customRedirect) {
    const { clientId, redirectUri } = loadConfig();
    const uri = customRedirect || redirectUri;
    const scopes = ['w_member_social', 'openid', 'profile', 'email'];
    const state = Math.random().toString(36).substring(2, 15);

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: uri,
        state: state,
        scope: scopes.join(' ')
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export async function exchangeCodeForToken(code, customRedirect) {
    const { clientId, clientSecret, redirectUri } = loadConfig();
    const uri = customRedirect || redirectUri;

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.trim(),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: uri
    });

    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
        throw new Error(`LinkedIn token exchange failed (${res.status}): ${JSON.stringify(data)}`);
    }

    const accessToken = data.access_token;
    const expiresIn = data.expires_in;

    // Fetch user profile info using OpenID userinfo
    const profile = await getUserProfile(accessToken);
    const personUrn = profile.sub ? `urn:li:person:${profile.sub}` : null;
    const authorName = profile.name || `${profile.given_name || ''} ${profile.family_name || ''}`.trim() || 'Desk2Quant Author';

    const updates = {
        LINKEDIN_ACCESS_TOKEN: accessToken,
        LINKEDIN_EXPIRES_AT: Math.floor(Date.now() / 1000) + (expiresIn || 5184000)
    };
    if (personUrn) updates.LINKEDIN_PERSON_URN = personUrn;
    if (authorName) updates.LINKEDIN_AUTHOR_NAME = authorName;

    saveConfig(updates);

    return {
        accessToken,
        expiresIn,
        personUrn,
        authorName,
        profile
    };
}

export async function getUserProfile(token) {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch LinkedIn profile (${res.status}): ${text}`);
    }

    return await res.json();
}

export async function publishPost(text, url) {
    const config = loadConfig();
    if (!config.accessToken) {
        throw new Error('LINKEDIN_ACCESS_TOKEN is not set. Run auth first.');
    }

    let personUrn = config.personUrn;
    if (!personUrn) {
        const profile = await getUserProfile(config.accessToken);
        personUrn = `urn:li:person:${profile.sub}`;
        saveConfig({ LINKEDIN_PERSON_URN: personUrn });
    }

    const payload = {
        author: personUrn,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: []
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
    };

    if (url) {
        payload.content = {
            article: {
                source: url,
                title: 'Desk2Quant Quant Finance Resource',
                description: 'Practitioner-grade quant finance material, code, and interview preparation.'
            }
        };
    }

    const res = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Linkedin-Version': '202503',
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (res.status === 201) {
        const postUrn = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || 'Created';
        return { success: true, postUrn };
    }

    const errBody = await res.text();
    throw new Error(`LinkedIn post failed (${res.status}): ${errBody}`);
}

export async function uploadDocument(filePath) {
    const config = loadConfig();
    if (!config.accessToken) {
        throw new Error('LINKEDIN_ACCESS_TOKEN is not set. Run auth first.');
    }

    let personUrn = config.personUrn;
    if (!personUrn) {
        const profile = await getUserProfile(config.accessToken);
        personUrn = `urn:li:person:${profile.sub}`;
        saveConfig({ LINKEDIN_PERSON_URN: personUrn });
    }

    const fileBuffer = fs.readFileSync(filePath);

    const initRes = await fetch('https://api.linkedin.com/rest/documents?action=initializeUpload', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Linkedin-Version': '202503',
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            initializeUploadRequest: {
                owner: personUrn
            }
        })
    });

    if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`Failed to initialize document upload (${initRes.status}): ${errText}`);
    }

    const initData = await initRes.json();
    const { uploadUrl, document: documentUrn } = initData.value;

    const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/pdf'
        },
        body: fileBuffer
    });

    if (!uploadRes.ok && uploadRes.status !== 201) {
        const errText = await uploadRes.text();
        throw new Error(`Failed to upload document binary (${uploadRes.status}): ${errText}`);
    }

    return { documentUrn, personUrn };
}

export async function publishDocumentPost(text, filePath, title = 'Quant Finance Document') {
    const config = loadConfig();
    const { documentUrn, personUrn } = await uploadDocument(filePath);

    const payload = {
        author: personUrn,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: []
        },
        content: {
            media: {
                id: documentUrn,
                title: title
            }
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
    };

    const res = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Linkedin-Version': '202503',
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (res.status === 201) {
        const postUrn = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || 'Created';
        return { success: true, postUrn, documentUrn };
    }

    const errBody = await res.text();
    throw new Error(`LinkedIn document post failed (${res.status}): ${errBody}`);
}

export async function publishComment(postUrn, text) {
    const config = loadConfig();
    if (!config.accessToken) {
        throw new Error('LINKEDIN_ACCESS_TOKEN is not set. Run auth first.');
    }

    let personUrn = config.personUrn;
    if (!personUrn) {
        const profile = await getUserProfile(config.accessToken);
        personUrn = `urn:li:person:${profile.sub}`;
        saveConfig({ LINKEDIN_PERSON_URN: personUrn });
    }

    const targetUrn = encodeURIComponent(postUrn.trim());
    const res = await fetch(`https://api.linkedin.com/v2/socialActions/${targetUrn}/comments`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify({
            actor: personUrn,
            message: { text: text.trim() }
        })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to publish comment (${res.status}): ${errText}`);
    }

    return await res.json();
}

// CLI handler
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || '--help';

    if (command === '--auth-url' || command === 'auth-url') {
        const url = getAuthorizationUrl(args[1]);
        console.log('\n🔗 LinkedIn Authorization URL:');
        console.log(url);
        console.log('\n👉 Open this URL in your browser, log in to LinkedIn, and click Allow.');
        console.log('After authorization, LinkedIn will redirect to your redirect URI with a ?code= parameter.');
        console.log('Then run:\nnode scripts/linkedin.mjs --exchange <CODE>\n');
        return;
    }

    if (command === '--exchange' || command === 'exchange') {
        const code = args[1];
        if (!code) {
            console.error('Error: Please provide the authorization code.');
            console.error('Usage: node scripts/linkedin.mjs --exchange <CODE>');
            process.exit(1);
        }
        try {
            console.log('Exchanging authorization code for access token...');
            const result = await exchangeCodeForToken(code, args[2]);
            console.log('✅ Successfully connected to LinkedIn!');
            console.log(`Author: ${result.authorName}`);
            console.log(`URN: ${result.personUrn}`);
            console.log(`Token expires in: ~${Math.round(result.expiresIn / 86400)} days`);
            console.log('Credentials saved to .env.local.');
        } catch (err) {
            console.error('❌ Exchange failed:', err.message);
            process.exit(1);
        }
        return;
    }

    if (command === '--status' || command === 'status') {
        const config = loadConfig();
        if (!config.accessToken) {
            console.log('❌ Not authenticated with LinkedIn.');
            console.log('Run: node scripts/linkedin.mjs --auth-url');
            return;
        }
        try {
            const profile = await getUserProfile(config.accessToken);
            console.log('✅ LinkedIn Connection Active:');
            console.log(`Name: ${profile.name || profile.given_name + ' ' + profile.family_name}`);
            console.log(`Email: ${profile.email || 'N/A'}`);
            console.log(`Person URN: urn:li:person:${profile.sub}`);
        } catch (err) {
            console.error('❌ Token expired or invalid:', err.message);
        }
        return;
    }

    if (command === '--post' || command === 'post') {
        const text = args[1];
        const url = args[2];
        if (!text) {
            console.error('Usage: node scripts/linkedin.mjs --post "Your post text" [url]');
            process.exit(1);
        }
        try {
            console.log('Publishing post to LinkedIn...');
            const res = await publishPost(text, url);
            console.log('✅ Post published successfully!');
            console.log(`Post URN: ${res.postUrn}`);
        } catch (err) {
            console.error('❌ Failed to publish post:', err.message);
            process.exit(1);
        }
        return;
    }

    if (command === '--carousel' || command === 'carousel' || command === '--post-carousel') {
        const pdfPath = args[1];
        const title = args[2] || 'Desk2Quant Document';
        const text = args[3] || '';
        if (!pdfPath) {
            console.error('Usage: node scripts/linkedin.mjs --carousel <pdfPath> [title] [text]');
            process.exit(1);
        }
        try {
            console.log(`Uploading carousel document: ${pdfPath}...`);
            const res = await publishDocumentPost(text, pdfPath, title);
            console.log('✅ Document Carousel published successfully to LinkedIn!');
            console.log(`Post URN: ${res.postUrn}`);
            console.log(`Document URN: ${res.documentUrn}`);
        } catch (err) {
            console.error('❌ Failed to publish document post:', err.message);
            process.exit(1);
        }
        return;
    }

    if (command === '--comment' || command === 'comment') {
        const postUrn = args[1];
        const text = args[2];
        if (!postUrn || !text) {
            console.error('Usage: node scripts/linkedin.mjs --comment <postUrn> "Comment text"');
            process.exit(1);
        }
        try {
            console.log(`Publishing comment on ${postUrn}...`);
            const res = await publishComment(postUrn, text);
            console.log('✅ Comment published successfully!');
            console.log(`Comment ID: ${res.id}`);
        } catch (err) {
            console.error('❌ Failed to publish comment:', err.message);
            process.exit(1);
        }
        return;
    }

    console.log(`
Desk2Quant LinkedIn Automation CLI

Commands:
  node scripts/linkedin.mjs --auth-url [redirect_uri]  Generate OAuth authorization link
  node scripts/linkedin.mjs --exchange <code>          Exchange authorization code for token
  node scripts/linkedin.mjs --status                   Check connection & profile status
  node scripts/linkedin.mjs --post "text" [url]        Publish a post to your LinkedIn profile
  node scripts/linkedin.mjs --carousel <pdf> [title] [text] Publish a PDF document carousel post
  node scripts/linkedin.mjs --comment <postUrn> "text" Post a comment on a LinkedIn post
`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(err => {
        console.error('Unexpected error:', err);
        process.exit(1);
    });
}
