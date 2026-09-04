import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function loadConfig() {
    let token = process.env.VERCEL_TOKEN;
    let projectId = process.env.VERCEL_PROJECT_ID;
    let teamId = process.env.VERCEL_TEAM_ID;

    const envPath = path.join(ROOT, '.env.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
            const idx = line.indexOf('=');
            if (idx !== -1) {
                const key = line.slice(0, idx).trim();
                const val = line.slice(idx + 1).trim();
                if (key === 'VERCEL_TOKEN' && !token) token = val;
                if (key === 'VERCEL_PROJECT_ID' && !projectId) projectId = val;
                if (key === 'VERCEL_TEAM_ID' && !teamId) teamId = val;
            }
        }
    }

    if (!token) {
        throw new Error('VERCEL_TOKEN not found in environment or .env.local');
    }

    return { token, projectId: projectId || 'prj_UcS0VGCet8TPsTKkrZQNKKbWKA0X', teamId: teamId || 'team_Uixpzk6xQLWJ0JpstFnomXfG' };
}

export async function vercelRequest(endpoint, options = {}, retries = 3) {
    const { token, teamId } = loadConfig();
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = endpoint.startsWith('http')
        ? endpoint
        : `https://api.vercel.com${endpoint}${teamId ? `${separator}teamId=${teamId}` : ''}`;

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, { ...options, headers });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(`Vercel API error (${res.status}): ${JSON.stringify(data)}`);
            }
            return data;
        } catch (err) {
            if (attempt === retries || err.message.startsWith('Vercel API error')) {
                throw err;
            }
            await new Promise(r => setTimeout(r, 500 * attempt));
        }
    }
}

async function main() {
    const [,, command = 'status', ...args] = process.argv;
    const { projectId } = loadConfig();

    if (command === 'status' || command === 'project') {
        console.log('Fetching Vercel project status...');
        const proj = await vercelRequest(`/v9/projects/${projectId}`);
        console.log('\n--- Vercel Project ---');
        console.log(`Name:        ${proj.name}`);
        console.log(`ID:          ${proj.id}`);
        console.log(`Framework:   ${proj.framework || 'Custom / Static + Node Serverless'}`);
        console.log(`Build Cmd:   ${proj.buildCommand || 'default'}`);
        console.log(`Updated:     ${new Date(proj.updatedAt).toLocaleString()}`);
        if (proj.targets?.production) {
            const prod = proj.targets.production;
            console.log('\n--- Production Deployment ---');
            console.log(`Deployment:  ${prod.id} (${prod.readyState})`);
            console.log(`URL:         https://${prod.url}`);
            console.log(`Commit:      ${prod.meta?.githubCommitSha?.slice(0, 7) || 'N/A'} - ${prod.meta?.githubCommitMessage?.slice(0, 60) || 'N/A'}`);
            console.log(`Author:      ${prod.meta?.githubCommitAuthorName || prod.creator?.username || 'N/A'}`);
            console.log(`Created:     ${new Date(prod.createdAt).toLocaleString()}`);
            console.log(`Domains:     ${(prod.alias || []).join(', ')}`);
        }
    } else if (command === 'deployments' || command === 'list') {
        const limit = args[0] || 5;
        console.log(`Fetching latest ${limit} deployments...`);
        const data = await vercelRequest(`/v6/deployments?projectId=${projectId}&limit=${limit}`);
        const rows = (data.deployments || []).map(d => ({
            id: d.uid,
            state: d.state,
            target: d.target || 'preview',
            commit: d.meta?.githubCommitSha ? `${d.meta.githubCommitSha.slice(0, 7)}: ${d.meta.githubCommitMessage?.slice(0, 35)}...` : 'manual',
            created: new Date(d.created).toLocaleString(),
            url: `https://${d.url}`
        }));
        console.table(rows);
    } else if (command === 'domains') {
        console.log('Fetching project domains...');
        const data = await vercelRequest(`/v9/projects/${projectId}/domains`);
        const rows = (data.domains || []).map(d => ({
            domain: d.name,
            verified: d.verified ? '✅ Verified' : '❌ Unverified',
            apex: d.apexName,
            redirect: d.redirect || 'none',
            createdAt: new Date(d.createdAt).toLocaleDateString()
        }));
        console.table(rows);
    } else if (command === 'env') {
        console.log('Fetching project environment variables (metadata only)...');
        const data = await vercelRequest(`/v9/projects/${projectId}/env`);
        const rows = (data.envs || []).map(e => ({
            key: e.key,
            type: e.type,
            target: (e.target || []).join(', '),
            updatedAt: new Date(e.updatedAt).toLocaleDateString()
        }));
        console.table(rows);
    } else if (command === 'logs') {
        const depId = args[0];
        if (!depId) {
            // Get latest deployment ID
            const proj = await vercelRequest(`/v9/projects/${projectId}`);
            const latestId = proj.targets?.production?.id;
            console.log(`No deployment ID specified, fetching logs for latest production deployment: ${latestId}`);
            const events = await vercelRequest(`/v3/deployments/${latestId}/events?direction=backward&limit=30`);
            for (const ev of (events || []).reverse()) {
                console.log(`[${new Date(ev.created).toISOString().slice(11, 19)}] ${ev.text || ev.type || ''}`);
            }
        } else {
            console.log(`Fetching logs for deployment ${depId}...`);
            const events = await vercelRequest(`/v3/deployments/${depId}/events?direction=backward&limit=30`);
            for (const ev of (events || []).reverse()) {
                console.log(`[${new Date(ev.created).toISOString().slice(11, 19)}] ${ev.text || ev.type || ''}`);
            }
        }
    } else {
        console.log(`Unknown command: ${command}`);
        console.log('Usage: node scripts/vercel.mjs <status|deployments|domains|env|logs> [args]');
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(err => {
        console.error('Vercel Error:', err.message);
        process.exitCode = 1;
    });
}
