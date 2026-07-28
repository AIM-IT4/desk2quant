export const simulatorMeta = Object.freeze({
    productName: 'Desk2Quant Desk Simulator',
    storageKey: 'desk2quant.desk-simulator.progress.v1',
    version: 1
});

export const scenarios = Object.freeze([
    {
        id: 'vol-snapshot',
        number: '01',
        title: 'The Missing Vega',
        shortTitle: 'Options P&L break',
        desk: 'Equity Derivatives',
        discipline: 'P&L explain',
        level: 'Foundation',
        duration: '12-15 min',
        accent: 'teal',
        teaser: 'The desk expected +$1.42m. Finance signed off +$0.61m. Find the missing $810k before the morning call.',
        objective: 'Identify the source of the unexplained P&L, propose a safe rerun, and add controls that prevent recurrence.',
        opening: {
            eyebrow: '08:07 London · Daily P&L control',
            headline: 'The trader says the book made $1.42m. Finance can only explain $0.61m.',
            body: 'The largest exposure is a three-month SPX options book. Spot and implied volatility both moved in the desk’s favour. New trades are already included in the front-office estimate.',
            metrics: [
                { label: 'Desk estimate', value: '+$1.42m', tone: 'positive' },
                { label: 'Official P&L', value: '+$0.61m', tone: 'neutral' },
                { label: 'Unexplained', value: '-$0.81m', tone: 'negative' }
            ]
        },
        brief: [
            { label: 'Your role', value: 'Desk quant covering equity derivatives' },
            { label: 'Deadline', value: '09:00 P&L sign-off call' },
            { label: 'Primary book', value: 'SPX 3M vanilla options' },
            { label: 'Investigation budget', value: '100 points' }
        ],
        messages: [
            {
                role: 'Trader',
                initials: 'TR',
                time: '08:07',
                text: 'Spot was up 1% and the three-month vol surface moved 2.5 points higher. This book is long vega. The official number makes no sense.'
            },
            {
                role: 'Product Control',
                initials: 'PC',
                time: '08:10',
                text: 'New trades and fees reconcile. We need an evidence-backed explanation, not an offsetting manual adjustment.'
            },
            {
                role: 'Market Data',
                initials: 'MD',
                time: '08:13',
                text: 'Yesterday included a symbol-alias deployment. No broad feed outage was reported.'
            }
        ],
        artifacts: [
            {
                id: 'pnl-bridge',
                title: 'Front-office P&L bridge',
                eyebrow: 'Initial evidence',
                type: 'table',
                summary: 'The desk estimate is internally consistent and dominated by vega.',
                columns: ['Component', 'P&L', 'Observation'],
                rows: [
                    ['Delta', '+$420k', '1.0% spot move'],
                    ['Gamma', '+$34k', 'Convexity contribution'],
                    ['Vega', '+$828k', '2.5 vol-point move'],
                    ['Theta', '-$48k', 'One business day'],
                    ['New trades & fees', '+$186k', 'Confirmed by Product Control'],
                    ['Desk estimate', '+$1.420m', 'Sum of components']
                ]
            },
            {
                id: 'risk-snapshot',
                title: 'Risk snapshot',
                eyebrow: 'Initial evidence',
                type: 'keyValue',
                summary: 'The book has enough vega for a stale volatility input to explain the gap.',
                values: [
                    ['SPX spot', '5,252'],
                    ['ATM 3M vega', '$331k / vol point'],
                    ['FO valuation time', '16:31:08 UTC'],
                    ['Risk valuation time', '16:32:14 UTC'],
                    ['FO market set', 'EOD_2026-07-27'],
                    ['Risk market set', 'EOD_2026-07-27']
                ]
            },
            {
                id: 'vol-compare',
                title: 'Volatility snapshot comparison',
                eyebrow: 'Unlocked evidence',
                type: 'table',
                summary: 'The risk copy contains an earlier ATM volatility despite sharing the same market-set label.',
                locked: true,
                columns: ['Field', 'Front office', 'Risk copy', 'Difference'],
                rows: [
                    ['SPX 3M ATM', '20.50%', '18.10%', '-2.40 vol pts'],
                    ['SPX 6M ATM', '21.20%', '21.18%', '-0.02 vol pts'],
                    ['Snapshot timestamp', '16:30:02', '15:45:00', '-45 min'],
                    ['Surface completeness', '64 / 64 nodes', '63 / 64 nodes', '1 missing']
                ]
            },
            {
                id: 'loader-log',
                title: 'Market-data loader log',
                eyebrow: 'Unlocked evidence',
                type: 'code',
                summary: 'A renamed alias skipped one surface node and retained its prior value.',
                locked: true,
                code: [
                    '16:29:58 INFO  loading surface SPX_VOL_EOD',
                    '16:29:59 WARN  alias not resolved: SPX.3M.ATM',
                    '16:29:59 INFO  retaining previous value for missing node',
                    '16:30:00 INFO  received alias candidate: SPX_ATM_3M',
                    '16:30:01 WARN  completeness check disabled for risk-copy job',
                    '16:30:02 INFO  published EOD_2026-07-27'
                ]
            },
            {
                id: 'revaluation',
                title: 'Controlled revaluation',
                eyebrow: 'Unlocked evidence',
                type: 'comparison',
                summary: 'Replacing only the stale volatility node closes almost the entire residual.',
                locked: true,
                left: { label: 'Risk copy', value: '+$0.610m', note: '18.10% ATM vol' },
                right: { label: 'Corrected node', value: '+$1.405m', note: '20.50% ATM vol' },
                footer: 'Remaining $15k is within normal explain tolerance.'
            }
        ],
        tests: [
            {
                id: 'compare-vol',
                title: 'Compare volatility snapshots',
                category: 'Market data',
                cost: 10,
                signal: 'decisive',
                description: 'Diff front-office and risk volatility nodes, timestamps and completeness.',
                resultTitle: 'Mismatch isolated to SPX 3M ATM',
                result: 'The risk copy retained 18.10% while front office used the 20.50% close. Other liquid nodes agree within 0.02 vol points.',
                unlocks: ['vol-compare']
            },
            {
                id: 'controlled-reval',
                title: 'Revalue with the front-office node',
                category: 'Valuation',
                cost: 14,
                signal: 'decisive',
                description: 'Change only the SPX 3M ATM input and rerun the official valuation.',
                resultTitle: 'Residual falls from $810k to $15k',
                result: 'The controlled rerun produces +$1.405m. This is strong causal evidence, not just correlation.',
                unlocks: ['revaluation']
            },
            {
                id: 'inspect-loader',
                title: 'Inspect the market-data loader',
                category: 'Operations',
                cost: 8,
                signal: 'supporting',
                description: 'Check alias resolution and completeness controls around the close.',
                resultTitle: 'Alias deployment skipped one node',
                result: 'SPX.3M.ATM was renamed, the risk-copy job retained the prior value, and its completeness check was disabled.',
                unlocks: ['loader-log']
            },
            {
                id: 'reconcile-trades',
                title: 'Reconcile new trades again',
                category: 'Booking',
                cost: 9,
                signal: 'neutral',
                description: 'Repeat the trade and fee reconciliation already performed by Product Control.',
                resultTitle: 'No booking break found',
                result: 'All 17 new trades, premiums and fees match the official ledger. This does not explain the residual.',
                unlocks: []
            },
            {
                id: 'check-fx',
                title: 'Rebuild the FX translation',
                category: 'P&L control',
                cost: 8,
                signal: 'neutral',
                description: 'Test whether USD-to-reporting-currency translation caused the difference.',
                resultTitle: 'FX impact is immaterial',
                result: 'The translation difference is $3.8k, well below the $810k residual.',
                unlocks: []
            },
            {
                id: 'theta-calendar',
                title: 'Review theta calendar treatment',
                category: 'Valuation',
                cost: 8,
                signal: 'neutral',
                description: 'Compare business-day and calendar-day theta conventions.',
                resultTitle: 'Theta convention is not the driver',
                result: 'The maximum convention difference is $11k. It cannot explain the observed break.',
                unlocks: []
            }
        ],
        diagnosis: {
            rootCauses: [
                { id: 'stale-vol', label: 'A stale 3M ATM volatility node entered the risk valuation' },
                { id: 'trade-booking', label: 'New option trades were missing from the official book' },
                { id: 'theta', label: 'Front office and Finance used different theta conventions' },
                { id: 'fx', label: 'The book was translated with an incorrect FX rate' }
            ],
            contributors: [
                { id: 'alias-change', label: 'The symbol-alias change was not mapped in the risk-copy job' },
                { id: 'control-gap', label: 'Surface completeness control was disabled' },
                { id: 'high-vega', label: 'Concentrated vega amplified a small data-control failure' },
                { id: 'solver', label: 'The pricing solver failed to converge' }
            ],
            fixes: [
                { id: 'repair-rerun', label: 'Repair the alias, republish the complete surface and rerun valuation' },
                { id: 'manual-offset', label: 'Post an $810k manual P&L adjustment' },
                { id: 'reduce-vega', label: 'Hedge the vega before correcting the official valuation' },
                { id: 'copy-fo-pnl', label: 'Replace the official P&L with the trader estimate' }
            ],
            controls: [
                { id: 'snapshot-parity', label: 'Compare source timestamps across valuation systems' },
                { id: 'surface-completeness', label: 'Block publication when required surface nodes are missing' },
                { id: 'manual-adjustment', label: 'Allow traders to override stale market data without review' },
                { id: 'more-email', label: 'Send a larger distribution-list email after each close' }
            ]
        },
        answer: {
            rootCause: 'stale-vol',
            contributors: ['alias-change', 'control-gap', 'high-vega'],
            fix: 'repair-rerun',
            controls: ['snapshot-parity', 'surface-completeness'],
            decisiveTests: ['compare-vol', 'controlled-reval'],
            supportingTests: ['inspect-loader'],
            explanation: 'The risk-copy job retained an old SPX 3M ATM volatility after an alias change. The book’s $331k-per-point vega turns the 2.4-point input gap into roughly $794k, and the controlled revaluation closes the residual to normal tolerance.',
            learning: [
                'A shared market-set name does not prove that the underlying snapshots are identical.',
                'A one-factor controlled revaluation is stronger evidence than a broad full-book rerun.',
                'Completeness and timestamp controls should fail closed for required market data.'
            ]
        },
        nextSteps: [
            {
                label: 'Read the companion article',
                title: 'The Greeks You Were Never Taught',
                href: 'blog.html?slug=greeks-you-were-never-taught-vanna-volga-charm-speed'
            },
            {
                label: 'Explore Desk2Quant notes',
                title: 'P&L attribution and desk diagnostics',
                href: 'index.html#products'
            }
        ]
    },
    {
        id: 'curve-convention',
        number: '02',
        title: 'The Curve That Would Not Build',
        shortTitle: 'Curve bootstrap failure',
        desk: 'Rates & Pricing',
        discipline: 'Model diagnostics',
        level: 'Intermediate',
        duration: '15-18 min',
        accent: 'amber',
        teaser: 'A routine USD curve deployment now fails at the five-year node. The quotes look normal; the pricing batch is blocked.',
        objective: 'Separate data, numerical and configuration hypotheses, restore a defensible curve, and design regression controls.',
        opening: {
            eyebrow: '18:42 New York · End-of-day curve build',
            headline: 'The USD projection curve no longer bootstraps past five years.',
            body: 'The failure began immediately after an instrument-configuration refactor. Market quotes passed first-line checks and the previous build completed normally.',
            metrics: [
                { label: 'Failed node', value: '5Y', tone: 'negative' },
                { label: 'Max residual', value: '18.7 bp', tone: 'negative' },
                { label: 'Batch blocked', value: '41 trades', tone: 'neutral' }
            ]
        },
        brief: [
            { label: 'Your role', value: 'Pricing quant supporting USD rates' },
            { label: 'Deadline', value: 'Before overnight valuation begins' },
            { label: 'Curve', value: 'USD term projection curve' },
            { label: 'Investigation budget', value: '100 points' }
        ],
        messages: [
            {
                role: 'Rates Trader',
                initials: 'RT',
                time: '18:42',
                text: 'The market is quiet. Nothing in today’s five-year quote should break a curve that built yesterday.'
            },
            {
                role: 'Valuation Control',
                initials: 'VC',
                time: '18:45',
                text: 'Do not drop the five-year instrument just to make the solver green. We need to preserve calibration coverage.'
            },
            {
                role: 'Platform Engineering',
                initials: 'PE',
                time: '18:49',
                text: 'A configuration refactor moved instrument conventions into a shared template this afternoon.'
            }
        ],
        artifacts: [
            {
                id: 'quote-ladder',
                title: 'USD swap quote ladder',
                eyebrow: 'Initial evidence',
                type: 'table',
                summary: 'The five-year quote is smooth relative to adjacent tenors.',
                columns: ['Tenor', 'Today', 'Prior close', 'Change'],
                rows: [
                    ['1Y', '4.31%', '4.33%', '-2 bp'],
                    ['2Y', '4.06%', '4.08%', '-2 bp'],
                    ['3Y', '3.92%', '3.94%', '-2 bp'],
                    ['5Y', '3.84%', '3.86%', '-2 bp'],
                    ['7Y', '3.89%', '3.91%', '-2 bp'],
                    ['10Y', '4.02%', '4.03%', '-1 bp']
                ]
            },
            {
                id: 'solver-log',
                title: 'Bootstrap solver log',
                eyebrow: 'Initial evidence',
                type: 'code',
                summary: 'More iterations are unlikely to repair a structurally mis-specified calibration instrument.',
                code: [
                    'node=3Y  converged  residual=0.04bp  iterations=7',
                    'node=5Y  bracket=[0.78, 1.04]',
                    'node=5Y  residual_left=+18.7bp',
                    'node=5Y  residual_right=+4.2bp',
                    'ERROR root not bracketed after 100 iterations',
                    'curve build aborted before node=7Y'
                ]
            },
            {
                id: 'schedule-diff',
                title: 'Five-year cashflow schedule diff',
                eyebrow: 'Unlocked evidence',
                type: 'table',
                summary: 'The deployed instrument uses the wrong fixed-leg frequency and day-count convention.',
                locked: true,
                columns: ['Property', 'Expected USD swap', 'Deployed instrument'],
                rows: [
                    ['Fixed-leg frequency', 'Semiannual', 'Annual'],
                    ['Fixed day count', '30/360', 'ACT/365F'],
                    ['Payment count', '10', '5'],
                    ['Business-day rule', 'Modified Following', 'Modified Following'],
                    ['Floating index', 'USD term 3M', 'USD term 3M']
                ]
            },
            {
                id: 'config-diff',
                title: 'Instrument configuration diff',
                eyebrow: 'Unlocked evidence',
                type: 'code',
                summary: 'A generic fallback replaced the USD swap convention during the refactor.',
                locked: true,
                code: [
                    '- convention: USD_TERM_SWAP',
                    '+ convention: GENERIC_TERM_SWAP',
                    '  floating_index: USD-TERM-3M',
                    '- fixed_frequency: 6M',
                    '+ fixed_frequency: 12M',
                    '- fixed_day_count: 30/360',
                    '+ fixed_day_count: ACT/365F'
                ]
            },
            {
                id: 'corrected-build',
                title: 'Controlled curve rebuild',
                eyebrow: 'Unlocked evidence',
                type: 'comparison',
                summary: 'Restoring only the expected convention produces a stable curve and reprices every calibration instrument.',
                locked: true,
                left: { label: 'Deployed config', value: '18.7 bp', note: 'Maximum residual' },
                right: { label: 'Corrected config', value: '0.06 bp', note: 'Maximum residual' },
                footer: 'Discount factors remain positive and forward-rate continuity checks pass.'
            }
        ],
        tests: [
            {
                id: 'schedule-test',
                title: 'Generate and compare cashflow schedules',
                category: 'Instrument setup',
                cost: 12,
                signal: 'decisive',
                description: 'Compare the deployed five-year calibration instrument against the approved USD convention.',
                resultTitle: 'Convention mismatch found',
                result: 'The deployed fixed leg pays annually on ACT/365F instead of semiannually on 30/360.',
                unlocks: ['schedule-diff']
            },
            {
                id: 'config-history',
                title: 'Inspect the configuration change',
                category: 'Release review',
                cost: 8,
                signal: 'supporting',
                description: 'Diff the instrument template before and after today’s refactor.',
                resultTitle: 'USD convention replaced by generic fallback',
                result: 'The refactor removed the explicit USD_TERM_SWAP mapping for this curve family.',
                unlocks: ['config-diff']
            },
            {
                id: 'corrected-rebuild',
                title: 'Rebuild with the approved convention',
                category: 'Calibration',
                cost: 14,
                signal: 'decisive',
                description: 'Restore the approved convention while keeping quotes and numerical settings unchanged.',
                resultTitle: 'Curve converges with a 0.06 bp max residual',
                result: 'All nodes calibrate, discount factors remain positive and the downstream pricing smoke test passes.',
                unlocks: ['corrected-build']
            },
            {
                id: 'raw-quotes',
                title: 'Validate the raw market quotes',
                category: 'Market data',
                cost: 8,
                signal: 'supporting',
                description: 'Compare vendor, cache and approved-source quotes.',
                resultTitle: 'Quotes are clean',
                result: 'Every tenor agrees across sources within 0.1 bp and no unit conversion anomaly is present.',
                unlocks: []
            },
            {
                id: 'more-iterations',
                title: 'Increase solver iterations tenfold',
                category: 'Numerics',
                cost: 10,
                signal: 'neutral',
                description: 'Raise the iteration cap without changing the instrument definition.',
                resultTitle: 'The root remains unbracketed',
                result: 'The residual keeps the same sign at both bracket endpoints. More iterations do not fix a missing root.',
                unlocks: []
            },
            {
                id: 'drop-node',
                title: 'Drop the five-year quote',
                category: 'Calibration',
                cost: 12,
                signal: 'harmful',
                description: 'Remove the failing calibration instrument and interpolate across the gap.',
                resultTitle: 'The build completes but loses calibration coverage',
                result: 'The curve turns green, but five-year swaps misprice by 16.9 bp. This masks the issue and is not an acceptable repair.',
                unlocks: []
            }
        ],
        diagnosis: {
            rootCauses: [
                { id: 'wrong-convention', label: 'The five-year calibration swap uses the wrong fixed-leg convention' },
                { id: 'bad-quote', label: 'The vendor supplied an erroneous five-year market quote' },
                { id: 'iteration-limit', label: 'The root solver needs a larger iteration limit' },
                { id: 'interpolation', label: 'The curve interpolation method is too rigid' }
            ],
            contributors: [
                { id: 'generic-fallback', label: 'A generic template silently replaced the USD convention' },
                { id: 'missing-regression', label: 'No golden-schedule regression test covered the refactor' },
                { id: 'quiet-market', label: 'The smooth quote ladder made a data error less likely' },
                { id: 'bad-bracket', label: 'The numerical root bracket was chosen randomly' }
            ],
            fixes: [
                { id: 'restore-convention', label: 'Restore the USD convention, rebuild and reprice the blocked portfolio' },
                { id: 'drop-instrument', label: 'Remove the five-year quote permanently' },
                { id: 'raise-iterations', label: 'Increase the iteration limit and accept the first result' },
                { id: 'manual-curve', label: 'Copy yesterday’s curve and adjust it by two basis points' }
            ],
            controls: [
                { id: 'golden-schedule', label: 'Golden cashflow-schedule tests for every calibration instrument family' },
                { id: 'schema-validation', label: 'Reject unknown or generic convention fallbacks in production config' },
                { id: 'curve-sanity', label: 'Automated repricing, discount-factor and forward-continuity checks' },
                { id: 'hide-errors', label: 'Suppress solver errors when the quote ladder appears smooth' }
            ]
        },
        answer: {
            rootCause: 'wrong-convention',
            contributors: ['generic-fallback', 'missing-regression'],
            fix: 'restore-convention',
            controls: ['golden-schedule', 'schema-validation', 'curve-sanity'],
            decisiveTests: ['schedule-test', 'corrected-rebuild'],
            supportingTests: ['config-history', 'raw-quotes'],
            explanation: 'The refactor replaced the approved USD swap definition with a generic template. That changed the fixed-leg schedule, so the five-year calibration equation had no root inside the valid discount-factor bracket. Restoring the convention calibrates without changing market quotes or numerical settings.',
            learning: [
                'A solver error can be a model-input or instrument-definition error rather than a numerical problem.',
                'Calibration instruments should be regression-tested as cashflow schedules, not only as configuration strings.',
                'Dropping a difficult node can conceal mispricing instead of repairing the curve.'
            ]
        },
        nextSteps: [
            {
                label: 'Explore Desk2Quant notes',
                title: 'Yield curves and numerical methods',
                href: 'index.html#products'
            },
            {
                label: 'Book an expert debrief',
                title: 'Discuss curve construction and validation',
                href: 'index.html#services'
            }
        ]
    },
    {
        id: 'mc-greeks',
        number: '03',
        title: 'Greeks in the Noise',
        shortTitle: 'Monte Carlo instability',
        desk: 'Exotics & Model Risk',
        discipline: 'Numerical validation',
        level: 'Advanced',
        duration: '15-20 min',
        accent: 'rose',
        teaser: 'A barrier option price is stable, but its vega changes sign across runs. Risk cannot hedge a number that will not repeat.',
        objective: 'Diagnose the estimator, design a stable Greek calculation, and define evidence that makes the result reviewable.',
        opening: {
            eyebrow: '14:18 Singapore · Intraday risk challenge',
            headline: 'The price converges. The vega does not.',
            body: 'A down-and-out call is valued with Monte Carlo. Nightly vega is computed using a central finite difference. Traders report sign flips even though the option price barely moves.',
            metrics: [
                { label: 'Price', value: '$4.82m', tone: 'neutral' },
                { label: 'Vega range', value: '-$95k to +$360k', tone: 'negative' },
                { label: 'Vol bump', value: '±0.01 pt', tone: 'neutral' }
            ]
        },
        brief: [
            { label: 'Your role', value: 'Model-validation quant reviewing exotic Greeks' },
            { label: 'Deadline', value: 'Before the next hedge run' },
            { label: 'Instrument', value: 'Down-and-out equity call' },
            { label: 'Investigation budget', value: '100 points' }
        ],
        messages: [
            {
                role: 'Exotics Trader',
                initials: 'ET',
                time: '14:18',
                text: 'The price is within a few basis points every night, but vega went from positive to negative and back again.'
            },
            {
                role: 'Model Validation',
                initials: 'MV',
                time: '14:21',
                text: 'Show uncertainty and convergence. A single plausible number is not enough evidence for approval.'
            },
            {
                role: 'Quant Developer',
                initials: 'QD',
                time: '14:24',
                text: 'The base and bumped jobs currently run as separate tasks. Each task creates its own random seed.'
            }
        ],
        artifacts: [
            {
                id: 'seed-runs',
                title: 'Nightly estimator history',
                eyebrow: 'Initial evidence',
                type: 'table',
                summary: 'Price variation is small, while the finite-difference Greek is dominated by run-to-run noise.',
                columns: ['Seed pair', 'Base price', 'Vega', '95% price CI'],
                rows: [
                    ['1041 / 7028', '$4.818m', '+$210k', '±$44k'],
                    ['5082 / 9914', '$4.833m', '-$95k', '±$45k'],
                    ['6610 / 1833', '$4.807m', '+$360k', '±$43k'],
                    ['2275 / 4401', '$4.826m', '+$41k', '±$44k']
                ]
            },
            {
                id: 'mc-config',
                title: 'Greek calculation configuration',
                eyebrow: 'Initial evidence',
                type: 'code',
                summary: 'The bump signal is smaller than the sampling uncertainty, and the paths are not paired.',
                code: [
                    'paths                = 250_000',
                    'volatility_bump      = 0.0001   # 0.01 vol point',
                    'finite_difference    = central',
                    'reuse_random_stream  = false',
                    'antithetic_variates  = true',
                    'barrier_monitoring   = daily',
                    'report_confidence_ci = false'
                ]
            },
            {
                id: 'paired-runs',
                title: 'Common-random-number comparison',
                eyebrow: 'Unlocked evidence',
                type: 'table',
                summary: 'Pairing base and bumped paths removes most of the variance in their difference.',
                locked: true,
                columns: ['Method', 'Mean vega', 'Std. error', 'Sign stability'],
                rows: [
                    ['Independent streams', '+$129k', '$171k', '58% positive'],
                    ['Common random numbers', '+$146k', '$19k', '100% positive'],
                    ['CRN + antithetic', '+$145k', '$14k', '100% positive']
                ]
            },
            {
                id: 'bump-sweep',
                title: 'Bump-size stability sweep',
                eyebrow: 'Unlocked evidence',
                type: 'bars',
                summary: 'The smallest bump is noise-dominated. A stable region appears between 0.10 and 0.25 vol points.',
                locked: true,
                bars: [
                    { label: '0.01 pt', value: 31, display: '$31k', tone: 'negative' },
                    { label: '0.05 pt', value: 118, display: '$118k', tone: 'warning' },
                    { label: '0.10 pt', value: 143, display: '$143k', tone: 'positive' },
                    { label: '0.25 pt', value: 147, display: '$147k', tone: 'positive' },
                    { label: '0.50 pt', value: 166, display: '$166k', tone: 'warning' }
                ]
            },
            {
                id: 'path-convergence',
                title: 'Path-count convergence',
                eyebrow: 'Unlocked evidence',
                type: 'table',
                summary: 'More paths help, but pairing the random streams is the larger improvement.',
                locked: true,
                columns: ['Paths', 'Independent std. error', 'CRN std. error'],
                rows: [
                    ['100k', '$268k', '$31k'],
                    ['250k', '$171k', '$19k'],
                    ['1m', '$84k', '$9k'],
                    ['4m', '$42k', '$5k']
                ]
            }
        ],
        tests: [
            {
                id: 'repeat-seeds',
                title: 'Repeat the estimator across seed pairs',
                category: 'Reproducibility',
                cost: 10,
                signal: 'supporting',
                description: 'Measure the distribution of vega estimates rather than inspecting one run.',
                resultTitle: 'Estimator variance overwhelms the signal',
                result: 'Across 40 independent seed pairs, the vega standard error is larger than its mean and the sign is unstable.',
                unlocks: []
            },
            {
                id: 'crn-run',
                title: 'Pair base and bumped random streams',
                category: 'Variance reduction',
                cost: 14,
                signal: 'decisive',
                description: 'Use identical random draws for the base and bumped valuations.',
                resultTitle: 'Common random numbers stabilize the difference',
                result: 'The vega standard error falls from $171k to $19k and all repeated estimates have the same sign.',
                unlocks: ['paired-runs']
            },
            {
                id: 'bump-test',
                title: 'Sweep the volatility bump size',
                category: 'Finite differences',
                cost: 12,
                signal: 'decisive',
                description: 'Test truncation error and sampling noise across several bump sizes.',
                resultTitle: 'The production bump is noise-dominated',
                result: 'A stable vega plateau appears around 0.10-0.25 vol points; the 0.01-point bump is too small for the current estimator.',
                unlocks: ['bump-sweep']
            },
            {
                id: 'path-test',
                title: 'Run a path-count convergence study',
                category: 'Numerics',
                cost: 10,
                signal: 'supporting',
                description: 'Compare confidence intervals at increasing path counts with and without paired paths.',
                resultTitle: 'Paths help; correlation helps more',
                result: 'Four million independent paths still have more error than 250k paths with common random numbers.',
                unlocks: ['path-convergence']
            },
            {
                id: 'recalibrate-surface',
                title: 'Recalibrate the volatility surface',
                category: 'Market data',
                cost: 10,
                signal: 'neutral',
                description: 'Re-run the market calibration without changing the Monte Carlo estimator.',
                resultTitle: 'The same sign instability remains',
                result: 'Price shifts by 0.3%, but repeated finite-difference vegas still change sign across seed pairs.',
                unlocks: []
            },
            {
                id: 'accept-average',
                title: 'Average the last four nightly vegas',
                category: 'Reporting',
                cost: 8,
                signal: 'harmful',
                description: 'Smooth the published number without changing or quantifying the estimator.',
                resultTitle: 'Smoothing hides uncertainty',
                result: 'The average looks plausible but has no stable confidence interval and can change materially with the next seed.',
                unlocks: []
            }
        ],
        diagnosis: {
            rootCauses: [
                { id: 'uncorrelated-estimator', label: 'Independent random streams and an undersized bump make the finite difference noise-dominated' },
                { id: 'bad-surface', label: 'The calibrated volatility surface is arbitrage-inconsistent' },
                { id: 'wrong-price', label: 'The option price has not converged' },
                { id: 'barrier-direction', label: 'A down-and-out call must always have negative vega' }
            ],
            contributors: [
                { id: 'crn-disabled', label: 'Base and bumped jobs do not reuse the same random stream' },
                { id: 'tiny-bump', label: 'The volatility bump is small relative to Monte Carlo uncertainty' },
                { id: 'no-ci', label: 'The production report omits Greek confidence intervals' },
                { id: 'daily-monitoring', label: 'Daily barrier monitoring automatically makes vega invalid' }
            ],
            fixes: [
                { id: 'pair-tune', label: 'Use common random numbers, select a stable bump region and report uncertainty' },
                { id: 'average', label: 'Publish a rolling average of recent nightly vegas' },
                { id: 'more-paths-only', label: 'Increase paths without changing seed pairing or bump size' },
                { id: 'force-sign', label: 'Floor the reported vega at zero' }
            ],
            controls: [
                { id: 'greek-ci', label: 'Report Greek confidence intervals or repeated-seed uncertainty' },
                { id: 'seed-regression', label: 'Regression tests across fixed seed sets' },
                { id: 'bump-stability', label: 'Periodic bump-size and path-count convergence checks' },
                { id: 'single-seed', label: 'Approve the model whenever one seed produces a plausible value' }
            ]
        },
        answer: {
            rootCause: 'uncorrelated-estimator',
            contributors: ['crn-disabled', 'tiny-bump', 'no-ci'],
            fix: 'pair-tune',
            controls: ['greek-ci', 'seed-regression', 'bump-stability'],
            decisiveTests: ['crn-run', 'bump-test'],
            supportingTests: ['repeat-seeds', 'path-test'],
            explanation: 'The production Greek subtracts two noisy valuations generated with independent paths, while the price change from a 0.01-point bump is smaller than sampling uncertainty. Common random numbers correlate the two valuations, and a bump sweep identifies a region where variance and truncation error are both controlled.',
            learning: [
                'Price convergence does not imply finite-difference Greek convergence.',
                'Variance of a difference depends critically on correlation between the two estimators.',
                'A model-risk result should include stability evidence, not only a point estimate.'
            ]
        },
        nextSteps: [
            {
                label: 'Read the companion article',
                title: 'Monte Carlo methods for option pricing',
                href: 'blog.html?slug=monte-carlo-methods-for-option-pricing-visual-guide-python'
            },
            {
                label: 'Explore Desk2Quant notes',
                title: 'Numerical methods and model validation',
                href: 'index.html#products'
            }
        ]
    },
    {
        id: 'fx-basis-forward',
        number: '04',
        title: 'The Forward That Ignored the Basis',
        shortTitle: 'FX forward mispricing',
        desk: 'FX & Cross-Currency',
        discipline: 'Pricing validation',
        level: 'Intermediate',
        duration: '15-18 min',
        accent: 'blue',
        teaser: 'The desk quoted a 6M USD/JPY forward 36 pips away from the interbank mid. Client dealing wants to know if the desk is mispricing, or if the market moved.',
        objective: 'Determine whether the quoted forward reflects a real market condition or a pricing-model gap, then propose a fix and a control.',
        opening: {
            eyebrow: '07:42 Tokyo · Client dealing escalation',
            headline: 'Client dealing says the desk\'s 6M USD/JPY forward is 36 pips away from every other bank\'s quote.',
            body: 'A corporate client flagged that Desk2Bank\'s 6-month USD/JPY forward is notably off-market versus three competitor quotes shown on the same dealing screen. The desk\'s forward pricer uses the USD and JPY deposit curves and textbook covered interest rate parity (CIP). Spot and both interest rate curves were refreshed this morning.',
            metrics: [
                { label: 'Desk quoted forward', value: '145.43', tone: 'neutral' },
                { label: 'Interbank mid (3 dealers)', value: '145.07', tone: 'positive' },
                { label: 'Gap', value: '36 pips', tone: 'negative' }
            ]
        },
        brief: [
            { label: 'Your role', value: 'Desk quant covering FX forwards & cross-currency' },
            { label: 'Deadline', value: '08:30 client dealing callback' },
            { label: 'Primary pair', value: 'USD/JPY 6M forward' },
            { label: 'Investigation budget', value: '100 points' }
        ],
        messages: [
            {
                role: 'Client Dealing',
                initials: 'CD',
                time: '07:42',
                text: 'Client is asking why our forward is 36 pips off three other dealers on the same screen. They want an answer before they trade elsewhere.'
            },
            {
                role: 'Rates Desk',
                initials: 'RT',
                time: '07:45',
                text: 'USD and JPY deposit curves were refreshed at 07:00 Tokyo. Both look like normal moves versus yesterday.'
            },
            {
                role: 'FX Trader',
                initials: 'FX',
                time: '07:48',
                text: 'Spot printed clean at 148.50. If CIP holds, the forward should be close to what we quoted. Either the model is wrong or the whole street is wrong — and it\'s never the whole street.'
            }
        ],
        artifacts: [
            {
                id: 'cip-worksheet',
                title: 'Textbook CIP worksheet',
                eyebrow: 'Initial evidence',
                type: 'keyValue',
                summary: 'The desk pricer\'s own textbook-CIP math is internally consistent with its quoted forward.',
                values: [
                    ['Spot USD/JPY', '148.50'],
                    ['USD 6M deposit rate', '4.85%'],
                    ['JPY 6M deposit rate', '0.62%'],
                    ['Textbook CIP forward', '145.43'],
                    ['Desk quoted forward', '145.43']
                ]
            },
            {
                id: 'rate-refresh-log',
                title: 'Curve refresh log',
                eyebrow: 'Initial evidence',
                type: 'code',
                summary: 'Both deposit curves refreshed on time with no missing tenors.',
                code: [
                    '07:00:04 INFO  loaded USD_DEPO curve, 14/14 tenors',
                    '07:00:06 INFO  loaded JPY_DEPO curve, 14/14 tenors',
                    '07:00:07 INFO  no stale-node warnings raised',
                    '07:00:09 INFO  forward pricer using CIP_NO_BASIS model v3'
                ]
            },
            {
                id: 'competitor-quotes',
                title: 'Competitor forward quotes',
                eyebrow: 'Unlocked evidence',
                type: 'table',
                summary: 'All three other dealers quote a materially bigger USD discount than the desk\'s textbook CIP number, and agree closely with each other.',
                locked: true,
                columns: ['Dealer', '6M forward', 'Points vs spot'],
                rows: [
                    ['Dealer A', '145.06', '-344 pips'],
                    ['Dealer B', '145.08', '-342 pips'],
                    ['Dealer C', '145.07', '-343 pips'],
                    ['Desk2Bank (us)', '145.43', '-307 pips']
                ]
            },
            {
                id: 'basis-swap-data',
                title: 'USD/JPY cross-currency basis swap data',
                eyebrow: 'Unlocked evidence',
                type: 'keyValue',
                summary: 'A live, actively-quoted 6M cross-currency basis exists and is not small.',
                locked: true,
                values: [
                    ['6M USD/JPY xccy basis (mid)', '-50 bps'],
                    ['Basis 1M ago', '-47 bps'],
                    ['Basis 1Y ago', '-43 bps'],
                    ['Desk pricer basis input', '0 bps (not modelled)']
                ]
            },
            {
                id: 'basis-reval',
                title: 'Controlled revaluation with basis',
                eyebrow: 'Unlocked evidence',
                type: 'comparison',
                summary: 'Adding the observed cross-currency basis to the discounting closes almost the entire gap.',
                locked: true,
                left: { label: 'Textbook CIP (no basis)', value: '145.43', note: '0 bps basis assumed' },
                right: { label: 'CIP + observed basis', value: '145.07', note: '-50 bps basis applied' },
                footer: 'This matches the interbank mid of 145.07 within normal quoting tolerance.'
            }
        ],
        tests: [
            {
                id: 'recompute-cip',
                title: 'Recompute textbook CIP by hand',
                category: 'Pricing',
                cost: 8,
                signal: 'supporting',
                description: 'Independently rebuild the forward from spot and both deposit rates.',
                resultTitle: 'Desk math matches its own model',
                result: 'Recomputing textbook CIP from the same spot and deposit rates reproduces 145.43 exactly. The desk pricer is not miscalculating its own formula.',
                unlocks: []
            },
            {
                id: 'pull-competitor-quotes',
                title: 'Pull live competitor forward quotes',
                category: 'Market data',
                cost: 10,
                signal: 'decisive',
                description: 'Compare the desk quote against three other dealers on the same pair and tenor.',
                resultTitle: 'The street agrees with itself, not with the desk',
                result: 'Three independent dealers quote within 2 pips of each other, all showing a materially bigger USD discount than the desk\'s textbook CIP forward.',
                unlocks: ['competitor-quotes']
            },
            {
                id: 'check-basis-market',
                title: 'Check the cross-currency basis swap market',
                category: 'Market data',
                cost: 12,
                signal: 'decisive',
                description: 'Look up whether a USD/JPY cross-currency basis is actively quoted and non-zero.',
                resultTitle: 'A -50 bps basis is live and has persisted for over a year',
                result: 'The cross-currency basis market shows a stable, actively-traded -50 bps 6M basis. The desk pricer does not read this input at all.',
                unlocks: ['basis-swap-data']
            },
            {
                id: 'basis-controlled-reval',
                title: 'Revalue the forward including the basis',
                category: 'Valuation',
                cost: 14,
                signal: 'decisive',
                description: 'Rerun the forward pricer with the observed basis added to the discounting.',
                resultTitle: 'Gap closes from 36 pips to about zero',
                result: 'Adding the -50 bps basis to the discount curve produces 145.07, matching the interbank mid within normal tolerance.',
                unlocks: ['basis-reval']
            },
            {
                id: 'reverify-spot',
                title: 'Reverify the spot print',
                category: 'Market data',
                cost: 6,
                signal: 'neutral',
                description: 'Check whether the 148.50 spot reference itself is stale or wrong.',
                resultTitle: 'Spot is clean',
                result: 'The 148.50 spot print matches two independent venues within 1 pip. Spot is not the issue.',
                unlocks: []
            },
            {
                id: 'daycount-check',
                title: 'Check day-count conventions',
                category: 'Pricing',
                cost: 7,
                signal: 'neutral',
                description: 'Test whether a day-count mismatch between the two deposit curves explains the gap.',
                resultTitle: 'Day-count treatment is correct',
                result: 'Both curves use their standard market conventions (ACT/360 USD, ACT/365 JPY) and the pricer applies them correctly. This is not the driver.',
                unlocks: []
            }
        ],
        diagnosis: {
            rootCauses: [
                { id: 'no-basis-modelled', label: 'The forward pricer ignores the live cross-currency basis and assumes textbook CIP holds exactly' },
                { id: 'stale-deposit-curve', label: 'One of the USD or JPY deposit curves is stale' },
                { id: 'spot-error', label: 'The reference spot rate used for the forward is wrong' },
                { id: 'daycount-mismatch', label: 'A day-count convention mismatch between the two curves is mispricing the forward' }
            ],
            contributors: [
                { id: 'model-v3-gap', label: 'The pricer\'s CIP_NO_BASIS model has no input field for cross-currency basis at all' },
                { id: 'no-basis-alert', label: 'No control flags forwards priced without a basis input on pairs with an active basis market' },
                { id: 'assumed-frictionless', label: 'The model assumes frictionless arbitrage between USD and JPY funding markets' },
                { id: 'usd-funding-scarcity', label: 'Dollar funding scarcity outside the US is a structural, persistent feature of this market, not a temporary glitch' }
            ],
            fixes: [
                { id: 'add-basis-input', label: 'Add a cross-currency basis input to the forward pricer and re-quote' },
                { id: 'match-competitors', label: 'Manually override today\'s quote to match competitor screens' },
                { id: 'widen-spread', label: 'Widen the bid-offer spread to absorb the discrepancy' },
                { id: 'blame-client-screen', label: 'Tell the client their competitor screen is showing stale prices' }
            ],
            controls: [
                { id: 'basis-required-field', label: 'Require a cross-currency basis input for every forward on a pair with an active basis market' },
                { id: 'competitor-benchmark', label: 'Automatically benchmark quotes against a live composite of dealer forwards' },
                { id: 'ignore-small-gaps', label: 'Treat any gap under 50 pips as immaterial and skip review' },
                { id: 'manual-review-large', label: 'Route quotes that deviate from the composite benchmark beyond a threshold to manual review' }
            ]
        },
        answer: {
            rootCause: 'no-basis-modelled',
            contributors: ['model-v3-gap', 'no-basis-alert', 'usd-funding-scarcity'],
            fix: 'add-basis-input',
            controls: ['basis-required-field', 'competitor-benchmark', 'manual-review-large'],
            decisiveTests: ['pull-competitor-quotes', 'check-basis-market', 'basis-controlled-reval'],
            supportingTests: ['recompute-cip'],
            explanation: 'Textbook covered interest rate parity assumes frictionless, unlimited arbitrage between USD and JPY funding markets. In reality a persistent cross-currency basis exists because dollar funding outside the US is structurally scarcer than the two deposit curves alone imply. The desk\'s pricer never modelled this basis, so it produced an internally consistent but factually wrong forward. Adding the observed -50 bps basis to the discounting closes the gap to within normal tolerance.',
            learning: [
                'CIP has not held exactly since the 2008 crisis — a persistent cross-currency basis is a real, tradable market feature, not noise.',
                'A model can be internally consistent with its own formula and still be wrong if the formula omits a real market friction.',
                'Benchmarking against live competitor quotes catches model-scope gaps that recomputation of your own formula cannot.'
            ]
        },
        nextSteps: [
            {
                label: 'Explore Desk2Quant notes',
                title: 'FX Models: Quant Interview Playbook',
                href: 'product.html?id=cf217e64-e64f-49c7-9f0d-a8d1478ef7b5'
            },
            {
                label: 'Explore Desk2Quant notes',
                title: 'Derivatives pricing across asset classes',
                href: 'index.html#products'
            }
        ]
    }
]);

export function getScenarioById(id) {
    return scenarios.find((scenario) => scenario.id === id) || scenarios[0];
}
