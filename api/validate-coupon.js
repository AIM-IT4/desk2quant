import {
    fetchProductById,
    resolveProductDiscountPercent
} from '../lib/pricing.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ valid: false, discountPercent: null });
    }

    try {
        const code = String(req.body?.code || '').trim().toUpperCase();
        const productId = String(req.body?.product_id || '').trim();

        if (!code || !productId || !/^[A-Z0-9_-]{4,64}$/.test(code)) {
            return res.status(200).json({ valid: false, discountPercent: null });
        }

        const product = await fetchProductById(productId);
        if (!product) {
            return res.status(200).json({ valid: false, discountPercent: null });
        }

        const discountPercent = await resolveProductDiscountPercent(product, code);
        const valid = Number.isFinite(discountPercent) && discountPercent > 0;

        return res.status(200).json({
            valid,
            discountPercent: valid ? discountPercent : null
        });
    } catch (error) {
        console.error('validate-coupon failed:', error);
        return res.status(500).json({ valid: false, discountPercent: null });
    }
}
