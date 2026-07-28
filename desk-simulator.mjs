import { getScenarioById, scenarios, simulatorMeta } from './desk-simulator-data.mjs';
import {
    createEmptyProgress,
    createSession,
    getProgressSummary,
    getUnlockedArtifactIds,
    markArtifactViewed,
    normalizeProgress,
    recordCompletedSession,
    runInvestigationTest,
    scoreDiagnosis
} from './desk-simulator-engine.mjs';

const ACTIVE_SESSION_KEY = `${simulatorMeta.storageKey}.active`;
const artifactTypeLabels = {
    table: 'TABLE',
    keyValue: 'SNAPSHOT',
    code: 'LOG',
    comparison: 'REVALUATION',
    bars: 'STABILITY'
};
const caseIcons = ['Δ', 'f(t)', 'σ'];
const tabProgress = {
    brief: { label: 'Briefing', value: 12 },
    evidence: { label: 'Evidence review', value: 35 },
    tests: { label: 'Investigation', value: 62 },
    diagnose: { label: 'Diagnosis', value: 84 }
};

let progress = loadProgress();
let currentScenario = null;
let currentSession = null;
let activeTab = 'brief';
let lastArtifactTrigger = null;
let toastTimer = null;

const elements = {
    landingView: document.getElementById('landingView'),
    workspaceView: document.getElementById('workspaceView'),
    workspaceShell: document.getElementById('workspaceShell'),
    resultView: document.getElementById('resultView'),
    siteNav: document.getElementById('siteNav'),
    siteFooter: document.getElementById('siteFooter'),
    caseGrid: document.getElementById('caseGrid'),
    progressCompleted: document.getElementById('progressCompleted'),
    progressSummary: document.getElementById('progressSummary'),
    workspaceCaseNumber: document.getElementById('workspaceCaseNumber'),
    workspaceCaseTitle: document.getElementById('workspaceCaseTitle'),
    incidentDesk: document.getElementById('incidentDesk'),
    incidentObjective: document.getElementById('incidentObjective'),
    briefList: document.getElementById('briefList'),
    briefEyebrow: document.getElementById('briefEyebrow'),
    briefHeadline: document.getElementById('briefHeadline'),
    briefBody: document.getElementById('briefBody'),
    mandateText: document.getElementById('mandateText'),
    metricGrid: document.getElementById('metricGrid'),
    channelMessages: document.getElementById('channelMessages'),
    messageCount: document.getElementById('messageCount'),
    evidenceGrid: document.getElementById('evidenceGrid'),
    testGrid: document.getElementById('testGrid'),
    testResults: document.getElementById('testResults'),
    emptyTestLog: document.getElementById('emptyTestLog'),
    testCount: document.getElementById('testCount'),
    diagnosisReadiness: document.getElementById('diagnosisReadiness'),
    budgetValue: document.getElementById('budgetValue'),
    workspaceProgressLabel: document.getElementById('workspaceProgressLabel'),
    workspaceProgressBar: document.getElementById('workspaceProgressBar'),
    workspaceProgressFill: document.getElementById('workspaceProgressFill'),
    rootCauseChoices: document.getElementById('rootCauseChoices'),
    contributorChoices: document.getElementById('contributorChoices'),
    fixChoices: document.getElementById('fixChoices'),
    controlChoices: document.getElementById('controlChoices'),
    diagnosisForm: document.getElementById('diagnosisForm'),
    formError: document.getElementById('formError'),
    confidenceRange: document.getElementById('confidenceRange'),
    confidenceOutput: document.getElementById('confidenceOutput'),
    artifactDialog: document.getElementById('artifactDialog'),
    artifactDialogEyebrow: document.getElementById('artifactDialogEyebrow'),
    artifactDialogTitle: document.getElementById('artifactDialogTitle'),
    artifactDialogSummary: document.getElementById('artifactDialogSummary'),
    artifactDialogContent: document.getElementById('artifactDialogContent'),
    resultScore: document.getElementById('resultScore'),
    scoreRing: document.getElementById('scoreRing'),
    resultCaseLabel: document.getElementById('resultCaseLabel'),
    resultBand: document.getElementById('resultBand'),
    resultMessage: document.getElementById('resultMessage'),
    resultBestScore: document.getElementById('resultBestScore'),
    scoreBreakdown: document.getElementById('scoreBreakdown'),
    workedExplanation: document.getElementById('workedExplanation'),
    learningList: document.getElementById('learningList'),
    evidenceReviewGrid: document.getElementById('evidenceReviewGrid'),
    nextCaseHeading: document.getElementById('nextCaseHeading'),
    resourceLinks: document.getElementById('resourceLinks'),
    nextCaseButton: document.getElementById('nextCaseButton'),
    toast: document.getElementById('toast'),
    liveRegion: document.getElementById('liveRegion')
};

