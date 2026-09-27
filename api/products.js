import { handleMentorPublic } from '../lib/guestMentors.js';
import { getServiceKey, blockIfUnconfigured } from '../lib/supabaseAdmin.js';
import { handleQuantAgentAdvanced } from '../lib/quantAgentAdvanced.js';
import { getDriveAccessToken } from '../lib/secureDownload.js';

const MICROSTRUCTURE_SAMPLE_FILE_ID = '1BLNufr0B5zvnTWPV2lmlLNj17RQUJ8z-';
const MICROSTRUCTURE_SAMPLE_FILENAME = 'Desk2Quant_Market_Microstructure_6Page_Sample.pdf';
const FAST_GREEKS_SAMPLE_FILE_ID = '1uBT4K39xt0Vx6_-5OwhwqdzZbbB7E1i2';
const FAST_GREEKS_SAMPLE_FILENAME = 'Desk2Quant_Fast_Greeks_AAD_SIMM_MVA_6Page_Sample.pdf';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.query?.action === 'mentors' || req.body?.action === 'mentor-confirm') return handleMentorPublic(req, res);

    // Public, deliberately limited 6-page product sample. The source PDF stays
    // private in Drive; only this dedicated sample file is exposed through the
    // existing products route so we do not consume another Vercel function.
    if (req.method === 'GET' && req.query.sample === 'market-microstructure') {
        return handleMicrostructureSample(res);
    }

    if (req.method === 'GET' && req.query.sample === 'fast-greeks') {
        return handleFastGreeksSample(res);
    }

    // Quant Agent shares this serverless route because Vercel Hobby caps the
    // project at 12 functions. Advanced handler owns adaptive assessment/RAG
    // actions and delegates ordinary auth/progress/run actions to the core.
    if (req.method === 'POST' && String(req.body?.action || '').startsWith('agent-')) {
        return handleQuantAgentAdvanced(req, res);
    }

    // Cache for 5 minutes, serve stale for 10 min
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    // Service role: RLS denies `anon` SELECT on products, so the old inline
    // anon-key fallback made this route return an empty catalog — the storefront
    // renders "no products" instead of failing visibly. file_url is stripped
    // below before anything reaches the client.
    if (blockIfUnconfigured(res, 'products')) return;
    const SUPABASE_KEY = getServiceKey();

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

async function handleMicrostructureSample(res) {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (!clientEmail || !privateKey) {
        return res.status(503).json({ error: 'Sample preview is temporarily unavailable.' });
    }

    try {
        const token = await getDriveAccessToken(clientEmail, privateKey);
        const driveResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${MICROSTRUCTURE_SAMPLE_FILE_ID}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!driveResponse.ok) {
            const detail = await driveResponse.text();
            console.error('Microstructure sample Drive fetch failed:', driveResponse.status, detail.substring(0, 200));
            return res.status(502).json({ error: 'Sample preview is temporarily unavailable.' });
        }

        const bytes = Buffer.from(await driveResponse.arrayBuffer());
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(bytes.length));
        res.setHeader('Content-Disposition', `inline; filename="${MICROSTRUCTURE_SAMPLE_FILENAME}"`);
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        return res.status(200).end(bytes);
    } catch (error) {
        console.error('Microstructure sample error:', error.message);
        return res.status(500).json({ error: 'Sample preview is temporarily unavailable.' });
    }
}


async function handleFastGreeksSample(res) {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (!clientEmail || !privateKey) {
        return res.status(503).json({ error: 'Sample preview is temporarily unavailable.' });
    }

    try {
        const token = await getDriveAccessToken(clientEmail, privateKey);
        const driveResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${FAST_GREEKS_SAMPLE_FILE_ID}?alt=media`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!driveResponse.ok) {
            const detail = await driveResponse.text();
            console.error('Fast Greeks sample Drive fetch failed:', driveResponse.status, detail.substring(0, 200));
            return res.status(502).json({ error: 'Sample preview is temporarily unavailable.' });
        }

        const bytes = Buffer.from(await driveResponse.arrayBuffer());
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(bytes.length));
        res.setHeader('Content-Disposition', `inline; filename="${FAST_GREEKS_SAMPLE_FILENAME}"`);
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        return res.status(200).end(bytes);
    } catch (error) {
        console.error('Fast Greeks sample error:', error.message);
        return res.status(500).json({ error: 'Sample preview is temporarily unavailable.' });
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
