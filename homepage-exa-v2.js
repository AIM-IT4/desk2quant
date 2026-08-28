(function () {
    'use strict';
    if (location.pathname !== '/' && location.pathname !== '/index.html') return;

    function addStyles() {
        if (document.getElementById('exa-home-v2-style')) return;
        const style = document.createElement('style');
        style.id = 'exa-home-v2-style';
        style.textContent = `
            .d2q-method,.d2q-diagnostic{padding:64px 0;background:#fff;border-bottom:1px solid #e5e7eb}
            .d2q-method-shell,.d2q-diag-shell{max-width:1180px;margin:0 auto;padding:0 20px}
            .d2q-method-head,.d2q-diag-head{max-width:760px;margin-bottom:28px}
            .d2q-method-head span,.d2q-diag-head span{color:#0f766e;font-size:.75rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
            .d2q-method-head h2,.d2q-diag-head h2{margin:8px 0 10px;color:#111827;font-size:clamp(1.9rem,3.5vw,2.8rem);line-height:1.1;letter-spacing:-.03em}
            .d2q-method-head p,.d2q-diag-head p{margin:0;color:#6b7280;line-height:1.65}
            .d2q-method-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
            .d2q-method-step{padding:22px 18px;border:1px solid #dfe7e5;border-radius:16px;background:#fbfdfc;min-height:180px}
            .d2q-method-step b{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#0f766e;color:#fff;font-size:.75rem;margin-bottom:12px}
            .d2q-method-step h3{margin:0 0 8px;color:#111827;font-size:1rem}.d2q-method-step p{margin:0;color:#6b7280;font-size:.86rem;line-height:1.55}
            .d2q-diagnostic-launch{display:grid;grid-template-columns:1fr auto;gap:22px;align-items:center;margin-bottom:22px;padding:24px;border:1px solid #b8ded9;border-radius:16px;background:#eefaf8}
            .d2q-diagnostic-launch span{color:#0f766e;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
            .d2q-diagnostic-launch h3{margin:6px 0 7px;color:#111827;font-size:1.25rem}.d2q-diagnostic-launch p{margin:0;color:#4b5563;font-size:.88rem;line-height:1.55}
            .d2q-diagnostic-launch a{display:inline-flex;align-items:center;gap:8px;padding:12px 16px;border-radius:9px;background:#0f766e;color:#fff;text-decoration:none;font-weight:800;white-space:nowrap}
            .d2q-diag-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.d2q-diag-card{padding:22px;border:1px solid #dfe7e5;border-radius:16px;background:#fff}
            .d2q-diag-card h3{margin:0 0 8px;color:#111827;font-size:1rem}.d2q-diag-card p{margin:0 0 14px;color:#6b7280;font-size:.86rem;line-height:1.55}.d2q-diag-card a{color:#0f766e;font-weight:800;text-decoration:none;font-size:.84rem}
            .d2q-diag-footer{margin-top:18px;color:#6b7280;font-size:.82rem;line-height:1.55}.d2q-diag-footer a{color:#0f766e;font-weight:800;text-decoration:none}
            @media(max-width:900px){.d2q-method-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.d2q-diag-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.d2q-diagnostic-launch{grid-template-columns:1fr}}
            @media(max-width:620px){.d2q-method,.d2q-diagnostic{padding:46px 0}.d2q-method-grid,.d2q-diag-grid{grid-template-columns:1fr}.d2q-method-step{min-height:0}.d2q-diagnostic-launch{padding:20px}.d2q-diagnostic-launch a{width:100%;justify-content:center}}
        `;
        document.head.appendChild(style);
    }

    function addSections() {
        if (document.getElementById('d2q-method')) return;
        const roles = document.getElementById('role-paths');
        if (!roles) return;

        const method = document.createElement('section');
        method.id = 'd2q-method';
        method.className = 'd2q-method';
        method.innerHTML = `
            <div class="d2q-method-shell">
                <div class="d2q-method-head">
                    <span>The Desk2Quant method</span>
                    <h2>Learn the model. Implement it. Break it. Validate it. Explain it.</h2>
                    <p>Each stage forces a different kind of understanding, so preparation moves beyond passive reading and formula recall.</p>
                </div>
                <div class="d2q-method-grid">
                    <article class="d2q-method-step"><b>1</b><h3>Learn</h3><p>Build the mathematical and product intuition first.</p></article>
                    <article class="d2q-method-step"><b>2</b><h3>Implement</h3><p>Turn equations into code, calibration and numerical workflows.</p></article>
                    <article class="d2q-method-step"><b>3</b><h3>Break it</h3><p>Stress assumptions, edge cases, stability and failure modes.</p></article>
                    <article class="d2q-method-step"><b>4</b><h3>Validate</h3><p>Challenge model choice, diagnostics, risk and P&amp;L behaviour.</p></article>
                    <article class="d2q-method-step"><b>5</b><h3>Explain</h3><p>Defend trade-offs clearly in interviews and desk discussions.</p></article>
                </div>
            </div>`;
        roles.insertAdjacentElement('afterend', method);

        const diagnostic = document.createElement('section');
        diagnostic.id = 'd2q-diagnostic';
        diagnostic.className = 'd2q-diagnostic';
        diagnostic.innerHTML = `
            <div class="d2q-diag-shell">
                <div class="d2q-diag-head">
                    <span>Choose your next step</span>
                    <h2>Start from evidence, not catalogue guesswork.</h2>
                    <p>If your target role is clear but your gaps are not, use the diagnostic. If the gap is already obvious, use one of the quick routes below.</p>
                </div>
                <div class="d2q-diagnostic-launch">
                    <div>
                        <span>3-minute self-assessment</span>
                        <h3>Quant Career Diagnostic</h3>
                        <p>Compare your self-assessed foundations, pricing, risk/XVA, implementation and interview readiness against explicit role benchmarks. Get ranked gaps and a 4-, 8- or 12-week sequence.</p>
                    </div>
                    <a href="/diagnostic.html">Take the diagnostic <i class="fas fa-arrow-right"></i></a>
                </div>
                <div class="d2q-diag-grid">
                    <article class="d2q-diag-card"><h3>I need stronger quant foundations</h3><p>Probability, statistics, stochastic calculus, linear algebra and numerical thinking.</p><a href="/product.html?id=6f4d2332-a1d0-4638-9307-0e2d9fe7453d">Start with foundations →</a></article>
                    <article class="d2q-diag-card"><h3>I want pricing/model depth</h3><p>Products, asset-class models, calibration, Greeks and hedging intuition.</p><a href="/product.html?id=bdb3c59e-c8c0-430f-8705-b7467514458e">Start with pricing →</a></article>
                    <article class="d2q-diag-card"><h3>I work in risk/validation</h3><p>Model challenge, failure modes, XVA, P&amp;L attribution and diagnostics.</p><a href="/product.html?id=a778e6ae-43d1-4cbd-a6a7-6dce693e5f69">Start with validation →</a></article>
                    <article class="d2q-diag-card"><h3>I am interviewing soon</h3><p>High-volume drills across maths, probability, coding, finance and models.</p><a href="/product.html?id=73806d69-768b-497e-87b7-d94fa4cfd772">Start interview prep →</a></article>
                </div>
                <p class="d2q-diag-footer">Preparation spans several domains? <a href="/product.html?id=164308cd-e3cd-4026-8fdc-337a5955ffff">Explore the Complete Bundle</a> after you know you need breadth.</p>
            </div>`;
        method.insertAdjacentElement('afterend', diagnostic);
    }

    function init() {
        addStyles();
        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            if (document.getElementById('role-paths')) {
                clearInterval(timer);
                addSections();
            } else if (attempts > 100) {
                clearInterval(timer);
            }
        }, 100);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();