import { simulatorMeta } from './desk-simulator-data.mjs';

const STARTING_BUDGET = 100;
const INTERVIEW_TIME_LIMIT_SECONDS = 10 * 60;

export function createSession(scenario, options = {}) {
    const mode = options.mode === 'interview' ? 'interview' : 'desk';
    const timeLimitSeconds = mode === 'interview'
        ? Math.max(60, Number(options.timeLimitSeconds) || INTERVIEW_TIME_LIMIT_SECONDS)
        : null;

    return {
        scenarioId: scenario.id,
        mode,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        budget: STARTING_BUDGET,
        timeLimitSeconds,
        remainingSeconds: timeLimitSeconds,
        timedOut: false,
        testsRun: [],
        testResults: [],
        artifactsViewed: [],
        submission: null,
        score: null
    };
}

export function normalizeSession(scenario, value) {
    if (!value || typeof value !== 'object' || value.scenarioId !== scenario.id) {
        return createSession(scenario);
    }

    const mode = value.mode === 'interview' ? 'interview' : 'desk';
    const fallback = createSession(scenario, { mode });
    const remainingSeconds = mode === 'interview'
        ? Math.max(0, Math.min(
            fallback.timeLimitSeconds,
            Number.isFinite(value.remainingSeconds) ? value.remainingSeconds : fallback.timeLimitSeconds
        ))
        : null;

    return {
        ...fallback,
        ...value,
        mode,
        timeLimitSeconds: fallback.timeLimitSeconds,
        remainingSeconds,
        timedOut: Boolean(value.timedOut) || (mode === 'interview' && remainingSeconds === 0),
        testsRun: Array.isArray(value.testsRun) ? value.testsRun : [],
        testResults: Array.isArray(value.testResults) ? value.testResults : [],
        artifactsViewed: Array.isArray(value.artifactsViewed) ? value.artifactsViewed : []
    };
}

export function tickInterviewClock(session, seconds = 1) {
    if (!session || session.mode !== 'interview' || session.score || session.timedOut) {
        return session;
    }

    const remainingSeconds = Math.max(0, (Number(session.remainingSeconds) || 0) - Math.max(1, seconds));
    return {
        ...session,
        remainingSeconds,
        timedOut: remainingSeconds === 0,
        updatedAt: new Date().toISOString()
    };
}

export function runInvestigationTest(scenario, session, testId) {
    if (session.timedOut) {
        return { session, error: 'The interview clock has expired. Submit your handoff now.' };
    }

    const test = scenario.tests.find((item) => item.id === testId);
    if (!test) {
        return { session, error: 'That investigation is unavailable.' };
    }

    if (session.testsRun.includes(testId)) {
        return { session, test, repeated: true };
    }

    if (session.budget < test.cost) {
        return { session, test, error: 'Not enough investigation budget remains for this test.' };
    }

    const nextSession = {
        ...session,
        updatedAt: new Date().toISOString(),
        budget: session.budget - test.cost,
        testsRun: [...session.testsRun, testId],
        testResults: [
            ...session.testResults,
            {
                testId,
                title: test.resultTitle,
                result: test.result,
                signal: test.signal,
                createdAt: new Date().toISOString()
            }
        ]
    };

    return { session: nextSession, test, repeated: false };
}

export function markArtifactViewed(session, artifactId) {
    if (session.artifactsViewed.includes(artifactId)) return session;
    return {
        ...session,
        updatedAt: new Date().toISOString(),
        artifactsViewed: [...session.artifactsViewed, artifactId]
    };
}

export function getUnlockedArtifactIds(scenario, session) {
    const unlocked = new Set(
        scenario.artifacts.filter((artifact) => !artifact.locked).map((artifact) => artifact.id)
    );

    scenario.tests.forEach((test) => {
        if (!session.testsRun.includes(test.id)) return;
        test.unlocks.forEach((artifactId) => unlocked.add(artifactId));
    });

    return unlocked;
}

function scoreSetSelection(selected = [], correct = [], availablePoints = 10, wrongPenalty = 2) {
    const uniqueSelected = [...new Set(selected)];
    const correctSelected = uniqueSelected.filter((id) => correct.includes(id)).length;
    const wrongSelected = uniqueSelected.filter((id) => !correct.includes(id)).length;
    const perCorrect = correct.length ? availablePoints / correct.length : 0;
    return Math.max(0, Math.round(correctSelected * perCorrect - wrongSelected * wrongPenalty));
}

function calculateEvidenceScore(scenario, session) {
    const decisiveRun = scenario.answer.decisiveTests.filter((id) => session.testsRun.includes(id)).length;
    const supportingRun = scenario.answer.supportingTests.filter((id) => session.testsRun.includes(id)).length;
    return Math.min(20, decisiveRun * 8 + supportingRun * 4);
}

function calculateEfficiencyScore(session, evidencePoints) {
    if (evidencePoints === 0) return 0;
    const harmfulCount = session.testResults.filter((result) => result.signal === 'harmful').length;
    const maximum = session.mode === 'interview' ? 5 : 10;
    const denominator = session.mode === 'interview' ? 4 : 2;
    const base = Math.max(0, Math.min(maximum, Math.round((session.budget - 35) / denominator)));
    const evidenceFactor = Math.min(1, evidencePoints / 20);
    return Math.max(0, Math.round((base - harmfulCount * 2) * evidenceFactor));
}

