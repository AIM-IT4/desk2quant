const ANCHORS = [
  {
    keys: ['black-scholes','black scholes','bs model','option pricing'],
    text: 'Black-Scholes anchor: under dS = r S dt + sigma S dW under the risk-neutral measure, a European call is C = S N(d1) - K exp(-rT) N(d2), with d1 = [ln(S/K) + (r + 0.5 sigma^2)T]/(sigma sqrt(T)) and d2 = d1 - sigma sqrt(T). State assumptions and discuss where they fail.'
  },
  {
    keys: ['ito','itô','stochastic calculus'],
    text: 'Ito anchor: if dX = mu dt + sigma dW and f = f(t,X), then df = (f_t + mu f_x + 0.5 sigma^2 f_xx)dt + sigma f_x dW. The second-order term survives because quadratic variation gives (dW)^2 = dt in Ito calculus.'
  },
  {
    keys: ['gbm','geometric brownian'],
    text: 'GBM anchor: dS = mu S dt + sigma S dW has solution S_T = S_0 exp[(mu - 0.5 sigma^2)T + sigma W_T]. Moments should be derived with the Gaussian moment-generating function and checked at sigma -> 0.'
  },
  {
    keys: ['heston','stochastic volatility'],
    text: 'Heston anchor: dS = mu S dt + sqrt(v) S dW_S and dv = kappa(theta-v)dt + xi sqrt(v)dW_v with corr(dW_S,dW_v)=rho dt. Calibration must discuss parameter identifiability, positivity/Feller diagnostics, objective weighting and out-of-sample smile stability.'
  },
  {
    keys: ['svi','ssvi','vol surface','volatility surface'],
    text: 'Vol-surface anchor: work in total implied variance w(k,T)=sigma_imp(k,T)^2 T. A professional implementation should audit static arbitrage: butterfly consistency within slices and calendar monotonicity across maturities, before using Dupire local volatility.'
  },
  {
    keys: ['monte carlo','simulation'],
    text: 'Monte Carlo anchor: estimator error is O(N^-1/2). Separate discretisation bias from sampling error, report confidence intervals, use variance reduction where justified, and validate against analytic or semi-analytic benchmarks when available.'
  },
  {
    keys: ['ois','sofr','curve','bootstrap'],
    text: 'Curve anchor: bootstrapping solves instruments sequentially so model PV equals market PV under explicit day-count, compounding and interpolation conventions. Validate repricing residuals, discount-factor monotonicity where appropriate, and sensitivity to interpolation.'
  },
  {
    keys: ['greek','delta','gamma','vega'],
    text: 'Greeks anchor: distinguish model partial derivatives from realised P&L. Delta is first-order spot sensitivity, gamma second-order spot convexity and vega volatility sensitivity. A desk explanation should connect Taylor P&L attribution to hedging limitations.'
  },
  {
    keys: ['probability','conditional expectation','bayes'],
    text: 'Probability anchor: define the sample space and conditioning event before calculating. For interview problems, expose independence assumptions explicitly; many traps arise from conditioning, stopping times or overlapping patterns rather than arithmetic.'
  },
  {
    keys: ['var','value at risk','expected shortfall'],
    text: 'Risk anchor: VaR is a loss quantile and is not generally subadditive; Expected Shortfall averages losses beyond the VaR threshold and is coherent under standard definitions. Backtesting must specify horizon, confidence level, P&L definition and exception logic.'
  }
];

export function knowledgeFor(query = '') {
  const q = String(query).toLowerCase();
  const hits = ANCHORS.filter(a => a.keys.some(k => q.includes(k))).slice(0, 3);
  if (!hits.length) return 'General Desk2Quant standard: define assumptions, variables and measure/conventions; connect equations to implementation; include numerical validation and failure modes; never invent empirical facts.';
  return hits.map(h => h.text).join('\n');
}

export function inferTopic(query = '') {
  const q = String(query).trim();
  if (!q) return 'general quant';
  const lower = q.toLowerCase();
  for (const anchor of ANCHORS) {
    const key = anchor.keys.find(k => lower.includes(k));
    if (key) return key.slice(0, 80);
  }
  return q.replace(/\s+/g, ' ').slice(0, 80);
}
