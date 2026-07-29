// Validate a recommendation-email coupon by the exact code issued.
// No customer email or other identity input is required or returned.

const COUPON_PATTERN = /^[A-Z]{3,40}20$/;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!COUPON_PATTERN.test(code)) {
        return res.status(200).json({ valid: false, discount: 0 });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('Recommendation coupon validation is missing Supabase configuration');
        return res.status(500).json({ error: 'Coupon validation is unavailable' });
    }

    try {
        const query = new URLSearchParams({
            coupon_code: `eq.${code}`,
            status: 'eq.sent',
            select: 'id',
            limit: '1'
        });

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/recommendation_emails?${query.toString()}`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            const details = await response.text();
            console.error('Recommendation coupon lookup failed:', response.status, details);
            return res.status(500).json({ error: 'Coupon validation failed' });
        }

        const rows = await response.json();
        const valid = Array.isArray(rows) && rows.length > 0;
        return res.status(200).json({
            valid,
            discount: valid ? 20 : 0
        });
    } catch (error) {
        console.error('Recommendation coupon validation error:', error);
        return res.status(500).json({ error: 'Coupon validation failed' });
    }
}