function calculateCommunicationScore(session, submission) {
    if (session.mode !== 'interview') return 0;
    const noteLength = String(submission.note || '').trim().length;
    if (noteLength >= 160) return 5;
    if (noteLength >= 100) return 4;
    if (noteLength >= 70) return 3;
    if (noteLength >= 40) return 1;
    return 0;
}

export function scoreDiagnosis(scenario, session, submission) {
    const evidencePoints = calculateEvidenceScore(scenario, session);
    const rootCausePoints = submission.rootCause === scenario.answer.rootCause
        ? (evidencePoints === 0 ? 20 : 25) : 0;
    const contributorPoints = scoreSetSelection(
        submission.contributors,
        scenario.answer.contributors,
        10,
        2
    );
    const diagnosisPoints = rootCausePoints + contributorPoints;
    const remediationPoints = submission.fix === scenario.answer.fix ? 20 : 0;
    const controlPoints = scoreSetSelection(
        submission.controls,
        scenario.answer.controls,
        15,
        3
    );
    const efficiencyPoints = calculateEfficiencyScore(session, evidencePoints);
    const communicationPoints = calculateCommunicationScore(session, submission);
    const total = Math.max(
        0,
        Math.min(
            100,
            diagnosisPoints +
                remediationPoints +
                evidencePoints +
                controlPoints +
                efficiencyPoints +
                communicationPoints
        )
    );

    const completedSession = {
        ...session,
        updatedAt: new Date().toISOString(),
        submission: {
            rootCause: submission.rootCause || '',
            contributors: [...new Set(submission.contributors || [])],
            fix: submission.fix || '',
            controls: [...new Set(submission.controls || [])],
            confidence: Number(submission.confidence) || 3,
            note: String(submission.note || '').trim().slice(0, 1200)
        },
        score: {
            total,
            diagnosis: diagnosisPoints,
            remediation: remediationPoints,
            evidence: evidencePoints,
            controls: controlPoints,
            efficiency: efficiencyPoints,
            communication: communicationPoints,
            band: getScoreBand(total)
        }
    };

    return completedSession;
}

export function getScoreBand(score) {
    if (score >= 85) {
        return {
            label: 'Desk ready',
            tone: 'excellent',
            message: 'You isolated the failure efficiently and proposed a controlled repair.'
        };
    }
    if (score >= 70) {
        return {
            label: 'Strong investigation',
            tone: 'strong',
            message: 'Your conclusion is sound; tighten the evidence trail or preventive controls.'
        };
    }
    if (score >= 50) {
        return {
            label: 'Developing',
            tone: 'developing',
            message: 'You found part of the story, but the diagnosis needs stronger causal evidence.'
        };
    }
    return {
        label: 'Revisit the case',
        tone: 'revisit',
        message: 'Review the decisive tests and separate symptoms from the underlying control failure.'
    };
}

export function createEmptyProgress() {
    return {
        version: simulatorMeta.version,
        scenarios: {},
        totalAttempts: 0,
        updatedAt: null
    };
}

export function normalizeProgress(value) {
    if (!value || typeof value !== 'object') return createEmptyProgress();
    return {
        version: simulatorMeta.version,
        scenarios: value.scenarios && typeof value.scenarios === 'object' ? value.scenarios : {},
        totalAttempts: Number.isFinite(value.totalAttempts) ? value.totalAttempts : 0,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
    };
}

export function recordCompletedSession(progress, session) {
    if (!session.score) return normalizeProgress(progress);
    const normalized = normalizeProgress(progress);
    const previous = normalized.scenarios[session.scenarioId] || {};
    const bestScore = Math.max(Number(previous.bestScore) || 0, session.score.total);
    const mode = session.mode === 'interview' ? 'interview' : 'desk';
    const modeBestKey = `${mode}BestScore`;
    const modeAttemptsKey = `${mode}Attempts`;

    return {
        ...normalized,
        scenarios: {
            ...normalized.scenarios,
            [session.scenarioId]: {
                bestScore,
                lastScore: session.score.total,
                attempts: (Number(previous.attempts) || 0) + 1,
                lastMode: mode,
                [modeBestKey]: Math.max(Number(previous[modeBestKey]) || 0, session.score.total),
                [modeAttemptsKey]: (Number(previous[modeAttemptsKey]) || 0) + 1,
                completedAt: new Date().toISOString()
            }
        },
        totalAttempts: normalized.totalAttempts + 1,
        updatedAt: new Date().toISOString()
    };
}

export function getProgressSummary(progress, scenarios) {
    const normalized = normalizeProgress(progress);
    const completed = scenarios.filter((scenario) => normalized.scenarios[scenario.id]?.bestScore >= 0 &&
        normalized.scenarios[scenario.id]?.completedAt).length;
    const bestScores = scenarios
        .map((scenario) => Number(normalized.scenarios[scenario.id]?.bestScore))
        .filter((score) => Number.isFinite(score));
    const average = bestScores.length
        ? Math.round(bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length)
        : null;

    return {
        completed,
        total: scenarios.length,
        average,
        attempts: normalized.totalAttempts
    };
}
