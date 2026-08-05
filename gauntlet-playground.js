/**
 * Gauntlet playground: real CPython in the browser via Pyodide (WASM).
 *
 * "Run" genuinely executes the candidate's code and the public self-checks
 * client-side -- no server, nothing to sandbox, and no way for their code to
 * touch our infrastructure.
 *
 * Grading is separate and server-side: the expected values never reach the
 * browser, because anything shipped to the client is readable by the client.
 */
(function () {
    'use strict';

    var PYODIDE_VERSION = 'v0.26.2';
    var PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/' + PYODIDE_VERSION + '/full/';

    var pyodide = null;
    var loading = null;

    function el(id) { return document.getElementById(id); }

    function setStatus(msg, kind) {
        var s = el('gp-status');
        if (!s) return;
        s.textContent = msg;
        s.className = 'gp-status' + (kind ? ' gp-status-' + kind : '');
    }

    function write(text, kind) {
        var out = el('gp-output');
        if (!out) return;
        var line = document.createElement('div');
        line.className = 'gp-line' + (kind ? ' gp-line-' + kind : '');
        line.textContent = text;
        out.appendChild(line);
        out.scrollTop = out.scrollHeight;
    }

    function clearOutput() {
        var out = el('gp-output');
        if (out) out.textContent = '';
    }

    /** Load Pyodide once, lazily -- it is a large download. */
    function ensurePyodide() {
        if (pyodide) return Promise.resolve(pyodide);
        if (loading) return loading;

        setStatus('Loading Python runtime (about 8MB, first time only)...', 'busy');

        loading = new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = PYODIDE_URL + 'pyodide.js';
            script.onload = resolve;
            script.onerror = function () { reject(new Error('Could not load the Python runtime.')); };
            document.head.appendChild(script);
        }).then(function () {
            return window.loadPyodide({ indexURL: PYODIDE_URL });
        }).then(function (py) {
            pyodide = py;
            // Route Python stdout/stderr into our console pane.
            pyodide.setStdout({ batched: function (s) { write(s); } });
            pyodide.setStderr({ batched: function (s) { write(s, 'err'); } });
            setStatus('Python ready.', 'ok');
            return pyodide;
        }).catch(function (err) {
            loading = null;
            setStatus(err.message, 'err');
            throw err;
        });

        return loading;
    }

    /**
     * Proof-of-purchase for paid projects, shared by the loader and the grader.
     * Free projects have none and send nothing extra.
     */
    function unlockCreds(slug) {
        try {
            var raw = localStorage.getItem('gauntlet:unlock:' + slug);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }

    window.GauntletPlayground = {
        unlockCreds: unlockCreds,
        ensurePyodide: ensurePyodide,
        write: write,
        clearOutput: clearOutput,
        setStatus: setStatus,
        el: el,
        getPyodide: function () { return pyodide; }
    };
})();

/* --- runner ------------------------------------------------------------- */
(function () {
    'use strict';

    var GP = window.GauntletPlayground;
    var slug = null;
    var starterSource = '';
    var checksSource = '';

    function editor() { return GP.el('gp-code'); }

    function fetchText(url) {
        return fetch(url, { cache: 'no-cache' }).then(function (r) {
            if (!r.ok) throw new Error('Could not load ' + url);
            return r.text();
        });
    }

    /**
     * Load the same starter.py and sample_tests.py the download ships.
     *
     * Free projects are static files. Paid ones are not deployed at all (they
     * are the deliverable), so they come from ?action=kit, which re-verifies
     * the purchase server-side before returning anything.
     */
    function loadSources(slug) {
        var creds = GP.unlockCreds(slug);
        if (creds && creds.payment_id) {
            var qs = '?action=kit&project=' + encodeURIComponent(slug)
                + '&payment_id=' + encodeURIComponent(creds.payment_id)
                + '&email=' + encodeURIComponent(creds.email || '');
            return fetch('/api/products' + qs).then(function (r) {
                return r.json().then(function (b) {
                    if (!r.ok) throw new Error(b.error || 'Could not load the project files.');
                    return [b.starter, b.tests];
                });
            });
        }
        var base = '/gauntlet/projects/' + slug + '/';
        return Promise.all([
            fetchText(base + 'starter.py'),
            fetchText(base + 'sample_tests.py')
        ]);
    }

    function loadProject(nextSlug) {
        slug = nextSlug;
        GP.setStatus('Loading project files...', 'busy');
        return loadSources(slug).then(function (parts) {
            starterSource = parts[0];
            checksSource = parts[1];
            var saved = null;
            try { saved = localStorage.getItem('gauntlet:' + slug); } catch (e) { saved = null; }
            editor().value = saved || starterSource;
            GP.setStatus(saved ? 'Restored your saved work.' : 'Loaded starter.py.', 'ok');
        }).catch(function (err) {
            GP.setStatus(err.message, 'err');
        });
    }

    function persist() {
        try { localStorage.setItem('gauntlet:' + slug, editor().value); } catch (e) { /* quota, ignore */ }
    }

    /** Write the candidate's buffer to the Pyodide filesystem as starter.py. */
    function syncFiles(py) {
        py.FS.writeFile('starter.py', editor().value);
        py.FS.writeFile('sample_tests.py', checksSource);
        // Drop cached bytecode so edits always take effect.
        py.runPython([
            'import sys, importlib',
            'for m in ("starter", "sample_tests"):',
            '    sys.modules.pop(m, None)',
            'importlib.invalidate_caches()'
        ].join('\n'));
    }

    function run(mode) {
        persist();
        GP.clearOutput();
        return GP.ensurePyodide().then(function (py) {
            syncFiles(py);
            GP.setStatus(mode === 'checks' ? 'Running self-checks...' : 'Running...', 'busy');
            var code = mode === 'checks'
                ? 'import sample_tests\nsample_tests.main()'
                : 'exec(open("starter.py").read(), {"__name__": "__main__"})';
            return py.runPythonAsync(code).then(function () {
                GP.setStatus('Finished.', 'ok');
            });
        }).catch(function (err) {
            // SystemExit is how sample_tests signals failure; not a crash.
            var msg = String(err && err.message ? err.message : err);
            if (/SystemExit/.test(msg)) {
                GP.setStatus('Some checks failed - see the output above.', 'err');
                return;
            }
            GP.write(msg.split('\n').slice(-14).join('\n'), 'err');
            GP.setStatus('Your code raised an error.', 'err');
        });
    }

    window.GauntletRunner = {
        loadProject: loadProject,
        run: run,
        reset: function () {
            if (!starterSource) return;
            editor().value = starterSource;
            persist();
            GP.setStatus('Reset to the original starter.', 'ok');
        },
        /** Read the submission dict back out of the Python side. */
        buildSubmission: function () {
            return GP.ensurePyodide().then(function (py) {
                syncFiles(py);
                return py.runPythonAsync([
                    'import json, importlib',
                    'import starter',
                    'importlib.reload(starter)',
                    'json.dumps(starter.build_submission())'
                ].join('\n'));
            });
        },
        getSlug: function () { return slug; }
    };
})();

