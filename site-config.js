/* Shared public copy and trust signals. Keep numbers here; do not duplicate them in pages. */
window.QUANT_MENTOR = Object.freeze({
    canonicalOrigin: 'https://desk2quant.com',
    brandName: 'Desk2Quant',
    brandDescriptor: 'Desk-Ready Quant Finance Preparation',
    stats: Object.freeze({
        products: 36,
        paidProducts: 33,
        reviews: 25,
        averageRating: 5.0,
        mentees: 50,
        resourceUsers: 500
    })
});

/* Website positioning v2 — Change #1: homepage hero only.
   This intentionally leaves checkout, product rendering, delivery, and backend logic untouched.
   Once approved, the same copy can be promoted into the static HTML/SEO metadata. */
(function applyHomepageHeroV2() {
    function apply() {
        const hero = document.getElementById('hero');
        if (!hero) return;

        const headline = document.getElementById('heroHeadline');
        if (headline) {
            headline.setAttribute('aria-label', 'From Quant Theory to Desk-Ready Practice');
            headline.innerHTML = 'From Quant Theory to <span class="gradient-text">Desk-Ready Practice</span>';
        }

        const subcopy = hero.querySelector('.hero-subcopy');
        if (subcopy) {
            subcopy.innerHTML = '<strong>Learn the model. Implement it. Break it. Validate it. Explain it in an interview.</strong><br>Practitioner-built training for derivatives pricing, numerical methods, XVA, risk, model validation, and quantitative interviews.';
        }

        const proofRow = hero.querySelector('.hero-proof-row');
        if (proofRow) {
            proofRow.innerHTML = '<span><i class="fas fa-chart-line"></i> Pricing &amp; XVA</span><span><i class="fas fa-shield-alt"></i> Risk &amp; validation</span><span><i class="fas fa-terminal"></i> Python &amp; C++</span>';
        }

        const cta = hero.querySelector('.hero-cta');
        if (cta) {
            cta.innerHTML = '<a href="#choose-path" class="btn btn-primary">Find Your Quant Path <i class="fas fa-arrow-right"></i></a><a href="#products" class="btn btn-secondary">Explore Complete Bundle</a>';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply, { once: true });
    } else {
        apply();
    }
})();
