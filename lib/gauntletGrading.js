// Grading engine for the Quant Project Gauntlet.
//
// Pure functions only: no network, no DB, no secrets. Everything here is
// deterministic and unit-testable, so the risky part of the product (deciding
// whether a paying customer passed) can be verified offline.
//
// Design notes:
//  - Quant answers are floating point. Exact equality is useless, so every
//    check carries its own tolerance and comparison mode.
//  - Tolerance bugs cut both ways: too tight fails correct work and generates
//    angry refund requests; too loose passes wrong work and destroys the only
//    claim this product makes. So comparisons are explicit, never guessed.
//  - Reference values and tolerances are server-side only. Never ship them to
//    the browser.

// Relative comparison is the default for prices/rates because absolute error
// is meaningless across scales (a 1e-4 error on a 0.02 rate is huge; on a
// 1_000_000 notional it is noise). absTol guards the near-zero case where
// relative error explodes.
export function compareNumeric(actual, expected, opts = {}) {
    const { relTol = 1e-6, absTol = 1e-9 } = opts;
    const a = Number(actual);
    const e = Number(expected);
    if (!Number.isFinite(a)) return { ok: false, reason: 'not_finite', actual, expected: e };
    const diff = Math.abs(a - e);
    const scale = Math.max(Math.abs(a), Math.abs(e));
    const tol = Math.max(absTol, relTol * scale);
    return {
        ok: diff <= tol,
        reason: diff <= tol ? 'ok' : 'tolerance_exceeded',
        actual: a, expected: e, diff, tol
    };
}

// Curves/surfaces/exposure profiles are arrays. Grade elementwise and report
// the WORST offender, because "your 37th pillar is wrong" is actionable
// feedback while "array mismatch" is not.
export function compareSeries(actual, expected, opts = {}) {
    if (!Array.isArray(actual)) return { ok: false, reason: 'not_an_array' };
    if (actual.length !== expected.length) {
        return { ok: false, reason: 'length_mismatch', actualLength: actual.length, expectedLength: expected.length };
    }
    let worst = null;
    for (let i = 0; i < expected.length; i++) {
        const r = compareNumeric(actual[i], expected[i], opts);
        if (!r.ok && (!worst || r.diff > worst.diff)) worst = { ...r, index: i };
    }
    return worst ? { ok: false, reason: 'element_mismatch', worst } : { ok: true, reason: 'ok' };
}

// Monotonicity/no-arbitrage style structural checks. These catch the classic
// failure where a candidate's numbers are close to reference but the curve
// wiggles, which is exactly what a desk would reject.
export function checkMonotonic(series, direction = 'nonincreasing') {
    if (!Array.isArray(series) || series.length < 2) return { ok: false, reason: 'too_short' };
    for (let i = 1; i < series.length; i++) {
        const prev = Number(series[i - 1]);
        const cur = Number(series[i]);
        if (!Number.isFinite(cur) || !Number.isFinite(prev)) return { ok: false, reason: 'not_finite', index: i };
        const bad = direction === 'nonincreasing' ? cur > prev + 1e-12 : cur < prev - 1e-12;
        if (bad) return { ok: false, reason: 'monotonicity_violated', index: i, prev, cur, direction };
    }
    return { ok: true, reason: 'ok' };
}

// --- Test running -----------------------------------------------------------
// A test case is data, not code, so hidden tests can live in a server-side
// JSON blob without an eval() anywhere near untrusted input.
//
//   { id, points, kind: 'numeric'|'series'|'monotonic', key, expected, opts,
//     hint }
//
// `key` addresses into the candidate's submitted result object. `hint` is the
// only thing revealed on failure -- never `expected`, or the grader becomes an
// oracle a candidate can brute-force.
export function runTest(test, submitted) {
    const value = readPath(submitted, test.key);
    if (value === undefined) {
        return { id: test.id, ok: false, points: 0, maxPoints: test.points, reason: 'missing_key', key: test.key };
    }
    let r;
    if (test.kind === 'numeric') r = compareNumeric(value, test.expected, test.opts);
    else if (test.kind === 'series') r = compareSeries(value, test.expected, test.opts);
    else if (test.kind === 'monotonic') r = checkMonotonic(value, test.direction);
    else return { id: test.id, ok: false, points: 0, maxPoints: test.points, reason: 'unknown_test_kind' };

    return {
        id: test.id,
        ok: r.ok,
        points: r.ok ? test.points : 0,
        maxPoints: test.points,
        reason: r.reason,
        // Deliberately omit expected/diff on failure: revealing them turns the
        // grader into an oracle. Only the authored hint is safe to return.
        hint: r.ok ? undefined : (test.hint || undefined)
    };
}

// Dotted path lookup, e.g. 'curve.discountFactors'. Guards against prototype
// pollution via submitted JSON keys.
function readPath(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = String(path || '').split('.');
    let cur = obj;
    for (const p of parts) {
        if (p === '__proto__' || p === 'constructor' || p === 'prototype') return undefined;
        if (cur === null || typeof cur !== 'object' || !(p in cur)) return undefined;
        cur = cur[p];
    }
    return cur;
}

// Grade a whole submission. Returns a scorecard safe to send to the customer.
export function gradeSubmission(tests, submitted) {
    if (!Array.isArray(tests) || !tests.length) {
        return { passed: false, score: 0, testsTotal: 0, testsPassed: 0, results: [], verdict: 'no_tests' };
    }
    if (!submitted || typeof submitted !== 'object') {
        return {
            passed: false, score: 0, testsTotal: tests.length, testsPassed: 0, results: [],
            verdict: 'invalid_submission'
        };
    }
    const results = tests.map(t => runTest(t, submitted));
    const maxPoints = tests.reduce((s, t) => s + (Number(t.points) || 0), 0);
    const gotPoints = results.reduce((s, r) => s + r.points, 0);
    const testsPassed = results.filter(r => r.ok).length;
    const score = maxPoints > 0 ? Math.round((gotPoints / maxPoints) * 1000) / 10 : 0;
    // Pass bar is every test green, not a points threshold: partial credit is
    // useful feedback but "mostly correct" is not a passing quant model.
    const passed = testsPassed === tests.length;
    return {
        passed, score, maxPoints, gotPoints,
        testsTotal: tests.length, testsPassed,
        results,
        verdict: passed ? 'passed' : 'failed'
    };
}
