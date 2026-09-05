import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function loadConfig() {
    let bearerToken = process.env.REDDIT_BEARER_TOKEN;
    let sessionCookie = process.env.REDDIT_SESSION_COOKIE;
    let username = process.env.REDDIT_USERNAME;

    const envPath = path.join(ROOT, '.env.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
            const idx = line.indexOf('=');
            if (idx !== -1) {
                const key = line.slice(0, idx).trim();
                const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
                if (key === 'REDDIT_BEARER_TOKEN' && !bearerToken) bearerToken = val;
                if (key === 'REDDIT_SESSION_COOKIE' && !sessionCookie) sessionCookie = val;
                if (key === 'REDDIT_USERNAME' && !username) username = val;
            }
        }
    }

    return {
        bearerToken,
        sessionCookie,
        username
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

export async function getUserProfile() {
    const { bearerToken, sessionCookie } = loadConfig();
    if (!bearerToken && !sessionCookie) {
        throw new Error('Neither REDDIT_BEARER_TOKEN nor REDDIT_SESSION_COOKIE is set.');
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
    }
    if (sessionCookie) {
        headers['Cookie'] = `reddit_session=${sessionCookie}`;
    }

    const url = bearerToken ? 'https://oauth.reddit.com/api/v1/me' : 'https://www.reddit.com/api/me.json';
    const res = await fetch(url, { headers });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Reddit profile fetch failed (${res.status}): ${errText}`);
    }

    const json = await res.json();
    const u = json.data || json;
    return {
        name: u.name,
        total_karma: u.total_karma ?? (u.link_karma + u.comment_karma),
        link_karma: u.link_karma,
        comment_karma: u.comment_karma,
        created_utc: u.created_utc,
        is_gold: !!u.is_gold,
        modhash: u.modhash || ''
    };
}

export async function publishPost({ title, text, subreddit = '', flairId = '', flairText = '' }) {
    const { bearerToken, sessionCookie, username } = loadConfig();
    if (!bearerToken && !sessionCookie) {
        throw new Error('Neither REDDIT_BEARER_TOKEN nor REDDIT_SESSION_COOKIE is configured.');
    }

    let me = null;
    let targetSr = subreddit.trim();
    if (!targetSr || targetSr === 'me' || targetSr === 'profile') {
        if (!username) {
            me = await getUserProfile();
            targetSr = `u_${me.name}`;
            saveConfig({ REDDIT_USERNAME: me.name });
        } else {
            targetSr = `u_${username}`;
        }
    } else {
        targetSr = targetSr.replace(/^r\//i, '');
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
    }
    if (sessionCookie) {
        headers['Cookie'] = `reddit_session=${sessionCookie}`;
        if (!me) {
            me = await getUserProfile();
        }
        if (me.modhash) {
            headers['X-Modhash'] = me.modhash;
        }
    }

    const params = new URLSearchParams({
        api_type: 'json',
        kind: 'self',
        sr: targetSr,
        title: title.trim(),
        text: text.trim(),
        resubmit: 'true',
        sendreplies: 'true'
    });

    if (flairId) {
        params.append('flair_id', flairId);
    }
    if (flairText) {
        params.append('flair_text', flairText);
    }

    if (sessionCookie && me?.modhash) {
        params.append('uh', me.modhash);
    }

    const endpoint = bearerToken ? 'https://oauth.reddit.com/api/submit' : 'https://www.reddit.com/api/submit';
    const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: params.toString()
    });

    const data = await res.json();

    if (!res.ok || (data.json && data.json.errors && data.json.errors.length > 0)) {
        const errors = data.json?.errors ? JSON.stringify(data.json.errors) : JSON.stringify(data);
        throw new Error(`Reddit submit failed (${res.status}): ${errors}`);
    }

    const postData = data.json?.data || {};
    return {
        success: true,
        id: postData.id,
        name: postData.name,
        url: postData.url
    };
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || '--help';

    if (command === '--set-token' || command === 'set-token') {
        const token = args[1];
        if (!token) {
            console.error('Usage: node scripts/reddit.mjs --set-token <BEARER_TOKEN>');
            process.exit(1);
        }
        saveConfig({ REDDIT_BEARER_TOKEN: token });
        console.log('✅ REDDIT_BEARER_TOKEN saved to .env.local.');
        try {
            console.log('Verifying token...');
            const me = await getUserProfile();
            console.log(`✅ Connected as: u/${me.name} (Karma: ${me.total_karma})`);
            saveConfig({ REDDIT_USERNAME: me.name });
        } catch (err) {
            console.error('⚠️ Token saved but verification failed:', err.message);
        }
        return;
    }

    if (command === '--set-cookie' || command === 'set-cookie') {
        const cookie = args[1];
        if (!cookie) {
            console.error('Usage: node scripts/reddit.mjs --set-cookie <REDDIT_SESSION_COOKIE>');
            process.exit(1);
        }
        saveConfig({ REDDIT_SESSION_COOKIE: cookie });
        console.log('✅ REDDIT_SESSION_COOKIE saved to .env.local.');
        try {
            console.log('Verifying cookie...');
            const me = await getUserProfile();
            console.log(`✅ Connected as: u/${me.name} (Karma: ${me.total_karma})`);
            saveConfig({ REDDIT_USERNAME: me.name });
        } catch (err) {
            console.error('⚠️ Cookie saved but verification failed:', err.message);
        }
        return;
    }

    if (command === '--status' || command === 'status') {
        try {
            const me = await getUserProfile();
            console.log('✅ Reddit Connection Active:');
            console.log(`  • Username:     u/${me.name}`);
            console.log(`  • Total Karma:  ${me.total_karma}`);
            console.log(`  • Created:      ${new Date(me.created_utc * 1000).toLocaleDateString()}`);
            console.log(`  • Gold/Prem:    ${me.is_gold ? 'Yes' : 'No'}`);
        } catch (err) {
            console.error('❌ Reddit not connected or token expired:', err.message);
            console.log('\nRun: node scripts/reddit.mjs --set-token <BEARER_TOKEN>');
        }
        return;
    }

    if (command === '--post' || command === 'post') {
        const title = args[1];
        const text = args[2];
        const subreddit = args[3] || '';
        const flairId = args[4] || '';
        const flairText = args[5] || '';
        if (!title || !text) {
            console.error('Usage: node scripts/reddit.mjs --post "Title" "Markdown Text" [subreddit] [flairId] [flairText]');
            process.exit(1);
        }
        try {
            console.log(`Publishing post to ${subreddit || 'your profile'}...`);
            const res = await publishPost({ title, text, subreddit, flairId, flairText });
            console.log('🎉 SUCCESS! Post is live on Reddit.');
            console.log(`URL: ${res.url}`);
            console.log(`ID:  ${res.id}`);
        } catch (err) {
            console.error('❌ Failed to publish post to Reddit:', err.message);
            process.exit(1);
        }
        return;
    }

    if (command === '--post-file' || command === 'post-file') {
        const filePath = args[1];
        const title = args[2];
        const subreddit = args[3] || '';
        const flairId = args[4] || '';
        const flairText = args[5] || '';
        if (!filePath || !title) {
            console.error('Usage: node scripts/reddit.mjs --post-file <path_to_markdown> "Title" [subreddit] [flairId] [flairText]');
            process.exit(1);
        }
        const text = fs.readFileSync(filePath, 'utf8');
        try {
            console.log(`Publishing ${filePath} to ${subreddit || 'your profile'}...`);
            const res = await publishPost({ title, text, subreddit, flairId, flairText });
            console.log('🎉 SUCCESS! Post is live on Reddit.');
            console.log(`URL: ${res.url}`);
            console.log(`ID:  ${res.id}`);
        } catch (err) {
            console.error('❌ Failed to publish post to Reddit:', err.message);
            process.exit(1);
        }
        return;
    }

    console.log(`
Desk2Quant Reddit Automation CLI

Commands:
  node scripts/reddit.mjs --set-token <token>             Save Reddit Bearer token
  node scripts/reddit.mjs --set-cookie <session_cookie>   Save Reddit session cookie
  node scripts/reddit.mjs --status                        Check connection & account status
  node scripts/reddit.mjs --post "Title" "Text" [sr]      Publish text/markdown post
  node scripts/reddit.mjs --post-file <file> "Title" [sr] Publish markdown file to Reddit
`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(err => {
        console.error('Unexpected error:', err);
        process.exit(1);
    });
}
