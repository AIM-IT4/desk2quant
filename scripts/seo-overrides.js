// Hand-tuned <title> and meta description for pages whose default metadata
// (derived from the product name / blog title / excerpt) earns impressions but
// few clicks. Keyed by output slug. Titles are passed through seoTitle(), so
// the brand suffix is appended only when it fits in 60 characters.
module.exports = {
  products: {
    'market-risk-quant-notes-and-lab-var-es-backtesting-and-frtb-141-pages': {
      title: 'Market Risk Quant Notes & Lab: VaR, ES & FRTB',
      description: '141-page market risk notes plus 3 executed projects on 20 years of real rates and FX data: VaR, ES, backtesting, stress testing and FRTB SA vs IMA.'
    },
    'ats-friendly-quant-resume-template-latex': {
      title: 'ATS-Friendly LaTeX Resume Template for Quants',
      description: 'One-page, single-column LaTeX resume template for quants and quant developers. Editable .tex, sample PDF and quant bullet examples that parse cleanly in ATS.'
    },
    'cpp-for-quants': {
      title: 'C++ for Quants: 59-Page Desk & Interview Guide',
      description: '59-page C++ guide for quants: 22 modules, 3-second interview answers on RAII, UB and STL choices, latency trade-offs and what breaks in production.'
    }
  },
  blogs: {
    'backtesting-var-traffic-light-zones-kupiec-christoffersen': {
      title: 'VaR Backtesting: Traffic Lights & Kupiec Test',
      description: 'How VaR backtesting really works: Basel traffic-light zones, FRTB desk limits, Kupiec and Christoffersen tests, and what 4,919 days of real data revealed.'
    },
    'xva-in-plain-english-why-banks-price-counterparty-risk': {
      title: 'XVA Explained: CVA, DVA, FVA, MVA, KVA',
      description: 'What is XVA? How banks price counterparty credit risk, funding, margin and capital into derivatives, with CVA, DVA, FVA, MVA and KVA explained simply.'
    },
    'calibrating-the-heston-stochastic-volatility-model-a-practitioner-s-notebook': {
      title: 'How to Calibrate the Heston Model in Python',
      description: 'How do you calibrate a stochastic volatility model? Step-by-step Heston calibration to a real implied vol surface, with runnable Python and the derivations.'
    }
  }
};
