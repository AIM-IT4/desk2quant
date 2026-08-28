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

/*
 * Homepage sales hierarchy.
 * Frontend-only: no checkout, Razorpay, Supabase, delivery, email or API logic is changed here.
 * The live bundle URL/price/content below are taken from the current product page.
 */
(function () {
    const BUNDLE_URL = '/product.html?id=164308cd-e3cd-4026-8fdc-337a5955ffff';
    const BUNDLE_COVER = 'https://dntabmyurlrlnoajdnja.supabase.co/storage/v1/object/public/product-covers/complete_front_office___risk_quant_professional_bundle__41__high_quality_pdfs___60__scripts__cover_1780111596182.jpg';

    function applyHomepageSalesLayer() {
        if (!document.body || !document.getElementById('hero')) return;

        if (!document.getElementById('d2q-sales-layer-styles')) {
            const style = document.createElement('style');
            style.id = 'd2q-sales-layer-styles';
            style.textContent = `
                .hero-value-line {
                    margin: 12px 0 2px;
                    color: var(--text-muted);
                    font-size: .95rem;
                    font-weight: 600;
                }
                .hero-value-line strong { color: var(--text-primary); }
                .flagship-offer {
                    padding: 72px 0;
                    position: relative;
                    overflow: hidden;
                    background:
                        radial-gradient(circle at 85% 20%, rgba(34,211,238,.11), transparent 34%),
                        radial-gradient(circle at 10% 80%, rgba(139,92,246,.11), transparent 36%),
                        var(--bg-secondary);
                    border-top: 1px solid var(--border-light);
                    border-bottom: 1px solid var(--border-light);
                }
                .flagship-shell {
                    display: grid;
                    grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr);
                    gap: 40px;
                    align-items: center;
                    padding: 38px;
                    border: 1px solid rgba(56,189,248,.23);
                    border-radius: 22px;
                    background: linear-gradient(145deg, rgba(15,23,42,.92), rgba(17,24,39,.72));
                    box-shadow: 0 30px 80px rgba(0,0,0,.26);
                }
                .flagship-eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 7px 11px;
                    margin-bottom: 16px;
                    border-radius: 999px;
                    border: 1px solid rgba(34,211,238,.28);
                    background: rgba(34,211,238,.08);
                    color: #67e8f9;
                    font-weight: 800;
                    font-size: .77rem;
                    letter-spacing: .08em;
                    text-transform: uppercase;
                }
                .flagship-copy h2 {
                    margin: 0 0 14px;
                    max-width: 760px;
                    font-size: clamp(2rem, 4.2vw, 3.6rem);
                    line-height: 1.04;
                }
                .flagship-lede {
                    max-width: 760px;
                    margin: 0 0 24px;
                    color: var(--text-muted);
                    font-size: 1.05rem;
                    line-height: 1.7;
                }
                .flagship-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0,1fr));
                    gap: 11px 18px;
                    margin: 0 0 28px;
                }
                .flagship-point {
                    display: flex;
                    gap: 10px;
                    align-items: flex-start;
                    color: var(--text-primary);
                    font-size: .94rem;
                    line-height: 1.5;
                }
                .flagship-point i { color: #22d3ee; margin-top: 4px; }
                .flagship-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .flagship-price {
                    display: flex;
                    align-items: baseline;
                    gap: 10px;
                    margin: 0 0 18px;
                }
                .flagship-price strong {
                    font-size: 2.25rem;
                    line-height: 1;
                    color: var(--text-primary);
                }
                .flagship-price span {
                    color: var(--text-muted);
                    font-size: .9rem;
                }
                .flagship-coupon {
                    margin-top: 13px;
                    color: var(--text-muted);
                    font-size: .9rem;
                }
                .flagship-coupon code {
                    padding: 3px 7px;
                    border: 1px dashed rgba(34,211,238,.5);
                    border-radius: 6px;
                    color: #67e8f9;
                    background: rgba(34,211,238,.07);
                    font-family: 'JetBrains Mono', monospace;
                }
                .flagship-cover-wrap {
                    position: relative;
                    min-height: 360px;
                    display: grid;
                    place-items: center;
                }
                .flagship-cover-wrap::before {
                    content: '';
                    position: absolute;
                    width: 78%;
                    aspect-ratio: 1;
                    border-radius: 50%;
                    background: rgba(34,211,238,.14);
                    filter: blur(52px);
                }
                .flagship-cover {
                    position: relative;
                    z-index: 1;
                    width: min(100%, 330px);
                    max-height: 420px;
                    object-fit: contain;
                    border-radius: 14px;
                    box-shadow: 0 26px 70px rgba(0,0,0,.5);
                    transform: rotate(1.2deg);
                }
                .flagship-trust {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                    margin-top: 23px;
                    color: var(--text-muted);
                    font-size: .83rem;
                }
                .flagship-trust span { display: inline-flex; align-items: center; gap: 6px; }
                .flagship-trust i { color: #22c55e; }
                @media (max-width: 900px) {
                    .flagship-shell { grid-template-columns: 1fr; padding: 28px; }
                    .flagship-cover-wrap { min-height: 260px; order: -1; }
                    .flagship-cover { width: min(78vw, 300px); max-height: 340px; }
                }
                @media (max-width: 620px) {
                    .flagship-offer { padding: 48px 0; }
                    .flagship-shell { padding: 22px; border-radius: 16px; }
                    .flagship-grid { grid-template-columns: 1fr; }
                    .flagship-actions .btn { width: 100%; justify-content: center; }
                }
            `;
            document.head.appendChild(style);
        }

        const hero = document.getElementById('hero');
        const badge = hero.querySelector('.hero-badge');
        const headline = document.getElementById('heroHeadline');
        const subcopy = hero.querySelector('.hero-subcopy');
        const proof = hero.querySelector('.hero-proof-row');
        const cta = hero.querySelector('.hero-cta');

        if (badge) {
            badge.innerHTML = '<span class="badge-dot"></span> Practitioner-built quant finance system';
        }

        if (headline) {
            headline.setAttribute('aria-label', 'Build Quant Skills That Survive the Interview and the Desk');
            headline.innerHTML = 'Build Quant Skills That Survive the <span class="gradient-text">Interview — and the Desk</span>';
        }

        if (subcopy) {
            subcopy.innerHTML = '<strong>Stop learning models as isolated formulas. Learn how they are implemented, challenged, hedged, validated, and explained under pressure.</strong><br>Desk-focused preparation for pricing, XVA, risk, model validation, numerical methods, Python, C++, and quant interviews.';

            if (!hero.querySelector('.hero-value-line')) {
                const valueLine = document.createElement('p');
                valueLine.className = 'hero-value-line';
                valueLine.innerHTML = '<strong>Flagship:</strong> 41+ PDFs • 60+ scripts • 1000+ interview problems • Python + C++ + SQL';
                subcopy.insertAdjacentElement('afterend', valueLine);
            }
        }

        if (proof) {
            proof.innerHTML = '<span><i class="fas fa-chart-line"></i> Pricing &amp; XVA</span><span><i class="fas fa-shield-alt"></i> Risk &amp; validation</span><span><i class="fas fa-code"></i> Implementation</span>';
        }

        if (cta) {
            cta.innerHTML = `
                <a href="${BUNDLE_URL}" class="btn btn-primary">Explore Complete Bundle — ₹7,999 <i class="fas fa-arrow-right"></i></a>
                <a href="#products" class="btn btn-secondary">Browse Individual Resources</a>
            `;
        }

        if (!document.getElementById('flagship-bundle')) {
            const about = document.querySelector('.about-desksection');
            if (about) {
                const section = document.createElement('section');
                section.className = 'flagship-offer';
                section.id = 'flagship-bundle';
                section.setAttribute('aria-labelledby', 'flagship-bundle-heading');
                section.innerHTML = `
                    <div class="section-container">
                        <div class="flagship-shell">
                            <div class="flagship-copy">
                                <span class="flagship-eyebrow"><i class="fas fa-layer-group"></i> The complete Desk2Quant system</span>
                                <h2 id="flagship-bundle-heading">One bundle for the full quant journey — <span class="gradient-text">from foundations to desk reasoning.</span></h2>
                                <p class="flagship-lede">Built for candidates and working quants who want one structured library instead of buying disconnected resources. Move from mathematics and programming into pricing, models, risk, XVA, projects, and interview preparation with the same desk-first philosophy throughout.</p>
                                <div class="flagship-grid" aria-label="Complete bundle contents">
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>41+ high-quality PDFs</strong> across core quant topics</span></div>
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>60+ scripts</strong> across Python, C++ and SQL</span></div>
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>1000+ interview problems</strong> with solutions and practice</span></div>
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>Asset-class models</strong> across rates, FX, equity, credit and vol</span></div>
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>Desk reality</strong>: hedging, P&amp;L attribution, risk and XVA</span></div>
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>Projects + interview prep</strong> designed to be defended, not memorized</span></div>
                                </div>
                                <div class="flagship-price"><strong>₹7,999</strong><span>complete professional bundle</span></div>
                                <div class="flagship-actions">
                                    <a href="${BUNDLE_URL}" class="btn btn-primary">See Everything Included <i class="fas fa-arrow-right"></i></a>
                                    <a href="#products" class="btn btn-secondary">Start with One Resource</a>
                                </div>
                                <p class="flagship-coupon">Current bundle page offer: use <code>COMBINED10</code> for 10% off at checkout.</p>
                                <div class="flagship-trust">
                                    <span><i class="fas fa-check-circle"></i> Instant digital delivery</span>
                                    <span><i class="fas fa-check-circle"></i> Desk-focused material</span>
                                    <span><i class="fas fa-check-circle"></i> Secure Razorpay checkout</span>
                                </div>
                            </div>
                            <div class="flagship-cover-wrap" aria-hidden="true">
                                <img class="flagship-cover" src="${BUNDLE_COVER}" alt="" loading="eager" decoding="async">
                            </div>
                        </div>
                    </div>
                `;
                about.insertAdjacentElement('afterend', section);
            }
        }

        const choosePath = document.getElementById('choose-path');
        if (choosePath) {
            const label = choosePath.querySelector('.section-label');
            const heading = document.getElementById('choose-path-heading');
            const intro = choosePath.querySelector('.flow-heading p');
            if (label) label.textContent = 'Prefer to start smaller?';
            if (heading) heading.innerHTML = 'Choose the <span class="gradient-text">starting point that fits you.</span>';
            if (intro) intro.textContent = 'Use the full bundle for breadth, or start with one focused resource, free tool, or mentorship session.';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyHomepageSalesLayer, { once: true });
    } else {
        applyHomepageSalesLayer();
    }
})();