init();

function init() {
    renderCaseLibrary();
    bindEvents();

    const routedCaseId = getCaseIdFromHash();
    if (routedCaseId && scenarios.some((scenario) => scenario.id === routedCaseId)) {
        openScenario(routedCaseId, { updateHistory: false, fresh: false });
    }
}

function bindEvents() {
    ['navStartButton', 'heroStartButton', 'finalStartButton'].forEach((id) => {
        document.getElementById(id)?.addEventListener('click', () => openScenario(scenarios[0].id));
    });

    elements.caseGrid.addEventListener('click', (event) => {
        const button = event.target.closest('[data-case-id]');
        if (!button) return;
        openScenario(button.dataset.caseId);
    });

    document.getElementById('exitWorkspaceButton').addEventListener('click', () => showLanding());
    document.getElementById('returnLibraryButton').addEventListener('click', () => showLanding());
    document.getElementById('retryCaseButton').addEventListener('click', () => {
        if (currentScenario) openScenario(currentScenario.id, { fresh: true });
    });
    document.getElementById('shareResultButton').addEventListener('click', shareResult);

    elements.nextCaseButton.addEventListener('click', () => {
        if (!currentScenario) return;
        const index = scenarios.findIndex((scenario) => scenario.id === currentScenario.id);
        const next = scenarios[(index + 1) % scenarios.length];
        openScenario(next.id, { fresh: true });
    });

    document.querySelector('.workspace-tabs').addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (button) switchTab(button.dataset.tab);
    });

    document.querySelectorAll('[data-next-tab]').forEach((button) => {
        button.addEventListener('click', () => switchTab(button.dataset.nextTab));
    });

    elements.evidenceGrid.addEventListener('click', (event) => {
        const button = event.target.closest('[data-artifact-id]');
        if (!button || button.disabled || !currentScenario || !currentSession) return;
        openArtifact(button.dataset.artifactId, button);
    });

    elements.testGrid.addEventListener('click', (event) => {
        const button = event.target.closest('[data-test-id]');
        if (!button || button.disabled) return;
        executeTest(button.dataset.testId);
    });

    elements.confidenceRange.addEventListener('input', () => {
        elements.confidenceOutput.value = `${elements.confidenceRange.value} / 5`;
    });

    elements.diagnosisForm.addEventListener('submit', submitDiagnosis);

    document.getElementById('closeArtifactDialog').addEventListener('click', closeArtifact);
    elements.artifactDialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeArtifact();
    });
    elements.artifactDialog.addEventListener('click', (event) => {
        if (event.target === elements.artifactDialog) closeArtifact();
    });

    window.addEventListener('popstate', () => {
        const caseId = getCaseIdFromHash();
        if (caseId && scenarios.some((scenario) => scenario.id === caseId)) {
            if (currentScenario?.id !== caseId || elements.workspaceView.hidden) {
                openScenario(caseId, { updateHistory: false, fresh: false });
            }
            return;
        }
        showLanding({ updateHistory: false, scrollToCases: false });
    });

    window.addEventListener('beforeunload', persistActiveSession);
}