/* --- grading ------------------------------------------------------------ */
(function () {
    'use strict';

    var GP = window.GauntletPlayground;

    function renderScorecard(data) {
        var box = GP.el('gp-scorecard');
        if (!box) return;
        var rows = (data.results || []).map(function (r) {
            return '<tr class="' + (r.ok ? 'gp-pass' : 'gp-fail') + '">'
                + '<td>' + (r.ok ? '&#10003;' : '&#10007;') + '</td>'
                + '<td><code>' + r.id + '</code></td>'
                + '<td>' + r.points + '/' + r.maxPoints + '</td>'
                + '<td>' + (r.ok ? '' : (r.hint ? r.hint : 'Incorrect.')) + '</td>'
                + '</tr>';
        }).join('');

        box.innerHTML =
            '<div class="gp-score-head ' + (data.passed ? 'gp-passed' : 'gp-failed') + '">'
            + '<span class="gp-score-num">' + data.score + '<small>/100</small></span>'
            + '<span class="gp-score-verdict">' + (data.passed ? 'Passed' : 'Not yet') + '</span>'
            + '<span class="gp-score-meta">' + data.testsPassed + ' of ' + data.testsTotal + ' hidden tests</span>'
            + '</div>'
            + '<table class="gp-score-table"><tbody>' + rows + '</tbody></table>'
            + (data.passed
                ? '<p class="gp-score-note">All hidden tests pass. This is the standard the paid projects are graded to.</p>'
                : '<p class="gp-score-note">Failures show a hint, never the expected value &mdash; otherwise the grader would be an oracle you could brute-force.</p>');
        box.hidden = false;
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    window.GauntletGrade = function () {
        var btn = GP.el('gp-grade');
        if (btn) btn.disabled = true;
        GP.setStatus('Building your submission...', 'busy');

        return window.GauntletRunner.buildSubmission().then(function (json) {
            GP.setStatus('Grading against the hidden tests...', 'busy');
            return fetch('/api/products?action=grade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({
                    project: window.GauntletRunner.getSlug(),
                    submission: JSON.parse(json)
                }, GP.unlockCreds(window.GauntletRunner.getSlug())))
            });
        }).then(function (r) {
            return r.json().then(function (body) {
                if (!r.ok) throw new Error(body.error || ('Grading failed (' + r.status + ')'));
                return body;
            });
        }).then(function (data) {
            renderScorecard(data);
            GP.setStatus(data.passed ? 'Passed.' : 'Graded - not passing yet.', data.passed ? 'ok' : 'err');
        }).catch(function (err) {
            var msg = String(err && err.message ? err.message : err);
            if (/NotImplementedError/.test(msg)) {
                msg = 'Implement the TODOs first, then run the self-checks before grading.';
            }
            GP.setStatus(msg, 'err');
        }).then(function () {
            if (btn) btn.disabled = false;
        });
    };
})();
