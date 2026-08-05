/**
 * Wires the playground UI. Kept separate from the engine so the engine stays
 * testable and the DOM wiring stays obvious.
 */
(function () {
    'use strict';

    var GP = window.GauntletPlayground;

    var TITLES = {
        '00-warmup-bond': 'Warm-up: bond price and duration',
        '01-sofr-curve': 'Bootstrap an OIS / SOFR discount curve'
    };

    // Free projects need no proof of purchase. Paid ones are playable once the
    // buyer has unlocked them; grading is still re-verified server-side against
    // Razorpay on every submission, so this is convenience, not security.
    var FREE = ['00-warmup-bond'];

    function creds(slug) {
        try {
            var raw = localStorage.getItem('gauntlet:unlock:' + slug);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function saveCreds(slug, paymentId, email) {
        try {
            localStorage.setItem('gauntlet:unlock:' + slug,
                JSON.stringify({ payment_id: paymentId, email: email }));
        } catch (e) { /* private mode; they can re-enter it */ }
    }

    function isPlayable(slug) {
        return FREE.indexOf(slug) !== -1 || !!creds(slug);
    }

    var BUY_URL = '/product.html?id=eb4ee16b-8a1f-475c-9dbf-e03993528ac9';

    function showLocked(slug) {
        var title = el('gp-title');
        if (title) title.textContent = TITLES[slug] || slug;

        var code = el('gp-code');
        if (code) { code.value = ''; code.disabled = true; }

        ['gp-run', 'gp-checks', 'gp-grade', 'gp-reset'].forEach(function (id) {
            var b = el(id);
            if (b) b.disabled = true;
        });

        var sc = el('gp-scorecard');
        if (sc) {
            sc.innerHTML = '<div class="gp-locked">'
                + '<h3><i class="fas fa-lock"></i> Already bought this project?</h3>'
                + '<p>Enter the email you paid with and the payment id from your receipt '
                + 'to unlock the editor and instant grading.</p>'
                + '<form class="gp-unlock-form" id="gp-unlock-form">'
                + '<input type="email" id="gp-unlock-email" placeholder="Email you paid with" '
                + 'autocomplete="email" required>'
                + '<input type="text" id="gp-unlock-pay" placeholder="Payment id (pay_...)" '
                + 'spellcheck="false" required>'
                + '<button type="submit" class="g-btn g-btn-primary">Unlock</button>'
                + '</form>'
                + '<p class="gp-unlock-msg" id="gp-unlock-msg"></p>'
                + '<p class="gp-locked-alt">Not bought it yet? '
                + '<a href="' + BUY_URL + '">Get Project 01</a> or '
                + '<a href="?project=00-warmup-bond">try the free warm-up</a>.</p>'
                + '</div>';
            sc.hidden = false;

            var form = el('gp-unlock-form');
            if (form) {
                form.addEventListener('submit', function (e) {
                    e.preventDefault();
                    attemptUnlock(slug);
                });
            }
        }
        GP.setStatus('Locked - unlock it, or run the free warm-up.', 'err');
    }

    /**
     * Confirm the purchase server-side before unlocking. Sending an empty
     * submission is enough: entitlement is checked before grading, so a
     * non-buyer gets 402/403 and learns nothing about the answers.
     */
    function attemptUnlock(slug) {
        var email = (el('gp-unlock-email') || {}).value;
        var pay = (el('gp-unlock-pay') || {}).value;
        var msg = el('gp-unlock-msg');
        var btn = document.querySelector('#gp-unlock-form button');

        if (!email || !pay) return;
        if (btn) btn.disabled = true;
        if (msg) { msg.textContent = 'Checking your purchase...'; msg.className = 'gp-unlock-msg'; }

        fetch('/api/products?action=grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: slug,
                submission: {},
                payment_id: String(pay).trim(),
                email: String(email).trim()
            })
        }).then(function (r) {
            return r.json().then(function (b) { return { status: r.status, body: b }; });
        }).then(function (out) {
            // Entitlement passes -> we get a graded result (0 for an empty
            // submission), not an error. Anything else is a real rejection.
            if (out.status === 200) {
                saveCreds(slug, String(pay).trim(), String(email).trim());
                if (msg) { msg.textContent = 'Unlocked. Loading the project...'; msg.className = 'gp-unlock-msg gp-unlock-ok'; }
                setTimeout(function () { selectProject(slug); }, 600);
                return;
            }
            if (msg) {
                msg.textContent = (out.body && out.body.error) || 'Could not verify that purchase.';
                msg.className = 'gp-unlock-msg gp-unlock-err';
            }
            if (btn) btn.disabled = false;
        }).catch(function () {
            if (msg) { msg.textContent = 'Network error. Try again.'; msg.className = 'gp-unlock-msg gp-unlock-err'; }
            if (btn) btn.disabled = false;
        });
    }

    function el(id) { return document.getElementById(id); }

    function currentSlug() {
        var params = new URLSearchParams(window.location.search);
        var p = params.get('project');
        return TITLES[p] ? p : '00-warmup-bond';
    }

    function selectProject(slug) {
        var title = el('gp-title');
        if (title) title.textContent = TITLES[slug] || slug;

        var sc = el('gp-scorecard');
        if (sc) { sc.hidden = true; sc.innerHTML = ''; }

        var out = el('gp-output');
        if (out) out.textContent = '';

        // Keep the URL shareable and bookmarkable.
        var url = new URL(window.location.href);
        url.searchParams.set('project', slug);
        window.history.replaceState({}, '', url);

        if (!isPlayable(slug)) {
            showLocked(slug);
            return;
        }

        var code = el('gp-code');
        if (code) code.disabled = false;
        ['gp-run', 'gp-checks', 'gp-grade', 'gp-reset'].forEach(function (id) {
            var b = el(id);
            if (b) b.disabled = false;
        });

        window.GauntletRunner.loadProject(slug);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var slug = currentSlug();
        var picker = el('gp-project');
        if (picker) {
            picker.value = slug;
            picker.addEventListener('change', function () { selectProject(picker.value); });
        }

        var run = el('gp-run');
        if (run) run.addEventListener('click', function () { window.GauntletRunner.run('main'); });

        var checks = el('gp-checks');
        if (checks) checks.addEventListener('click', function () { window.GauntletRunner.run('checks'); });

        var reset = el('gp-reset');
        if (reset) reset.addEventListener('click', function () {
            if (window.confirm('Discard your changes and reload the original starter?')) {
                window.GauntletRunner.reset();
            }
        });

        var grade = el('gp-grade');
        if (grade) grade.addEventListener('click', function () { window.GauntletGrade(); });

        // Tab should indent, not jump focus out of the editor.
        var code = el('gp-code');
        if (code) {
            code.addEventListener('keydown', function (e) {
                if (e.key !== 'Tab') return;
                e.preventDefault();
                var s = code.selectionStart, en = code.selectionEnd;
                code.value = code.value.slice(0, s) + '    ' + code.value.slice(en);
                code.selectionStart = code.selectionEnd = s + 4;
            });
        }

        selectProject(slug);
    });
})();