function renderCaseLibrary() {
    const icons = caseIcons;
    elements.caseGrid.innerHTML = scenarios
        .map((scenario, index) => {
            const saved = progress.scenarios[scenario.id];
            const scoreMarkup = saved?.completedAt
                ? `<div class="case-score"><span>BEST SCORE</span><strong>${saved.bestScore}</strong></div>`
                : '';
            const actionLabel = saved?.completedAt ? 'Retry incident' : 'Start incident';
            const statusText = saved?.completedAt
                ? `${saved.attempts} attempt${saved.attempts === 1 ? '' : 's'}`
                : 'Not attempted';

            return `
                <article class="case-card" data-accent="${escapeHtml(scenario.accent)}">
                    <div class="case-card-top">
                        <span class="case-number">INCIDENT ${escapeHtml(scenario.number)}</span>
                        <span class="case-level">${escapeHtml(scenario.level)}</span>
                    </div>
                    ${scoreMarkup}
                    <div class="case-card-icon" aria-hidden="true">${escapeHtml(icons[index])}</div>
                    <h3>${escapeHtml(scenario.title)}</h3>
                    <p class="case-desk">${escapeHtml(scenario.desk)} · ${escapeHtml(scenario.discipline)}</p>
                    <p class="case-teaser">${escapeHtml(scenario.teaser)}</p>
                    <div class="case-card-footer">
                        <div class="case-card-meta">
                            <span>${escapeHtml(scenario.duration)}</span>
                            <strong>${escapeHtml(statusText)}</strong>
                        </div>
                        <button class="case-start" type="button" data-case-id="${escapeHtml(scenario.id)}"
                            aria-label="${escapeHtml(actionLabel)}: ${escapeHtml(scenario.title)}">
                            <span aria-hidden="true">→</span>
                        </button>
                    </div>
                </article>
            `;
        })
        .join('');

    const summary = getProgressSummary(progress, scenarios);
    elements.progressCompleted.textContent = `${summary.completed} / ${summary.total}`;
    const averageText = summary.average === null ? '' : ` · Best-score average ${summary.average}`;
    elements.progressSummary.setAttribute(
        'aria-label',
        `${summary.completed} of ${summary.total} incidents completed${averageText}`
    );
}

function openScenario(id, options = {}) {
    const { updateHistory = true, fresh = false } = options;
    currentScenario = getScenarioById(id);
    const restoredSession = fresh ? null : loadActiveSession(currentScenario.id);
    currentSession = restoredSession || createSession(currentScenario);
    activeTab = 'brief';

    if (fresh) clearActiveSession();
    persistActiveSession();

    renderWorkspace();
    elements.landingView.hidden = true;
    elements.siteNav.hidden = true;
    elements.siteFooter.hidden = true;
    elements.workspaceView.hidden = false;
    elements.workspaceShell.hidden = false;
    elements.resultView.hidden = true;
    document.body.classList.add('workspace-open');
    switchTab(restoredSession?.testsRun?.length ? 'tests' : 'brief', { focus: false });
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (updateHistory && getCaseIdFromHash() !== currentScenario.id) {
        history.pushState(
            { caseId: currentScenario.id },
            '',
            `${window.location.pathname}${window.location.search}#case=${encodeURIComponent(currentScenario.id)}`
        );
    }

    if (restoredSession) {
        showToast('Your in-progress investigation was restored.');
    }
}

