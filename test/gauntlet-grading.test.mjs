// Unit tests for the Gauntlet grading engine.
//
// This is the highest-risk logic in the product: it decides whether a paying
// customer passed. A tolerance bug either fails correct work (refund requests)
// or passes wrong work (destroys the product's only claim). So it is tested
// offline, deterministically, before it ever touches a submission.
//
// Run: node test/gauntlet-grading.test.mjs
import { compareNumeric, compareSeries, checkMonotonic, gradeSubmission } from '../lib/gauntletGrading.js';

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('  FAIL: ' + name); } };

// --- tolerance semantics ---
t('exact match ok', compareNumeric(1.5, 1.5).ok);
t('float noise (0.1+0.2) ok', compareNumeric(0.1 + 0.2, 0.3).ok);
t('relative tolerance scales up', compareNumeric(1000000.1, 1000000.0, { relTol: 1e-6 }).ok);
t('subtly wrong rate fails', !compareNumeric(0.0205, 0.0200, { relTol: 1e-6 }).ok);
t('near-zero uses absTol', compareNumeric(1e-12, 0, { absTol: 1e-9 }).ok);
t('NaN rejected', !compareNumeric(NaN, 1).ok);
t('Infinity rejected', !compareNumeric(Infinity, 1).ok);
t('numeric string coerced', compareNumeric('1.5', 1.5).ok);
t('null rejected', !compareNumeric(null, 1).ok);

// --- series ---
t('equal series ok', compareSeries([1, 2, 3], [1, 2, 3]).ok);
t('length mismatch fails', !compareSeries([1, 2], [1, 2, 3]).ok);
t('worst offender index reported', compareSeries([1, 2, 9], [1, 2, 3]).worst.index === 2);
t('non-array rejected', !compareSeries('nope', [1]).ok);

// --- structural (discount factors must not rise) ---
t('nonincreasing DFs ok', checkMonotonic([1, 0.98, 0.95]).ok);
t('curve wiggle caught', !checkMonotonic([1, 0.98, 0.99]).ok);
t('too-short series rejected', !checkMonotonic([1]).ok);

// --- full grading + anti-gaming ---
const tests = [
  { id: 'df_5y', points: 40, kind: 'numeric', key: 'curve.df5y', expected: 0.9048, opts: { relTol: 1e-4 }, hint: 'Check your day count convention.' },
  { id: 'df_curve', points: 40, kind: 'series', key: 'curve.dfs', expected: [1, 0.98, 0.95], opts: { relTol: 1e-4 }, hint: 'Pillar dates do not line up.' },
  { id: 'df_mono', points: 20, kind: 'monotonic', key: 'curve.dfs', direction: 'nonincreasing', hint: 'Discount factors must not increase.' }
];

const good = gradeSubmission(tests, { curve: { df5y: 0.9048, dfs: [1, 0.98, 0.95] } });
t('correct submission passes with 100', good.passed && good.score === 100);

const wrong = gradeSubmission(tests, { curve: { df5y: 0.91, dfs: [1, 0.98, 0.95] } });
t('subtly wrong submission fails overall', !wrong.passed);
t('partial credit awarded', wrong.score > 0 && wrong.score < 100);
t('scorecard never leaks expected value', !JSON.stringify(wrong).includes('0.9048'));
t('failing test returns its hint', wrong.results.find(r => r.id === 'df_5y').hint === 'Check your day count convention.');

t('missing key reported', gradeSubmission(tests, {}).results[0].reason === 'missing_key');
t('null submission handled', gradeSubmission(tests, null).verdict === 'invalid_submission');
t('prototype pollution blocked', gradeSubmission([{ id: 'x', points: 1, kind: 'numeric', key: '__proto__.polluted', expected: 1 }], {}).results[0].reason === 'missing_key');
t('empty test list safe', gradeSubmission([], {}).verdict === 'no_tests');
t('unknown test kind rejected', gradeSubmission([{ id: 'z', points: 5, kind: 'telepathy', key: 'a' }], { a: 1 }).results[0].reason === 'unknown_test_kind');

// Numbers all wrong but flat, so the structural test legitimately passes:
// partial credit is correct here, a full pass is not.
const allWrong = gradeSubmission(tests, { curve: { df5y: 5, dfs: [9, 9, 9] } });
t('wrong numbers cannot pass overall', !allWrong.passed);
t('flat series still earns structural points only', allWrong.gotPoints === 20);

console.log('\n  gauntlet grading: passed ' + pass + ' / ' + (pass + fail));
if (fail) process.exit(1);
