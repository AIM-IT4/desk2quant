/**
 * Desk2Quant Hero Dynamic Terminal Simulation
 * Demonstrates real-time value proposition of the platform:
 * Pricing, Greeks, Risk Attribution, Model Validation & Mentorship
 */
(function () {
    const scenarios = [
        {
            id: 0,
            title: "Vol & Pricing",
            command: "d2q price --model svi-jump --surface SPX-6M --barrier knock-out",
            lines: [
                { type: "info", text: "[09:14:02] Ingesting implied vol quotes across 18 delta strikes..." },
                { type: "ok", text: "[OK]   SVI Calibration: RMSE 0.0011 | Butterfly & Calendar Arb: ZERO" },
                { type: "calc", text: "[CALC] Pricing 6M Down-and-Out Barrier Call (S=5,240, K=5,200, B=4,950):" },
                { type: "metric", text: "       • Price: $148.20  |  Delta: +0.528  |  Gamma: +0.019" },
                { type: "metric", text: "       • Vega: -64.5k/vol    |  Vanna: +3.2k    |  Volga: +8.9k" },
                { type: "pass", text: "[PASS] Delta-Gamma neutral hedge executed via 25D Risk Reversal" },
                { type: "value", text: "⚡ Flagship Scope: 46+ PDFs • 60+ scripts • 1000+ problems • Python + C++ + SQL" }
            ]
        },
        {
            id: 1,
            title: "Desk P&L & Greeks",
            command: "d2q simulate --desk rates-linear --event sofr-basis-spike",
            lines: [
                { type: "alert", text: "[ALERT] SOFR vs 3M Libor basis blowout (+22 bps intraday shock)" },
                { type: "info", text: "[DIAGNOSE] P&L unexplained: -$184,200 on multi-curve swap book" },
                { type: "calc", text: "       • Root Cause: Cross-gamma convexity unhedged between 2Y & 5Y OIS" },
                { type: "ok", text: "       • Desk Action: DV01 curve re-weighting + FRA-OIS basis hedge" },
                { type: "pass", text: "[PASS] Reconciled P&L: Delta neutral | Basis exposure closed | P&L: +$42,000" },
                { type: "value", text: "⚡ Real Desk Drills: Learn how front-office quants debug live book shocks" }
            ]
        },
        {
            id: 2,
            title: "Model Risk Drill",
            command: "d2q validate --model local-vol --challenge \"Gatheral Wing Test\"",
            lines: [
                { type: "info", text: "[DRILL] Interviewer: \"Why does standard Dupire PDE blow up at OTM wings?\"" },
                { type: "calc", text: "[DEFENCE] Candidate: Discretization error in d²C/dK² yields negative density." },
                { type: "ok", text: "[REMEDY]  Applied Gatheral quasi-explicit SVI asymptotic wing parametrization." },
                { type: "pass", text: "[SCORE: 9.8/10] Interviewer Verdict: TIER-1 BANK READY (Front Office/MRM)" },
                { type: "value", text: "⚡ Interview Gauntlet: 1,000+ rigorously derived interview questions & answers" }
            ]
        },
        {
            id: 3,
            title: "Platform Scope",
            command: "d2q system --info flagship-curriculum",
            lines: [
                { type: "info", text: "[CURRICULUM] Desk2Quant Flagship Practitioner System:" },
                { type: "metric", text: "  • 46+ Field Manual PDFs (Pricing, XVA, Rates, Vol, Numerical Methods)" },
                { type: "metric", text: "  • 60+ Production Scripts & Runnable Notebooks (Python + C++ + SQL)" },
                { type: "metric", text: "  • 1,000+ Quant Interview Problems with rigorous derivations & code" },
                { type: "ok", text: "  • 1-on-1 Mentorship personally led by Amit Kumar Jha (IIT Alum)" },
                { type: "pass", text: "[SUCCESS] 50+ candidates placed across global hedge funds & tier-1 banks" },
                { type: "value", text: "⚡ Flagship: 46+ PDFs • 60+ scripts • 1000+ interview problems • Python + C++ + SQL" }
            ]
        }
    ];

    let currentScenarioIdx = 0;
    let isTyping = false;
    let autoPlayTimer = null;
    let typeInterval = null;
    let streamTimer = null;
    let isPaused = false;
    let isVisible = true;

    function initTerminal() {
        const termScreen = document.getElementById('termLogHistory');
        const termCmd = document.getElementById('termCurrentCommand');
        if (!termScreen || !termCmd) return;

        const termWindow = document.getElementById('heroTerminalWindow');
        if (termWindow) {
            termWindow.addEventListener('mouseenter', () => { isPaused = true; });
            termWindow.addEventListener('mouseleave', () => { isPaused = false; });

            // Free CPU/GPU cycles when terminal is scrolled off-screen
            if ('IntersectionObserver' in window) {
                const visObserver = new IntersectionObserver((entries) => {
                    entries.forEach((entry) => {
                        const wasVisible = isVisible;
                        isVisible = entry.isIntersecting;
                        if (!isVisible) {
                            isPaused = true;
                            clearTimeout(autoPlayTimer);
                        } else if (!wasVisible && isVisible) {
                            isPaused = false;
                            scheduleNext();
                        }
                    });
                }, { rootMargin: '60px' });
                visObserver.observe(termWindow);
            }
        }

        // Pause when tab is backgrounded
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                isPaused = true;
                clearTimeout(autoPlayTimer);
            } else if (isVisible) {
                isPaused = false;
                scheduleNext();
            }
        });

        runScenario(0);
    }

    function runScenario(index) {
        if (index < 0 || index >= scenarios.length) index = 0;
        currentScenarioIdx = index;

        // Update active chip
        document.querySelectorAll('.scenario-chip').forEach((chip, i) => {
            chip.classList.toggle('active', i === currentScenarioIdx);
        });

        clearTimeout(autoPlayTimer);
        clearInterval(typeInterval);
        clearTimeout(streamTimer);

        const scenario = scenarios[currentScenarioIdx];
        const termScreen = document.getElementById('termLogHistory');
        const termCmd = document.getElementById('termCurrentCommand');
        if (!termScreen || !termCmd) return;

        termScreen.innerHTML = '';
        termCmd.textContent = '';
        isTyping = true;

        // Type command
        let charIdx = 0;
        const textToType = scenario.command;
        typeInterval = setInterval(() => {
            if (charIdx < textToType.length) {
                termCmd.textContent += textToType.charAt(charIdx);
                charIdx++;
            } else {
                clearInterval(typeInterval);
                isTyping = false;
                streamOutput(scenario.lines, 0);
            }
        }, 28);
    }

    function streamOutput(lines, lineIdx) {
        if (lineIdx >= lines.length) {
            scheduleNext();
            return;
        }

        const line = lines[lineIdx];
        const termScreen = document.getElementById('termLogHistory');
        if (!termScreen) return;

        const lineEl = document.createElement('div');
        lineEl.className = 'term-line ' + (line.type || 'info');
        lineEl.textContent = line.text;
        termScreen.appendChild(lineEl);
        termScreen.scrollTop = termScreen.scrollHeight;

        const delay = line.type === 'value' ? 450 : 260;
        streamTimer = setTimeout(() => {
            streamOutput(lines, lineIdx + 1);
        }, delay);
    }

    function scheduleNext() {
        clearTimeout(autoPlayTimer);
        autoPlayTimer = setTimeout(() => {
            if (!isPaused && isVisible) {
                const nextIdx = (currentScenarioIdx + 1) % scenarios.length;
                runScenario(nextIdx);
            } else if (isPaused && isVisible) {
                scheduleNext();
            }
        }, 5000);
    }

    // Expose global controller functions
    window.triggerHeroScenario = function (index) {
        runScenario(index);
    };

    window.switchHeroTab = function (tab) {
        const tabTerm = document.getElementById('tabTerminal');
        const tabMentor = document.getElementById('tabMentor');
        const panelTerm = document.getElementById('panelTerminal');
        const panelMentor = document.getElementById('panelMentor');

        if (tab === 'mentor') {
            tabTerm?.classList.remove('active');
            tabMentor?.classList.add('active');
            if (panelTerm) panelTerm.style.display = 'none';
            if (panelMentor) {
                panelMentor.style.display = 'block';
                panelMentor.removeAttribute('hidden');
            }
        } else {
            tabMentor?.classList.remove('active');
            tabTerm?.classList.add('active');
            if (panelMentor) panelMentor.style.display = 'none';
            if (panelTerm) panelTerm.style.display = 'block';
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTerminal);
    } else {
        initTerminal();
    }
})();
