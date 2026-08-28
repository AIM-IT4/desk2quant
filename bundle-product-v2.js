(function () {
    'use strict';

    const BUNDLE_ID = '164308cd-e3cd-4026-8fdc-337a5955ffff';
    const SAMPLE_PDF = '/assets/samples/164308cd-e3cd-4026-8fdc-337a5955ffff_sample.pdf';

    function isBundlePage() {
        try {
            const id = new URLSearchParams(window.location.search).get('id');
            return String(id || '').replace(/^['"]|['"]$/g, '') === BUNDLE_ID;
        } catch (_) {
            return false;
        }
    }

    if (!isBundlePage()) return;

    function addStyles() {
        if (document.getElementById('bundle-v2-styles')) return;
        const style = document.createElement('style');
        style.id = 'bundle-v2-styles';
        style.textContent = `
            body.bundle-v2 { background: #f7f8f6; }
            body.bundle-v2 .product-page-container {
                max-width: 1180px;
                padding-top: 104px;
                padding-bottom: 34px;
            }
            body.bundle-v2 .product-detail-card {
                background: #ffffff;
                border: 1px solid #dfe7e5;
                border-top: 4px solid #0f766e;
                box-shadow: 0 22px 60px rgba(15, 23, 42, .10);
                color: #111827;
            }
            body.bundle-v2 .product-detail-image {
                height: 520px;
                background: #eef4f3;
                border: 1px solid #dfe7e5;
            }
            body.bundle-v2 .product-detail-image img { padding: 18px; }
            body.bundle-v2 .product-info { position: static; }
            body.bundle-v2 .product-info h1 {
                color: #111827;
                background: none;
                -webkit-text-fill-color: #111827;
                font-size: clamp(2rem, 4vw, 3.25rem);
                line-height: 1.04;
                letter-spacing: -.035em;
                margin-bottom: 16px;
            }
            body.bundle-v2 .product-description-full {
                color: #4b5563;
                line-height: 1.72;
                margin-bottom: 22px;
            }
            body.bundle-v2 .product-price-tag { color: #111827; margin-bottom: 10px; }
            body.bundle-v2 .product-badge-item {
                background: #eefaf8;
                border: 1px solid #b8ded9;
                color: #0f5f59;
            }
            body.bundle-v2 .product-badge-item.rating i { color: #0f766e; }
            body.bundle-v2 .action-buttons .btn-primary {
                background: #0f766e !important;
                border-color: #0f766e !important;
                color: #fff !important;
                box-shadow: 0 10px 24px rgba(15, 118, 110, .18);
            }
            body.bundle-v2 .action-buttons .btn-secondary {
                background: #fff !important;
                border: 1px solid #cbd5d1 !important;
                color: #1f2937 !important;
            }
            .bundle-kicker {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 12px;
                color: #0f766e;
                font-size: .76rem;
                font-weight: 800;
                letter-spacing: .09em;
                text-transform: uppercase;
            }
            .bundle-hero-lede {
                margin: -4px 0 18px;
                color: #374151;
                font-size: 1.04rem;
                line-height: 1.65;
                font-weight: 600;
            }
            .bundle-value-row {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 9px;
                margin: 18px 0 22px;
            }
            .bundle-value-chip {
                padding: 11px 10px;
                border: 1px solid #dfe7e5;
                border-radius: 10px;
                background: #fbfdfc;
                color: #1f2937;
                text-align: center;
                font-size: .78rem;
                line-height: 1.35;
            }
            .bundle-value-chip strong { display: block; color: #0f766e; font-size: 1rem; }
            .bundle-price-note {
                display: flex;
                gap: 10px;
                align-items: center;
                flex-wrap: wrap;
                margin: 0 0 18px;
                color: #6b7280;
                font-size: .88rem;
            }
            .bundle-price-note code {
                padding: 4px 8px;
                border: 1px dashed #5fbdb3;
                border-radius: 6px;
                background: #f0fdfa;
                color: #0f766e;
                font-weight: 800;
            }
            .bundle-trust-row {
                display: flex;
                gap: 10px 16px;
                flex-wrap: wrap;
                margin-top: 16px;
                color: #6b7280;
                font-size: .8rem;
            }
            .bundle-trust-row span { display: inline-flex; align-items: center; gap: 6px; }
            .bundle-trust-row i { color: #0f766e; }

            .bundle-sticky-nav {
                position: sticky;
                top: 72px;
                z-index: 80;
                background: rgba(255,255,255,.96);
                border-bottom: 1px solid #e5e7eb;
                backdrop-filter: blur(14px);
            }
            .bundle-sticky-inner {
                max-width: 1180px;
                margin: 0 auto;
                padding: 10px 20px;
                display: flex;
                gap: 8px;
                overflow-x: auto;
                scrollbar-width: none;
            }
            .bundle-sticky-inner::-webkit-scrollbar { display: none; }
            .bundle-sticky-inner a {
                flex: 0 0 auto;
                padding: 7px 11px;
                border-radius: 999px;
                color: #4b5563;
                text-decoration: none;
                font-size: .78rem;
                font-weight: 700;
            }
            .bundle-sticky-inner a:hover { background: #eefaf8; color: #0f766e; }

            .bundle-v2-section {
                max-width: 1180px;
                margin: 0 auto;
                padding: 56px 20px;
            }
            .bundle-v2-section + .bundle-v2-section { padding-top: 20px; }
            .bundle-section-head { max-width: 760px; margin-bottom: 26px; }
            .bundle-section-head span {
                color: #0f766e;
                font-size: .75rem;
                font-weight: 800;
                letter-spacing: .08em;
                text-transform: uppercase;
            }
            .bundle-section-head h2 {
                margin: 8px 0 10px;
                color: #111827;
                font-size: clamp(1.75rem, 3vw, 2.55rem);
                line-height: 1.12;
                letter-spacing: -.028em;
            }
            .bundle-section-head p { margin: 0; color: #6b7280; line-height: 1.7; }

            .bundle-module-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 15px;
            }
            .bundle-module-card {
                padding: 22px;
                border: 1px solid #dfe7e5;
                border-radius: 16px;
                background: #ffffff;
                box-shadow: 0 8px 24px rgba(15, 23, 42, .04);
            }
            .bundle-module-card i { color: #0f766e; margin-bottom: 14px; font-size: 1.05rem; }
            .bundle-module-card h3 { margin: 0 0 8px; color: #111827; font-size: 1.02rem; }
            .bundle-module-card p { margin: 0; color: #6b7280; font-size: .88rem; line-height: 1.58; }

            .bundle-path {
                display: grid;
                grid-template-columns: repeat(6, minmax(0, 1fr));
                gap: 10px;
            }
            .bundle-path-step {
                position: relative;
                padding: 18px 14px;
                border: 1px solid #dfe7e5;
                border-radius: 14px;
                background: #fff;
                min-height: 150px;
            }
            .bundle-step-num {
                display: inline-grid;
                place-items: center;
                width: 28px;
                height: 28px;
                margin-bottom: 12px;
                border-radius: 50%;
                background: #0f766e;
                color: #fff;
                font-size: .74rem;
                font-weight: 800;
            }
            .bundle-path-step strong { display: block; color: #111827; font-size: .9rem; margin-bottom: 7px; }
            .bundle-path-step span { color: #6b7280; font-size: .78rem; line-height: 1.45; }

            .bundle-fit-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 16px;
            }
            .bundle-fit-card {
                padding: 24px;
                border-radius: 16px;
                border: 1px solid #dfe7e5;
                background: #fff;
            }
            .bundle-fit-card h3 { margin: 0 0 14px; color: #111827; }
            .bundle-fit-card ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
            .bundle-fit-card li { display: grid; grid-template-columns: 18px 1fr; gap: 8px; color: #4b5563; line-height: 1.5; font-size: .9rem; }
            .bundle-fit-card.good li::before { content: '✓'; color: #0f766e; font-weight: 900; }
            .bundle-fit-card.bad li::before { content: '–'; color: #9ca3af; font-weight: 900; }

            .bundle-sample-box {
                display: grid;
                grid-template-columns: 1.1fr .9fr;
                gap: 22px;
                align-items: center;
                padding: 28px;
                border: 1px solid #b8ded9;
                border-radius: 18px;
                background: #eefaf8;
            }
            .bundle-sample-box h3 { margin: 0 0 10px; color: #111827; font-size: 1.35rem; }
            .bundle-sample-box p { margin: 0 0 18px; color: #4b5563; line-height: 1.65; }
            .bundle-sample-list { display: grid; gap: 10px; }
            .bundle-sample-list span {
                display: flex;
                gap: 8px;
                align-items: flex-start;
                color: #374151;
                font-size: .88rem;
                line-height: 1.45;
            }
            .bundle-sample-list i { color: #0f766e; margin-top: 3px; }
            .bundle-sample-btn {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                border-radius: 9px;
                background: #0f766e;
                color: #fff !important;
                text-decoration: none;
                font-weight: 800;
            }

            .bundle-credibility {
                padding: 26px;
                border-left: 4px solid #0f766e;
                border-radius: 0 16px 16px 0;
                background: #fff;
                border-top: 1px solid #dfe7e5;
                border-right: 1px solid #dfe7e5;
                border-bottom: 1px solid #dfe7e5;
            }
            .bundle-credibility h3 { margin: 0 0 10px; color: #111827; }
            .bundle-credibility p { margin: 0; color: #4b5563; line-height: 1.7; }

            .bundle-faq { display: grid; gap: 10px; }
            .bundle-faq details {
                padding: 17px 19px;
                border: 1px solid #dfe7e5;
                border-radius: 12px;
                background: #fff;
            }
            .bundle-faq summary { cursor: pointer; color: #111827; font-weight: 800; }
            .bundle-faq p { margin: 12px 0 0; color: #6b7280; line-height: 1.65; }

            .bundle-final-cta {
                max-width: 1180px;
                margin: 0 auto 62px;
                padding: 34px;
                border-radius: 20px;
                background: #071522;
                color: #fff;
                display: grid;
                grid-template-columns: 1fr auto;
                gap: 24px;
                align-items: center;
            }
            .bundle-final-cta h2 { margin: 0 0 8px; color: #fff; font-size: clamp(1.55rem, 3vw, 2.25rem); }
            .bundle-final-cta p { margin: 0; color: #b8c7d2; line-height: 1.6; }
            .bundle-final-price { margin-top: 8px !important; color: #72e7df !important; font-weight: 800; }
            .bundle-final-buy {
                border: 0;
                border-radius: 10px;
                padding: 14px 20px;
                background: #0f766e;
                color: #fff;
                font: inherit;
                font-weight: 800;
                cursor: pointer;
                white-space: nowrap;
            }

            body.bundle-v2 #product-preview-section {
                max-width: 1180px;
                background: #fff;
                border: 1px solid #dfe7e5;
                border-radius: 18px;
                padding: 30px;
                margin-bottom: 36px;
            }
            body.bundle-v2 #product-preview-section .product-preview-title,
            body.bundle-v2 #reviews-section h2 { color: #111827; }
            body.bundle-v2 #product-preview-section .product-preview-subtitle { color: #6b7280; }
            body.bundle-v2 #reviews-section { max-width: 960px; }

            @media (max-width: 960px) {
                .bundle-value-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .bundle-module-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .bundle-path { grid-template-columns: repeat(3, minmax(0, 1fr)); }
                .bundle-sample-box { grid-template-columns: 1fr; }
            }
            @media (max-width: 768px) {
                body.bundle-v2 .product-page-container { padding-top: 92px; }
                body.bundle-v2 .product-detail-image { height: 360px; }
                .bundle-sticky-nav { top: 64px; }
                .bundle-module-grid, .bundle-fit-grid { grid-template-columns: 1fr; }
                .bundle-path { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .bundle-final-cta { margin: 0 15px 44px; grid-template-columns: 1fr; padding: 26px 22px; }
                .bundle-final-buy { width: 100%; }
                body.bundle-v2 #product-preview-section { margin-left: 15px; margin-right: 15px; padding: 22px 18px; }
            }
            @media (max-width: 480px) {
                .bundle-value-row, .bundle-path { grid-template-columns: 1fr; }
                .bundle-v2-section { padding: 42px 15px; }
                .bundle-sample-box { padding: 22px 18px; }
            }
        `;
        document.head.appendChild(style);
    }

    function insertStickyNav() {
        if (document.getElementById('bundle-sticky-nav')) return;
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;
        const nav = document.createElement('div');
        nav.id = 'bundle-sticky-nav';
        nav.className = 'bundle-sticky-nav';
        nav.innerHTML = `
            <div class="bundle-sticky-inner" aria-label="Bundle page sections">
                <a href="#bundle-overview">Overview</a>
                <a href="#bundle-inside">What's inside</a>
                <a href="#bundle-learning-path">Learning path</a>
                <a href="#bundle-sample">Sample</a>
                <a href="#reviews-section">Reviews</a>
                <a href="#bundle-faq">FAQ</a>
            </div>`;
        navbar.insertAdjacentElement('afterend', nav);
    }

    function insertLandingSections() {
        if (document.getElementById('bundle-inside')) return;
        const preview = document.getElementById('product-preview-section');
        if (!preview) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'bundle-v2-content';
        wrapper.innerHTML = `
            <section class="bundle-v2-section" id="bundle-inside">
                <div class="bundle-section-head">
                    <span>What's inside</span>
                    <h2>A complete system, not a folder of disconnected notes.</h2>
                    <p>The bundle is organized around the tasks quants actually need to perform: understand the product, choose and challenge the model, implement the calculation, interpret risk, and defend the reasoning.</p>
                </div>
                <div class="bundle-module-grid">
                    <article class="bundle-module-card"><i class="fas fa-square-root-variable"></i><h3>Foundations &amp; Quant Mathematics</h3><p>Probability, statistics, econometrics, linear algebra, differential equations and stochastic calculus with desk-oriented intuition.</p></article>
                    <article class="bundle-module-card"><i class="fas fa-chart-line"></i><h3>Products &amp; Pricing</h3><p>Rates, FX, equity, credit, inflation and commodities with product mechanics, pricing logic, Greeks and hedging implications.</p></article>
                    <article class="bundle-module-card"><i class="fas fa-project-diagram"></i><h3>Asset-Class Models</h3><p>Rates, FX, equity, credit and volatility models connected to calibration choices, assumptions, limitations and failure modes.</p></article>
                    <article class="bundle-module-card"><i class="fas fa-shield-alt"></i><h3>Risk, XVA &amp; Validation</h3><p>Counterparty risk, XVA, P&amp;L attribution, model diagnostics, validation thinking and regulatory/risk frameworks.</p></article>
                    <article class="bundle-module-card"><i class="fas fa-code"></i><h3>Python, C++ &amp; SQL</h3><p>Runnable scripts and implementation-focused notes covering numerical work, performance, coding patterns and interview preparation.</p></article>
                    <article class="bundle-module-card"><i class="fas fa-user-tie"></i><h3>Projects &amp; Interviews</h3><p>Employability-focused projects plus 1000+ interview problems designed to expose weak spots and make your reasoning defensible.</p></article>
                </div>
            </section>

            <section class="bundle-v2-section" id="bundle-learning-path">
                <div class="bundle-section-head">
                    <span>Recommended sequence</span>
                    <h2>Learn in the order a desk problem actually unfolds.</h2>
                    <p>You do not need to read every PDF linearly. Use this sequence to turn the library into a practical preparation path.</p>
                </div>
                <div class="bundle-path">
                    <div class="bundle-path-step"><b class="bundle-step-num">1</b><strong>Foundations</strong><span>Refresh probability, statistics, stochastic calculus and numerical thinking.</span></div>
                    <div class="bundle-path-step"><b class="bundle-step-num">2</b><strong>Products</strong><span>Understand cashflows, conventions, market quoting and lifecycle before modeling.</span></div>
                    <div class="bundle-path-step"><b class="bundle-step-num">3</b><strong>Models</strong><span>Connect model choice and calibration to the product and market regime.</span></div>
                    <div class="bundle-path-step"><b class="bundle-step-num">4</b><strong>Risk &amp; XVA</strong><span>Translate pricing into Greeks, P&amp;L, exposure, funding and model-risk questions.</span></div>
                    <div class="bundle-path-step"><b class="bundle-step-num">5</b><strong>Implementation</strong><span>Reproduce the logic in Python, C++ and SQL rather than stopping at equations.</span></div>
                    <div class="bundle-path-step"><b class="bundle-step-num">6</b><strong>Defend it</strong><span>Use projects and interview drills to explain assumptions, failures and trade-offs.</span></div>
                </div>
            </section>

            <section class="bundle-v2-section" id="bundle-fit">
                <div class="bundle-section-head">
                    <span>Fit check</span>
                    <h2>Built for people who want desk-ready reasoning.</h2>
                </div>
                <div class="bundle-fit-grid">
                    <article class="bundle-fit-card good">
                        <h3>This bundle is a strong fit if you are…</h3>
                        <ul>
                            <li>Preparing for front-office quant, XVA, model validation, risk or quant-development roles.</li>
                            <li>Doing an MFE/MSc/CQF/PhD and want a bridge from academic models to practitioner reasoning.</li>
                            <li>Already working in finance and need a structured reference across pricing, risk and implementation.</li>
                            <li>Preparing for interviews where explaining why a model fails matters as much as deriving it.</li>
                        </ul>
                    </article>
                    <article class="bundle-fit-card bad">
                        <h3>It is probably not the right fit if you want…</h3>
                        <ul>
                            <li>A passive video course with hours of lecture playback.</li>
                            <li>A trading-signal service, investment advice or guaranteed job placement.</li>
                            <li>Only one narrow topic that is already covered by an individual Desk2Quant note.</li>
                            <li>Formula memorization without implementation, diagnostics or desk context.</li>
                        </ul>
                    </article>
                </div>
            </section>

            <section class="bundle-v2-section" id="bundle-sample">
                <div class="bundle-sample-box">
                    <div>
                        <div class="bundle-section-head" style="margin-bottom:0;">
                            <span>See before you buy</span>
                            <h2>Open the real bundle sample PDF.</h2>
                            <p>This is an actual Desk2Quant sample asset from the bundle—not a marketing mock-up. Use it to judge the depth, mathematical style and desk orientation before purchasing.</p>
                        </div>
                        <a class="bundle-sample-btn" href="${SAMPLE_PDF}" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> Open Sample PDF</a>
                    </div>
                    <div class="bundle-sample-list">
                        <span><i class="fas fa-check-circle"></i> Representative technical pages from the learning system</span>
                        <span><i class="fas fa-check-circle"></i> Equations and practical quant explanations</span>
                        <span><i class="fas fa-check-circle"></i> Desk-style reasoning rather than generic course copy</span>
                        <span><i class="fas fa-check-circle"></i> No email gate required to inspect the sample</span>
                    </div>
                </div>
            </section>

            <section class="bundle-v2-section" id="bundle-author">
                <div class="bundle-credibility">
                    <h3>Practitioner-built, with the model-risk questions left in.</h3>
                    <p>Desk2Quant material is written from a practising quantitative-risk perspective. The emphasis is not only on deriving a model, but on implementation choices, calibration intuition, hedging consequences, P&amp;L behaviour, validation questions and the places where clean textbook assumptions break.</p>
                </div>
            </section>

            <section class="bundle-v2-section" id="bundle-faq">
                <div class="bundle-section-head">
                    <span>Before checkout</span>
                    <h2>Frequently asked questions</h2>
                </div>
                <div class="bundle-faq">
                    <details><summary>What exactly do I receive?</summary><p>41+ structured PDFs plus 60+ scripts/code resources across quantitative foundations, derivatives, asset-class models, Python/C++/SQL, risk, XVA, validation, projects and interview preparation.</p></details>
                    <details><summary>Is this only for interview preparation?</summary><p>No. Interview material is one component. The larger goal is a desk-focused reference system covering pricing, implementation, risk, validation and model reasoning.</p></details>
                    <details><summary>How is the bundle delivered?</summary><p>It is a digital product. After verified payment, Desk2Quant's existing delivery and My Access workflow provides access to the purchased resources.</p></details>
                    <details><summary>Is there a discount code?</summary><p>Yes. The configured bundle coupon is <strong>COMBINED10</strong>, which applies 10% off when valid at checkout.</p></details>
                </div>
            </section>

            <section class="bundle-final-cta" id="bundle-buy">
                <div>
                    <h2>Build the full quant stack instead of collecting disconnected notes.</h2>
                    <p>41+ PDFs • 60+ scripts • 1000+ interview problems • Python + C++ + SQL</p>
                    <p class="bundle-final-price" id="bundle-final-price">₹7,999 • List value ₹12,999 • COMBINED10 available</p>
                </div>
                <button class="bundle-final-buy" id="bundle-final-buy-btn" type="button">Get Complete Bundle <i class="fas fa-arrow-right"></i></button>
            </section>
        `;
        preview.insertAdjacentElement('beforebegin', wrapper);

        const previewEyebrow = preview.querySelector('.product-preview-eyebrow');
        const previewTitle = preview.querySelector('.product-preview-title');
        const previewSummary = document.getElementById('preview-summary');
        if (previewEyebrow) previewEyebrow.textContent = 'Resource preview';
        if (previewTitle) previewTitle.textContent = 'Inspect the material before you commit';
        if (previewSummary) previewSummary.textContent = 'Use the structured preview below together with the real sample PDF above to assess the bundle depth and fit.';
    }

    function enhanceLoadedProduct() {
        const content = document.getElementById('product-content');
        const title = document.getElementById('p-title');
        const desc = document.getElementById('p-desc');
        const price = document.getElementById('p-price');
        const buy = document.getElementById('buy-btn');
        if (!content || !title || !desc || !price || !buy) return false;
        if (title.textContent.trim() === 'Product Title') return false;
        if (content.dataset.bundleV2Applied === '1') return true;
        content.dataset.bundleV2Applied = '1';

        document.body.classList.add('bundle-v2');
        const container = document.querySelector('.product-page-container');
        if (container) container.id = 'bundle-overview';

        title.textContent = 'Complete Front Office & Risk Quant Professional Bundle';
        if (!title.previousElementSibling || !title.previousElementSibling.classList.contains('bundle-kicker')) {
            title.insertAdjacentHTML('beforebegin', '<div class="bundle-kicker"><i class="fas fa-layer-group"></i> Complete Desk2Quant System</div>');
        }
        title.insertAdjacentHTML('afterend', '<p class="bundle-hero-lede">From foundations to desk-ready reasoning: pricing, models, risk, XVA, validation, implementation, projects and interviews in one structured system.</p>');

        desc.innerHTML = '<strong>Stop learning models as isolated formulas.</strong> This bundle is designed to connect product mechanics → model choice → implementation → Greeks and P&amp;L → risk and validation → interview defence.';

        price.insertAdjacentHTML('afterend', `
            <div class="bundle-price-note"><span>List value <s>₹12,999</s></span><span>•</span><span>Use <code>COMBINED10</code> for 10% off</span></div>
            <div class="bundle-value-row" aria-label="Bundle contents">
                <div class="bundle-value-chip"><strong>41+</strong>PDFs</div>
                <div class="bundle-value-chip"><strong>60+</strong>Scripts</div>
                <div class="bundle-value-chip"><strong>1000+</strong>Interview problems</div>
                <div class="bundle-value-chip"><strong>3</strong>Python • C++ • SQL</div>
            </div>`);

        const actions = content.querySelector('.action-buttons');
        if (actions) {
            actions.insertAdjacentHTML('afterend', '<div class="bundle-trust-row"><span><i class="fas fa-check-circle"></i> Instant digital delivery</span><span><i class="fas fa-check-circle"></i> My Access library</span><span><i class="fas fa-check-circle"></i> Secure Razorpay checkout</span></div>');
        }

        insertLandingSections();

        const finalBuy = document.getElementById('bundle-final-buy-btn');
        if (finalBuy) finalBuy.addEventListener('click', () => buy.click());

        const finalPrice = document.getElementById('bundle-final-price');
        if (finalPrice) {
            const syncPrice = () => {
                const live = (price.textContent || '').replace(/\s+/g, ' ').trim();
                if (live) finalPrice.textContent = `${live} • List value ₹12,999 • COMBINED10 available`;
            };
            syncPrice();
            new MutationObserver(syncPrice).observe(price, { childList: true, subtree: true, characterData: true });
        }

        return true;
    }

    function init() {
        addStyles();
        insertStickyNav();
        if (enhanceLoadedProduct()) return;

        const title = document.getElementById('p-title');
        if (title) {
            const observer = new MutationObserver(() => {
                if (enhanceLoadedProduct()) observer.disconnect();
            });
            observer.observe(title, { childList: true, subtree: true, characterData: true });
        }

        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            if (enhanceLoadedProduct() || attempts > 80) clearInterval(timer);
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
