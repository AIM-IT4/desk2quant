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

/* Website positioning v2 — Change #2: organize the homepage around the visitor's target role.
   Role cards reuse the existing storefront search; no commerce or product data is modified. */
(function applyRoleBasedQuantPaths() {
    const paths = [
        {
            title: 'Pricing / Desk Quant',
            icon: 'fa-chart-line',
            description: 'Derivatives, pricing models, calibration, numerical methods, and desk intuition.',
            action: 'Explore pricing resources',
            query: 'pricing'
        },
        {
            title: 'Risk Quant',
            icon: 'fa-shield-alt',
            description: 'Market risk, VaR/ES, stress testing, P&L diagnostics, and risk frameworks.',
            action: 'Explore risk resources',
            query: 'risk'
        },
        {
            title: 'Model Validation Quant',
            icon: 'fa-microscope',
            description: 'Model risk, benchmarking, calibration challenge, limitations, and validation cases.',
            action: 'Explore validation resources',
            query: 'model validation'
        },
        {
            title: 'XVA Quant',
            icon: 'fa-project-diagram',
            description: 'CVA, DVA, FVA, MVA, CCR, exposure simulation, and Monte Carlo.',
            action: 'Explore XVA resources',
            query: 'xva'
        },
        {
            title: 'Quant Researcher',
            icon: 'fa-flask',
            description: 'Probability, statistics, econometrics, time series, ML, and research projects.',
            action: 'Explore research resources',
            query: 'statistics'
        },
        {
            title: 'Quant Developer',
            icon: 'fa-code',
            description: 'Python, C++, numerical implementation, systems, and interview coding.',
            action: 'Explore developer resources',
            query: 'python'
        },
        {
            title: "I'm a Beginner",
            icon: 'fa-seedling',
            description: 'Start from first principles, build the maths and coding base, then move into pricing.',
            action: 'Start with foundations',
            query: 'beginner'
        },
        {
            title: 'Not Sure Yet',
            icon: 'fa-compass',
            description: 'Start with the free formula sheet and tools while you decide which quant track fits you.',
            action: 'Start free',
            query: '',
            href: '#lead-capture'
        }
    ];

    function apply() {
        const section = document.getElementById('choose-path');
        if (!section) return;

        const label = section.querySelector('.section-label');
        if (label) label.textContent = 'Choose by role';

        const heading = document.getElementById('choose-path-heading');
        if (heading) heading.innerHTML = 'What are you <span class="gradient-text">preparing for?</span>';

        const intro = section.querySelector('.flow-heading p');
        if (intro) intro.textContent = 'Choose your target role and Desk2Quant will take you to the most relevant starting point.';

        const grid = section.querySelector('.flow-grid');
        if (!grid) return;

        grid.setAttribute('aria-label', 'Quant career paths');
        grid.innerHTML = paths.map((path) => {
            const href = path.href || '#products';
            const queryAttr = path.query ? ` data-product-query="${path.query}"` : '';
            return `<a class="flow-card role-path-card" href="${href}" data-role="${path.title}"${queryAttr}>
                <div class="flow-icon"><i class="fas ${path.icon}"></i></div>
                <h3>${path.title}</h3>
                <p>${path.description}</p>
                <span class="flow-action">${path.action} <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
            </a>`;
        }).join('');

        grid.querySelectorAll('.role-path-card').forEach((card) => {
            card.addEventListener('click', function () {
                const role = this.dataset.role || '';
                const query = this.dataset.productQuery || '';
                try {
                    sessionStorage.setItem('desk2quantSelectedPath', role);
                } catch (e) {
                    /* storage may be unavailable; navigation still works */
                }

                if (!query) return;
                const searchInput = document.getElementById('productSearchInput');
                if (!searchInput) return;
                searchInput.value = query;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply, { once: true });
    } else {
        apply();
    }
})();