function showLanding(options = {}) {
    const { updateHistory = true, scrollToCases = true } = options;
    persistActiveSession();
    closeArtifact();
    currentScenario = null;
    currentSession = null;
    elements.workspaceView.hidden = true;
    elements.workspaceShell.hidden = false;
    elements.resultView.hidden = true;
    elements.landingView.hidden = false;
    elements.siteNav.hidden = false;
    elements.siteFooter.hidden = false;
    document.body.classList.remove('workspace-open');
    renderCaseLibrary();

    if (updateHistory) {
        history.pushState({}, '', `${window.location.pathname}${window.location.search}#cases`);
    }

    requestAnimationFrame(() => {
        const target = scrollToCases ? document.getElementById('cases') : document.body;
        target.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
}

function renderWorkspace() {
    if (!currentScenario || !currentSession) return;

    elements.workspaceCaseNumber.textContent = `INCIDENT ${currentScenario.number}`;
    elements.workspaceCaseTitle.textContent = currentScenario.title;
    elements.incidentDesk.textContent = currentScenario.desk;
    elements.incidentObjective.textContent = currentScenario.objective;
    elements.briefEyebrow.textContent = currentScenario.opening.eyebrow;
    elements.briefHeadline.textContent = currentScenario.opening.headline;
    elements.briefBody.textContent = currentScenario.opening.body;
    elements.mandateText.textContent = currentScenario.objective;
    elements.messageCount.textContent = `${currentScenario.messages.length} messages`;

    elements.briefList.innerHTML = currentScenario.brief
        .map(
            (item) =>
                `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`
        )
        .join('');

    elements.metricGrid.innerHTML = currentScenario.opening.metrics
        .map(
            (metric) => `
                <div class="metric-card" data-tone="${escapeHtml(metric.tone)}">
                    <span>${escapeHtml(metric.label)}</span>
                    <strong>${escapeHtml(metric.value)}</strong>
                </div>
            `
        )
        .join('');

    elements.channelMessages.innerHTML = currentScenario.messages
        .map(
            (message) => `
                <article class="channel-message">
                    <div class="message-avatar" aria-hidden="true">${escapeHtml(message.initials)}</div>
                    <div>
                        <div class="message-meta">
                            <strong>${escapeHtml(message.role)}</strong>
                            <span>${escapeHtml(message.time)}</span>
                        </div>
                        <p>${escapeHtml(message.text)}</p>
                    </div>
                </article>
            `
        )
        .join('');

    renderEvidence();
    renderTests();
    renderDiagnosisChoices();
    updateWorkspaceStatus();
}

function renderEvidence() {
    const unlocked = getUnlockedArtifactIds(currentScenario, currentSession);
    elements.evidenceGrid.innerHTML = currentScenario.artifacts
        .map((artifact) => {
            const isUnlocked = unlocked.has(artifact.id);
            const viewed = currentSession.artifactsViewed.includes(artifact.id);
            const stateClass = isUnlocked ? '' : ' locked';
            const status = isUnlocked
                ? viewed
                    ? 'Viewed · open again →'
                    : 'Open artefact →'
                : 'Run a relevant test to unlock';
            const summary = isUnlocked
                ? artifact.summary
                : 'This evidence is unavailable until the relevant investigation produces it.';

            return `
                <button class="evidence-card${stateClass}" type="button"
                    data-artifact-id="${escapeHtml(artifact.id)}" ${isUnlocked ? '' : 'disabled'}
                    aria-label="${isUnlocked ? 'Open' : 'Locked'} evidence: ${escapeHtml(artifact.title)}">
                    <span class="evidence-card-top">
                        <span>${escapeHtml(artifact.eyebrow)}</span>
                        <span class="evidence-type">${escapeHtml(artifactTypeLabels[artifact.type] || 'FILE')}</span>
                    </span>
                    <h3>${escapeHtml(artifact.title)}</h3>
                    <p>${escapeHtml(summary)}</p>
                    <span class="evidence-card-bottom">${escapeHtml(status)}</span>
                </button>
            `;
        })
        .join('');
}

function renderTests() {
    elements.testGrid.innerHTML = currentScenario.tests
        .map((test) => {
            const completed = currentSession.testsRun.includes(test.id);
            const unavailable = !completed && currentSession.budget < test.cost;
            return `
                <button class="test-card${completed ? ' completed' : ''}" type="button"
                    data-test-id="${escapeHtml(test.id)}" ${completed || unavailable ? 'disabled' : ''}>
                    <span class="test-card-top">
                        <span>${escapeHtml(test.category)}</span>
                        <span class="test-cost">-${test.cost} pts</span>
                    </span>
                    <h3>${escapeHtml(test.title)}</h3>
                    <p>${escapeHtml(test.description)}</p>
                    <span class="test-card-status">${
                        completed ? 'Completed ✓' : unavailable ? 'Budget unavailable' : 'Run test →'
                    }</span>
                </button>
            `;
        })
        .join('');

    const results = [...currentSession.testResults].reverse();
    elements.emptyTestLog.hidden = results.length > 0;
    elements.testCount.textContent = `${results.length} test${results.length === 1 ? '' : 's'} run`;
    elements.testResults.innerHTML = results
        .map(
            (result) => `
                <article class="test-result" data-signal="${escapeHtml(result.signal)}">
                    <span class="test-result-marker" aria-hidden="true"></span>
                    <div>
                        <h4>${escapeHtml(result.title)}</h4>
                        <p>${escapeHtml(result.result)}</p>
                    </div>
                </article>
            `
        )
        .join('');

    const decisiveCount = currentScenario.answer.decisiveTests.filter((id) =>
        currentSession.testsRun.includes(id)
    ).length;
    elements.diagnosisReadiness.textContent =
        decisiveCount === 0
            ? 'No decisive evidence collected yet.'
            : decisiveCount < currentScenario.answer.decisiveTests.length
                ? 'You have partial causal evidence. Another decisive test may strengthen the diagnosis.'
                : 'The key causal evidence is available. You can now defend a diagnosis.';
}

function renderDiagnosisChoices() {
    elements.rootCauseChoices.innerHTML = renderChoiceList(
        currentScenario.diagnosis.rootCauses,
        'rootCause',
        'radio'
    );
    elements.contributorChoices.innerHTML = renderChoiceList(
        currentScenario.diagnosis.contributors,
        'contributors',
        'checkbox'
    );
    elements.fixChoices.innerHTML = renderChoiceList(
        currentScenario.diagnosis.fixes,
        'fix',
        'radio'
    );
    elements.controlChoices.innerHTML = renderChoiceList(
        currentScenario.diagnosis.controls,
        'controls',
        'checkbox'
    );
    elements.diagnosisForm.reset();
    elements.confidenceRange.value = '3';
    elements.confidenceOutput.value = '3 / 5';
    elements.formError.textContent = '';
}

function renderChoiceList(items, name, type) {
    return items
        .map((item) => {
            const id = `${name}-${item.id}`;
            return `
                <div class="choice">
                    <input type="${type}" id="${escapeHtml(id)}" name="${escapeHtml(name)}"
                        value="${escapeHtml(item.id)}">
                    <label for="${escapeHtml(id)}">${escapeHtml(item.label)}</label>
                </div>
            `;
        })
        .join('');
}

function executeTest(testId) {
    if (!currentScenario || !currentSession) return;
    const outcome = runInvestigationTest(currentScenario, currentSession, testId);
    if (outcome.error) {
        showToast(outcome.error);
        return;
    }
    if (outcome.repeated) {
        showToast('That test is already complete.');
        return;
    }

    currentSession = outcome.session;
    persistActiveSession();
    renderEvidence();
    renderTests();
    updateWorkspaceStatus();

    const unlockedCount = outcome.test.unlocks.length;
    const suffix = unlockedCount
        ? ` ${unlockedCount} new evidence artefact${unlockedCount === 1 ? '' : 's'} unlocked.`
        : '';
    const message = `${outcome.test.resultTitle}.${suffix}`;
    elements.liveRegion.textContent = message;
    showToast(message);
}

function openArtifact(artifactId, trigger) {
    const artifact = currentScenario.artifacts.find((item) => item.id === artifactId);
    const unlocked = getUnlockedArtifactIds(currentScenario, currentSession);
    if (!artifact || !unlocked.has(artifactId)) return;

    currentSession = markArtifactViewed(currentSession, artifactId);
    persistActiveSession();
    renderEvidence();
    lastArtifactTrigger =
        elements.evidenceGrid.querySelector(`[data-artifact-id="${artifactId}"]`) || trigger;

    elements.artifactDialogEyebrow.textContent = artifact.eyebrow;
    elements.artifactDialogTitle.textContent = artifact.title;
    elements.artifactDialogSummary.textContent = artifact.summary;
    renderArtifactContent(artifact);

    document.body.classList.add('dialog-open');
    if (typeof elements.artifactDialog.showModal === 'function') {
        elements.artifactDialog.showModal();
    } else {
        elements.artifactDialog.setAttribute('open', '');
    }
}

function renderArtifactContent(artifact) {
    const container = elements.artifactDialogContent;
    container.replaceChildren();

    if (artifact.type === 'table') {
        const wrapper = document.createElement('div');
        wrapper.style.overflowX = 'auto';
        const table = document.createElement('table');
        table.className = 'artifact-table';
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        artifact.columns.forEach((column) => {
            const th = document.createElement('th');
            th.textContent = column;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        artifact.rows.forEach((row) => {
            const tr = document.createElement('tr');
            row.forEach((cell) => {
                const td = document.createElement('td');
                td.textContent = cell;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrapper.appendChild(table);
        container.appendChild(wrapper);
        return;
    }

    if (artifact.type === 'keyValue') {
        const grid = document.createElement('div');
        grid.className = 'artifact-kv';
        artifact.values.forEach(([label, value]) => {
            const cell = document.createElement('div');
            const labelElement = document.createElement('span');
            const valueElement = document.createElement('strong');
            labelElement.textContent = label;
            valueElement.textContent = value;
            cell.append(labelElement, valueElement);
            grid.appendChild(cell);
        });
        container.appendChild(grid);
        return;
    }

    if (artifact.type === 'code') {
        const pre = document.createElement('pre');
        pre.className = 'artifact-code';
        pre.textContent = artifact.code.join('\n');
        container.appendChild(pre);
        return;
    }

    if (artifact.type === 'comparison') {
        const grid = document.createElement('div');
        grid.className = 'comparison-grid';
        [artifact.left, artifact.right].forEach((side) => {
            const section = document.createElement('div');
            section.className = 'comparison-side';
            const label = document.createElement('span');
            const value = document.createElement('strong');
            const note = document.createElement('small');
            label.textContent = side.label;
            value.textContent = side.value;
            note.textContent = side.note;
            section.append(label, value, note);
            grid.appendChild(section);
        });
        const footer = document.createElement('p');
        footer.className = 'comparison-footer';
        footer.textContent = artifact.footer;
        container.append(grid, footer);
        return;
    }

    if (artifact.type === 'bars') {
        const chart = document.createElement('div');
        chart.className = 'bar-chart';
        const maxValue = Math.max(...artifact.bars.map((bar) => bar.value), 1);
        artifact.bars.forEach((bar) => {
            const row = document.createElement('div');
            row.className = 'bar-row';
            row.dataset.tone = bar.tone;
            const label = document.createElement('span');
            const track = document.createElement('div');
            const fill = document.createElement('i');
            const value = document.createElement('strong');
            label.textContent = bar.label;
            fill.style.width = `${Math.max(4, Math.round((bar.value / maxValue) * 100))}%`;
            value.textContent = bar.display;
            track.className = 'bar-track';
            track.appendChild(fill);
            row.append(label, track, value);
            chart.appendChild(row);
        });
        container.appendChild(chart);
    }
}

function closeArtifact() {
    if (elements.artifactDialog.open) elements.artifactDialog.close();
    elements.artifactDialog.removeAttribute('open');
    document.body.classList.remove('dialog-open');
    if (lastArtifactTrigger?.isConnected) lastArtifactTrigger.focus();
    lastArtifactTrigger = null;
}

function switchTab(tab, options = {}) {
    if (!tabProgress[tab]) return;
    activeTab = tab;

    document.querySelectorAll('.workspace-tabs [data-tab]').forEach((button) => {
        const selected = button.dataset.tab === tab;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
    });

    document.querySelectorAll('.workspace-panel').forEach((panel) => {
        panel.hidden = panel.id !== `${tab}Panel`;
    });

    updateWorkspaceStatus();
    if (options.focus !== false) {
        document.getElementById(`${tab}Tab`)?.focus();
        document.querySelector('.workspace-header')?.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
}

function updateWorkspaceStatus() {
    if (!currentSession) return;
    elements.budgetValue.textContent = String(currentSession.budget);
    const base = tabProgress[activeTab];
    const testBonus = activeTab === 'tests'
        ? Math.min(15, currentSession.testsRun.length * 3)
        : activeTab === 'diagnose'
            ? Math.min(8, currentSession.testsRun.length)
            : 0;
    const value = Math.min(95, base.value + testBonus);
    elements.workspaceProgressLabel.textContent = base.label;
    elements.workspaceProgressBar.setAttribute('aria-valuenow', String(value));
    elements.workspaceProgressFill.style.width = `${value}%`;
}

function submitDiagnosis(event) {
    event.preventDefault();
    if (!currentScenario || !currentSession) return;

    const formData = new FormData(elements.diagnosisForm);
    const submission = {
        rootCause: String(formData.get('rootCause') || ''),
        contributors: formData.getAll('contributors').map(String),
        fix: String(formData.get('fix') || ''),
        controls: formData.getAll('controls').map(String),
        confidence: Number(formData.get('confidence') || 3),
        note: String(formData.get('note') || '')
    };

    const missing = [];
    if (!submission.rootCause) missing.push('a primary root cause');
    if (!submission.fix) missing.push('an immediate remediation');
    if (missing.length) {
        elements.formError.textContent = `Select ${missing.join(' and ')} before submitting.`;
        elements.formError.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
    }

    elements.formError.textContent = '';
    currentSession = scoreDiagnosis(currentScenario, currentSession, submission);
    progress = recordCompletedSession(progress, currentSession);
    saveProgress(progress);
    clearActiveSession();
    renderCaseLibrary();
    renderResult();
}

function renderResult() {
    const score = currentSession.score;
    const saved = progress.scenarios[currentScenario.id];
    elements.workspaceShell.hidden = true;
    elements.resultView.hidden = false;
    elements.resultScore.textContent = String(score.total);
    elements.scoreRing.style.setProperty('--score-angle', `${score.total * 3.6}deg`);
    elements.resultCaseLabel.textContent = `INCIDENT ${currentScenario.number} COMPLETE`;
    elements.resultBand.textContent = score.band.label;
    elements.resultMessage.textContent = score.band.message;
    elements.resultBestScore.textContent = `Best ${saved.bestScore} · Attempt ${saved.attempts}`;
    elements.workedExplanation.textContent = currentScenario.answer.explanation;

    const rows = [
        ['Diagnosis', score.diagnosis, 35],
        ['Remediation', score.remediation, 20],
        ['Evidence', score.evidence, 20],
        ['Controls', score.controls, 15],
        ['Efficiency', score.efficiency, 10]
    ];
    elements.scoreBreakdown.innerHTML = rows
        .map(
            ([label, value, max]) => `
                <div class="result-rubric-row">
                    <span>${escapeHtml(label)}</span>
                    <div><i style="width:${Math.round((value / max) * 100)}%"></i></div>
                    <strong>${value}/${max}</strong>
                </div>
            `
        )
        .join('');

    elements.learningList.innerHTML = currentScenario.answer.learning
        .map(
            (item, index) => `
                <div class="learning-item">
                    <span>${String(index + 1).padStart(2, '0')}</span>
                    <div>${escapeHtml(item)}</div>
                </div>
            `
        )
        .join('');

    const decisiveRun = currentScenario.answer.decisiveTests.filter((id) =>
        currentSession.testsRun.includes(id)
    );
    const correctControls = currentSession.submission.controls.filter((id) =>
        currentScenario.answer.controls.includes(id)
    );
    const rootCorrect = currentSession.submission.rootCause === currentScenario.answer.rootCause;
    const evidenceTone =
        decisiveRun.length === currentScenario.answer.decisiveTests.length ? 'good' : 'missed';

    elements.evidenceReviewGrid.innerHTML = `
        <article class="evidence-review-item ${rootCorrect ? 'good' : 'missed'}">
            <span>Primary diagnosis</span>
            <strong>${rootCorrect ? 'Correct root cause' : 'Root cause missed'}</strong>
            <p>${rootCorrect ? 'Your primary diagnosis matches the causal evidence.' : 'Review the controlled tests and separate the symptom from its cause.'}</p>
        </article>
        <article class="evidence-review-item ${evidenceTone}">
            <span>Decisive tests</span>
            <strong>${decisiveRun.length} / ${currentScenario.answer.decisiveTests.length} collected</strong>
            <p>${decisiveRun.length === currentScenario.answer.decisiveTests.length ? 'You collected the tests that isolate and reproduce the failure.' : 'One or more causal tests were available but not run.'}</p>
        </article>
        <article class="evidence-review-item ${correctControls.length === currentScenario.answer.controls.length ? 'good' : 'missed'}">
            <span>Preventive controls</span>
            <strong>${correctControls.length} / ${currentScenario.answer.controls.length} selected</strong>
            <p>${correctControls.length === currentScenario.answer.controls.length ? 'Your controls address both detection and prevention.' : 'The control set leaves part of the failure path exposed.'}</p>
        </article>
    `;

    const index = scenarios.findIndex((scenario) => scenario.id === currentScenario.id);
    const nextScenario = scenarios[(index + 1) % scenarios.length];
    elements.nextCaseHeading.textContent =
        index === scenarios.length - 1
            ? 'Repeat the first incident and improve your evidence path.'
            : `Next: ${nextScenario.title}`;
    elements.nextCaseButton.firstChild.textContent =
        index === scenarios.length - 1 ? 'Return to incident 01 ' : 'Next incident ';

    elements.resourceLinks.innerHTML = currentScenario.nextSteps
        .map(
            (resource) => `
                <a class="resource-link" href="${escapeHtml(resource.href)}">
                    <span>${escapeHtml(resource.label)}</span>
                    <strong>${escapeHtml(resource.title)} →</strong>
                </a>
            `
        )
        .join('');

    elements.workspaceProgressLabel.textContent = 'Complete';
    elements.workspaceProgressBar.setAttribute('aria-valuenow', '100');
    elements.workspaceProgressFill.style.width = '100%';
    window.scrollTo({ top: 0, behavior: 'auto' });
    elements.resultBand.focus?.();
    elements.liveRegion.textContent = `Incident complete. Score ${score.total} out of 100. ${score.band.label}.`;
}

async function shareResult() {
    if (!currentScenario || !currentSession?.score) return;
    const shareUrl = new URL('desk-simulator.html', window.location.href);
    shareUrl.hash = `case=${currentScenario.id}`;
    const shareText =
        `I scored ${currentSession.score.total}/100 on “${currentScenario.title}” ` +
        `in the Desk2Quant Desk Simulator. Can you diagnose the incident?`;
    const shareData = {
        title: 'Desk2Quant Desk Simulator',
        text: shareText,
        url: shareUrl.href
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            return;
        } catch (error) {
            if (error?.name === 'AbortError') return;
        }
    }

    try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl.href}`);
        showToast('Score and challenge link copied.');
    } catch {
        window.prompt('Copy your score and challenge link:', `${shareText} ${shareUrl.href}`);
    }
}

function getCaseIdFromHash() {
    const match = window.location.hash.match(/^#case=([^&]+)/);
    if (!match) return null;
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return null;
    }
}

function loadProgress() {
    try {
        const raw = localStorage.getItem(simulatorMeta.storageKey);
        return raw ? normalizeProgress(JSON.parse(raw)) : createEmptyProgress();
    } catch {
        return createEmptyProgress();
    }
}

function saveProgress(value) {
    try {
        localStorage.setItem(simulatorMeta.storageKey, JSON.stringify(value));
    } catch {
        showToast('Your score is available now, but this browser could not save it for later.');
    }
}

function persistActiveSession() {
    if (!currentScenario || !currentSession || currentSession.score) return;
    try {
        sessionStorage.setItem(
            ACTIVE_SESSION_KEY,
            JSON.stringify({ scenarioId: currentScenario.id, session: currentSession })
        );
    } catch {
        // The simulator remains fully usable when browser storage is unavailable.
    }
}

function loadActiveSession(scenarioId) {
    try {
        const raw = sessionStorage.getItem(ACTIVE_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
            parsed?.scenarioId !== scenarioId ||
            parsed?.session?.scenarioId !== scenarioId ||
            parsed?.session?.score ||
            !Array.isArray(parsed?.session?.testsRun)
        ) {
            return null;
        }
        return parsed.session;
    } catch {
        return null;
    }
}

function clearActiveSession() {
    try {
        sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch {
        // No action required.
    }
}

function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('visible');
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), 3600);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
