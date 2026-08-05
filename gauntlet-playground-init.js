/**
 * Wires the playground UI. Kept separate from the engine so the engine stays
 * testable and the DOM wiring stays obvious.
 */
(function () {
    'use strict';

    var TITLES = {
        '00-warmup-bond': 'Warm-up: bond price and duration',
        '01-sofr-curve': 'Bootstrap an OIS / SOFR discount curve'
    };

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
