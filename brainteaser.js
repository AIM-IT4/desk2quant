/**
 * Desk2Quant - Daily Quant Brainteaser
 * Rotates daily based on day-of-year across 7 foundational quantitative interview puzzles.
 */
(function () {
    'use strict';

    const PUZZLES = [
        {
            category: 'Probability & Martingales',
            title: 'Expected Coin Tosses: HTH vs HHT',
            context: 'Frequently asked by Jump Trading, Citadel Securities, and SIG.',
            question: 'You flip a fair coin repeatedly. What is the expected number of flips to see the pattern HTH, and what is the expected number of flips to see HHT?',
            hint: 'Set up states for prefixes or consider how overlapping prefixes affect return times. Does HTH have self-overlap that HHT does not?',
            solution: '<p><strong>HHT: Expected 8 flips. HTH: Expected 10 flips.</strong></p><p><strong>Why the difference?</strong> Both patterns have probability (1/2)³ = 1/8. However, if you are attempting HTH and flip H-T-T, you lose all progress and must start over. But if you flip H-T-H and fail the next flip (getting H-T-H-T), the trailing "H" can still serve as the beginning of a new HTH! By renewal theory and Martingale stopping times (Gambler''s Ruin on prefixes), patterns with self-overlap take longer on average to appear first: E[HTH] = 2³ + 2¹ = 10, whereas E[HHT] = 2³ = 8.</p>'
        },
        {
            category: 'Game Theory & Backward Induction',
            title: 'The 100 Tigers and One Sheep',
            context: 'Classic puzzle tested at D.E. Shaw, Jane Street, and Two Sigma.',
            question: '100 rational, ferocious tigers and 1 sheep are on an island. If a tiger eats the sheep, the tiger turns into a sheep (and can now be eaten by other tigers). Eating is the only way to satisfy their hunger, but surviving is their highest priority. Does the first tiger eat the sheep?',
            hint: 'Use backward induction: what happens if there is only 1 tiger? 2 tigers? 3 tigers? Look for the even/odd parity.',
            solution: '<p><strong>The first tiger does NOT eat the sheep.</strong></p><p><strong>Backward Induction Proof:</strong><br>• <strong>1 Tiger:</strong> Eats the sheep immediately (no one left to eat it).<br>• <strong>2 Tigers:</strong> Neither eats! (If Tiger A eats, it becomes a sheep with 1 tiger left, which Tiger B would eat. Tiger A knows this, so the sheep survives).<br>• <strong>3 Tigers:</strong> The first tiger eats! (Because it turns into 2 tigers and 1 sheep, and as shown above, 2 tigers never eat).<br>• <strong>Parity Rule:</strong> For any <em>odd</em> number of tigers, the sheep is eaten. For any <em>even</em> number (such as 100), no tiger dares to eat the sheep. The sheep remains completely safe!</p>'
        },
        {
            category: 'Conditional Probability & Decision Theory',
            title: 'Russian Roulette with Consecutive Bullets',
            context: 'Asked at Morgan Stanley strats and Akuna Capital interviews.',
            question: 'A 6-chamber revolver is loaded with 2 consecutive bullets. The cylinder is spun. The first participant points the gun at their head, pulls the trigger, and survives (click!). You are the second participant. Should you pull the trigger immediately, or spin the cylinder before pulling?',
            hint: 'Condition on the observed event: the previous chamber was empty. Which empty chambers could that have been, and what sits in the next chamber?',
            solution: '<p><strong>You should pull the trigger immediately WITHOUT spinning.</strong></p><p><strong>Conditional Probability:</strong><br>Label the chambers 1 to 6. Let bullets be in chambers 1 and 2. The 4 empty chambers are 3, 4, 5, and 6.<br>Since the first shot clicked on an empty chamber, the cylinder was in position 3, 4, 5, or 6.<br>• If it was at 3: next is 4 (Empty).<br>• If it was at 4: next is 5 (Empty).<br>• If it was at 5: next is 6 (Empty).<br>• If it was at 6: next is 1 (BULLET!).<br>Thus, of the 4 possibilities, only 1 contains a bullet: P(Death | No Spin) = 1/4 = <strong>25%</strong>.<br>If you spin the cylinder, you reset to random: P(Death | Spin) = 2/6 = <strong>33.3%</strong>.<br>Pulling immediately reduces your risk by 8.3 percentage points!</p>'
        },
        {
            category: 'Continuous Random Variables & Order Statistics',
            title: 'Expected Max of Two Uniform Variables',
            context: 'Foundational quantitative risk problem asked at Goldman Sachs & Barclays.',
            question: 'Let X and Y be independent, identically distributed random variables drawn uniformly from (0, 1). What is the expected value of max(X, Y), and what is the expected absolute difference E[|X - Y|]?',
            hint: 'Find the CDF of M = max(X, Y) by noting that max(X, Y) <= m if and only if both X <= m and Y <= m.',
            solution: '<p><strong>E[max(X, Y)] = 2/3, and E[|X - Y|] = 1/3.</strong></p><p><strong>Mathematical Derivation:</strong><br>1. For m in [0, 1], P(max(X, Y) <= m) = P(X <= m) * P(Y <= m) = m * m = m².<br>2. The PDF is f(m) = d/dm(m²) = 2m.<br>3. E[max(X, Y)] = ∫₀¹ m * 2m dm = [2m³/3]₀¹ = <strong>2/3</strong>.<br>4. By symmetry, E[min(X, Y)] = 1 - 2/3 = 1/3.<br>5. Note that |X - Y| = max(X, Y) - min(X, Y).<br>Therefore, E[|X - Y|] = E[max] - E[min] = 2/3 - 1/3 = <strong>1/3</strong>.</p>'
        },
        {
            category: 'Stochastic Processes & Optimal Stopping',
            title: 'The Secretary Problem (The 37% Rule)',
            context: 'Optimal stopping puzzle frequently asked by algorithmic trading desks.',
            question: 'You must hire the best quant from N candidates who arrive sequentially. After each interview, you must decide immediately to hire or reject. Rejected candidates cannot be recalled. What strategy maximizes your probability of choosing the best candidate, and what is that probability as N -> infinity?',
            hint: 'Consider an exploration phase where you reject the first k candidates to set a benchmark, followed by an exploitation phase where you pick the next candidate who exceeds the benchmark.',
            solution: '<p><strong>The optimal strategy is the 1/e (approx 36.8%) rule.</strong></p><p><strong>Optimal Stopping Policy:</strong><br>Reject the first k* = N/e candidates unconditionally (observation phase) while noting the highest score seen so far. Then hire the very next candidate whose score exceeds this benchmark.<br>As N -> ∞, the optimal threshold converges to 1/e ≈ <strong>36.79%</strong>, and the probability of landing the absolute best candidate in the entire pool is exactly 1/e ≈ <strong>36.79%</strong>.</p>'
        },
        {
            category: 'Harmonic Analysis & Geometry',
            title: 'Ant on a Stretching Rubber Rope',
            context: 'Asked to test whether candidates think in rates vs proportions.',
            question: 'An ant crawls at 1 cm/second on a 1-meter rubber band. At the end of each second, the band stretches instantaneously by 1 meter uniformly. Does the ant ever reach the end, and why?',
            hint: 'Do not measure the ant in centimeters. Measure the ant''s position as a proportion (fraction) of the total length.',
            solution: '<p><strong>Yes, the ant reaches the end!</strong></p><p><strong>Proportional Analysis:</strong><br>Let L_n be the length of the band at second n: L_n = 100n cm.<br>In second n, the ant crawls 1 cm before the stretch. Because the stretch is uniform, stretching multiplies the ant''s absolute distance from the start by the same ratio as the total length, preserving its relative fraction of the rope!<br>The fraction of the rope traversed in second n is: Δf_n = 1 / (100n).<br>Total fraction traversed after t seconds is: F(t) = (1/100) * ∑_{n=1}^t (1/n).<br>Because the harmonic series ∑ (1/n) diverges to infinity, F(t) will eventually exceed 1 (100%), guaranteeing the ant will cross the finish line!</p>'
        },
        {
            category: 'Martingales & Random Walks',
            title: 'Gambler''s Ruin with Unfair Odds',
            context: 'Core options pricing and risk management concept asked across prop shops.',
            question: 'A trader starts with $k capital and bets $1 each round. With probability p they win $1, and with probability q = 1-p they lose $1. They stop when they reach $N or go broke ($0). What is the probability of hitting $N?',
            hint: 'Construct a martingale of the form M_n = (q/p)^{X_n} and apply the Optional Stopping Theorem.',
            solution: '<p><strong>P(Hit N) = [1 - (q/p)^k] / [1 - (q/p)^N] (for p != 0.5).</strong></p><p><strong>Martingale Construction:</strong><br>For p != 0.5, the process M_n = (q/p)^{S_n} is a martingale with constant expectation E[M_0] = (q/p)^k.<br>Let T be the stopping time when the trader reaches 0 or N.<br>By the Optional Stopping Theorem: E[M_T] = P(N) * (q/p)^N + [1 - P(N)] * (q/p)^0 = (q/p)^k.<br>Solving for P(N) yields: P(Hit N) = [1 - (q/p)^k] / [1 - (q/p)^N].<br>For a fair game (p = 0.5), this simplifies by L''Hôpital''s Rule to simply <strong>k / N</strong>.</p>'
        }
    ];

    function initBrainteaser() {
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
        const puzzle = PUZZLES[dayOfYear % PUZZLES.length];

        const catEl = document.getElementById('btCategory');
        const qEl = document.getElementById('btQuestion');
        const ctxEl = document.getElementById('btContext');
        const hintEl = document.getElementById('btHintText');
        const solEl = document.getElementById('btSolutionText');
        const dateEl = document.getElementById('btDateDisplay');
        const shareLink = document.getElementById('btShareLinkedIn');

        if (catEl) catEl.textContent = puzzle.category;
        if (qEl) qEl.textContent = puzzle.question;
        if (ctxEl) ctxEl.textContent = puzzle.context;
        if (hintEl) hintEl.textContent = puzzle.hint;
        if (solEl) solEl.innerHTML = puzzle.solution;

        if (dateEl) {
            const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            dateEl.textContent = 'Puzzle #' + (dayOfYear % PUZZLES.length + 1) + ' · ' + today;
        }

        if (shareLink) {
            const shareText = encodeURIComponent(
                `💡 Today's Quant Interview Brainteaser from @Desk2Quant:\n\n"${puzzle.question}"\n\nCan you solve this without checking the worked solution? Try it here: https://desk2quant.com/#brainteaser`
            );
            shareLink.href = `https://www.linkedin.com/feed/?shareActive=true&text=${shareText}`;
        }
    }

    window.toggleBtHint = function () {
        const panel = document.getElementById('btHintPanel');
        const btnText = document.getElementById('btHintBtnText');
        if (!panel) return;
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (btnText) btnText.textContent = isHidden ? 'Hide Hint' : 'Show Hint';
    };

    window.toggleBtSolution = function () {
        const panel = document.getElementById('btSolutionPanel');
        const btnText = document.getElementById('btSolutionBtnText');
        if (!panel) return;
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (btnText) btnText.textContent = isHidden ? 'Hide Solution' : 'Reveal Worked Solution';
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBrainteaser);
    } else {
        initBrainteaser();
    }
})();
