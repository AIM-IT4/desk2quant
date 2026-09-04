/* Desk2Quant product advisor widget.
 * Self-contained and deferred: injects its own markup and styles on first
 * open, so it adds no render-blocking weight to the homepage. */
(function () {
    'use strict';
    var ENDPOINT = '/api/interview';
    var history = [];
    var busy = false;
    var built = false;
    var els = {};

    var GREETING = "Hi. Tell me your background and the role you're targeting, and I'll point you to the right material.";

    function css() {
        return [
            '.d2q-adv-fab{position:fixed;right:20px;bottom:20px;z-index:9990;display:flex;align-items:center;gap:8px;',
            'padding:12px 18px;border:0;border-radius:999px;cursor:pointer;font:600 14px/1 inherit;color:#fff;',
            'background:linear-gradient(135deg,#2563eb,#1e40af);box-shadow:0 6px 22px rgba(37,99,235,.38);transition:transform .25s ease,opacity .25s ease;}',
            '.d2q-adv-fab:hover{transform:translateY(-2px);}',
            '.d2q-adv-fab[hidden]{display:none;}',
            '.d2q-adv-fab.is-hero-hidden{opacity:0;pointer-events:none;transform:translateY(16px);}',
            '.d2q-adv-panel{position:fixed;right:20px;bottom:20px;z-index:10001;width:min(380px,calc(100vw - 32px));',
            'height:min(560px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden;',
            'background:#fff;color:#0f172a;border-radius:16px;box-shadow:0 20px 60px rgba(2,6,23,.28);}',
            '.d2q-adv-panel[hidden]{display:none;}',
            '.d2q-adv-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px;',
            'background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;}',
            '.d2q-adv-head strong{font-size:15px;}',
            '.d2q-adv-head small{display:block;opacity:.85;font-size:11px;font-weight:400;}',
            '.d2q-adv-head a{color:#bfdbfe;text-decoration:underline;cursor:pointer;}',
            '.d2q-adv-head a:hover{color:#fff;}',
            '.d2q-adv-x{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px;}',
            '.d2q-adv-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f8fafc;}',
            '.d2q-adv-msg{max-width:86%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.5;',
            'white-space:pre-wrap;word-break:break-word;}',
            '.d2q-adv-msg a{color:#1d4ed8;text-decoration:underline;}',
            '.d2q-adv-bot{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;}',
            '.d2q-adv-me{align-self:flex-end;background:#2563eb;color:#fff;}',
            '.d2q-adv-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e2e8f0;background:#fff;}',
            '.d2q-adv-form input{flex:1;min-width:0;padding:11px 13px;border:1px solid #cbd5e1;border-radius:10px;',
            'font-size:13.5px;font-family:inherit;color:#0f172a;background:#fff;}',
            '.d2q-adv-form button{padding:11px 16px;border:0;border-radius:10px;background:#2563eb;color:#fff;',
            'font:600 13.5px/1 inherit;cursor:pointer;}',
            '.d2q-adv-form button:disabled{opacity:.55;cursor:default;}',
            '@media (prefers-reduced-motion:reduce){.d2q-adv-fab{transition:none;}.d2q-adv-fab:hover{transform:none;}}',
            '@media (max-width:768px){',
            '  .d2q-adv-panel{right:8px;left:8px;bottom:8px;width:auto;height:min(70vh,520px);}',
            '  .d2q-adv-fab{right:14px;bottom:14px;padding:9px 13px;font-size:12px;gap:5px;}',
            '}',
            '@media (max-width:420px){',
            '  .d2q-adv-fab .d2q-adv-fab-text{display:inline;}',
            '  .d2q-adv-fab{padding:8px 12px;font-size:11.5px;}',
            '}',
            'body:has(.promo-popup-modal.active) .d2q-adv-fab, body:has(.success-modal.active) .d2q-adv-fab, body:has(#cartDrawer.active) .d2q-adv-fab { display: none !important; }'
        ].join('');
    }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Turn the model's /products/<slug>.html paths into real links.
    function linkify(text) {
        return esc(text).replace(/\/products\/[a-z0-9-]+\.html/g, function (m) {
            return '<a href="' + m + '">' + m.replace('/products/', '').replace('.html', '') + '</a>';
        });
    }

    function add(role, text) {
        var d = document.createElement('div');
        d.className = 'd2q-adv-msg ' + (role === 'user' ? 'd2q-adv-me' : 'd2q-adv-bot');
        if (role === 'user') { d.textContent = text; } else { d.innerHTML = linkify(text); }
        els.log.appendChild(d);
        els.log.scrollTop = els.log.scrollHeight;
        return d;
    }

    var cssDone = false;
    function injectCss() {
        if (cssDone) return;
        cssDone = true;
        var st = document.createElement('style');
        st.textContent = css();
        document.head.appendChild(st);
    }

    function build() {
        if (built) return;
        built = true;
        injectCss();

        var panel = document.createElement('div');
        panel.className = 'd2q-adv-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Product advisor');
        panel.hidden = true;
        panel.innerHTML =
            '<div class="d2q-adv-head"><span><strong>Which pack is right for me?</strong>' +
            '<small>AI Quant Advisor &bull; <a href="#contact" class="d2q-adv-mentorship-link">1-on-1 Mentorship</a></small></span>' +
            '<button class="d2q-adv-x" type="button" aria-label="Close advisor">&times;</button></div>' +
            '<div class="d2q-adv-log"></div>' +
            '<form class="d2q-adv-form"><input type="text" maxlength="600" autocomplete="off" ' +
            'placeholder="e.g. CS grad, know Python, want risk quant roles"><button type="submit">Send</button></form>';
        document.body.appendChild(panel);

        els.panel = panel;
        els.log = panel.querySelector('.d2q-adv-log');
        els.form = panel.querySelector('.d2q-adv-form');
        els.input = panel.querySelector('input');
        els.send = panel.querySelector('button[type=submit]');
        panel.querySelector('.d2q-adv-x').addEventListener('click', close);
        var mentorLink = panel.querySelector('.d2q-adv-mentorship-link');
        if (mentorLink) {
            mentorLink.addEventListener('click', function (e) {
                e.preventDefault();
                close();
                var contactEl = document.getElementById('contact');
                if (contactEl) contactEl.scrollIntoView({ behavior: 'smooth' });
            });
        }
        els.form.addEventListener('submit', submit);
        add('assistant', GREETING);
    }

    function open() {
        build();
        els.panel.hidden = false;
        els.fab.hidden = true;
        els.input.focus();
    }

    function close() {
        els.panel.hidden = true;
        els.fab.hidden = false;
    }

    function submit(e) {
        e.preventDefault();
        if (busy) return;
        var text = els.input.value.trim();
        if (!text) return;
        els.input.value = '';
        add('user', text);
        history.push({ role: 'user', content: text });

        busy = true;
        els.send.disabled = true;
        var pending = add('assistant', 'Thinking\u2026');

        fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'chat', messages: history.slice(-8) })
        }).then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
        }).then(function (res) {
            if (res.status === 429) {
                pending.textContent = 'Too many messages just now. Try again in ' +
                    (res.j.retryAfter || 10) + 's.';
                return;
            }
            if (!res.ok || !res.j.reply) {
                pending.textContent = res.j.error || 'Something went wrong. Please try again.';
                return;
            }
            pending.innerHTML = linkify(res.j.reply);
            history.push({ role: 'assistant', content: res.j.reply });
        }).catch(function () {
            pending.textContent = 'Network error. Please try again.';
        }).then(function () {
            busy = false;
            els.send.disabled = false;
            els.log.scrollTop = els.log.scrollHeight;
        });
    }

    function init() {
        // Inject styles up front: the FAB is visible before the panel is ever
        // built, and without them it rendered as an unstyled inline button with
        // z-index:auto, so the promo modal painted over it.
        injectCss();
        var fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'd2q-adv-fab';
        fab.setAttribute('aria-label', 'Open Quant Pack Advisor');
        fab.innerHTML = '<span aria-hidden="true">\uD83D\uDCAC</span><span class="d2q-adv-fab-text">Which pack suits me?</span>';
        fab.addEventListener('click', open);
        document.body.appendChild(fab);
        els.fab = fab;

        // Mobile ergonomics: On mobile screens, keep the FAB hidden while the
        // visitor is reading the hero section so it never covers proof points
        // or hero buttons. It cleanly fades in once the visitor scrolls down.
        function handleMobileScroll() {
            if (window.innerWidth <= 768) {
                var hero = document.getElementById('hero');
                var threshold = hero ? Math.max(hero.offsetHeight - 120, 280) : 320;
                if (window.scrollY < threshold) {
                    fab.classList.add('is-hero-hidden');
                } else {
                    fab.classList.remove('is-hero-hidden');
                }
            } else {
                fab.classList.remove('is-hero-hidden');
            }
        }

        window.addEventListener('scroll', handleMobileScroll, { passive: true });
        window.addEventListener('resize', handleMobileScroll, { passive: true });
        handleMobileScroll();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
})();
