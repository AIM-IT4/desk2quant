/* Shared public copy and trust signals. Keep numbers here; do not duplicate them in pages. */
window.QUANT_MENTOR = Object.freeze({
    canonicalOrigin: 'https://desk2quant.com',
    brandName: 'Desk2Quant',
    brandDescriptor: 'Desk-Ready Quant Finance Preparation',
    stats: Object.freeze({
        products: 46,
        paidProducts: 41,
        reviews: 25,
        averageRating: 5.0,
        mentees: 50,
        resourceUsers: 500
    })
});

/* 100% Free Two-Way Google Calendar Sync via Cal.com */
window.D2Q_CALENDAR_CONFIG = Object.freeze({
    enabled: true,
    provider: 'cal', // Free Cal.com with two-way Google Calendar sync
    calLink: 'desk2quant', // Cal.com username
    mentorName: 'Amit Kumar Jha',
    mentorEmail: 'jha.8@alumni.iitj.ac.in',
    eventTitle: 'Desk2Quant 1-on-1 Mentorship & Code Review',
    eventDescription: 'Private 1-on-1 quantitative finance mentorship and code review session with Amit Kumar Jha (Desk2Quant founder, Model Risk Quant at UBS).'
});

/* Microsoft Clarity (Heatmaps & Session Recording) - 100% Free */
window.D2Q_CLARITY_CONFIG = Object.freeze({
    enabled: true,
    projectId: 'ycjcdlveyz'
});

/* Tawk.to Live Chat Widget - 100% Free */
window.D2Q_LIVE_CHAT_CONFIG = Object.freeze({
    enabled: true,
    propertyId: '6a996a06f31d2934469232b9',
    widgetId: '1k1jkcb5o',
    position: 'bottom-left' // 'bottom-left' avoids overlapping advisor widget & scroll-to-top button
});

/**
 * Clean, safe loader for Microsoft Clarity.
 * Activates gracefully only when enabled and configured with a real project ID.
 * Never throws an exception and will not block rendering if blocked by adblockers.
 */
function initClarity() {
    try {
        var config = window.D2Q_CLARITY_CONFIG;
        if (!config || !config.enabled) return;
        var projectId = (config.projectId || '').trim();
        if (!projectId || projectId === '...' || projectId.indexOf('YOUR_') === 0) return;
        if (window.clarity) return;

        (function (c, l, a, r, i, t, y) {
            c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
            t = l.createElement(r);
            t.async = 1;
            t.src = 'https://www.clarity.ms/tag/' + encodeURIComponent(i);
            t.onerror = function () { /* Gracefully handle adblockers or network failure without throwing */ };
            y = l.getElementsByTagName(r)[0];
            if (y && y.parentNode) {
                y.parentNode.insertBefore(t, y);
            } else if (document.head) {
                document.head.appendChild(t);
            }
        })(window, document, 'clarity', 'script', projectId);
    } catch (e) {
        // Defensive: never let analytics affect UX
    }
}
window.initClarity = initClarity;

/**
 * Clean, safe async injector for Tawk.to Live Chat.
 * Activates only when enabled with valid propertyId and widgetId.
 * Configured so it doesn't interfere with existing floating buttons and causes zero console errors.
 */
function initLiveChat() {
    try {
        var config = window.D2Q_LIVE_CHAT_CONFIG;
        if (!config || !config.enabled) return;
        var propId = (config.propertyId || '').trim();
        var widgetId = (config.widgetId || '').trim();
        if (!propId || !widgetId || propId === '...' || widgetId === '...') return;
        if (window.Tawk_API && window.Tawk_API.isChatMaximized) return;

        window.Tawk_API = window.Tawk_API || {};
        window.Tawk_LoadStart = new Date();

        window.Tawk_API.customStyle = {
            visibility: {
                desktop: { position: 'bl', xOffset: 20, yOffset: 20 },
                mobile: { position: 'bl', xOffset: 12, yOffset: 12 }
            }
        };

        var s1 = document.createElement('script');
        s1.id = 'd2q-tawk-script';
        s1.async = true;
        s1.src = 'https://embed.tawk.to/' + encodeURIComponent(propId) + '/' + encodeURIComponent(widgetId);
        s1.charset = 'UTF-8';
        s1.setAttribute('crossorigin', '*');
        s1.onerror = function () { /* Adblocker safe */ };

        var s0 = document.getElementsByTagName('script')[0];
        if (s0 && s0.parentNode) {
            s0.parentNode.insertBefore(s1, s0);
        } else if (document.head) {
            document.head.appendChild(s1);
        }
    } catch (e) {
        // Defensive: never let chat widget failure affect UX
    }
}
window.initLiveChat = initLiveChat;

