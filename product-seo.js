(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.Desk2QuantProductSeo = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SITE_URL = 'https://desk2quant.com';

    // Product IDs are stable even when marketing names change. Keep the most
    // valuable search landing pages on short, durable URLs and fall back to a
    // deterministic name-based slug for the rest of the catalog.
    const CURATED_SLUGS_BY_ID = Object.freeze({
        '73806d69-768b-497e-87b7-d94fa4cfd772': 'quant-interview-problem-book',
        'c3e4c5cc-6616-4728-b979-782bec4d8811': 'cpp-for-quants',
        '9ad9f8ac-9872-40c3-82b8-1e6168e65062': 'python-for-quants',
        '6f4d2332-a1d0-4638-9307-0e2d9fe7453d': 'stochastic-calculus-for-quants',
        '6b78550d-e130-41d1-9409-92335ce82a6c': 'numerical-methods-for-quants',
        'a778e6ae-43d1-4cbd-a6a7-6dce693e5f69': 'model-validation-quant-interview',
        '146ecb42-3df6-41de-a499-14c22b1bd36d': 'pnl-attribution-for-quants',
        '351aa09b-681b-4da9-9b61-844cf295640c': 'xva-calculus-lab'
    });

    function slugifyProductName(name) {
        return String(name || '')
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/\+/g, ' plus ')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 70)
            .replace(/-+$/g, '') || 'product';
    }

    function getProductSlug(product) {
        const id = product && product.id != null ? String(product.id) : '';
        return CURATED_SLUGS_BY_ID[id] || slugifyProductName(product && product.name);
    }

    function getProductPath(product) {
        return `/products/${getProductSlug(product)}.html`;
    }

    function getProductUrl(product) {
        return `${SITE_URL}${getProductPath(product)}`;
    }

    return Object.freeze({
        SITE_URL,
        CURATED_SLUGS_BY_ID,
        slugifyProductName,
        getProductSlug,
        getProductPath,
        getProductUrl
    });
});
