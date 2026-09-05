import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const slides = [
  // Slide 1: Cover
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#070a12"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    
    <!-- Outer Glow Frame -->
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <!-- Top Pill -->
    <rect x="90" y="100" width="340" height="42" rx="21" fill="#1e293b"/>
    <circle cx="115" cy="121" r="6" fill="#10b981"/>
    <text x="135" y="128" fill="#10b981" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" letter-spacing="2">QUANT CAREER BLUEPRINT</text>
    
    <!-- Main Headline -->
    <text x="90" y="270" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="62" font-weight="bold">The 5 Projects That</text>
    <text x="90" y="350" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="62" font-weight="bold">Actually Get You Hired</text>
    <text x="90" y="430" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="62" font-weight="bold">As A Quant in 2026</text>
    
    <!-- Subtitle Card -->
    <rect x="90" y="490" width="900" height="130" rx="16" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="130" y="545" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="24">Every candidate knows Black-Scholes and Bayes theorem.</text>
    <text x="130" y="585" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">Buyside desks hire candidates who build production engines.</text>
    
    <!-- Visual Pillars -->
    <rect x="90" y="660" width="435" height="160" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="1"/>
    <text x="120" y="710" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="bold">01 // MARKET MAKING</text>
    <text x="120" y="750" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">L2 Order Book &amp; Matching</text>
    <text x="120" y="785" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Lock-free C++20 engine &amp; queue sim</text>

    <rect x="555" y="660" width="435" height="160" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="1"/>
    <text x="585" y="710" fill="#10b981" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="bold">02 // VOLATILITY</text>
    <text x="585" y="750" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">Arbitrage-Free SVI Surface</text>
    <text x="585" y="785" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">SSVI &amp; Dupire local vol inversion</text>

    <rect x="90" y="850" width="435" height="160" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="1"/>
    <text x="120" y="900" fill="#f59e0b" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="bold">03 // STAT ARB</text>
    <text x="120" y="940" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">Kalman Filter Pairs Trading</text>
    <text x="120" y="975" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Cointegration &amp; dynamic hedge ratio</text>

    <rect x="555" y="850" width="435" height="160" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="1"/>
    <text x="585" y="900" fill="#ec4899" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="bold">04 // RISK &amp; XVA</text>
    <text x="585" y="940" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">Multi-Curve OIS &amp; XVA</text>
    <text x="585" y="975" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">SOFR dual-curve &amp; American MC</text>
    
    <!-- Swipe CTA -->
    <rect x="90" y="1130" width="900" height="90" rx="20" fill="#0284c7"/>
    <text x="390" y="1185" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">SWIPE FOR ARCHITECTURES &gt;&gt;</text>
  </svg>
  `,

  // Slide 2: Project 1
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070a12"/>
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <text x="90" y="120" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">PROJECT 01 // HFT &amp; MARKET MAKING</text>
    <text x="90" y="190" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="36" font-weight="bold">L2 Limit Order Book &amp; Matching Engine</text>
    <text x="90" y="240" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="22">Language: Modern C++20 | Focus: Microstructure &amp; Low Latency</text>
    
    <!-- Red Box: What Amateurs Put on Resumes -->
    <rect x="90" y="290" width="900" height="210" rx="16" fill="#1c131a" stroke="#4c1d24" stroke-width="1.5"/>
    <rect x="120" y="320" width="260" height="34" rx="6" fill="#f43f5e"/>
    <text x="135" y="343" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">AMATEUR GITHUB PROJECT</text>
    <text x="120" y="395" fill="#fda4af" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-style="italic">&quot;Downloaded daily AAPL data with yfinance, tested 20/50 SMA crossover in Python.&quot;</text>
    <text x="120" y="440" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Why it fails: Immediate auto-reject. Shows zero understanding of order matching,</text>
    <text x="120" y="470" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">queue priority, exchange latency, or adverse selection.</text>

    <!-- Green Box: Production Desk Standard -->
    <rect x="90" y="530" width="900" height="420" rx="16" fill="#0f1f1a" stroke="#134e4a" stroke-width="1.5"/>
    <rect x="120" y="560" width="250" height="34" rx="6" fill="#10b981"/>
    <text x="135" y="583" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">INDUSTRY-GRADE STANDARD</text>
    <text x="120" y="635" fill="#6ee7b7" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">What top market makers (Citadel, Optiver, Jump) look for:</text>
    
    <text x="120" y="685" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Price-Time Priority Engine: Doubly linked lists with O(1) order cancellation via hash map.</text>
    <text x="120" y="730" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Lock-Free Ingestion: SPSC ring buffer avoiding mutex contention on fast feeds.</text>
    <text x="120" y="775" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Queue Position Tracking: Model volume ahead of you; don&#39;t assume naive touch-fills.</text>
    <text x="120" y="820" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Microsecond Latency Injector: Pessimistic wire-to-wire ack offsets to prove real PnL.</text>

    <!-- Interview Question Card -->
    <rect x="90" y="980" width="900" height="180" rx="16" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="120" y="1025" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold">DESK INTERVIEW DEFENSE QUESTION:</text>
    <text x="120" y="1070" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">&quot;Your limit order sits at the inside bid. 40 lots trade at bid. Did you get filled?</text>
    <text x="120" y="1110" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">Explain how your matching engine models adverse selection during book sweeps.&quot;</text>
  </svg>
  `,

  // Slide 3: Project 2
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070a12"/>
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <text x="90" y="120" fill="#10b981" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">PROJECT 02 // EXOTIC DERIVATIVES</text>
    <text x="90" y="190" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="36" font-weight="bold">Arbitrage-Free SVI Volatility Surface</text>
    <text x="90" y="240" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="22">Language: Python + C++ | Focus: Dupire Local Vol &amp; Static Arbitrage</text>
    
    <!-- Red Box: What Amateurs Put on Resumes -->
    <rect x="90" y="290" width="900" height="210" rx="16" fill="#1c131a" stroke="#4c1d24" stroke-width="1.5"/>
    <rect x="120" y="320" width="260" height="34" rx="6" fill="#f43f5e"/>
    <text x="135" y="343" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">AMATEUR GITHUB PROJECT</text>
    <text x="120" y="395" fill="#fda4af" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-style="italic">&quot;Scraped Yahoo Finance option chains and fitted cubic splines across implied vol.&quot;</text>
    <text x="120" y="440" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Why it fails: Standard splines violate no-arbitrage bounds, producing negative</text>
    <text x="120" y="470" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">butterfly probability densities and imaginary Dupire local volatilities.</text>

    <!-- Green Box: Production Desk Standard -->
    <rect x="90" y="530" width="900" height="420" rx="16" fill="#0f1f1a" stroke="#134e4a" stroke-width="1.5"/>
    <rect x="120" y="560" width="250" height="34" rx="6" fill="#10b981"/>
    <text x="135" y="583" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">INDUSTRY-GRADE STANDARD</text>
    <text x="120" y="635" fill="#6ee7b7" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">What volatility desks look for in your code:</text>
    
    <text x="120" y="685" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Gatheral's Quasi-Explicit SVI / SSVI parameterization across strike &amp; expiry.</text>
    <text x="120" y="730" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Static Arbitrage Free: Strict check that ∂w/∂T ≥ 0 (no calendar arbitrage).</text>
    <text x="120" y="775" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Breeden-Litzenberger Check: ∂²C/∂K² ≥ 0 to guarantee positive risk-neutral density.</text>
    <text x="120" y="820" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Dupire Local Vol Inversion: Smooth PDE pricing grid for exotic autocallables &amp; barriers.</text>

    <!-- Interview Question Card -->
    <rect x="90" y="980" width="900" height="180" rx="16" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="120" y="1025" fill="#10b981" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold">DESK INTERVIEW DEFENSE QUESTION:</text>
    <text x="120" y="1070" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">&quot;Under what conditions does SSVI surface calibration produce butterfly arbitrage?</text>
    <text x="120" y="1110" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">How does your optimizer enforce Lee's moment formula at extreme wings?&quot;</text>
  </svg>
  `,

  // Slide 4: Project 3
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070a12"/>
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <text x="90" y="120" fill="#f59e0b" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">PROJECT 03 // QUANT RESEARCH</text>
    <text x="90" y="190" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="36" font-weight="bold">Stat Arb &amp; Kalman Filter Pairs Trading</text>
    <text x="90" y="240" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="22">Language: Python | Focus: Cointegration, OU Fitting &amp; Slippage</text>
    
    <!-- Red Box: What Amateurs Put on Resumes -->
    <rect x="90" y="290" width="900" height="210" rx="16" fill="#1c131a" stroke="#4c1d24" stroke-width="1.5"/>
    <rect x="120" y="320" width="260" height="34" rx="6" fill="#f43f5e"/>
    <text x="135" y="343" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">AMATEUR GITHUB PROJECT</text>
    <text x="120" y="395" fill="#fda4af" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-style="italic">&quot;Calculated Pearson correlation between KO and PEP, traded when Z-score &gt; 2.&quot;</text>
    <text x="120" y="440" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Why it fails: Correlation ≠ Cointegration. High correlation between non-stationary</text>
    <text x="120" y="470" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">prices is often spurious. Unhedged spreads drift apart and blow up the fund.</text>

    <!-- Green Box: Production Desk Standard -->
    <rect x="90" y="530" width="900" height="420" rx="16" fill="#0f1f1a" stroke="#134e4a" stroke-width="1.5"/>
    <rect x="120" y="560" width="250" height="34" rx="6" fill="#10b981"/>
    <text x="135" y="583" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">INDUSTRY-GRADE STANDARD</text>
    <text x="120" y="635" fill="#6ee7b7" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">What quantitative equity / statistical arbitrage teams look for:</text>
    
    <text x="120" y="685" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Cointegration Testing: Augmented Dickey-Fuller (ADF) &amp; Johansen eigenvector rank.</text>
    <text x="120" y="730" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Dynamic Beta Tracking: State-space Kalman filter updating β_t dynamically.</text>
    <text x="120" y="775" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Ornstein-Uhlenbeck (OU) Calibration: Estimate true half-life of mean reversion.</text>
    <text x="120" y="820" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Frictions &amp; Half-Spread: Square-root market impact model to weed out phantom alpha.</text>

    <!-- Interview Question Card -->
    <rect x="90" y="980" width="900" height="180" rx="16" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="120" y="1025" fill="#f59e0b" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold">DESK INTERVIEW DEFENSE QUESTION:</text>
    <text x="120" y="1070" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">&quot;Why does rolling OLS fail for hedge ratio estimation compared to Kalman filter?</text>
    <text x="120" y="1110" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">How do you tune process noise covariance Q to avoid lagging regime changes?&quot;</text>
  </svg>
  `,

  // Slide 5: Project 4 & 5
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070a12"/>
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <text x="90" y="120" fill="#ec4899" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">PROJECTS 04 &amp; 05 // FIXED INCOME &amp; RISK</text>
    <text x="90" y="190" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="36" font-weight="bold">Multi-Curve OIS Bootstrapping &amp; XVA</text>
    <text x="90" y="240" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="22">Focus: Modern SOFR Discounting &amp; American Monte Carlo (AMC)</text>
    
    <!-- Top Box: Multi-Curve SOFR -->
    <rect x="90" y="290" width="900" height="340" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="1.5"/>
    <rect x="120" y="320" width="280" height="34" rx="6" fill="#0284c7"/>
    <text x="135" y="343" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">PROJECT 04: MULTI-CURVE SOFR</text>
    <text x="120" y="395" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">The Post-LIBOR Dual-Curve Architecture:</text>
    <text x="120" y="440" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Disconnect between discounting curve (SOFR/OIS) and projection curve (Term SOFR).</text>
    <text x="120" y="480" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Monotone Convex / Cubic Hermite Spline interpolation preventing negative forward rates.</text>
    <text x="120" y="520" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Jacobian solving: Simultaneous multi-instrument root finding for IRS and basis swaps.</text>
    <text x="120" y="560" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold">Desk takeaway: Single-curve discounting is obsolete. Desks test dual-curve mastery.</text>

    <!-- Bottom Box: XVA Simulation -->
    <rect x="90" y="660" width="900" height="340" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="1.5"/>
    <rect x="120" y="690" width="310" height="34" rx="6" fill="#ec4899"/>
    <text x="135" y="713" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">PROJECT 05: XVA SIMULATION ENGINE</text>
    <text x="120" y="765" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">Counterparty Credit Risk Under Longstaff-Schwartz:</text>
    <text x="120" y="810" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• American Monte Carlo (AMC): Regression-based exercise boundary across 10k paths.</text>
    <text x="120" y="850" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Profile generation: Expected Exposure (EE) and 99% Potential Future Exposure (PFE).</text>
    <text x="120" y="890" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• CSA Modeling: Netting sets, collateral threshold, and Margin Period of Risk (MPOR).</text>
    <text x="120" y="930" fill="#f472b6" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold">Desk takeaway: Risk quants must model netting and default intensity jump curves.</text>

    <!-- Interview Question Card -->
    <rect x="90" y="1030" width="900" height="150" rx="16" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="120" y="1075" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">&quot;How do you calculate CVA on an netting set with daily margin calls vs. uncollateralized?&quot;</text>
    <text x="120" y="1120" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Your project code gives you instant 10-second proof during technical interviews.</text>
  </svg>
  `,

  // Slide 6: Action & Conversion Card
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070a12"/>
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <text x="90" y="120" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">THE FULL PRODUCTION BLUEPRINT</text>
    <text x="90" y="190" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="44" font-weight="bold">Don't Just Learn Theory.</text>
    <text x="90" y="245" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="44" font-weight="bold">Build Real Quant Engines.</text>
    
    <text x="90" y="310" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="22">We compiled all 45 production-grade projects into a complete blueprint:</text>

    <!-- Product Card -->
    <rect x="90" y="360" width="900" height="420" rx="20" fill="#111a2e" stroke="#38bdf8" stroke-width="2"/>
    <rect x="130" y="390" width="280" height="34" rx="6" fill="#38bdf8"/>
    <text x="145" y="413" fill="#070a12" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">45 INDUSTRY GRADE PROJECTS</text>
    
    <text x="130" y="470" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" font-weight="bold">Ultimate Industry Grade Quant Project Pack</text>
    
    <text x="130" y="525" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• 45 Complete Projects across Pricing, Risk, XVA, Rates, FX &amp; Equity</text>
    <text x="130" y="565" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Mathematical Derivations → Python Prototyping → C++ Implementation</text>
    <text x="130" y="605" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Interview Defense Questions &amp; Verified Answers for each project</text>
    <text x="130" y="645" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Resume-Ready Bullets: Pre-written impact bullets ready for your CV</text>
    <text x="130" y="685" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• 600+ Pages of production code, documentation &amp; runnable notebooks</text>
    
    <rect x="130" y="715" width="820" height="45" rx="8" fill="#06120e" stroke="#134e4a" stroke-width="1"/>
    <text x="145" y="745" fill="#10b981" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold">Launch Special: Use coupon code PROJECT20 at checkout for 20% off</text>

    <!-- Next Steps Card -->
    <rect x="90" y="815" width="900" height="230" rx="18" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="130" y="865" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">How to access the full 45 Project Pack:</text>
    <text x="130" y="915" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">👉 Direct link pinned in Comment #1 below</text>
    <text x="130" y="960" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">Available at desk2quant.com/products/ultimate-industry-grade-quant-project-pack-45-projects.html</text>
    <text x="130" y="1005" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Bookmark this carousel 📌 to reference during your portfolio and interview prep.</text>

    <!-- Footer branding -->
    <text x="440" y="1180" fill="#64748b" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Desk2Quant © 2026 · Desk Practitioner Series</text>
  </svg>
  `
];

const tmpDir = '/tmp/projects_carousel_build';
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const pngPaths = [];
slides.forEach((svg, i) => {
  const svgPath = `${tmpDir}/slide_${i + 1}.svg`;
  const pngPath = `${tmpDir}/slide_${i + 1}.png`;
  fs.writeFileSync(svgPath, svg.trim());
  execSync(`magick ${svgPath} ${pngPath}`);
  pngPaths.push(pngPath);
  console.log(`Generated slide ${i + 1}`);
});

const pdfPath = '/root/desk2quant/assets/downloads/quant-projects-blueprint-carousel.pdf';
execSync(`magick ${pngPaths.join(' ')} ${pdfPath}`);
console.log(`Compiled PDF carousel: ${pdfPath}`);

// Copy slides to assets/images/project-slides/
const slidesDir = '/root/desk2quant/assets/images/project-slides';
if (!fs.existsSync(slidesDir)) fs.mkdirSync(slidesDir, { recursive: true });
pngPaths.forEach((png, i) => {
  fs.copyFileSync(png, `${slidesDir}/slide_${i + 1}.png`);
});
console.log(`Exported 6 slide PNGs to ${slidesDir}`);
