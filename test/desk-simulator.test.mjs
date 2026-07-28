import test from 'node:test';
import assert from 'node:assert/strict';

import { scenarios } from '../desk-simulator-data.mjs';
import {
    createEmptyProgress,
    createSession,
    getProgressSummary,
    getUnlockedArtifactIds,
    recordCompletedSession,
    runInvestigationTest,
    scoreDiagnosis
} from '../desk-simulator-engine.mjs';

test('scenario definitions have unique IDs and valid answer references', () => {
    assert.equal(scenarios.length, 4);
    assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, scenarios.length);

    scenarios.forEach((scenario) => {
        const testIds = new Set(scenario.tests.map((item) => item.id));
        const artifactIds = new Set(scenario.artifacts.map((item) => item.id));
        const rootCauseIds = new Set(scenario.diagnosis.rootCauses.map((item) => item.id));
        const contributorIds = new Set(scenario.diagnosis.contributors.map((item) => item.id));
        const fixIds = new Set(scenario.diagnosis.fixes.map((item) => item.id));
        const controlIds = new Set(scenario.diagnosis.controls.map((item) => item.id));

        assert.ok(rootCauseIds.has(scenario.answer.rootCause));
        assert.ok(fixIds.has(scenario.answer.fix));
        scenario.answer.contributors.forEach((id) => assert.ok(contributorIds.has(id)));
        scenario.answer.controls.forEach((id) => assert.ok(controlIds.has(id)));
        scenario.answer.decisiveTests.forEach((id) => assert.ok(testIds.has(id)));
        scenario.answer.supportingTests.forEach((id) => assert.ok(testIds.has(id)));
        scenario.tests.flatMap((item) => item.unlocks).forEach((id) => assert.ok(artifactIds.has(id)));
    });
});

test('running a test spends budget once and unlocks its evidence', () => {
    const scenario = scenarios[0];
    const initial = createSession(scenario);
    const testDefinition = scenario.tests.find((item) => item.id === 'compare-vol');
    const outcome = runInvestigationTest(scenario, initial, testDefinition.id);

    assert.equal(outcome.error, undefined);
    assert.equal(outcome.session.budget, 100 - testDefinition.cost);
    assert.deepEqual(outcome.session.testsRun, [testDefinition.id]);
    assert.ok(getUnlockedArtifactIds(scenario, outcome.session).has('vol-compare'));

    const repeated = runInvestigationTest(scenario, outcome.session, testDefinition.id);
    assert.equal(repeated.repeated, true);
    assert.equal(repeated.session.budget, outcome.session.budget);
});

test('the evidence-backed answer can earn a perfect score in every scenario', () => {
    scenarios.forEach((scenario) => {
        let session = createSession(scenario);
        const recommendedTests = [
            ...scenario.answer.decisiveTests,
            ...scenario.answer.supportingTests
        ];

        recommendedTests.forEach((testId) => {
            session = runInvestigationTest(scenario, session, testId).session;
        });

        const completed = scoreDiagnosis(scenario, session, {
            rootCause: scenario.answer.rootCause,
            contributors: scenario.answer.contributors,
            fix: scenario.answer.fix,
            controls: scenario.answer.controls,
            confidence: 4,
            note: 'Evidence-backed diagnosis and controlled remediation.'
        });

        assert.equal(completed.score.total, 100, scenario.id);
        assert.equal(completed.score.band.label, 'Desk ready');
    });
});

test('guessing the answer without evidence cannot reach a strong score', () => {
    const scenario = scenarios[0];
    const session = createSession(scenario);
    const completed = scoreDiagnosis(scenario, session, {
        rootCause: scenario.answer.rootCause,
        contributors: scenario.answer.contributors,
        fix: scenario.answer.fix,
        controls: scenario.answer.controls,
        confidence: 5,
        note: ''
    });

    assert.equal(completed.score.evidence, 0);
    assert.equal(completed.score.efficiency, 0);
    assert.ok(completed.score.total < 70);
});

test('completed progress records best score, attempts and summary', () => {
    const scenario = scenarios[0];
    let session = createSession(scenario);
    scenario.answer.decisiveTests.forEach((testId) => {
        session = runInvestigationTest(scenario, session, testId).session;
    });
    const completed = scoreDiagnosis(scenario, session, {
        rootCause: scenario.answer.rootCause,
        contributors: [],
        fix: scenario.answer.fix,
        controls: [],
        confidence: 3,
        note: ''
    });

    const progress = recordCompletedSession(createEmptyProgress(), completed);
    assert.equal(progress.totalAttempts, 1);
    assert.equal(progress.scenarios[scenario.id].lastScore, completed.score.total);
    assert.equal(progress.scenarios[scenario.id].bestScore, completed.score.total);

    const summary = getProgressSummary(progress, scenarios);
    assert.equal(summary.completed, 1);
    assert.equal(summary.total, 4);
});