// Auto-run when DOM is ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initClarity();
            initLiveChat();
        }, { once: true });
    } else {
        initClarity();
        initLiveChat();
    }
}

/*
 * Homepage sales hierarchy.
 * Frontend-only: no checkout, Razorpay, Supabase, delivery, email or API logic is changed here.
 * The live bundle URL/price/content below are taken from the current product page.
 */
(function () {
    const BUNDLE_URL = '/product.html?id=164308cd-e3cd-4026-8fdc-337a5955ffff';
    const BUNDLE_COVER = '/assets/images/desk2quant-bundle-cover-2026.svg';

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

                /* Role-based entry points: reduce catalogue choice overload. */
                .role-paths-section {
                    padding: 68px 0;
                    background: #ffffff;
                    border-bottom: 1px solid #e5e7eb;
                }
                .role-paths-header {
                    max-width: 780px;
                    margin: 0 auto 30px;
                    text-align: center;
                }
                .role-paths-eyebrow {
                    display: inline-block;
                    margin-bottom: 10px;
                    color: #0f766e;
                    font-size: .76rem;
                    font-weight: 800;
                    letter-spacing: .09em;
                    text-transform: uppercase;
                }
                .role-paths-header h2 {
                    margin: 0 0 12px;
                    color: #111827;
                    font-size: clamp(1.9rem, 3.5vw, 2.8rem);
                    line-height: 1.1;
                    letter-spacing: -.03em;
                }
                .role-paths-header p {
                    margin: 0;
                    color: #6b7280;
                    line-height: 1.65;
                }
                .role-paths-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                    gap: 16px;
                }
                .role-path-card {
                    display: flex;
                    flex-direction: column;
                    min-height: 255px;
                    padding: 24px;
                    border: 1px solid #dfe7e5;
                    border-radius: 18px;
                    background: #fbfdfc;
                    color: #111827;
                    text-decoration: none;
                    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
                }
                .role-path-card:hover {
                    transform: translateY(-3px);
                    border-color: #8ccfc7;
                    box-shadow: 0 14px 32px rgba(15, 23, 42, .08);
                }
                .role-path-icon {
                    width: 42px;
                    height: 42px;
                    display: grid;
                    place-items: center;
                    margin-bottom: 18px;
                    border-radius: 12px;
                    background: #eaf8f6;
                    color: #0f766e;
                    font-size: 1rem;
                }
                .role-path-card h3 {
                    margin: 0 0 9px;
                    color: #111827;
                    font-size: 1.08rem;
                    line-height: 1.3;
                }
                .role-path-card p {
                    margin: 0 0 18px;
                    color: #6b7280;
                    font-size: .9rem;
                    line-height: 1.55;
                }
                .role-path-start {
                    margin-top: auto;
                    padding-top: 14px;
                    border-top: 1px solid #e5e7eb;
                    color: #0f766e;
                    font-size: .82rem;
                    font-weight: 800;
                    line-height: 1.45;
                }
                .role-paths-footer {
                    margin-top: 22px;
                    text-align: center;
                    color: #6b7280;
                    font-size: .9rem;
                }
                .role-paths-footer a {
                    color: #0f766e;
                    font-weight: 800;
                    text-decoration: none;
                }

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
                    .role-paths-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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
                    .role-paths-section { padding: 46px 0; }
                    .role-paths-header { text-align: left; margin-bottom: 22px; }
                    .role-paths-grid { grid-template-columns: 1fr; }
                    .role-path-card { min-height: 0; padding: 21px; }
                    .role-paths-footer { text-align: left; }
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
            headline.innerHTML = 'Build Quant Skills That Survive the <span class="gradient-text">Interview and the Desk</span>';
        }

        if (subcopy) {
            subcopy.innerHTML = '<strong>Stop learning models as isolated formulas. Learn how they are implemented, challenged, hedged, validated, and explained under pressure.</strong><br>Desk-focused preparation for pricing, XVA, risk, model validation, numerical methods, Python, C++, and quant interviews.';

            let valueLine = hero.querySelector('.hero-value-line');
            if (!valueLine) {
                valueLine = document.createElement('p');
                valueLine.className = 'hero-value-line';
                subcopy.insertAdjacentElement('afterend', valueLine);
            }
            valueLine.innerHTML = '<strong>Flagship:</strong> 46+ PDFs • 60+ scripts • 1000+ interview problems • Python + C++ + SQL';
        }

        // Do not clobber hero proof or cta already configured in index.html

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

        if (!document.getElementById('role-paths')) {
            const flagship = document.getElementById('flagship-bundle');
            if (flagship) {
                const roleSection = document.createElement('section');
                roleSection.className = 'role-paths-section';
                roleSection.id = 'role-paths';
                roleSection.setAttribute('aria-labelledby', 'role-paths-heading');
                roleSection.innerHTML = `
                    <div class="section-container">
                        <div class="role-paths-header">
                            <span class="role-paths-eyebrow">Start with your target role</span>
                            <h2 id="role-paths-heading">What kind of quant are you preparing to become?</h2>
                            <p>Skip the catalogue guesswork. Pick the desk or interview outcome you care about and start with the most relevant Desk2Quant resource.</p>
                        </div>
                        <div class="role-paths-grid">
                            <a class="role-path-card" href="/product.html?id=bdb3c59e-c8c0-430f-8705-b7467514458e">
                                <span class="role-path-icon"><i class="fas fa-chart-line"></i></span>
                                <h3>Front Office Quant &amp; Pricing</h3>
                                <p>Build product intuition across rates, FX, equity, credit, inflation and commodities before moving deeper into models and hedging.</p>
                                <span class="role-path-start">Start: Derivatives Products &amp; Pricing Master Pack — ₹1,999 <i class="fas fa-arrow-right"></i></span>
                            </a>
                            <a class="role-path-card" href="/product.html?id=351aa09b-681b-4da9-9b61-844cf295640c">
                                <span class="role-path-icon"><i class="fas fa-calculator"></i></span>
                                <h3>XVA &amp; Counterparty Risk</h3>
                                <p>Focus on counterparty credit risk, valuation adjustments and the desk calculations that connect exposure, funding and capital.</p>
                                <span class="role-path-start">Start: XVA Calculus Lab — ₹699 <i class="fas fa-arrow-right"></i></span>
                            </a>
                            <a class="role-path-card" href="/product.html?id=a778e6ae-43d1-4cbd-a6a7-6dce693e5f69">
                                <span class="role-path-icon"><i class="fas fa-shield-alt"></i></span>
                                <h3>Model Validation &amp; Risk</h3>
                                <p>Practice challenging assumptions, testing models and explaining limitations the way validation and risk teams expect.</p>
                                <span class="role-path-start">Start: Model Validation Case Study Pack — ₹799 <i class="fas fa-arrow-right"></i></span>
                            </a>
                            <a class="role-path-card" href="/product.html?id=ff04eb72-ff48-4917-b56c-0694fa4f4ee6">
                                <span class="role-path-icon"><i class="fas fa-flask"></i></span>
                                <h3>Quant Researcher &amp; Systematic Research</h3>
                                <p>Build a defensible research workflow across time series, signals, statistical testing, leakage control, validation, decay and portfolio construction.</p>
                                <span class="role-path-start">Start: Quant Researcher Interview Playbook — ₹799 <i class="fas fa-arrow-right"></i></span>
                            </a>
                            <a class="role-path-card" href="/product.html?id=73806d69-768b-497e-87b7-d94fa4cfd772">
                                <span class="role-path-icon"><i class="fas fa-user-tie"></i></span>
                                <h3>Quant Interview Preparation</h3>
                                <p>Drill probability, maths, coding, finance and model questions with enough volume to expose weak spots before the interview does.</p>
                                <span class="role-path-start">Start: 1000+ Quant Interview Problems — ₹899 <i class="fas fa-arrow-right"></i></span>
                            </a>
                        </div>
                        <p class="role-paths-footer">Not sure which path fits? <a href="${BUNDLE_URL}">Use the Complete Bundle for full-spectrum preparation <i class="fas fa-arrow-right"></i></a></p>
                    </div>
                `;
                flagship.insertAdjacentElement('afterend', roleSection);
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