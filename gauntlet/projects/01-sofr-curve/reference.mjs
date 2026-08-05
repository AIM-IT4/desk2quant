// Reference solution for Gauntlet project 01: OIS/SOFR discount curve bootstrap.
//
// This exists to GENERATE the expected values in the hidden test blob. Never
// hand-write expected numbers -- if the reference and the tests disagree, the
// tests are wrong and paying customers get failed unfairly.
//
// Model (deliberately simplified, and stated plainly in the candidate spec so
// grading is unambiguous):
//   - Annual pillars, ACT/365F, continuous compounding.
//   - Par OIS swap: fixed rate r_n makes the swap value zero.
//   - Annual fixed payments, notional 1, so:
//         r_n * sum_{i=1..n} tau_i * DF_i  ==  1 - DF_n
//     solved forward pillar by pillar (each new DF depends only on prior ones).

const DAY_COUNT = 365.0;

export function bootstrapOIS(quotes) {
    const dfs = [];
    const taus = [];
    let annuity = 0;

    for (let i = 0; i < quotes.length; i++) {
        const { days, rate } = quotes[i];
        const prevDays = i === 0 ? 0 : quotes[i - 1].days;
        const tau = (days - prevDays) / DAY_COUNT;
        taus.push(tau);

        // r * (annuity_prev + tau_n * DF_n) = 1 - DF_n
        //   =>  DF_n = (1 - r*annuity_prev) / (1 + r*tau_n)
        const df = (1 - rate * annuity) / (1 + rate * tau);
        dfs.push(df);
        annuity += tau * df;
    }

    return {
        dfs,
        taus,
        zeroRates: dfs.map((df, i) => -Math.log(df) / (quotes[i].days / DAY_COUNT)),
        annuity
    };
}

// Continuously-compounded forward rate between two pillars.
export function forwardRate(dfStart, dfEnd, tau) {
    return Math.log(dfStart / dfEnd) / tau;
}
