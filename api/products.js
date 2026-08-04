export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Cache for 5 minutes, serve stale for 10 min
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    if (req.method === 'OPTIONS') return res.status(200).end();

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
