// Product recommendation assistant.
//
// Grounded strictly in the live products table: the model is given the real
// catalog (name, price, slug) and told to recommend only from it, so it cannot
// invent products, prices, or URLs. Runs as an `action: 'chat'` branch on
// api/interview.js because the Vercel Hobby plan caps this project at 12
// serverless functions and all 12 are in use.

const MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 700;
const MAX_MSG_CHARS = 600;
const MAX_HISTORY = 8;

// Per-IP limiter. Serverless instances are short-lived and not shared, so this
// is a speed bump against casual abuse, not a hard guarantee.
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;

export function rateLimit(ip) {
    const now = Date.now();
    const list = (HITS.get(ip) || []).filter(t => now - t < WINDOW_MS);
    if (list.length >= MAX_PER_WINDOW) {
        return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - list[0])) / 1000) };
    }
    list.push(now);
    HITS.set(ip, list);
    if (HITS.size > 500) {
        for (const [k, v] of HITS) if (!v.some(t => now - t < WINDOW_MS)) HITS.delete(k);
    }
    return { ok: true };
}

// Must stay identical to slugify() in scripts/generate-seo-pages.js, which
// generated the real /products/<slug>.html files -- a divergent slug means the
// assistant hands visitors 404 links.
function slugify(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/\+/g, ' plus ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 70)
        .replace(/-+$/g, '') || 'product';
}

export async function fetchCatalog(supabaseUrl, supabaseKey) {
    const resp = await fetch(
        `${supabaseUrl}/rest/v1/products?select=name,price,description&order=price.desc`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!resp.ok) throw new Error(`catalog fetch ${resp.status}`);
    return (await resp.json()).map(p => ({
        name: p.name,
        price: Number(p.price) || 0,
        slug: slugify(p.name),
        blurb: String(p.description || '').replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ').trim().slice(0, 160)
    }));
}

export function buildSystemPrompt(catalog) {
    const lines = catalog.map(p =>
        `- ${p.name} | ${p.price === 0 ? 'FREE' : '₹' + p.price} | /products/${p.slug}.html | ${p.blurb}`
    ).join('\n');

    return [
        'You are the Desk2Quant product advisor. Desk2Quant sells self-study material',
        'for people preparing for quant finance roles (quant research, risk, model',
        'validation, trading desk support).',
        '',
        'Your only job is to understand the visitor\'s background and goal, then',
        'recommend products from the catalog below.',
        '',
        'RULES:',
        '1. Recommend ONLY products from this catalog. Never invent a product.',
        '2. Quote prices EXACTLY as listed. Never estimate, convert, or discount.',
        '3. Link using the exact /products/<slug>.html path given.',
        '4. Recommend at most 3 products. Fewer is better. Say why each one fits.',
        '5. If you need to know their level or target role, ask ONE short question.',
        '6. Never promise job outcomes, interview success, referrals, or salaries.',
        '7. Do not invent coupons or discounts. If asked, say current offers are shown on the site.',
        '8. Off-topic requests (general coding help, homework, unrelated chat): decline',
        '   briefly and steer back to picking material.',
        '9. Be concise: 120 words maximum. No preamble, no bullet-point walls.',
        '10. You are not a substitute for the free 10-minute AI mock interview at /interview.html.',
        '',
        'CATALOG:',
        lines
    ].join('\n');
}

export function sanitizeHistory(messages) {
    if (!Array.isArray(messages)) return [];
    return messages
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-MAX_HISTORY)
        .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MSG_CHARS) }));
}

export async function askAdvisor({ groqKey, systemPrompt, history }) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'system', content: systemPrompt }, ...history],
            temperature: 0.4,
            max_tokens: MAX_TOKENS
        })
    });
    if (resp.status === 429) {
        const ra = resp.headers.get('retry-after') || '10';
        return { rateLimited: true, retryAfter: parseInt(ra, 10) || 10 };
    }
    if (!resp.ok) throw new Error(`groq ${resp.status}: ${(await resp.text()).slice(0, 160)}`);
    const j = await resp.json();
    return { reply: j.choices?.[0]?.message?.content?.trim() || '' };
}
