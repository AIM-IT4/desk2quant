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

                /* Flagship bundle: intentionally light and editorial so it belongs to the existing homepage. */
                .flagship-offer {
                    padding: 68px 0;
                    position: relative;
                    overflow: hidden;
                    background: #f7f8f6;
                    border-top: 1px solid #e5e7eb;
                    border-bottom: 1px solid #e5e7eb;
                }
                .flagship-shell {
                    display: grid;
                    grid-template-columns: minmax(0, 1.3fr) minmax(260px, .7fr);
                    gap: 42px;
                    align-items: center;
                    padding: 42px;
                    border: 1px solid #dfe7e5;
                    border-top: 4px solid #0f766e;
                    border-radius: 22px;
                    background: #ffffff;
                    box-shadow: 0 18px 55px rgba(15, 23, 42, .08);
                }
                .flagship-copy { color: #111827; }
                .flagship-eyebrow {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 7px 11px;
                    margin-bottom: 17px;
                    border-radius: 999px;
                    border: 1px solid #99d5cf;
                    background: #eefaf8;
                    color: #0f766e;
                    font-weight: 800;
                    font-size: .76rem;
                    letter-spacing: .075em;
                    text-transform: uppercase;
                }
                .flagship-copy h2 {
                    margin: 0 0 14px;
                    max-width: 760px;
                    color: #111827;
                    font-size: clamp(2rem, 4vw, 3.35rem);
                    line-height: 1.06;
                    letter-spacing: -.035em;
                }
                .flagship-copy .gradient-text {
                    background: none !important;
                    -webkit-background-clip: initial !important;
                    background-clip: initial !important;
                    -webkit-text-fill-color: #0f766e !important;
                    color: #0f766e !important;
                }
                .flagship-lede {
                    max-width: 720px;
                    margin: 0 0 25px;
                    color: #4b5563;
                    font-size: 1rem;
                    line-height: 1.68;
                }
                .flagship-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0,1fr));
                    gap: 12px 20px;
                    margin: 0 0 28px;
                }
                .flagship-point {
                    display: flex;
                    gap: 10px;
                    align-items: flex-start;
                    color: #1f2937;
                    font-size: .93rem;
                    line-height: 1.48;
                }
                .flagship-point strong { color: #111827; }
                .flagship-point i {
                    color: #0f766e;
                    margin-top: 4px;
                    flex: 0 0 auto;
                }
                .flagship-price {
                    display: flex;
                    align-items: baseline;
                    gap: 10px;
                    margin: 0 0 18px;
                }
                .flagship-price strong {
                    font-size: 2.3rem;
                    line-height: 1;
                    color: #111827;
                    letter-spacing: -.035em;
                }
                .flagship-price span {
                    color: #6b7280;
                    font-size: .88rem;
                }
                .flagship-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .flagship-shell .btn-primary {
                    background: #0f766e !important;
                    border-color: #0f766e !important;
                    color: #fff !important;
                    box-shadow: 0 8px 22px rgba(15, 118, 110, .18) !important;
                }
                .flagship-shell .btn-primary:hover {
                    background: #115e59 !important;
                    border-color: #115e59 !important;
                }
                .flagship-shell .btn-secondary {
                    background: #fff !important;
                    border: 1px solid #cbd5d1 !important;
                    color: #1f2937 !important;
                    box-shadow: none !important;
                }
                .flagship-coupon {
                    margin-top: 14px;
                    color: #6b7280;
                    font-size: .88rem;
                }
                .flagship-coupon code {
                    padding: 3px 7px;
                    border: 1px dashed #5fbdb3;
                    border-radius: 6px;
                    color: #0f766e;
                    background: #f0fdfa;
                    font-family: 'JetBrains Mono', monospace;
                    font-weight: 700;
                }
                .flagship-cover-wrap {
                    position: relative;
                    min-height: 310px;
                    display: grid;
                    place-items: center;
                    padding: 10px;
                }
                .flagship-cover-wrap::before {
                    content: '';
                    position: absolute;
                    inset: 9% 7%;
                    border-radius: 28px;
                    background: #eef4f3;
                    border: 1px solid #dfe8e6;
                    transform: rotate(-2deg);
                }
                .flagship-cover {
                    position: relative;
                    z-index: 1;
                    width: min(100%, 285px);
                    max-height: 360px;
                    object-fit: contain;
                    border-radius: 12px;
                    box-shadow: 0 18px 42px rgba(15,23,42,.16);
                    transform: none;
                }
                .flagship-trust {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                    margin-top: 22px;
                    padding-top: 18px;
                    border-top: 1px solid #e5e7eb;
                    color: #6b7280;
                    font-size: .82rem;
                }
                .flagship-trust span { display: inline-flex; align-items: center; gap: 6px; }
                .flagship-trust i { color: #0f766e; }

                @media (max-width: 900px) {
                    .flagship-shell {
                        grid-template-columns: 1fr;
                        gap: 28px;
                        padding: 32px;
                    }
                    .flagship-cover-wrap {
                        min-height: 230px;
                        order: 2;
                        padding-top: 4px;
                    }
                    .flagship-cover {
                        width: min(68vw, 260px);
                        max-height: 300px;
                    }
                }
                @media (max-width: 620px) {
                    .flagship-offer { padding: 42px 0; }
                    .flagship-shell {
                        padding: 24px 20px;
                        border-radius: 16px;
                        gap: 24px;
                    }
                    .flagship-eyebrow {
                        font-size: .7rem;
                        letter-spacing: .055em;
                        margin-bottom: 14px;
                    }
                    .flagship-copy h2 {
                        font-size: clamp(1.85rem, 8.8vw, 2.45rem);
                        line-height: 1.08;
                    }
                    .flagship-lede {
                        color: #4b5563;
                        font-size: .96rem;
                        line-height: 1.62;
                        margin-bottom: 22px;
                    }
                    .flagship-grid {
                        grid-template-columns: 1fr;
                        gap: 10px;
                        margin-bottom: 24px;
                    }
                    .flagship-point { font-size: .91rem; }
                    .flagship-price strong { font-size: 2.05rem; }
                    .flagship-actions { gap: 9px; }
                    .flagship-actions .btn {
                        width: 100%;
                        justify-content: center;
                    }
                    .flagship-cover-wrap {
                        min-height: 190px;
                        margin-top: 2px;
                    }
                    .flagship-cover {
                        width: min(64vw, 235px);
                        max-height: 270px;
                    }
                    .flagship-trust {
                        gap: 9px 14px;
                        margin-top: 19px;
                        padding-top: 16px;
                    }
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
                                <span class="flagship-eyebrow"><i class="fas fa-layer-group"></i> Complete Desk2Quant System</span>
                                <h2 id="flagship-bundle-heading">Serious quant preparation, <span class="gradient-text">in one structured bundle.</span></h2>
                                <p class="flagship-lede">Move from foundations and coding into pricing, risk, XVA, model validation, projects, and interviews without stitching together disconnected material.</p>
                                <div class="flagship-grid" aria-label="Complete bundle contents">
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>41+ high-quality PDFs</strong> across core quant topics</span></div>
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>60+ scripts</strong> across Python, C++ and SQL</span></div>
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>1000+ interview problems</strong> with solutions and practice</span></div>
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>Rates, FX, equity, credit &amp; vol</strong> model coverage</span></div>
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>Desk reasoning</strong>: hedging, P&amp;L, risk and XVA</span></div>
                                    <div class="flagship-point"><i class="fas fa-check-circle"></i><span><strong>Projects + interview prep</strong> designed to be defended</span></div>
                                </div>
                                <div class="flagship-price"><strong>₹7,999</strong><span>complete professional bundle</span></div>
                                <div class="flagship-actions">
                                    <a href="${BUNDLE_URL}" class="btn btn-primary">Get Complete Bundle — ₹7,999 <i class="fas fa-arrow-right"></i></a>
                                    <a href="#products" class="btn btn-secondary">Browse Individual Notes</a>
                                </div>
                                <p class="flagship-coupon">Use <code>COMBINED10</code> for 10% off at checkout.</p>
                                <div class="flagship-trust">
                                    <span><i class="fas fa-check-circle"></i> Instant digital delivery</span>
                                    <span><i class="fas fa-check-circle"></i> Desk-focused material</span>
                                    <span><i class="fas fa-check-circle"></i> Secure Razorpay checkout</span>
                                </div>
                            </div>
                            <div class="flagship-cover-wrap" aria-hidden="true">
                                <img class="flagship-cover" src="${BUNDLE_COVER}" alt="" loading="lazy" decoding="async">
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
