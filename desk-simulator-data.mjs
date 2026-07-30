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
    },
    {
        id: 'cva-recovery-rate',
        number: '05',
        title: 'The CVA That Doubled Overnight',
        shortTitle: 'Counterparty CVA spike',
        desk: 'Credit & XVA',
        discipline: 'Counterparty risk',
        level: 'Advanced',
        duration: '18-22 min',
        accent: 'teal',
        teaser: 'CVA on a single dealer counterparty jumped from $2.1m to $4.3m overnight with no new trades. Credit committee meets at 09:00.',
        objective: 'Determine whether the CVA jump reflects genuine credit deterioration or a modelling error, then propose a fix and a control.',
        opening: {
            eyebrow: '07:15 New York · Credit valuation adjustment control',
            headline: 'CVA on the Meridian Bank netting set jumped from $2.1m to $4.3m overnight with no new trades.',
            body: 'The netting set includes 40 interest rate swaps against Meridian Bank. No trades were booked or unwound. Both the exposure profile and credit curve inputs refresh nightly.',
            metrics: [
                { label: 'Yesterday\'s CVA', value: '$2.10m', tone: 'neutral' },
                { label: 'Today\'s CVA', value: '$4.30m', tone: 'negative' },
                { label: 'Change', value: '+105%', tone: 'negative' }
            ]
        },
        brief: [
            { label: 'Your role', value: 'Credit/XVA quant covering counterparty risk' },
            { label: 'Deadline', value: '09:00 credit committee' },
            { label: 'Primary book', value: 'Meridian Bank netting set (40 IRS)' },
            { label: 'Investigation budget', value: '100 points' }
        ],
        messages: [
            {
                role: 'Credit Officer',
                initials: 'CO',
                time: '07:15',
                text: 'Meridian\'s CDS spread did not move overnight. If this is real credit deterioration, why is the market not pricing it?'
            },
            {
                role: 'XVA Desk',
                initials: 'XD',
                time: '07:19',
                text: 'The exposure profile looks essentially the same as yesterday, and the trade population has not changed.'
            },
            {
                role: 'Model Validation',
                initials: 'MV',
                time: '07:24',
                text: 'An unrelated release last night touched recovery-rate defaults across the credit engine. Worth checking before we call this real.'
            }
        ],
        artifacts: [
            {
                id: 'cva-inputs',
                title: 'CVA input comparison',
                eyebrow: 'Initial evidence',
                type: 'table',
                summary: 'Credit spread is unchanged; the recovery-rate assumption differs.',
                columns: ['Input', 'Yesterday', 'Today', 'Change'],
                rows: [
                    ['Meridian 5Y CDS spread', '140 bps', '140 bps', 'Unchanged'],
                    ['Recovery rate', '40%', '20%', '-20 pts'],
                    ['EPE profile (avg)', '$18.2m', '$18.4m', '+1%'],
                    ['Netting set trade count', '40', '40', 'Unchanged']
                ]
            },
            {
                id: 'exposure-profile',
                title: 'Expected positive exposure (EPE) profile',
                eyebrow: 'Initial evidence',
                type: 'keyValue',
                summary: 'The exposure profile is materially unchanged from yesterday.',
                values: [
                    ['Peak EPE', '$31.6m'],
                    ['EPE at 1Y', '$18.9m'],
                    ['EPE at 5Y', '$22.4m'],
                    ['Simulation paths', '50,000'],
                    ['Netting agreement', 'ISDA CSA, Meridian Bank']
                ]
            },
            {
                id: 'recovery-release-log',
                title: 'Credit engine release log',
                eyebrow: 'Unlocked evidence',
                type: 'code',
                summary: 'Last night\'s release changed a default recovery-rate assumption used when no issuer-specific value is configured.',
                locked: true,
                code: [
                    '23:41 INFO  deploying credit-engine v4.7.0',
                    '23:41 INFO  changelog: default LGD assumption updated 60% -> 80%',
                    '23:41 WARN  issuer overrides not re-validated post-deploy',
                    '23:42 INFO  Meridian Bank: no issuer-specific recovery override found',
                    '23:42 INFO  falling back to engine default recovery = 1 - LGD = 20%',
                    '23:42 INFO  credit-engine v4.7.0 live'
                ]
            },
            {
                id: 'cva-reval',
                title: 'Controlled CVA revaluation',
                eyebrow: 'Unlocked evidence',
                type: 'comparison',
                summary: 'Restoring the correct 40% recovery rate closes almost the entire gap.',
                locked: true,
                left: { label: 'Today (20% recovery)', value: '$4.30m', note: 'Engine default, no override' },
                right: { label: 'Restored (40% recovery)', value: '$2.15m', note: 'Meridian issuer-specific rate' },
                footer: 'Remaining $50k reflects the 1% genuine EPE increase.'
            },
            {
                id: 'peer-recovery-check',
                title: 'Peer counterparty recovery audit',
                eyebrow: 'Unlocked evidence',
                type: 'table',
                summary: 'Other counterparties without issuer-specific overrides show the same silent fallback.',
                locked: true,
                columns: ['Counterparty', 'Has override?', 'Recovery used today'],
                rows: [
                    ['Meridian Bank', 'No (lost on deploy)', '20% (wrong)'],
                    ['Alderney Capital', 'Yes', '45% (correct)'],
                    ['Northfield Trust', 'No (never configured)', '20% (was already 20%)'],
                    ['Comerica Partners', 'No (lost on deploy)', '20% (wrong)']
                ]
            }
        ],
        tests: [
            {
                id: 'compare-cva-inputs',
                title: 'Compare CVA inputs day-over-day',
                category: 'Credit risk',
                cost: 10,
                signal: 'decisive',
                description: 'Diff every input to the CVA calculation, not just the credit spread.',
                resultTitle: 'Recovery rate changed; spread did not',
                result: 'Meridian\'s CDS spread is unchanged at 140bps, but the recovery-rate assumption fell from 40% to 20% between runs.',
                unlocks: ['cva-inputs']
            },
            {
                id: 'check-release-log',
                title: 'Check the credit engine release log',
                category: 'Operations',
                cost: 9,
                signal: 'decisive',
                description: 'Review last night\'s deployment for changes to credit assumptions.',
                resultTitle: 'A default LGD change silently dropped issuer overrides',
                result: 'The release changed the engine-wide default recovery rate and did not re-validate that issuer-specific overrides, like Meridian\'s 40%, still applied.',
                unlocks: ['recovery-release-log']
            },
            {
                id: 'run-cva-reval',
                title: 'Revalue CVA with the correct recovery rate',
                category: 'Valuation',
                cost: 14,
                signal: 'decisive',
                description: 'Restore Meridian\'s 40% recovery override and rerun CVA in isolation.',
                resultTitle: 'CVA falls back to $2.15m',
                result: 'Restoring only the recovery rate closes the gap to within normal tolerance, isolating it as the cause.',
                unlocks: ['cva-reval']
            },
            {
                id: 'audit-peer-counterparties',
                title: 'Audit recovery rates across other counterparties',
                category: 'Credit risk',
                cost: 10,
                signal: 'supporting',
                description: 'Check whether other counterparties lost their recovery overrides in the same release.',
                resultTitle: 'The fallback affected multiple counterparties',
                result: 'Two other counterparties with configured overrides silently reverted to the 20% engine default overnight.',
                unlocks: ['peer-recovery-check']
            },
            {
                id: 'check-exposure-model',
                title: 'Re-run the exposure simulation',
                category: 'Model risk',
                cost: 11,
                signal: 'neutral',
                description: 'Test whether the Monte Carlo exposure simulation itself introduced the jump.',
                resultTitle: 'Exposure profile is essentially unchanged',
                result: 'Peak and average EPE moved by about 1%, well within normal day-to-day simulation noise.',
                unlocks: []
            },
            {
                id: 'reprice-swaps',
                title: 'Reprice the underlying swaps',
                category: 'Pricing',
                cost: 8,
                signal: 'neutral',
                description: 'Check whether a rates-curve change affected the swap valuations feeding the exposure.',
                resultTitle: 'Swap valuations reconcile',
                result: 'All 40 swap mark-to-markets match yesterday within normal daily rate movement.',
                unlocks: []
            },
            {
                id: 'escalate-as-credit-event',
                title: 'Escalate as a genuine credit deterioration',
                category: 'Reporting',
                cost: 6,
                signal: 'harmful',
                description: 'Report the CVA jump to credit committee as real without checking the calculation inputs.',
                resultTitle: 'Premature escalation risk',
                result: 'Meridian\'s CDS spread never moved. Escalating this as a genuine credit event would misinform the committee before the input error is even checked.',
                unlocks: []
            }
        ],
        diagnosis: {
            rootCauses: [
                { id: 'recovery-fallback', label: 'A credit-engine release silently reverted Meridian\'s recovery rate to an engine-wide default' },
                { id: 'real-deterioration', label: 'Meridian Bank\'s genuine credit quality deteriorated overnight' },
                { id: 'exposure-bug', label: 'The Monte Carlo exposure simulation produced an incorrect profile' },
                { id: 'spread-repricing', label: 'The CDS spread was repriced using a stale curve' }
            ],
            contributors: [
                { id: 'override-not-revalidated', label: 'Issuer-specific overrides were not re-validated after the release' },
                { id: 'silent-fallback', label: 'The engine silently fell back to a default instead of failing loudly' },
                { id: 'multiple-counterparties', label: 'Other counterparties were also silently affected' },
                { id: 'high-lgd-sensitivity', label: 'CVA is highly sensitive to the loss-given-default assumption' }
            ],
            fixes: [
                { id: 'restore-override-rerun', label: 'Restore the correct recovery override, republish, and rerun CVA for all affected counterparties' },
                { id: 'accept-new-cva', label: 'Accept $4.3m as the new CVA and hedge accordingly' },
                { id: 'average-two-values', label: 'Report the average of yesterday\'s and today\'s CVA' },
                { id: 'manual-override-single', label: 'Manually override only Meridian\'s CVA number without checking other counterparties' }
            ],
            controls: [
                { id: 'override-regression-test', label: 'Regression-test that issuer-specific overrides survive engine releases' },
                { id: 'fail-closed-missing-override', label: 'Fail loudly, not silently, when an expected override is missing' },
                { id: 'cross-check-market-spread', label: 'Cross-check large CVA moves against observed CDS/bond spread moves' },
                { id: 'allow-silent-defaults', label: 'Allow engine defaults to apply silently for operational simplicity' }
            ]
        },
        answer: {
            rootCause: 'recovery-fallback',
            contributors: ['override-not-revalidated', 'silent-fallback', 'multiple-counterparties'],
            fix: 'restore-override-rerun',
            controls: ['override-regression-test', 'fail-closed-missing-override', 'cross-check-market-spread'],
            decisiveTests: ['compare-cva-inputs', 'check-release-log', 'run-cva-reval'],
            supportingTests: ['audit-peer-counterparties'],
            explanation: 'A credit-engine release changed the engine-wide default recovery rate and did not re-validate that issuer-specific overrides still applied. Meridian Bank\'s 40% override was lost, so its CVA was computed with the 20% default, roughly doubling the loss-given-default and the CVA. Restoring the override and rerunning closes the gap, and the same fallback silently affected other counterparties too.',
            learning: [
                'A large CVA move should first be checked against the market-observed CDS spread before being treated as genuine credit news.',
                'Engine-wide default assumptions can silently override issuer-specific configuration during a release.',
                'CVA is highly sensitive to the recovery-rate/LGD assumption, not just the credit spread.'
            ]
        },
        nextSteps: [
            {
                label: 'Explore Desk2Quant notes',
                title: 'XVA Calculus Lab: Master Counterparty Credit Risk',
                href: 'product.html?id=351aa09b-681b-4da9-9b61-844cf295640c'
            },
            {
                label: 'Explore Desk2Quant notes',
                title: 'Credit Models: Quant Interview Playbook',
                href: 'product.html?id=43e3695f-7fd5-4ca3-89f0-271f3e27e8ea'
            }
        ]
    },
    {
        id: 'equity-dividend-gap',
        number: '06',
        title: 'The Autocall That Priced Itself Wrong',
        shortTitle: 'Equity dividend mispricing',
        desk: 'Equity Derivatives',
        discipline: 'Pricing validation',
        level: 'Intermediate',
        duration: '15-18 min',
        accent: 'amber',
        teaser: 'A single-stock autocallable is quoting 60bps rich versus two competitor banks. The client wants to trade in an hour.',
        objective: 'Determine whether the desk\'s autocall pricer has a genuine model edge or a dividend-input error, then propose a fix and a control.',
        opening: {
            eyebrow: '09:20 London · Structured note pricing review',
            headline: 'The desk\'s 2Y autocallable note on Solvane Corp is quoting 60bps rich to two competitor structuring desks.',
            body: 'Sales wants to trade with a client in the next hour. The note\'s value is highly sensitive to the assumed forward price of Solvane Corp, which is driven by the borrow cost and projected dividends over the note\'s life.',
            metrics: [
                { label: 'Desk quoted coupon', value: '9.40% p.a.', tone: 'positive' },
                { label: 'Competitor average', value: '8.80% p.a.', tone: 'neutral' },
                { label: 'Gap', value: '+60 bps', tone: 'negative' }
            ]
        },
        brief: [
            { label: 'Your role', value: 'Equity derivatives quant supporting structuring' },
            { label: 'Deadline', value: '10:20 client indication' },
            { label: 'Instrument', value: '2Y Solvane Corp autocallable note' },
            { label: 'Investigation budget', value: '100 points' }
        ],
        messages: [
            {
                role: 'Structurer',
                initials: 'ST',
                time: '09:20',
                text: 'Our coupon looks too good. Either we have a genuine pricing edge or we are missing something in the forward.'
            },
            {
                role: 'Sales',
                initials: 'SA',
                time: '09:24',
                text: 'Client is comparing all three quotes side by side. We need a defendable answer before we confirm anything.'
            },
            {
                role: 'Stock Loan Desk',
                initials: 'SL',
                time: '09:28',
                text: 'Solvane\'s borrow has been getting more expensive all quarter as short interest builds.'
            }
        ],
        artifacts: [
            {
                id: 'forward-inputs',
                title: 'Forward price input comparison',
                eyebrow: 'Initial evidence',
                type: 'table',
                summary: 'The desk\'s dividend assumption is noticeably lower than the market-implied dividend.',
                columns: ['Input', 'Desk pricer', 'Market-implied', 'Difference'],
                rows: [
                    ['Annual dividend yield', '1.8%', '2.6%', '-0.8 pts'],
                    ['Borrow cost', '0.90%', '1.65%', '-0.75 pts'],
                    ['Spot', '$84.20', '$84.20', 'Matches'],
                    ['Risk-free rate (2Y)', '4.10%', '4.10%', 'Matches']
                ]
            },
            {
                id: 'dividend-schedule',
                title: 'Solvane Corp dividend schedule',
                eyebrow: 'Initial evidence',
                type: 'keyValue',
                summary: 'The company raised its dividend twice in the past year, faster than the desk\'s static assumption reflects.',
                values: [
                    ['Last declared dividend', '$0.52/quarter'],
                    ['Dividend one year ago', '$0.38/quarter'],
                    ['Announced growth policy', '8-10% annually'],
                    ['Desk pricer assumption', 'Flat $0.38/quarter for 2Y']
                ]
            },
            {
                id: 'borrow-cost-history',
                title: 'Stock loan borrow-cost history',
                eyebrow: 'Unlocked evidence',
                type: 'bars',
                summary: 'Borrow cost has risen steadily through the quarter as short interest built.',
                locked: true,
                bars: [
                    { label: '3mo ago', value: 90, display: '0.90%', tone: 'positive' },
                    { label: '2mo ago', value: 118, display: '1.18%', tone: 'warning' },
                    { label: '1mo ago', value: 142, display: '1.42%', tone: 'warning' },
                    { label: 'Today', value: 165, display: '1.65%', tone: 'negative' }
                ]
            },
            {
                id: 'corrected-forward-reval',
                title: 'Controlled note revaluation',
                eyebrow: 'Unlocked evidence',
                type: 'comparison',
                summary: 'Correcting the dividend and borrow inputs brings the coupon in line with competitors.',
                locked: true,
                left: { label: 'Desk pricer', value: '9.40% p.a.', note: 'Stale dividend + borrow' },
                right: { label: 'Corrected inputs', value: '8.75% p.a.', note: 'Market-implied dividend + borrow' },
                footer: 'Remaining 5bps difference reflects normal desk-to-desk model spread.'
            },
            {
                id: 'pricer-config-diff',
                title: 'Pricer configuration change history',
                eyebrow: 'Unlocked evidence',
                type: 'code',
                summary: 'The dividend feed was not reconnected after a data-vendor migration three months ago.',
                locked: true,
                code: [
                    '3mo ago  INFO  migrating dividend feed: VendorA -> VendorB',
                    '3mo ago  WARN  Solvane Corp not found in VendorB mapping table',
                    '3mo ago  INFO  falling back to last cached VendorA dividend',
                    '3mo ago  WARN  fallback cache has no expiry configured',
                    'today    INFO  autocall pricer still using 3-month-old cached dividend'
                ]
            }
        ],
        tests: [
            {
                id: 'compare-forward-inputs',
                title: 'Compare forward-price inputs to market',
                category: 'Market data',
                cost: 10,
                signal: 'decisive',
                description: 'Diff the desk\'s dividend and borrow assumptions against observable market levels.',
                resultTitle: 'Both dividend and borrow assumptions are stale',
                result: 'The desk pricer uses a 1.8% dividend yield and 0.90% borrow, versus market-implied levels of 2.6% and 1.65%.',
                unlocks: ['forward-inputs']
            },
            {
                id: 'check-dividend-schedule',
                title: 'Check the actual dividend schedule',
                category: 'Fundamentals',
                cost: 8,
                signal: 'decisive',
                description: 'Review Solvane Corp\'s declared dividends and growth policy directly.',
                resultTitle: 'Dividends have grown faster than the pricer assumes',
                result: 'Solvane raised its dividend twice in the past year under an 8-10% growth policy; the pricer holds it flat at last year\'s rate.',
                unlocks: ['dividend-schedule']
            },
            {
                id: 'check-borrow-history',
                title: 'Check the stock loan borrow-cost trend',
                category: 'Stock loan',
                cost: 7,
                signal: 'supporting',
                description: 'Review how Solvane\'s borrow cost has moved as short interest built.',
                resultTitle: 'Borrow cost nearly doubled over the quarter',
                result: 'Borrow rose from 0.90% to 1.65% over three months. The desk pricer never updated from its original level.',
                unlocks: ['borrow-cost-history']
            },
            {
                id: 'run-corrected-reval',
                title: 'Revalue the note with corrected inputs',
                category: 'Valuation',
                cost: 14,
                signal: 'decisive',
                description: 'Replace only the dividend and borrow assumptions and rerun the note pricer.',
                resultTitle: 'Coupon falls to 8.75%, in line with competitors',
                result: 'Correcting both inputs closes almost the entire 60bps gap, isolating them as the cause.',
                unlocks: ['corrected-forward-reval']
            },
            {
                id: 'inspect-pricer-config',
                title: 'Inspect the dividend feed configuration',
                category: 'Operations',
                cost: 6,
                signal: 'supporting',
                description: 'Check how the pricer sources its dividend assumption and when it last updated.',
                resultTitle: 'A vendor migration left a stale cached dividend',
                result: 'A three-month-old data-vendor migration left Solvane Corp unmapped, so the pricer has been using a stale cached dividend with no expiry.',
                unlocks: ['pricer-config-diff']
            },
            {
                id: 'check-rates-curve',
                title: 'Recheck the discounting curve',
                category: 'Rates',
                cost: 7,
                signal: 'neutral',
                description: 'Test whether the 2Y risk-free rate used in discounting is stale.',
                resultTitle: 'Discounting curve is current',
                result: 'The 2Y risk-free rate matches the market close exactly. This is not contributing to the gap.',
                unlocks: []
            },
            {
                id: 'quote-as-is',
                title: 'Confirm the client indication as quoted',
                category: 'Sales',
                cost: 5,
                signal: 'harmful',
                description: 'Send the 9.40% indication to the client without checking the pricing inputs.',
                resultTitle: 'Confirming an unverified rich quote',
                result: 'Sending 9.40% without checking dividend and borrow inputs risks confirming a price the desk cannot actually honor once inputs are corrected.',
                unlocks: []
            }
        ],
        diagnosis: {
            rootCauses: [
                { id: 'stale-dividend-borrow', label: 'The pricer used a stale, uncorrected dividend and borrow-cost assumption from a vendor migration' },
                { id: 'genuine-model-edge', label: 'The desk has a genuine proprietary pricing edge over competitors' },
                { id: 'rates-curve-error', label: 'The 2Y discounting curve is mismarked' },
                { id: 'autocall-barrier-bug', label: 'The autocall barrier monitoring logic is incorrect' }
            ],
            contributors: [
                { id: 'vendor-migration-gap', label: 'A data-vendor migration left the stock unmapped and defaulted to a stale cache' },
                { id: 'no-cache-expiry', label: 'The cached dividend fallback had no expiry or staleness check' },
                { id: 'rising-borrow', label: 'Borrow cost rose materially as short interest built, compounding the gap' },
                { id: 'dividend-growth-policy', label: 'The company\'s dividend grew faster than the pricer\'s static assumption' }
            ],
            fixes: [
                { id: 'reconnect-feed-reprice', label: 'Reconnect the dividend feed, refresh borrow cost, and reprice before quoting the client' },
                { id: 'quote-as-is-note', label: 'Quote the client at 9.40% since sales is under time pressure' },
                { id: 'split-the-difference', label: 'Average the desk and competitor coupons and quote that' },
                { id: 'widen-spread-only', label: 'Add a wider bid-offer spread without correcting the inputs' }
            ],
            controls: [
                { id: 'staleness-check-market-data', label: 'Add staleness/expiry checks on cached market-data fallbacks' },
                { id: 'vendor-migration-mapping-audit', label: 'Audit instrument mapping completeness after any data-vendor migration' },
                { id: 'competitor-benchmark-check', label: 'Benchmark structured note quotes against competitor levels before client indication' },
                { id: 'allow-indefinite-cache', label: 'Allow market-data caches to persist indefinitely once populated' }
            ]
        },
        answer: {
            rootCause: 'stale-dividend-borrow',
            contributors: ['vendor-migration-gap', 'no-cache-expiry', 'rising-borrow'],
            fix: 'reconnect-feed-reprice',
            controls: ['staleness-check-market-data', 'vendor-migration-mapping-audit', 'competitor-benchmark-check'],
            decisiveTests: ['compare-forward-inputs', 'check-dividend-schedule', 'run-corrected-reval'],
            supportingTests: ['check-borrow-history', 'inspect-pricer-config'],
            explanation: 'A data-vendor migration three months ago left Solvane Corp unmapped, so the autocall pricer silently fell back to a stale cached dividend with no expiry check. Meanwhile the stock\'s borrow cost nearly doubled as short interest built. Both a lower assumed dividend and a lower assumed borrow cost push the forward price up, inflating the note\'s coupon. Correcting both inputs brings the desk\'s quote in line with competitors.',
            learning: [
                'An autocallable note\'s value is highly sensitive to the assumed forward price, which depends on both dividends and borrow cost, not spot alone.',
                'A quote that looks too good relative to competitors is a market-data or model-scope signal, not proof of a pricing edge, until checked.',
                'Cached market-data fallbacks without an expiry check can silently go stale for months.'
            ]
        },
        nextSteps: [
            {
                label: 'Explore Desk2Quant notes',
                title: 'Equity Models: Quant Interview Playbook',
                href: 'product.html?id=f3c4d9a4-0202-4bfe-857a-00e9392b2c68'
            },
            {
                label: 'Explore Desk2Quant notes',
                title: 'Derivatives pricing across asset classes',
                href: 'index.html#products'
            }
        ]
    },
    {
        id: 'var-backtest-breach',
        number: '07',
        title: 'The VaR Model That Kept Passing',
        shortTitle: 'VaR backtest failure',
        desk: 'Model Validation',
        discipline: 'Model risk',
        level: 'Advanced',
        duration: '18-22 min',
        accent: 'rose',
        teaser: 'The 99% VaR model has breached its loss limit 6 times in 250 days — regulators expect at most 2-3. Model Validation must decide: red zone or bad luck?',
        objective: 'Determine whether the VaR model is genuinely miscalibrated or the breaches reflect a temporary regime, then propose a fix and a control.',
        opening: {
            eyebrow: '10:00 New York · Annual VaR backtesting review',
            headline: 'The trading book\'s 99% 1-day VaR model has been breached 6 times in the past 250 trading days.',
            body: 'Basel backtesting classifies 0-4 breaches per 250 days as the green zone, 5-9 as yellow, and 10+ as red. Six breaches puts the desk in the yellow zone, and regulators want a root-cause explanation, not just a restatement of the count.',
            metrics: [
                { label: 'Expected breaches (99% VaR)', value: '2-3', tone: 'neutral' },
                { label: 'Actual breaches', value: '6', tone: 'negative' },
                { label: 'Zone', value: 'Yellow', tone: 'negative' }
            ]
        },
        brief: [
            { label: 'Your role', value: 'Model validation quant reviewing VaR backtesting' },
            { label: 'Deadline', value: 'Regulatory submission in 3 days' },
            { label: 'Model scope', value: 'Desk-wide 99% 1-day historical VaR' },
            { label: 'Investigation budget', value: '100 points' }
        ],
        messages: [
            {
                role: 'Head of Desk',
                initials: 'HD',
                time: '10:00',
                text: 'Markets were unusually volatile this year. Six breaches out of 250 days does not feel abnormal to me.'
            },
            {
                role: 'Regulator Liaison',
                initials: 'RL',
                time: '10:04',
                text: 'We need to know if the breaches cluster in time, and whether they are explained by the volatility regime or by the model itself.'
            },
            {
                role: 'Quant Developer',
                initials: 'QD',
                time: '10:08',
                text: 'The historical VaR window is 2 years of daily returns, equally weighted.'
            }
        ],
        artifacts: [
            {
                id: 'breach-timeline',
                title: 'Breach timeline',
                eyebrow: 'Initial evidence',
                type: 'table',
                summary: 'Breaches cluster tightly in a six-week window rather than spreading across the year.',
                columns: ['Breach #', 'Date', 'Loss vs VaR'],
                rows: [
                    ['1', 'Week 14', '1.05x VaR'],
                    ['2', 'Week 15', '1.20x VaR'],
                    ['3', 'Week 16', '1.60x VaR'],
                    ['4', 'Week 17', '1.35x VaR'],
                    ['5', 'Week 18', '1.15x VaR'],
                    ['6', 'Week 19', '1.90x VaR']
                ]
            },
            {
                id: 'window-composition',
                title: 'Historical VaR lookback window',
                eyebrow: 'Initial evidence',
                type: 'keyValue',
                summary: 'The 2-year equally-weighted window is still dominated by a calm period that ended over a year ago.',
                values: [
                    ['Lookback length', '2 years, equal weight'],
                    ['Calmest quarter in window', '18 months ago'],
                    ['Realized vol, calm quarter', '9% annualized'],
                    ['Realized vol, last 3 months', '27% annualized']
                ]
            },
            {
                id: 'weighted-var-comparison',
                title: 'Equal-weighted vs. volatility-weighted VaR',
                eyebrow: 'Unlocked evidence',
                type: 'comparison',
                summary: 'Weighting recent, more volatile history more heavily produces a materially higher VaR.',
                locked: true,
                left: { label: 'Equal-weighted (current)', value: '$4.10m', note: '99% 1-day VaR' },
                right: { label: 'Volatility-weighted', value: '$6.35m', note: 'Same window, recency-weighted' },
                footer: 'The volatility-weighted model would have caught 5 of the 6 breaches.'
            },
            {
                id: 'breach-clustering-test',
                title: 'Breach clustering statistical test',
                eyebrow: 'Unlocked evidence',
                type: 'table',
                summary: 'A Christoffersen independence test rejects the hypothesis that breaches are independent.',
                locked: true,
                columns: ['Test', 'Statistic', 'Conclusion'],
                rows: [
                    ['Kupiec unconditional coverage', 'p = 0.04', 'Marginally rejects correct coverage'],
                    ['Christoffersen independence', 'p < 0.01', 'Strongly rejects independence'],
                    ['Christoffersen conditional coverage', 'p < 0.01', 'Strongly rejects joint hypothesis']
                ]
            },
            {
                id: 'regime-return-series',
                title: 'Return series around the breach window',
                eyebrow: 'Unlocked evidence',
                type: 'bars',
                summary: 'Realized volatility rose sharply just before the breach cluster and stayed elevated.',
                locked: true,
                bars: [
                    { label: 'Q1 (weeks 1-13)', value: 11, display: '11%', tone: 'positive' },
                    { label: 'Q2 (weeks 14-19)', value: 27, display: '27%', tone: 'negative' },
                    { label: 'Q3 (weeks 20-32)', value: 24, display: '24%', tone: 'warning' },
                    { label: 'Q4 (weeks 33-50)', value: 19, display: '19%', tone: 'warning' }
                ]
            }
        ],
        tests: [
            {
                id: 'plot-breach-timeline',
                title: 'Plot the breach timeline',
                category: 'Backtesting',
                cost: 9,
                signal: 'decisive',
                description: 'Check whether breaches are spread evenly across the year or cluster in time.',
                resultTitle: 'Breaches cluster in a six-week window',
                result: 'All 6 breaches occur in weeks 14-19, not spread across the 250-day period. This points away from pure bad luck.',
                unlocks: ['breach-timeline']
            },
            {
                id: 'run-independence-test',
                title: 'Run a Christoffersen independence test',
                category: 'Statistics',
                cost: 13,
                signal: 'decisive',
                description: 'Formally test whether the breach clustering is statistically significant.',
                resultTitle: 'Breaches are not independent',
                result: 'The Christoffersen test strongly rejects independence (p < 0.01), confirming the clustering is a real model-fit issue, not noise.',
                unlocks: ['breach-clustering-test']
            },
            {
                id: 'check-window-composition',
                title: 'Inspect the VaR lookback window composition',
                category: 'Model risk',
                cost: 8,
                signal: 'decisive',
                description: 'Check how much of the 2-year equal-weighted window still reflects an old, calmer regime.',
                resultTitle: 'The window is anchored to a stale calm period',
                result: 'The equally-weighted window still gives full weight to an 18-month-old quarter with 9% annualized vol, diluting the recent 27% vol regime.',
                unlocks: ['window-composition']
            },
            {
                id: 'run-weighted-var',
                title: 'Recompute VaR with volatility weighting',
                category: 'Model risk',
                cost: 10,
                signal: 'decisive',
                description: 'Rerun the historical VaR using a recency/volatility-weighted scheme instead of equal weighting.',
                resultTitle: 'Volatility-weighted VaR would have caught most breaches',
                result: 'A volatility-weighted VaR of $6.35m would have flagged 5 of the 6 realized losses, versus $4.10m from the equal-weighted model.',
                unlocks: ['weighted-var-comparison']
            },
            {
                id: 'check-realized-vol-regime',
                title: 'Check the realized volatility regime',
                category: 'Market data',
                cost: 4,
                signal: 'supporting',
                description: 'Compare realized volatility before, during and after the breach cluster.',
                resultTitle: 'A genuine volatility regime shift occurred',
                result: 'Realized volatility jumped from 11% to 27% annualized right before the breach cluster and stayed elevated afterward.',
                unlocks: ['regime-return-series']
            },
            {
                id: 'check-pnl-explain',
                title: 'Reconcile P&L explain for the breach days',
                category: 'P&L control',
                cost: 7,
                signal: 'neutral',
                description: 'Check whether unexplained P&L, rather than model calibration, drove the breaches.',
                resultTitle: 'Losses are fully explained by realized market moves',
                result: 'All 6 breach-day losses reconcile cleanly to observed market moves. This is not a booking or P&L-explain problem.',
                unlocks: []
            },
            {
                id: 'attribute-to-bad-luck',
                title: 'Attribute breaches to normal statistical variation',
                category: 'Reporting',
                cost: 5,
                signal: 'harmful',
                description: 'Report the 6 breaches to regulators as within acceptable statistical variation without further analysis.',
                resultTitle: 'Unsupported conclusion',
                result: 'The clustering and independence test both reject the "bad luck" explanation. Reporting this without testing risks a failed regulatory review.',
                unlocks: []
            }
        ],
        diagnosis: {
            rootCauses: [
                { id: 'stale-equal-weight-window', label: 'The equally-weighted 2-year window under-weights the recent higher-volatility regime' },
                { id: 'bad-luck', label: 'Six breaches in 250 days is within normal statistical variation for a 99% VaR model' },
                { id: 'pnl-booking-error', label: 'Booking errors on the breach days inflated realized losses' },
                { id: 'wrong-confidence-level', label: 'The model was calibrated to 95% instead of 99% confidence' }
            ],
            contributors: [
                { id: 'regime-shift', label: 'A genuine shift to a higher-volatility regime occurred mid-year' },
                { id: 'no-recency-weighting', label: 'The model has no mechanism to weight recent volatility more heavily' },
                { id: 'breach-clustering', label: 'Breaches are statistically clustered, not independent' },
                { id: 'slow-window-adaptation', label: 'A 2-year equal-weighted window adapts slowly to regime changes' }
            ],
            fixes: [
                { id: 'adopt-weighted-scheme', label: 'Adopt a volatility- or recency-weighted historical VaR scheme and revalidate' },
                { id: 'accept-yellow-zone', label: 'Accept the yellow-zone classification without changing the model' },
                { id: 'shorten-window-only', label: 'Shorten the lookback window without adding any weighting scheme' },
                { id: 'raise-confidence-level', label: 'Raise the confidence level to 99.5% without addressing the weighting' }
            ],
            controls: [
                { id: 'formal-independence-testing', label: 'Run formal breach-independence testing, not just breach counting, each review cycle' },
                { id: 'regime-triggered-reweighting', label: 'Trigger a weighting-scheme review when realized volatility shifts materially' },
                { id: 'document-clustering-analysis', label: 'Document breach-clustering analysis in every regulatory backtesting submission' },
                { id: 'count-only-reporting', label: 'Report only the raw breach count without further statistical analysis' }
            ]
        },
        answer: {
            rootCause: 'stale-equal-weight-window',
            contributors: ['regime-shift', 'no-recency-weighting', 'breach-clustering'],
            fix: 'adopt-weighted-scheme',
            controls: ['formal-independence-testing', 'regime-triggered-reweighting', 'document-clustering-analysis'],
            decisiveTests: ['plot-breach-timeline', 'run-independence-test', 'check-window-composition', 'run-weighted-var'],
            supportingTests: ['check-realized-vol-regime'],
            explanation: 'The breaches cluster tightly in a six-week window and fail a formal independence test, ruling out simple bad luck. The equally-weighted 2-year lookback still gives full weight to an 18-month-old calm quarter, diluting a genuine mid-year volatility regime shift. A volatility-weighted VaR recomputation would have caught most of the realized breaches, isolating the equal-weighting scheme as the root cause rather than the confidence level or booking.',
            learning: [
                'Breach counting alone is not sufficient backtesting; clustering and independence must be tested formally.',
                'An equally-weighted historical VaR window can be slow to adapt to genuine volatility regime shifts.',
                'A statistically significant cluster of breaches is stronger evidence of miscalibration than the raw breach count relative to the traffic-light zone.'
            ]
        },
        nextSteps: [
            {
                label: 'Explore Desk2Quant notes',
                title: 'Model Validation Quant Case Study Pack',
                href: 'product.html?id=a778e6ae-43d1-4cbd-a6a7-6dce693e5f69'
            },
            {
                label: 'Explore Desk2Quant notes',
                title: 'Numerical methods and model validation',
                href: 'index.html#products'
            }
        ]
    },
    {
        id: 'collateral-discounting-gap',
        number: '08',
        title: 'The Swap Book That Discounted Itself Wrong',
        shortTitle: 'Collateral discounting mismatch',
        desk: 'Funding & Collateral',
        discipline: 'Funding valuation',
        level: 'Advanced',
        duration: '18-22 min',
        accent: 'blue',
        teaser: 'A large cleared swap book shows a $1.6m valuation gap against the clearinghouse\'s own numbers after a CSA change. Collateral desk needs an answer before margin call.',
        objective: 'Determine why the desk\'s valuation diverges from the clearinghouse, then propose a fix and a control.',
        opening: {
            eyebrow: '11:30 Chicago · Cleared swaps collateral reconciliation',
            headline: 'The desk\'s valuation of its cleared USD swap book is $1.6m below the clearinghouse\'s own valuation.',
            body: 'The book was moved from a bilateral CSA (cash collateral, unsecured overnight rate) to central clearing three weeks ago. Trade population and notional are unchanged since the move.',
            metrics: [
                { label: 'Clearinghouse valuation', value: '$18.40m', tone: 'neutral' },
                { label: 'Desk valuation', value: '$16.80m', tone: 'negative' },
                { label: 'Gap', value: '-$1.60m', tone: 'negative' }
            ]
        },
        brief: [
            { label: 'Your role', value: 'Funding/collateral quant supporting cleared swaps' },
            { label: 'Deadline', value: 'Margin call reconciliation by 13:00' },
            { label: 'Primary book', value: 'Cleared USD interest rate swap portfolio' },
            { label: 'Investigation budget', value: '100 points' }
        ],
        messages: [
            {
                role: 'Collateral Manager',
                initials: 'CM',
                time: '11:30',
                text: 'The clearinghouse variation margin call assumes their valuation is correct. If ours is wrong we are posting the wrong collateral.'
            },
            {
                role: 'Trader',
                initials: 'TR',
                time: '11:34',
                text: 'Nothing has traded in this book for three weeks. The only thing that changed was moving from bilateral to cleared.'
            },
            {
                role: 'Quant Developer',
                initials: 'QD',
                time: '11:38',
                text: 'Did the discounting curve get updated when the CSA changed? That switch is easy to miss.'
            }
        ],
        artifacts: [
            {
                id: 'discounting-curve-comparison',
                title: 'Discounting curve comparison',
                eyebrow: 'Initial evidence',
                type: 'table',
                summary: 'The desk is still discounting with the old unsecured curve instead of the cleared OIS curve.',
                columns: ['Input', 'Desk valuation', 'Clearinghouse valuation', 'Difference'],
                rows: [
                    ['Discounting curve', 'Unsecured O/N (bilateral CSA)', 'Cleared OIS (CCP)', 'Different curve'],
                    ['Forecast curve', 'USD SOFR forward', 'USD SOFR forward', 'Matches'],
                    ['Trade population', '212 swaps', '212 swaps', 'Matches'],
                    ['Notional', '$4.1bn', '$4.1bn', 'Matches']
                ]
            },
            {
                id: 'csa-migration-log',
                title: 'CSA migration record',
                eyebrow: 'Initial evidence',
                type: 'keyValue',
                summary: 'The book moved to central clearing three weeks ago; the pricer\'s discounting configuration was not updated at the same time.',
                values: [
                    ['Migration date', '3 weeks ago'],
                    ['Old CSA type', 'Bilateral, cash collateral, unsecured O/N'],
                    ['New CSA type', 'Cleared, CCP-required OIS discounting'],
                    ['Pricer discounting config', 'Still set to "unsecured O/N"']
                ]
            },
            {
                id: 'corrected-discounting-reval',
                title: 'Controlled revaluation with cleared OIS discounting',
                eyebrow: 'Unlocked evidence',
                type: 'comparison',
                summary: 'Switching only the discounting curve closes almost the entire gap to the clearinghouse.',
                locked: true,
                left: { label: 'Desk (unsecured O/N)', value: '$16.80m', note: 'Stale bilateral discounting' },
                right: { label: 'Corrected (cleared OIS)', value: '$18.35m', note: 'CCP-required discounting' },
                footer: 'Remaining $50k is within normal cross-system valuation tolerance.'
            },
            {
                id: 'other-books-audit',
                title: 'Audit of other recently cleared books',
                eyebrow: 'Unlocked evidence',
                type: 'table',
                summary: 'Two other books moved to clearing in the same window and show the same discounting mismatch.',
                locked: true,
                columns: ['Book', 'Migrated to clearing', 'Discounting curve updated?'],
                rows: [
                    ['USD swap book (this case)', '3 weeks ago', 'No — mismatch found'],
                    ['EUR swap book', '5 weeks ago', 'No — mismatch found'],
                    ['GBP swap book', '2 weeks ago', 'Yes — updated correctly'],
                    ['JPY swap book', '6 months ago', 'Yes — updated correctly']
                ]
            },
            {
                id: 'migration-checklist-review',
                title: 'CSA migration checklist review',
                eyebrow: 'Unlocked evidence',
                type: 'code',
                summary: 'The migration checklist has no explicit step requiring the pricer\'s discounting configuration to be updated.',
                locked: true,
                code: [
                    'CSA Migration Checklist v2.1',
                    '[x] Notify clearinghouse of migration',
                    '[x] Update legal documentation',
                    '[x] Confirm margin schedule with CCP',
                    '[x] Update collateral eligibility schedule',
                    '[ ] (missing) Update discounting curve in pricing systems'
                ]
            }
        ],
        tests: [
            {
                id: 'compare-discounting-inputs',
                title: 'Compare discounting curves used by each system',
                category: 'Funding valuation',
                cost: 10,
                signal: 'decisive',
                description: 'Diff the discounting curve the desk pricer uses against the clearinghouse\'s required curve.',
                resultTitle: 'Desk is discounting with the wrong curve',
                result: 'The desk pricer still uses the unsecured overnight curve from the old bilateral CSA, while the clearinghouse requires cleared OIS discounting.',
                unlocks: ['discounting-curve-comparison']
            },
            {
                id: 'review-csa-migration',
                title: 'Review the CSA migration record',
                category: 'Operations',
                cost: 8,
                signal: 'decisive',
                description: 'Check when the book moved to clearing and whether pricer configuration was updated at the same time.',
                resultTitle: 'Pricer configuration was not updated at migration',
                result: 'The book moved to central clearing three weeks ago, but the discounting configuration in the pricer was never changed from the old bilateral setting.',
                unlocks: ['csa-migration-log']
            },
            {
                id: 'run-corrected-discounting-reval',
                title: 'Revalue with corrected discounting',
                category: 'Valuation',
                cost: 14,
                signal: 'decisive',
                description: 'Switch only the discounting curve to cleared OIS and rerun the book valuation.',
                resultTitle: 'Valuation gap closes to $50k',
                result: 'Correcting only the discounting curve brings the desk valuation to $18.35m, within normal tolerance of the clearinghouse\'s $18.40m.',
                unlocks: ['corrected-discounting-reval']
            },
            {
                id: 'audit-other-cleared-books',
                title: 'Audit other recently migrated books',
                category: 'Funding valuation',
                cost: 7,
                signal: 'supporting',
                description: 'Check whether other books that recently moved to clearing have the same discounting mismatch.',
                resultTitle: 'Two other books share the same gap',
                result: 'The EUR book, migrated five weeks ago, has the identical discounting mismatch. The GBP and JPY books, migrated with an updated checklist, do not.',
                unlocks: ['other-books-audit']
            },
            {
                id: 'review-migration-checklist',
                title: 'Review the CSA migration checklist',
                category: 'Process',
                cost: 6,
                signal: 'supporting',
                description: 'Check whether the standard migration process includes updating pricing-system discounting.',
                resultTitle: 'The checklist has no discounting-update step',
                result: 'The migration checklist covers legal, margin and collateral-eligibility steps but has no explicit requirement to update the discounting curve in pricing systems.',
                unlocks: ['migration-checklist-review']
            },
            {
                id: 'check-trade-population',
                title: 'Reconcile the trade population and notional',
                category: 'Booking',
                cost: 7,
                signal: 'neutral',
                description: 'Confirm the desk and clearinghouse agree on which trades and notional are in the book.',
                resultTitle: 'Trade population matches exactly',
                result: 'Both systems show 212 swaps and $4.1bn notional. This is not a booking or trade-population issue.',
                unlocks: []
            },
            {
                id: 'dispute-ccp-valuation',
                title: 'Dispute the clearinghouse\'s valuation as incorrect',
                category: 'Collateral',
                cost: 6,
                signal: 'harmful',
                description: 'Escalate to the clearinghouse claiming their valuation is wrong, without checking the desk\'s own discounting first.',
                resultTitle: 'Premature and likely incorrect dispute',
                result: 'The clearinghouse\'s valuation reflects the CCP-required discounting basis correctly. Disputing it first, without checking the desk\'s own stale configuration, would misdirect the reconciliation.',
                unlocks: []
            }
        ],
        diagnosis: {
            rootCauses: [
                { id: 'stale-discounting-post-migration', label: 'The pricer\'s discounting curve was never updated after the book moved to central clearing' },
                { id: 'ccp-valuation-error', label: 'The clearinghouse\'s own valuation is incorrect' },
                { id: 'trade-population-mismatch', label: 'The desk and clearinghouse disagree on trade population or notional' },
                { id: 'forecast-curve-error', label: 'The SOFR forward-rate forecasting curve is mismarked' }
            ],
            contributors: [
                { id: 'incomplete-migration-checklist', label: 'The CSA migration checklist has no explicit step to update pricing-system discounting' },
                { id: 'multiple-books-affected', label: 'Other books migrated in the same window share the same unaddressed gap' },
                { id: 'manual-config-step', label: 'Discounting-curve selection is a manual configuration step, not automated from the CSA type' },
                { id: 'large-notional-amplifies-gap', label: 'The book\'s large notional amplifies a small curve-basis difference into a large dollar gap' }
            ],
            fixes: [
                { id: 'update-discounting-rerun-all', label: 'Update the discounting curve to cleared OIS, rerun this book and audit all recently migrated books' },
                { id: 'accept-desk-valuation', label: 'Post collateral based on the desk\'s own valuation instead of the clearinghouse\'s' },
                { id: 'manual-one-off-adjustment', label: 'Post a one-off manual adjustment to match the clearinghouse number without fixing the pricer' },
                { id: 'average-two-valuations', label: 'Split the difference and post collateral based on the average of both valuations' }
            ],
            controls: [
                { id: 'automate-discounting-from-csa', label: 'Automate discounting-curve selection from the CSA/clearing status rather than manual configuration' },
                { id: 'add-migration-checklist-step', label: 'Add an explicit discounting-curve update step to the CSA migration checklist' },
                { id: 'periodic-ccp-reconciliation', label: 'Run periodic valuation reconciliation against the clearinghouse for all cleared books' },
                { id: 'trust-desk-valuation-only', label: 'Treat the desk\'s own valuation as authoritative without independent reconciliation' }
            ]
        },
        answer: {
            rootCause: 'stale-discounting-post-migration',
            contributors: ['incomplete-migration-checklist', 'multiple-books-affected', 'manual-config-step'],
            fix: 'update-discounting-rerun-all',
            controls: ['automate-discounting-from-csa', 'add-migration-checklist-step', 'periodic-ccp-reconciliation'],
            decisiveTests: ['compare-discounting-inputs', 'review-csa-migration', 'run-corrected-discounting-reval'],
            supportingTests: ['audit-other-cleared-books', 'review-migration-checklist'],
            explanation: 'When the swap book moved from a bilateral CSA to central clearing, the CCP-required discounting basis changed from an unsecured overnight curve to cleared OIS. The pricer\'s discounting configuration was never updated to reflect this, because the migration checklist had no explicit step requiring it. Correcting only the discounting curve closes the $1.6m gap to the clearinghouse\'s valuation, and the same unaddressed gap is found in another book migrated in the same window.',
            learning: [
                'A change in collateral arrangement (CSA type) changes the correct discounting curve, not just the margin mechanics.',
                'Manual, checklist-driven configuration steps are a common source of migration-related valuation gaps.',
                'Independent reconciliation against the clearinghouse is the fastest way to catch a discounting-basis mismatch before a margin dispute.'
            ]
        },
        nextSteps: [
            {
                label: 'Explore Desk2Quant notes',
                title: 'Credit Models: Quant Interview Playbook',
                href: 'product.html?id=43e3695f-7fd5-4ca3-89f0-271f3e27e8ea'
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
