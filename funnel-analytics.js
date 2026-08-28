(function () {
    'use strict';

    const ENDPOINT = 'https://dntabmyurlrlnoajdnja.supabase.co/functions/v1/log-funnel-event';
    const SESSION_KEY = 'd2q_funnel_session_v1';
    const CAMPAIGN_KEY = 'd2q_funnel_campaign_v1';
    const DIAG_KEY = 'd2q_funnel_diag_ctx_v1';
    const CHECKOUT_KEY = 'd2q_funnel_checkout_v1';
    const ACTIVE_DIAG_KEY = 'd2q_funnel_active_diag_v1';
    const DIAG_RESULT_KEY = 'd2q_quant_diagnostic_v1';
    const ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const PRODUCT_DOMAIN = Object.freeze({
        '30d74f65-720f-4c8a-9358-5c034c713433': 'foundations',
        '1d425519-ab39-4aa7-92fa-2d42c42946d6': 'foundations',
        '6f4d2332-a1d0-4638-9307-0e2d9fe7453d': 'foundations',
        'bdb3c59e-c8c0-430f-8705-b7467514458e': 'pricing',
        '75f6118b-c10e-43c6-acc6-ec48cd6a6cbc': 'pricing',
        'a778e6ae-43d1-4cbd-a6a7-6dce693e5f69': 'risk',
        '351aa09b-681b-4da9-9b61-844cf295640c': 'risk',
        '146ecb42-3df6-41de-a499-14c22b1bd36d': 'risk',
        '0c8d934a-3844-407b-985e-210783d8cfe6': 'risk',
        '9ad9f8ac-9872-40c3-82b8-1e6168e65062': 'implementation',
        'c3e4c5cc-6616-4728-b979-782bec4d8811': 'implementation',
        '798495e8-653a-480c-9ea8-3182f43f2b9d': 'implementation',
        '6b78550d-e130-41d1-9409-92335ce82a6c': 'implementation',
        '73806d69-768b-497e-87b7-d94fa4cfd772': 'interview',
        'bd2e57b7-32c4-44ad-8a2a-d156222b7ff7': 'integration',
        'eb4ee16b-8a1f-475c-9dbf-e03993528ac9': 'integration',
        '164308cd-e3cd-4026-8fdc-337a5955ffff': 'bundle'
    });

    function randomId(prefix) {
        try {
            const raw = crypto.randomUUID().replace(/-/g, '');
            return `${prefix}_${raw}`.slice(0, 80);
        } catch (_) {
            return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`.slice(0, 80);
        }
    }
    function readSession(key) {
        try { return sessionStorage.getItem(key); } catch (_) { return null; }
    }
    function writeSession(key, value) {
        try { sessionStorage.setItem(key, value); } catch (_) { }
    }
    function removeSession(key) {
        try { sessionStorage.removeItem(key); } catch (_) { }
    }
    function readJson(key) {
        try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
    }
    function writeJson(key, value) {
        try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) { }
    }
    function sessionId() {
        let id = readSession(SESSION_KEY);
        if (!id || !ID_RE.test(id)) {
            id = randomId('s');
            writeSession(SESSION_KEY, id);
        }
        return id;
    }
    function clean(value, max) {
        if (typeof value !== 'string') return null;
        const s = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
        return s ? s.slice(0, max) : null;
    }
    function productIdFromHref(href) {
        try {
            const id = new URL(href, location.origin).searchParams.get('id');
            return id && UUID_RE.test(id) ? id : null;
        } catch (_) { return null; }
    }
    function currentProductId() {
        try {
            const id = new URLSearchParams(location.search).get('id');
            return id && UUID_RE.test(id) ? id : null;
        } catch (_) { return null; }
    }
    function referrerHost() {
        try { return document.referrer ? new URL(document.referrer).hostname.slice(0, 180) : null; } catch (_) { return null; }
    }
    function campaign() {
        const existing = readJson(CAMPAIGN_KEY);
        if (existing) return existing;
        let data = { utm_source: null, utm_medium: null, utm_campaign: null, referrer_host: referrerHost() };
        try {
            const q = new URLSearchParams(location.search);
            data.utm_source = clean(q.get('utm_source'), 100);
            data.utm_medium = clean(q.get('utm_medium'), 100);
            data.utm_campaign = clean(q.get('utm_campaign'), 120);
        } catch (_) { }
        writeJson(CAMPAIGN_KEY, data);
        return data;
    }
    function readinessBand(score) {
        const n = Number(score);
        if (n >= 90) return '90_plus';
        if (n >= 75) return '75_89';
        if (n >= 55) return '55_74';
        return 'below_55';
    }
    function diagnosticContext() { return readJson(DIAG_KEY) || null; }
    function setDiagnosticContext(ctx) { writeJson(DIAG_KEY, ctx); }
    function contextFields() {
        const ctx = diagnosticContext() || {};
        return {
            diagnostic_id: ctx.diagnostic_id || null,
            role: ctx.role || null,
            experience: ctx.experience || null,
            timeline: ctx.timeline || null,
            readiness_band: ctx.readiness_band || null,
            top_gap: ctx.top_gap || null,
            material_gap_count: Number.isInteger(ctx.material_gap_count) ? ctx.material_gap_count : null,
            bundle_suggested: typeof ctx.bundle_suggested === 'boolean' ? ctx.bundle_suggested : null
        };
    }

    function track(eventName, data) {
        const payload = Object.assign({
            event_id: randomId('e'),
            session_id: sessionId(),
            event_name: eventName,
            page_path: location.pathname || '/',
            product_id: null,
            source: null,
            role: null,
            experience: null,
            timeline: null,
            readiness_band: null,
            top_gap: null,
            recommendation_domain: null,
            material_gap_count: null,
            bundle_suggested: null,
            amount: null,
            currency: null,
            cta_source: null
        }, campaign(), contextFields(), data || {});

        // Never let caller-supplied fields expand this privacy-minimized schema.
        const allowed = [
            'event_id','session_id','diagnostic_id','event_name','page_path','product_id','source',
            'role','experience','timeline','readiness_band','top_gap','recommendation_domain',
            'material_gap_count','bundle_suggested','amount','currency','cta_source',
            'utm_source','utm_medium','utm_campaign','referrer_host'
        ];
        const safe = {};
        allowed.forEach(k => { if (payload[k] !== undefined) safe[k] = payload[k]; });

        try {
            fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                body: JSON.stringify(safe),
                keepalive: true,
                credentials: 'omit',
                mode: 'cors'
            }).catch(() => {});
        } catch (_) { }
    }

    function sourceForRoleCard(card) {
        const id = productIdFromHref(card.href);
        const roleByProduct = {
            'bdb3c59e-c8c0-430f-8705-b7467514458e': 'pricing',
            '351aa09b-681b-4da9-9b61-844cf295640c': 'xva',
            'a778e6ae-43d1-4cbd-a6a7-6dce693e5f69': 'validation',
            '73806d69-768b-497e-87b7-d94fa4cfd772': 'general'
        };
        return { product_id: id, role: id ? roleByProduct[id] || null : null, source: 'role_selector' };
    }

    function instrumentHomepage() {
        document.addEventListener('click', function (event) {
            const role = event.target.closest('.role-path-card');
            if (role) {
                track('role_path_selected', sourceForRoleCard(role));
                return;
            }
            const goal = event.target.closest('.d2q-diag-card a');
            if (goal) {
                track('goal_path_selected', {
                    product_id: productIdFromHref(goal.href),
                    source: 'goal_starting_points'
                });
            }
        }, { passive: true });
    }

    function makeDiagnosticId() {
        const id = randomId('d');
        writeSession(ACTIVE_DIAG_KEY, id);
        return id;
    }
    function activeDiagnosticId() {
        const id = readSession(ACTIVE_DIAG_KEY);
        return id && ID_RE.test(id) ? id : makeDiagnosticId();
    }
    function readSavedDiagnostic() {
        try { const raw = localStorage.getItem(DIAG_RESULT_KEY); return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
    }

    function instrumentDiagnostic() {
        const form = document.getElementById('qd-form');
        if (!form) return;
        let started = false;
        form.addEventListener('change', function () {
            if (started) return;
            started = true;
            track('diagnostic_started', { diagnostic_id: activeDiagnosticId(), source: 'diagnostic_form' });
        }, { passive: true });

        form.addEventListener('submit', function () {
            window.setTimeout(function () {
                const result = readSavedDiagnostic();
                const resultWrap = document.getElementById('qd-result');
                if (!result || !resultWrap || resultWrap.hidden) return;
                const id = activeDiagnosticId();
                const topGap = result.priorities && result.priorities[0] ? result.priorities[0].key : 'none';
                const ctx = {
                    diagnostic_id: id,
                    role: result.role || null,
                    experience: result.experience || null,
                    timeline: result.timeline || null,
                    readiness_band: readinessBand(result.readiness),
                    top_gap: topGap || 'none',
                    material_gap_count: Number(result.materialGapCount) || 0,
                    bundle_suggested: !!result.bundleAlternative,
                    last_recommended_product_id: null,
                    last_recommendation_domain: null
                };
                setDiagnosticContext(ctx);
                track('diagnostic_completed', Object.assign({ source: 'diagnostic_form' }, contextFields()));
            }, 80);
        });

        document.addEventListener('click', function (event) {
            const rec = event.target.closest('.qd-resource-card a, .qd-bundle-alt a');
            if (rec) {
                const productId = productIdFromHref(rec.href);
                if (!productId) return;
                const domain = PRODUCT_DOMAIN[productId] || null;
                const ctx = diagnosticContext() || {};
                ctx.last_recommended_product_id = productId;
                ctx.last_recommendation_domain = domain;
                setDiagnosticContext(ctx);
                track('diagnostic_recommendation_clicked', {
                    product_id: productId,
                    recommendation_domain: domain,
                    source: rec.closest('.qd-bundle-alt') ? 'diagnostic_bundle_alt' : 'diagnostic_resource'
                });
                return;
            }
            const retake = event.target.closest('#qd-retake');
            if (retake) {
                removeSession(ACTIVE_DIAG_KEY);
                started = false;
            }
        }, { passive: true });
    }

    function priceContext() {
        const buy = document.getElementById('buy-btn');
        const amount = buy ? Number(buy.dataset.price) : NaN;
        const currency = buy && /^[A-Z]{3}$/.test(String(buy.dataset.currency || '').toUpperCase())
            ? String(buy.dataset.currency).toUpperCase() : 'INR';
        return { amount: Number.isFinite(amount) && amount >= 0 ? amount : null, currency };
    }
    function ctaSource(el) {
        if (!el) return 'unknown';
        if (el.id === 'cartCheckoutBtn') return 'cart_checkout';
        if (el.id === 'bundle-final-buy-btn') return 'bundle_final';
        if (el.id === 'bundle-proof-buy-clean' || el.classList.contains('bundle-proof-cta')) return 'bundle_value_proof';
        if (el.id === 'buy-btn') return 'product_primary';
        return 'product_cta';
    }
    function setPendingCheckout(ctx) { writeJson(CHECKOUT_KEY, ctx); }
    function pendingCheckout() { return readJson(CHECKOUT_KEY); }
    function clearPendingCheckout() { removeSession(CHECKOUT_KEY); }

    function observeRazorpay() {
        let wasOpen = false;
        let closeTimer = null;
        const selector = '.razorpay-container, iframe[src*="razorpay"]';
        const check = function () {
            const open = !!document.querySelector(selector);
            const ctx = pendingCheckout();
            if (open && !wasOpen && ctx && Date.now() - Number(ctx.cta_at || 0) < 30 * 60 * 1000) {
                if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
                ctx.checkout_opened_at = Date.now();
                ctx.checkout_event_sent = true;
                setPendingCheckout(ctx);
                track('checkout_opened', {
                    product_id: ctx.product_id || null,
                    amount: ctx.amount == null ? null : ctx.amount,
                    currency: ctx.currency || null,
                    cta_source: ctx.cta_source || null,
                    source: 'razorpay_overlay'
                });
            }
            if (!open && wasOpen) {
                if (closeTimer) clearTimeout(closeTimer);
                closeTimer = setTimeout(function () {
                    const latest = pendingCheckout();
                    if (latest && !latest.purchase_success_sent) clearPendingCheckout();
                }, 30000);
            }
            wasOpen = open;
        };
        new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'src'] });
        check();
    }

    function wrapSuccessModal() {
        let attempts = 0;
        const timer = setInterval(function () {
            attempts += 1;
            const original = window.showSuccessModal;
            if (typeof original === 'function' && !original.__d2qFunnelWrapped) {
                const wrapped = function () {
                    const result = original.apply(this, arguments);
                    const ctx = pendingCheckout();
                    const openedAt = ctx && Number(ctx.checkout_opened_at || 0);
                    if (ctx && openedAt && Date.now() - openedAt < 10 * 60 * 1000 && !ctx.purchase_success_sent) {
                        ctx.purchase_success_sent = true;
                        setPendingCheckout(ctx);
                        track('purchase_success', {
                            product_id: ctx.product_id || null,
                            amount: ctx.amount == null ? null : ctx.amount,
                            currency: ctx.currency || null,
                            cta_source: ctx.cta_source || null,
                            source: 'verified_success_ui'
                        });
                        setTimeout(clearPendingCheckout, 1000);
                    }
                    return result;
                };
                wrapped.__d2qFunnelWrapped = true;
                window.showSuccessModal = wrapped;
                clearInterval(timer);
            } else if (attempts > 240) {
                clearInterval(timer);
            }
        }, 250);
    }

    function instrumentProductAndCheckout() {
        const productId = currentProductId();
        if (location.pathname === '/product.html' && productId) {
            const ctx = diagnosticContext();
            if (ctx && ctx.last_recommended_product_id === productId) {
                track('product_view_from_diagnostic', {
                    product_id: productId,
                    recommendation_domain: ctx.last_recommendation_domain || PRODUCT_DOMAIN[productId] || null,
                    source: 'diagnostic_recommendation'
                });
            }
        }

        document.addEventListener('click', function (event) {
            const sample = event.target.closest('a[href*="/assets/samples/"]');
            if (sample) {
                track('sample_opened', { product_id: productId, source: 'product_sample' });
                return;
            }

            const cta = event.target.closest('#buy-btn, #bundle-final-buy-btn, #bundle-proof-buy-clean, .bundle-proof-cta, #cartCheckoutBtn');
            if (!cta || event.isTrusted === false) return;
            const source = ctaSource(cta);
            const price = priceContext();
            const ctx = {
                cta_at: Date.now(),
                checkout_opened_at: null,
                purchase_success_sent: false,
                product_id: cta.id === 'cartCheckoutBtn' ? null : productId,
                amount: cta.id === 'cartCheckoutBtn' ? null : price.amount,
                currency: cta.id === 'cartCheckoutBtn' ? null : price.currency,
                cta_source: source
            };
            setPendingCheckout(ctx);
            track('purchase_cta_clicked', {
                product_id: ctx.product_id,
                amount: ctx.amount,
                currency: ctx.currency,
                cta_source: source,
                source: 'commerce_ui'
            });
        });

        observeRazorpay();
        wrapSuccessModal();
    }

    function init() {
        sessionId();
        campaign();
        if (location.pathname === '/' || location.pathname === '/index.html') instrumentHomepage();
        if (location.pathname === '/diagnostic.html') instrumentDiagnostic();
        if (location.pathname === '/product.html' || document.getElementById('cartCheckoutBtn')) instrumentProductAndCheckout();
    }

    window.D2QFunnel = Object.freeze({ track, diagnosticContext });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
