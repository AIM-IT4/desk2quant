(function () {
    'use strict';

    const BUNDLE_ID = '164308cd-e3cd-4026-8fdc-337a5955ffff';
    const INCLUDED = [
        ['bdb3c59e-c8c0-430f-8705-b7467514458e', 'Derivatives Products & Pricing Master Pack'],
        ['75f6118b-c10e-43c6-acc6-ec48cd6a6cbc', 'Quant Models by Asset Class Master Pack'],
        ['73806d69-768b-497e-87b7-d94fa4cfd772', '1000+ Quant Interview Problem Book'],
        ['a778e6ae-43d1-4cbd-a6a7-6dce693e5f69', 'Model Validation Case Study Pack'],
        ['351aa09b-681b-4da9-9b61-844cf295640c', 'XVA Calculus Lab'],
        ['6b78550d-e130-41d1-9409-92335ce82a6c', 'Numerical Methods for Quants'],
        ['9ad9f8ac-9872-40c3-82b8-1e6168e65062', 'Python for Quants'],
        ['6f4d2332-a1d0-4638-9307-0e2d9fe7453d', 'Stochastic Calculus for Quants'],
        ['1d425519-ab39-4aa7-92fa-2d42c42946d6', 'Statistics & Econometrics for Quants']
    ];

    function isBundlePage() {
        try {
            return String(new URLSearchParams(location.search).get('id') || '').replace(/^['"]|['"]$/g, '') === BUNDLE_ID;
        } catch (_) {
            return false;
        }
    }
    if (!isBundlePage()) return;

    function money(n) {
        return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
    }

    function addStyles() {
        if (document.getElementById('bundle-proof-v3-styles')) return;
        const style = document.createElement('style');
        style.id = 'bundle-proof-v3-styles';
        style.textContent = `
            .bundle-proof-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;align-items:start}
            .bundle-value-card,.bundle-compare-card,.bundle-proof-reviews{background:#fff;border:1px solid #dfe7e5;border-radius:18px;padding:24px;box-shadow:0 8px 24px rgba(15,23,42,.04)}
            .bundle-value-card h3,.bundle-compare-card h3{margin:0 0 8px;color:#111827;font-size:1.15rem}
            .bundle-proof-muted{margin:0 0 18px;color:#6b7280;font-size:.88rem;line-height:1.6}
            .bundle-live-items{display:grid;gap:8px;margin:0 0 18px}
            .bundle-live-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;padding:10px 0;border-top:1px solid #eef2f1;color:#374151;font-size:.86rem;line-height:1.4}
            .bundle-live-row:first-child{border-top:0}
            .bundle-live-row b{color:#111827;white-space:nowrap}
            .bundle-value-total{display:grid;grid-template-columns:1fr auto;gap:14px;padding:15px;border-radius:12px;background:#eefaf8;color:#0f5f59;font-weight:800}
            .bundle-value-caveat{margin:10px 0 0;color:#6b7280;font-size:.76rem;line-height:1.5}
            .bundle-savings-stack{display:grid;gap:10px;margin-top:16px}
            .bundle-saving{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #dfe7e5;border-radius:11px;color:#4b5563;font-size:.86rem}
            .bundle-saving strong{color:#0f766e}
            .bundle-compare-table{display:grid;gap:10px;margin-top:16px}
            .bundle-compare-row{display:grid;grid-template-columns:1.1fr .9fr .9fr;gap:8px;align-items:center;padding:11px 0;border-top:1px solid #eef2f1;font-size:.84rem;color:#4b5563}
            .bundle-compare-row:first-child{border-top:0;color:#111827;font-weight:800}
            .bundle-compare-good{color:#0f766e;font-weight:800}
            .bundle-proof-cta{width:100%;margin-top:18px;border:0;border-radius:10px;padding:13px 16px;background:#0f766e;color:#fff;font:inherit;font-weight:800;cursor:pointer}
            .bundle-proof-reviews{margin-top:18px}
            .bundle-proof-review-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}
            .bundle-proof-review{padding:17px;border:1px solid #dfe7e5;border-radius:13px;background:#fbfdfc}
            .bundle-proof-stars{color:#0f766e;font-size:.78rem;letter-spacing:.05em;margin-bottom:9px}
            .bundle-proof-review blockquote{margin:0 0 12px;color:#374151;font-size:.86rem;line-height:1.58}
            .bundle-proof-review strong{display:block;color:#111827;font-size:.82rem}
            .bundle-proof-review span{color:#6b7280;font-size:.74rem}
            .bundle-proof-loading{color:#6b7280;font-size:.86rem}
            @media(max-width:900px){.bundle-proof-grid{grid-template-columns:1fr}.bundle-proof-review-grid{grid-template-columns:1fr}}
            @media(max-width:520px){.bundle-value-card,.bundle-compare-card,.bundle-proof-reviews{padding:19px}.bundle-compare-row{grid-template-columns:1fr .75fr .75fr;font-size:.77rem}}
        `;
        document.head.appendChild(style);
    }

    function createSection() {
        if (document.getElementById('bundle-proof')) return;
        const learning = document.getElementById('bundle-learning-path');
        if (!learning) return;

        const section = document.createElement('section');
        section.className = 'bundle-v2-section';
        section.id = 'bundle-proof';
        section.innerHTML = `
            <div class="bundle-section-head">
                <span>Value + proof</span>
                <h2>See what the ₹7,999 bundle replaces.</h2>
                <p>Instead of a vague “worth ₹X” claim, this comparison uses live standalone prices for selected resources that are already included in the bundle.</p>
            </div>
            <div class="bundle-proof-grid">
                <article class="bundle-value-card">
                    <h3>Selected included resources</h3>
                    <p class="bundle-proof-muted">Current standalone catalogue prices are loaded read-only from Desk2Quant's product catalogue.</p>
                    <div class="bundle-live-items" id="bundle-live-items"><div class="bundle-proof-loading">Loading current catalogue prices…</div></div>
                    <div class="bundle-value-total"><span>Selected resources alone</span><span id="bundle-selected-total">—</span></div>
                    <p class="bundle-value-caveat">This is intentionally only a selected subset, not an inflated sum of every file inside the bundle.</p>
                </article>
                <article class="bundle-compare-card">
                    <h3>Bundle economics</h3>
                    <p class="bundle-proof-muted">The Complete Bundle's configured list value is ₹12,999. Its current selling price is ₹7,999.</p>
                    <div class="bundle-savings-stack">
                        <div class="bundle-saving"><span>Bundle price</span><strong>₹7,999</strong></div>
                        <div class="bundle-saving"><span>Saving vs configured list value</span><strong>₹5,000</strong></div>
                        <div class="bundle-saving"><span>With COMBINED10</span><strong>≈ ₹7,199</strong></div>
                        <div class="bundle-saving"><span>Saving vs list value with coupon</span><strong>≈ ₹5,800</strong></div>
                    </div>
                    <div class="bundle-compare-table" aria-label="Individual resources versus complete bundle">
                        <div class="bundle-compare-row"><span></span><span>Individual</span><span>Bundle</span></div>
                        <div class="bundle-compare-row"><span>Structured learning path</span><span>Fragmented</span><span class="bundle-compare-good">Included</span></div>
                        <div class="bundle-compare-row"><span>Pricing + risk + XVA + validation</span><span>Pick separately</span><span class="bundle-compare-good">Together</span></div>
                        <div class="bundle-compare-row"><span>Projects + interview bank</span><span>Separate</span><span class="bundle-compare-good">Included</span></div>
                    </div>
                    <button type="button" class="bundle-proof-cta" id="bundle-proof-buy">Get Complete Bundle <i class="fas fa-arrow-right"></i></button>
                </article>
            </div>
            <div class="bundle-proof-reviews" id="bundle-context-reviews">
                <div class="bundle-section-head" style="margin-bottom:0;">
                    <span>Relevant learner feedback</span>
                    <h2 style="font-size:clamp(1.35rem,2.4vw,1.9rem);">Proof closer to the buying decision.</h2>
                    <p>Product-related feedback is shown here; the full review carousel remains unchanged below.</p>
                </div>
                <div class="bundle-proof-review-grid" id="bundle-proof-review-grid"><div class="bundle-proof-loading">Loading published product feedback…</div></div>
            </div>`;
        learning.insertAdjacentElement('beforebegin', section);

        const nav = document.querySelector('.bundle-sticky-inner');
        if (nav && !nav.querySelector('a[href="#bundle-proof"]')) {
            const link = document.createElement('a');
            link.href = '#bundle-proof';
            link.textContent = 'Value';
            const reviewsLink = nav.querySelector('a[href="#reviews-section"]');
            nav.insertBefore(link, reviewsLink || null);
        }

        const buy = document.getElementById('buy-btn');
        const proofBuy = document.getElementById('bundle-proof-buy');
        if (buy && proofBuy) proofBuy.addEventListener('click', () => buy.click());
    }

    async function waitForClient(maxMs) {
        const started = Date.now();
        while (Date.now() - started < maxMs) {
            if (window.supabaseClient && typeof window.supabaseClient.from === 'function') return window.supabaseClient;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return null;
    }

    async function loadLivePrices(client) {
        const host = document.getElementById('bundle-live-items');
        if (!host || !client) return;
        try {
            const ids = INCLUDED.map(x => x[0]);
            const { data, error } = await client.from('products').select('id,name,price').in('id', ids);
            if (error || !Array.isArray(data)) throw error || new Error('No product data');
            const byId = new Map(data.map(p => [String(p.id), p]));
            host.textContent = '';
            let total = 0;
            INCLUDED.forEach(([id, fallback]) => {
                const p = byId.get(id);
                if (!p) return;
                const price = Number(p.price) || 0;
                total += price;
                const row = document.createElement('div');
                row.className = 'bundle-live-row';
                const name = document.createElement('span');
                const amount = document.createElement('b');
                name.textContent = p.name || fallback;
                amount.textContent = money(price);
                row.append(name, amount);
                host.appendChild(row);
            });
            const totalEl = document.getElementById('bundle-selected-total');
            if (totalEl) totalEl.textContent = money(total);
        } catch (err) {
            host.textContent = 'Live price comparison is temporarily unavailable. The bundle price and checkout remain unaffected.';
        }
    }

    async function loadReviews(client) {
        const grid = document.getElementById('bundle-proof-review-grid');
        if (!grid || !client) return;
        try {
            const { data: links, error: linkError } = await client
                .from('product_reviews')
                .select('testimonial_id,display_order')
                .eq('product_id', BUNDLE_ID)
                .order('display_order', { ascending: true });
            if (linkError || !Array.isArray(links) || !links.length) throw linkError || new Error('No reviews');
            const ids = links.map(x => x.testimonial_id);
            const { data: reviews, error: reviewError } = await client
                .from('testimonials')
                .select('id,name,title,rating,review,product,is_published')
                .in('id', ids)
                .eq('is_published', true);
            if (reviewError || !Array.isArray(reviews)) throw reviewError || new Error('No testimonials');

            const order = new Map(links.map(x => [x.testimonial_id, Number(x.display_order) || 0]));
            const relevant = reviews
                .filter(r => /quant notes|resource|content/i.test(String(r.product || '') + ' ' + String(r.title || '')))
                .sort((a, b) => (order.get(a.id) || 0) - (order.get(b.id) || 0));
            const chosen = (relevant.length >= 3 ? relevant : reviews).slice(0, 3);
            if (!chosen.length) throw new Error('No published feedback');

            grid.textContent = '';
            chosen.forEach(r => {
                const card = document.createElement('article');
                card.className = 'bundle-proof-review';
                const stars = document.createElement('div');
                stars.className = 'bundle-proof-stars';
                stars.textContent = '★★★★★';
                const quote = document.createElement('blockquote');
                quote.textContent = r.review || '';
                const author = document.createElement('strong');
                author.textContent = r.name || 'Desk2Quant learner';
                const title = document.createElement('span');
                title.textContent = r.title || 'Published feedback';
                card.append(stars, quote, author, title);
                grid.appendChild(card);
            });
        } catch (err) {
            grid.textContent = 'Published feedback remains available in the review carousel below.';
        }
    }

    async function init() {
        addStyles();
        let tries = 0;
        const timer = setInterval(async () => {
            tries += 1;
            if (document.getElementById('bundle-learning-path')) {
                clearInterval(timer);
                createSection();
                const client = await waitForClient(5000);
                if (client) await Promise.all([loadLivePrices(client), loadReviews(client)]);
            } else if (tries > 100) {
                clearInterval(timer);
            }
        }, 100);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
