(function () {
    'use strict';

    const STORAGE_KEY = 'd2q_quant_diagnostic_v1';
    const LEVEL_SCORES = [0, 25, 50, 75, 100];

    const DOMAINS = Object.freeze({
        foundations: { label: 'Quant foundations', short: 'Foundations' },
        pricing: { label: 'Products & pricing', short: 'Pricing' },
        risk: { label: 'Risk, XVA & validation', short: 'Risk / XVA' },
        implementation: { label: 'Implementation & coding', short: 'Implementation' },
        interview: { label: 'Interview readiness', short: 'Interview' }
    });

    const ROLES = Object.freeze({
        pricing: {
            label: 'Front Office / Pricing Quant',
            weights: { foundations: .22, pricing: .30, risk: .13, implementation: .20, interview: .15 },
            benchmarks: { foundations: 75, pricing: 80, risk: 55, implementation: 70, interview: 70 }
        },
        xva: {
            label: 'XVA / Counterparty Risk Quant',
            weights: { foundations: .20, pricing: .15, risk: .30, implementation: .20, interview: .15 },
            benchmarks: { foundations: 70, pricing: 65, risk: 85, implementation: 70, interview: 70 }
        },
        validation: {
            label: 'Model Validation / Quant Risk',
            weights: { foundations: .20, pricing: .20, risk: .30, implementation: .15, interview: .15 },
            benchmarks: { foundations: 75, pricing: 70, risk: 85, implementation: 60, interview: 70 }
        },
        quantdev: {
            label: 'Quant Developer',
            weights: { foundations: .15, pricing: .15, risk: .10, implementation: .40, interview: .20 },
            benchmarks: { foundations: 70, pricing: 60, risk: 45, implementation: 90, interview: 70 }
        },
        general: {
            label: 'General Quant Interview / Career Transition',
            weights: { foundations: .20, pricing: .20, risk: .15, implementation: .20, interview: .25 },
            benchmarks: { foundations: 75, pricing: 70, risk: 65, implementation: 70, interview: 80 }
        }
    });

    const EXPERIENCE_DELTA = Object.freeze({ transition: 0, early: 5, experienced: 10 });

    const TIMELINES = Object.freeze({
        urgent: { label: 'Within 4 weeks', weeks: 4 },
        near: { label: '1–3 months', weeks: 8 },
        runway: { label: '3+ months / no fixed deadline', weeks: 12 }
    });

    const PRODUCTS = Object.freeze({
        probability: { id: '30d74f65-720f-4c8a-9358-5c034c713433', name: 'Probability Theory for Quants: Desk-First', reason: 'Build core probability intuition before layering on stochastic models.' },
        statistics: { id: '1d425519-ab39-4aa7-92fa-2d42c42946d6', name: 'Statistics & Econometrics for Quants', reason: 'Strengthen estimation, diagnostics, backtesting and statistical reasoning.' },
        stochastic: { id: '6f4d2332-a1d0-4638-9307-0e2d9fe7453d', name: 'Stochastic Calculus for Quants', reason: 'Connect stochastic processes and calculus to pricing and interview reasoning.' },
        derivatives: { id: 'bdb3c59e-c8c0-430f-8705-b7467514458e', name: 'Derivatives Products & Pricing Master Pack', reason: 'Build product mechanics, pricing, Greeks and hedging intuition across asset classes.' },
        models: { id: '75f6118b-c10e-43c6-acc6-ec48cd6a6cbc', name: 'Quant Models by Asset Class Master Pack', reason: 'Move from product knowledge into model choice, calibration intuition and failure modes.' },
        validation: { id: 'a778e6ae-43d1-4cbd-a6a7-6dce693e5f69', name: 'Model Validation Quant Case Study Pack', reason: 'Practice model challenge, assumptions, diagnostics and validation findings.' },
        xva: { id: '351aa09b-681b-4da9-9b61-844cf295640c', name: 'XVA Calculus Lab', reason: 'Prioritise exposure, counterparty risk and valuation-adjustment reasoning.' },
        pnl: { id: '146ecb42-3df6-41de-a499-14c22b1bd36d', name: 'PnL Attribution & Desk Diagnostics for Quants', reason: 'Connect model behaviour to Greeks, hedging gaps and residual P&L.' },
        lifecycle: { id: '0c8d934a-3844-407b-985e-210783d8cfe6', name: 'Trade Lifecycle for Quants', reason: 'Build the operational desk context linking booking, P&L, risk, XVA and validation.' },
        python: { id: '9ad9f8ac-9872-40c3-82b8-1e6168e65062', name: 'Python for Quants', reason: 'Close implementation gaps with practical Python patterns and interview work.' },
        cpp: { id: 'c3e4c5cc-6616-4728-b979-782bec4d8811', name: 'C++ for Quants: Desk-Ready Notes', reason: 'Deepen performance, memory and production-oriented implementation skills.' },
        sql: { id: '798495e8-653a-480c-9ea8-3182f43f2b9d', name: 'SQL for Quant Interviews', reason: 'Add practical data-query fluency for quant development and interview workflows.' },
        numerical: { id: '6b78550d-e130-41d1-9409-92335ce82a6c', name: 'Numerical Methods for Quants', reason: 'Strengthen calibration, PDE, Monte Carlo and numerical implementation judgement.' },
        interview: { id: '73806d69-768b-497e-87b7-d94fa4cfd772', name: 'Quant Interview Problem Book (1000+ Problems)', reason: 'Convert knowledge into timed recall, problem solving and interview execution.' },
        projects: { id: 'bd2e57b7-32c4-44ad-8a2a-d156222b7ff7', name: 'Industry Grade Quant Project Pack (45 Projects)', reason: 'Integrate multiple domains into implementations you can explain and defend.' },
        gauntlet: { id: 'eb4ee16b-8a1f-475c-9dbf-e03993528ac9', name: 'Quant Project Gauntlet 01: OIS/SOFR Curve', reason: 'Stress-test advanced readiness with a graded, desk-style curve project.' },
        bundle: { id: '164308cd-e3cd-4026-8fdc-337a5955ffff', name: 'Complete Front Office & Risk Quant Professional Bundle', reason: 'Use one structured library when several high-priority domains need work together.' }
    });

    function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

    function getFormValue(name) {
        const el = document.querySelector(`[name="${name}"]:checked`);
        return el ? el.value : '';
    }

    function collectAnswers() {
        const role = getFormValue('role');
        const experience = getFormValue('experience');
        const timeline = getFormValue('timeline');
        const scores = {};
        Object.keys(DOMAINS).forEach(domain => {
            const raw = Number(getFormValue(`level-${domain}`));
            scores[domain] = Number.isInteger(raw) && raw >= 0 && raw <= 4 ? LEVEL_SCORES[raw] : null;
        });
        return { role, experience, timeline, scores };
    }

    function validateAnswers(answers) {
        if (!ROLES[answers.role] || !(answers.experience in EXPERIENCE_DELTA) || !TIMELINES[answers.timeline]) return false;
        return Object.values(answers.scores).every(score => Number.isFinite(score));
    }

    function calculateDiagnostic(answers) {
        const role = ROLES[answers.role];
        const delta = EXPERIENCE_DELTA[answers.experience] || 0;
        const domains = {};
        let readiness = 0;

        Object.keys(DOMAINS).forEach(key => {
            const benchmark = clamp(role.benchmarks[key] + delta, 0, 95);
            const score = answers.scores[key];
            const gap = Math.max(0, benchmark - score);
            const weight = role.weights[key];
            const attainment = benchmark > 0 ? Math.min(score / benchmark, 1) : 1;
            const priority = gap * weight;
            readiness += attainment * weight * 100;
            domains[key] = { score, benchmark, gap, weight, priority };
        });

        const priorities = Object.keys(domains)
            .sort((a, b) => domains[b].priority - domains[a].priority)
            .map(key => ({ key, ...domains[key] }));
        const materialGaps = priorities.filter(item => item.gap >= 20);
        const plan = buildPlan(answers.timeline, priorities);
        const resources = recommendResources(answers, priorities);
        const activePriorities = priorities.filter(item => item.gap > 0).slice(0, 3);

        return {
            version: 1,
            createdAt: new Date().toISOString(),
            role: answers.role,
            roleLabel: role.label,
            experience: answers.experience,
            timeline: answers.timeline,
            timelineLabel: TIMELINES[answers.timeline].label,
            readiness: Math.round(readiness),
            domains,
            priorities: activePriorities,
            materialGapCount: materialGaps.length,
            plan,
            resources,
            bundleAlternative: materialGaps.length >= 3,
            methodology: { levelScores: LEVEL_SCORES, experienceDelta: delta }
        };
    }

    function pickFoundation(score, role) {
        if (score <= 25) return PRODUCTS.probability;
        if (role === 'validation') return PRODUCTS.statistics;
        return PRODUCTS.stochastic;
    }

    function pickRisk(role) {
        if (role === 'xva') return PRODUCTS.xva;
        if (role === 'validation') return PRODUCTS.validation;
        if (role === 'pricing') return PRODUCTS.pnl;
        if (role === 'quantdev') return PRODUCTS.lifecycle;
        return PRODUCTS.validation;
    }

    function pickImplementation(score, role) {
        if (role === 'quantdev') return score <= 50 ? PRODUCTS.python : PRODUCTS.cpp;
        if (score <= 25) return PRODUCTS.python;
        return PRODUCTS.numerical;
    }

    function recommendResources(answers, priorities) {
        const selected = [];
        const seen = new Set();
        function add(product, domain) {
            if (!product || seen.has(product.id)) return;
            seen.add(product.id);
            selected.push({ ...product, domain });
        }

        priorities.slice(0, 3).forEach(priority => {
            if (priority.gap < 10) return;
            switch (priority.key) {
                case 'foundations': add(pickFoundation(priority.score, answers.role), priority.key); break;
                case 'pricing': add(priority.score <= 50 ? PRODUCTS.derivatives : PRODUCTS.models, priority.key); break;
                case 'risk': add(pickRisk(answers.role), priority.key); break;
                case 'implementation': add(pickImplementation(priority.score, answers.role), priority.key); break;
                case 'interview': add(PRODUCTS.interview, priority.key); break;
            }
        });

        if (!selected.length) {
            add(answers.role === 'pricing' ? PRODUCTS.gauntlet : PRODUCTS.projects, 'integration');
            add(PRODUCTS.interview, 'interview');
        } else if (selected.length < 3) {
            add(PRODUCTS.projects, 'integration');
        }
        return selected.slice(0, 3);
    }

    function buildPlan(timeline, priorities) {
        const top = priorities.filter(p => p.gap > 0).slice(0, 3).map(p => DOMAINS[p.key].short);
        const fallbacks = ['Implementation & integration', 'Project integration', 'Interview defence'];
        for (const fallback of fallbacks) {
            if (top.length >= 3) break;
            if (!top.includes(fallback)) top.push(fallback);
        }
        const weeks = TIMELINES[timeline].weeks;
        if (weeks === 4) {
            return [
                { period: 'Week 1', focus: top[0], action: 'Learn the core concepts, then solve or implement one representative problem.' },
                { period: 'Week 2', focus: top[1], action: 'Implement the workflow and explicitly document assumptions and failure modes.' },
                { period: 'Week 3', focus: top[2], action: 'Integrate the third gap with timed drills and cross-domain questions.' },
                { period: 'Week 4', focus: 'Integration & interview defence', action: 'Run mocks, revisit mistakes, and explain model choices without notes.' }
            ];
        }
        if (weeks === 8) {
            return [
                { period: 'Weeks 1–2', focus: top[0], action: 'Build depth using Learn → Implement → Break it.' },
                { period: 'Weeks 3–4', focus: top[1], action: 'Add validation, diagnostics and implementation practice.' },
                { period: 'Weeks 5–6', focus: top[2], action: 'Close the third gap and connect it to the target role.' },
                { period: 'Weeks 7–8', focus: 'Projects & interview defence', action: 'Integrate the domains through a project, timed questions and explanation practice.' }
            ];
        }
        return [
            { period: 'Weeks 1–3', focus: top[0], action: 'Build the strongest missing foundation; derive, implement and test it.' },
            { period: 'Weeks 4–6', focus: top[1], action: 'Deepen the second priority and connect it to desk decisions.' },
            { period: 'Weeks 7–9', focus: top[2], action: 'Close the third gap with validation and failure-mode analysis.' },
            { period: 'Weeks 10–12', focus: 'Integration & interview defence', action: 'Complete a project, run mocks, and practise explaining trade-offs under pressure.' }
        ];
    }

    const ENGINE = Object.freeze({ calculateDiagnostic, ROLES, DOMAINS, TIMELINES, LEVEL_SCORES });
    if (typeof module === 'object' && module.exports) module.exports = ENGINE;
    if (typeof window !== 'undefined') window.D2QDiagnosticEngine = ENGINE;

    function readinessLabel(score) {
        if (score >= 90) return 'Close to the selected role benchmark';
        if (score >= 75) return 'Targeted gaps remain';
        if (score >= 55) return 'Focused rebuilding recommended';
        return 'Foundation-first preparation recommended';
    }

    function priorityCopy(priority) {
        if (priority.gap <= 0) return 'At or above the self-assessed benchmark for this role.';
        if (priority.gap < 20) return 'Small gap: maintain with practice and integration.';
        if (priority.gap < 40) return 'Material gap: prioritise deliberate study and implementation.';
        return 'Large gap: make this an immediate preparation priority.';
    }

    function resultHtml(result) {
        const domainRows = Object.keys(DOMAINS).map(key => {
            const d = result.domains[key];
            return `<div class="qd-domain-row"><div class="qd-domain-head"><strong>${DOMAINS[key].label}</strong><span>Self ${d.score}% · role benchmark ${d.benchmark}%</span></div><div class="qd-bars" aria-label="${DOMAINS[key].label}: self ${d.score} percent, benchmark ${d.benchmark} percent"><div class="qd-bar qd-bar-benchmark" style="width:${d.benchmark}%"></div><div class="qd-bar qd-bar-self" style="width:${d.score}%"></div></div></div>`;
        }).join('');

        const priorities = result.priorities.length ? result.priorities.map((p, index) => `<article class="qd-priority-card"><span class="qd-rank">${index + 1}</span><div><h3>${DOMAINS[p.key].label}</h3><p>${priorityCopy(p)}</p><small>Gap to benchmark: ${p.gap} points · role weight: ${Math.round(p.weight * 100)}%</small></div></article>`).join('') : `<article class="qd-priority-card" style="grid-column:1/-1;"><span class="qd-rank"><i class="fas fa-check"></i></span><div><h3>No benchmark gap identified from your self-ratings</h3><p>Shift the next block toward integration, projects, timed interviews and explaining trade-offs under pressure.</p><small>Retake the diagnostic if your target role or self-assessment changes.</small></div></article>`;

        const plan = result.plan.map(step => `<div class="qd-plan-row"><strong>${step.period}</strong><div><b>${step.focus}</b><p>${step.action}</p></div></div>`).join('');
        const resources = result.resources.map(resource => `<article class="qd-resource-card"><span>${resource.domain === 'integration' ? 'Integration' : (DOMAINS[resource.domain]?.short || 'Recommended')}</span><h3>${resource.name}</h3><p>${resource.reason}</p><a href="/product.html?id=${resource.id}">View resource <i class="fas fa-arrow-right"></i></a></article>`).join('');
        const bundle = result.bundleAlternative ? `<aside class="qd-bundle-alt"><div><strong>Broad-gap alternative</strong><p>You have three or more material gaps. A structured multi-domain library may be more coherent than solving each gap independently.</p></div><a href="/product.html?id=${PRODUCTS.bundle.id}">View Complete Bundle</a></aside>` : '';

        return `<section class="qd-result-hero"><div><span class="qd-eyebrow">Your diagnostic</span><h2>${result.roleLabel}</h2><p>${result.timelineLabel} preparation horizon</p></div><div class="qd-score" aria-label="${result.readiness} percent readiness to self-assessed benchmark"><strong>${result.readiness}%</strong><span>${readinessLabel(result.readiness)}</span></div></section>
        <div class="qd-disclaimer"><i class="fas fa-circle-info"></i><p><strong>Interpretation:</strong> this is a transparent self-assessment against role-specific preparation benchmarks, not a psychometric test, hiring prediction, or guarantee of interview performance.</p></div>
        <section class="qd-result-section"><div class="qd-section-head"><span>Readiness profile</span><h2>Where your self-assessment sits against the target role</h2></div><div class="qd-domain-legend"><span><i class="qd-legend-self"></i>Your self-rating</span><span><i class="qd-legend-benchmark"></i>Role benchmark</span></div><div class="qd-domain-list">${domainRows}</div></section>
        <section class="qd-result-section"><div class="qd-section-head"><span>Priority gaps</span><h2>Work on these first</h2></div><div class="qd-priority-grid">${priorities}</div></section>
        <section class="qd-result-section"><div class="qd-section-head"><span>${TIMELINES[result.timeline].weeks}-week sequence</span><h2>A preparation order matched to your timeline</h2></div><div class="qd-plan">${plan}</div></section>
        <section class="qd-result-section"><div class="qd-section-head"><span>Focused resources</span><h2>Use only what addresses the highest-priority gaps</h2><p>Current price and checkout details are shown on each product page.</p></div><div class="qd-resource-grid">${resources}</div>${bundle}</section>
        <section class="qd-methodology"><details><summary>How this diagnostic is calculated</summary><div class="qd-methodology-body"><p>Each domain self-rating maps to 0%, 25%, 50%, 75% or 100%. Your selected role defines a benchmark and importance weight for each domain. Experience raises the preparation benchmark by ${result.methodology.experienceDelta} points, capped at 95%. The readiness indicator is the weighted percentage of those benchmarks currently met.</p><p>Priority gaps are ranked by <code>(benchmark − self-rating) × role weight</code>. Interview timeline changes only the study sequence length; it does not inflate or reduce the readiness score.</p></div></details></section>
        <div class="qd-result-actions"><button type="button" class="qd-btn qd-btn-secondary" id="qd-retake"><i class="fas fa-rotate-left"></i> Retake diagnostic</button><button type="button" class="qd-btn qd-btn-secondary" id="qd-copy"><i class="fas fa-copy"></i> Copy preparation summary</button></div>`;
    }

    function copySummary(result) {
        const priorities = result.priorities.map((p, i) => `${i + 1}. ${DOMAINS[p.key].label} (gap ${p.gap})`).join('\n');
        const plan = result.plan.map(step => `${step.period}: ${step.focus} — ${step.action}`).join('\n');
        const resources = result.resources.map(r => `- ${r.name}`).join('\n');
        const text = `Desk2Quant Quant Career Diagnostic\nRole: ${result.roleLabel}\nReadiness-to-benchmark: ${result.readiness}%\nTimeline: ${result.timelineLabel}\n\nTop priorities:\n${priorities || 'No benchmark gaps identified'}\n\nPlan:\n${plan}\n\nFocused resources:\n${resources}\n\nThis is a self-assessment, not a hiring prediction.`;
        return navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error('Clipboard unavailable'));
    }

    function saveResult(result) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); } catch (_) { } }

    function showResult(result) {
        const formWrap = document.getElementById('qd-form-wrap');
        const resultWrap = document.getElementById('qd-result');
        if (!formWrap || !resultWrap) return;
        formWrap.hidden = true;
        resultWrap.hidden = false;
        resultWrap.innerHTML = resultHtml(result);
        resultWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const retake = document.getElementById('qd-retake');
        if (retake) retake.addEventListener('click', () => {
            resultWrap.hidden = true;
            resultWrap.innerHTML = '';
            formWrap.hidden = false;
            document.getElementById('qd-form').reset();
            document.getElementById('qd-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        const copy = document.getElementById('qd-copy');
        if (copy) copy.addEventListener('click', async () => {
            const original = copy.innerHTML;
            try { await copySummary(result); copy.innerHTML = '<i class="fas fa-check"></i> Copied'; }
            catch (_) { copy.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Copy unavailable'; }
            setTimeout(() => { copy.innerHTML = original; }, 1800);
        });
    }

    function onSubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const answers = collectAnswers();
        if (!validateAnswers(answers)) {
            const error = document.getElementById('qd-form-error');
            if (error) { error.hidden = false; error.textContent = 'Please answer every question before generating your diagnostic.'; }
            return;
        }
        const error = document.getElementById('qd-form-error');
        if (error) error.hidden = true;
        const result = calculateDiagnostic(answers);
        saveResult(result);
        showResult(result);
    }

    function init() {
        const form = document.getElementById('qd-form');
        if (!form) return;
        form.addEventListener('submit', onSubmit);
    }

    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();