import { gradeSubmission } from '../lib/gauntletGrading.js';
import { verifyProjectEntitlement } from './_gauntlet-entitlement.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Gauntlet grading is multiplexed onto this route because the Vercel Hobby
    // plan caps us at 12 serverless functions and we are at 12. Same pattern
    // api/interview.js already uses.
    if (req.query.action === 'grade') {
        res.setHeader('Cache-Control', 'no-store');
        return handleGrade(req, res);
    }

    if (req.query.action === 'kit') {
        res.setHeader('Cache-Control', 'no-store');
        return handleKit(req, res);
    }

    // Cache for 5 minutes, serve stale for 10 min
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_OhbTYIuMYgGgmKPQJ9W7RA_rhKyaad0';

    try {
        // Use fetch (same pattern as razorpay-webhook.js and reminders.js)
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/products?select=id,name,description,price,cover_image_url,file_url,created_at&order=created_at.desc`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error('Supabase products error:', response.status, errText);
            return res.status(response.status).json({ error: 'Failed to fetch from Supabase', detail: errText.substring(0, 200) });
        }

        const products = await response.json();

        // Format for readability (strip HTML, clean up for LLMs and bots)
        const formatted = products.map(p => ({
            id: p.id,
            name: p.name,
            description: stripHtml(p.description),
            price: p.price === 0 ? 'Free' : `₹${p.price}`,
            priceINR: p.price,
            coverImage: p.cover_image_url || null,
            downloadUrl: Number(p.price) === 0 ? p.file_url : null,
            purchaseUrl: p.price > 0
                ? `https://desk2quant.com/?id=${p.id}`
                : 'https://desk2quant.com/#resources',
            createdAt: p.created_at
        }));

        const paid = formatted.filter(p => p.priceINR > 0);
        const free = formatted.filter(p => p.priceINR === 0);

        return res.status(200).json({
            site: 'Desk2Quant - desk2quant.com',
            description: 'Premium digital products for quantitative finance professionals. Curated study materials, coding scripts, and interview guides.',
            totalProducts: formatted.length,
            paidProducts: { count: paid.length, items: paid },
            freeResources: { count: free.length, items: free },
            allProducts: formatted
        });

    } catch (error) {
        console.error('Products API Error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch products', message: error.message });
    }
}

function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/p>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/* ------------------------------------------------------------------------- *
 * Gauntlet grading
 *
 * The hidden tests CANNOT live in a repo file: vercel.json sets
 * outputDirectory "." so the whole repo root is web-served, and I verified
 * api/*.js and lib/*.js return 200 publicly. They come from the
 * GAUNTLET_TESTS env var instead, which is never served.
 *
 * Free warm-up (00) is open. Paid projects require a verified purchase.
 * ------------------------------------------------------------------------- */

const FREE_PROJECTS = ['00-warmup-bond'];
const SLUG_RE = /^[0-9]{2}-[a-z0-9-]{2,40}$/;

function loadTestBank() {
    const raw = process.env.GAUNTLET_TESTS;
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (err) {
        console.error('GAUNTLET_TESTS is not valid JSON:', err.message);
        return null;
    }
}

/**
 * Serve a paid project's starter + public tests to a verified buyer.
 *
 * The files are deliberately NOT deployed (.vercelignore) because they are the
 * paid deliverable, so they come from the GAUNTLET_KITS env var instead of the
 * filesystem. Free projects are served as static files and never reach here.
 */
async function handleKit(req, res) {
    const project = String(req.query.project || '');
    if (!SLUG_RE.test(project)) {
        return res.status(400).json({ error: 'Unknown project.' });
    }

    const ent = await verifyProjectEntitlement(
        project,
        req.query.payment_id,
        req.query.email
    );
    if (!ent.ok) return res.status(ent.status).json({ error: ent.error });

    let kits;
    try {
        kits = JSON.parse(process.env.GAUNTLET_KITS || '{}');
    } catch (err) {
        console.error('GAUNTLET_KITS is not valid JSON:', err.message);
        return res.status(503).json({ error: 'Project files unavailable.' });
    }

    const kit = kits[project];
    if (!kit || !kit.starter) {
        return res.status(404).json({ error: 'No files for that project.' });
    }
    return res.status(200).json({ starter: kit.starter, tests: kit.tests || '' });
}

async function handleGrade(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST required' });
    }

    const { project, submission } = req.body || {};

    if (typeof project !== 'string' || !SLUG_RE.test(project)) {
        return res.status(400).json({ error: 'Unknown project.' });
    }
    if (!submission || typeof submission !== 'object' || Array.isArray(submission)) {
        return res.status(400).json({ error: 'submission must be a JSON object.' });
    }
    // Bound the payload: grading is pure arithmetic over a handful of numbers.
    if (Object.keys(submission).length > 40) {
        return res.status(400).json({ error: 'Submission has too many fields.' });
    }

    const bank = loadTestBank();
    if (!bank) {
        return res.status(503).json({
            error: 'Instant grading is not configured yet. Email submission.json to hello@desk2quant.com and you will get a scorecard back.'
        });
    }

    const entry = bank[project];
    if (!entry || !Array.isArray(entry.tests)) {
        return res.status(404).json({ error: 'No hidden tests for that project yet.' });
    }

    // Paid projects require a Razorpay-verified purchase. Checked before
    // grading so a non-buyer cannot use the grader as an answer oracle.
    if (!FREE_PROJECTS.includes(project)) {
        const { payment_id: paymentId, email } = req.body || {};
        const ent = await verifyProjectEntitlement(project, paymentId, email);
        if (!ent.ok) {
            return res.status(ent.status).json({ error: ent.error, needsUnlock: true });
        }
    }

    try {
        const result = gradeSubmission(entry.tests, submission);
        // Never echo expected values or diffs -- that would turn the grader
        // into a brute-forceable oracle. Only id/ok/points/hint go back.
        return res.status(200).json({
            project,
            score: result.score,
            passed: result.passed,
            testsPassed: result.testsPassed,
            testsTotal: result.testsTotal,
            results: (result.results || []).map(r => ({
                id: r.id,
                ok: r.ok,
                points: r.points,
                maxPoints: r.maxPoints,
                hint: r.ok ? undefined : r.hint
            }))
        });
    } catch (err) {
        console.error('Gauntlet grading error:', err.message);
        return res.status(500).json({ error: 'Grading failed.' });
    }
}
