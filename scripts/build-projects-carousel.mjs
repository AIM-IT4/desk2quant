import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

// High-contrast, vibrant FinTech aesthetic for Desk2Quant LinkedIn Carousel
// Pure standard glyphs to guarantee zero missing font characters
// Bold colors: Electric Cyan (#00f0ff), Electric Yellow (#facc15), Mint Green (#10b981), Crimson (#f43f5e), Violet (#d946ef)

const slides = [
  // Slide 1: Cover
  `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070c18"/>
    <rect x="35" y="35" width="1010" height="1280" rx="28" fill="none" stroke="#1e2d4a" stroke-width="2.5"/>
    
    <!-- Top Nav Header -->
    <rect x="75" y="70" width="370" height="42" rx="21" fill="#0f1f38" stroke="#2563eb" stroke-width="1.5"/>
    <circle cx="102" cy="91" r="7" fill="#10b981"/>
    <text x="122" y="98" fill="#34d399" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" letter-spacing="2">QUANT PORTFOLIO GUIDE</text>
    
    <rect x="835" y="70" width="170" height="42" rx="21" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
    <text x="857" y="98" fill="#facc15" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold">DESK2QUANT</text>

    <!-- Main Headline -->
    <text x="75" y="215" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="56" font-weight="bold">The 5 Projects That</text>
    <text x="75" y="285" fill="#facc15" font-family="DejaVu Sans, Arial, sans-serif" font-size="62" font-weight="bold">Actually Get You Hired</text>
    <text x="75" y="355" fill="#00f0ff" font-family="DejaVu Sans, Arial, sans-serif" font-size="56" font-weight="bold">As A Quant in 2026</text>
    
    <!-- Context Banner -->
    <rect x="75" y="405" width="930" height="145" rx="18" fill="#0d1f3b" stroke="#0284c7" stroke-width="2.5"/>
    <text x="110" y="455" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="21">Every candidate knows Black-Scholes and basic Bayes theorem.</text>
    <text x="110" y="493" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="21" font-weight="bold">Top buyside desks filter 95% of resumes. They hire production builders.</text>
    <text x="110" y="528" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold">Here are the 5 architectures that prove you are desk-ready on Day 1:</text>
    
    <!-- 4 Project Grid Cards -->
    <!-- Card 1 -->
    <rect x="75" y="585" width="450" height="240" rx="20" fill="#0c2344" stroke="#00f0ff" stroke-width="3"/>
    <rect x="105" y="615" width="190" height="34" rx="8" fill="#0284c7"/>
    <text x="120" y="638" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">01 // HFT &amp; C++20</text>
    <text x="105" y="690" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="25" font-weight="bold">L2 Limit Order Book</text>
    <text x="105" y="725" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">&amp; Matching Engine</text>
    <text x="105" y="770" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">• Lock-free SPSC circular queues</text>
    <text x="105" y="800" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">• Probabilistic queue depletion</text>

    <!-- Card 2 -->
    <rect x="555" y="585" width="450" height="240" rx="20" fill="#082e22" stroke="#10b981" stroke-width="3"/>
    <rect x="585" y="615" width="170" height="34" rx="8" fill="#059669"/>
    <text x="600" y="638" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">02 // VOLATILITY</text>
    <text x="585" y="690" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="25" font-weight="bold">Arbitrage-Free SVI</text>
    <text x="585" y="725" fill="#34d399" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">Dupire Local Vol Surface</text>
    <text x="585" y="770" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">• Gatheral SSVI parameterization</text>
    <text x="585" y="800" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">• Breeden-Litzenberger density</text>

    <!-- Card 3 -->
    <rect x="75" y="855" width="450" height="240" rx="20" fill="#2e1a05" stroke="#f59e0b" stroke-width="3"/>
    <rect x="105" y="885" width="170" height="34" rx="8" fill="#d97706"/>
    <text x="120" y="908" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">03 // STAT ARB</text>
    <text x="105" y="960" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="25" font-weight="bold">Kalman Filter Pairs</text>
    <text x="105" y="995" fill="#fbbf24" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">Dynamic Beta Stat Arb</text>
    <text x="105" y="1040" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">• Cointegration: ADF &amp; Johansen</text>
    <text x="105" y="1070" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">• Ornstein-Uhlenbeck half-life</text>

    <!-- Card 4 -->
    <rect x="555" y="855" width="450" height="240" rx="20" fill="#2d0b36" stroke="#d946ef" stroke-width="3"/>
    <rect x="585" y="885" width="215" height="34" rx="8" fill="#a21caf"/>
    <text x="600" y="908" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">04 &amp; 05 // RATES &amp; RISK</text>
    <text x="585" y="960" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="25" font-weight="bold">SOFR Multi-Curve</text>
    <text x="585" y="995" fill="#f472b6" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">&amp; XVA American MC</text>
    <text x="585" y="1040" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">• Dual-curve OIS bootstrapping</text>
    <text x="585" y="1070" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">• Longstaff-Schwartz EE / PFE</text>
    
    <!-- Swipe Indicator Button -->
    <rect x="75" y="1135" width="930" height="95" rx="22" fill="#0284c7" stroke="#38bdf8" stroke-width="2.5"/>
    <text x="235" y="1193" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="25" font-weight="bold">SWIPE FOR ARCHITECTURES &amp; INTERVIEWS ➔</text>
  </svg>
  `,

  // Slide 2: Project 1: L2 Limit Order Book & Matching Engine
  `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070c18"/>
    <rect x="35" y="35" width="1010" height="1280" rx="28" fill="none" stroke="#1e2d4a" stroke-width="2.5"/>
    
    <!-- Top Header -->
    <rect x="75" y="70" width="375" height="42" rx="21" fill="#0284c7"/>
    <text x="95" y="97" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" letter-spacing="1">PROJECT 01 // HIGH FREQUENCY TRADING</text>
    
    <rect x="855" y="70" width="150" height="42" rx="21" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
    <text x="880" y="97" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold">SLIDE 02 / 06</text>
    
    <text x="75" y="170" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="42" font-weight="bold">L2 Limit Order Book &amp; Matching</text>
    <text x="75" y="212" fill="#00f0ff" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">Language: Modern C++20 | Focus: Microstructure &amp; Ultra-Low Latency</text>
    
    <!-- Red Box: Amateur Approach -->
    <rect x="75" y="245" width="930" height="215" rx="20" fill="#260d16" stroke="#f43f5e" stroke-width="3"/>
    <rect x="110" y="270" width="350" height="34" rx="8" fill="#f43f5e"/>
    <text x="125" y="293" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">AMATEUR APPROACH (AUTO-REJECTED)</text>
    <text x="110" y="345" fill="#fecdd3" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-style="italic">&quot;Downloaded daily AAPL bars with yfinance, backtested 20/50 SMA crossover.&quot;</text>
    <text x="110" y="390" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Why it gets rejected: Citadel and Optiver auto-reject this in 5 seconds. Shows zero proof</text>
    <text x="110" y="420" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">of order matching, queue priority, exchange latency, or adverse selection.</text>

    <!-- Green Box: Production Standard -->
    <rect x="75" y="485" width="930" height="455" rx="20" fill="#082b20" stroke="#10b981" stroke-width="3"/>
    <rect x="110" y="515" width="370" height="34" rx="8" fill="#10b981"/>
    <text x="125" y="538" fill="#040b17" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">PRODUCTION DESK STANDARD (BUY-SIDE)</text>
    <text x="110" y="585" fill="#6ee7b7" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">What top market making desks look for in your codebase:</text>
    
    <text x="110" y="635" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Price-Time Priority Engine: Doubly linked lists with O(1) order cancels via hash map</text>
    <text x="110" y="680" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Lock-Free SPSC Ring Buffer: Cache-line aligned circular queues (zero mutex contention)</text>
    <text x="110" y="725" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Probabilistic Queue Position: Model volume ahead of you; never assume naive touch fills</text>
    <text x="110" y="770" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Microsecond Latency Injector: Pessimistic wire-to-wire ack offsets to reflect live PnL</text>
    <text x="110" y="815" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Synthetic ITCH / OUCH Parser: Replay high-burst market events with zero packet drops</text>
    
    <rect x="110" y="855" width="860" height="48" rx="10" fill="#0e4433" stroke="#10b981" stroke-width="1.5"/>
    <text x="125" y="885" fill="#a7f3d0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold">CV Impact: Proves you can build low-latency systems that survive production traffic.</text>

    <!-- Interview Question Box -->
    <rect x="75" y="965" width="930" height="235" rx="20" fill="#0d2547" stroke="#00f0ff" stroke-width="3"/>
    <rect x="110" y="995" width="315" height="32" rx="8" fill="#0284c7"/>
    <text x="125" y="1017" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">DESK INTERVIEW DEFENSE QUESTION</text>
    
    <text x="110" y="1065" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">&quot;Your limit order sits at the inside bid. 40 lots trade at the bid.</text>
    <text x="110" y="1100" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">Did your order get filled? How does your engine track queue priority?&quot;</text>
    <text x="110" y="1145" fill="#93c5fd" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Your project codebase gives you verified 10-second proof during technical rounds.</text>
  </svg>
  `,

  // Slide 3: Project 2: Arbitrage-Free SVI Volatility Surface
  `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070c18"/>
    <rect x="35" y="35" width="1010" height="1280" rx="28" fill="none" stroke="#1e2d4a" stroke-width="2.5"/>
    
    <!-- Top Header -->
    <rect x="75" y="70" width="350" height="42" rx="21" fill="#059669"/>
    <text x="95" y="97" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" letter-spacing="1">PROJECT 02 // EXOTIC DERIVATIVES</text>
    
    <rect x="855" y="70" width="150" height="42" rx="21" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
    <text x="880" y="97" fill="#34d399" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold">SLIDE 03 / 06</text>
    
    <text x="75" y="170" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="42" font-weight="bold">Arbitrage-Free SVI Vol Surface</text>
    <text x="75" y="212" fill="#34d399" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">Language: Python + Modern C++ | Focus: Dupire Local Vol &amp; Static Arbitrage</text>
    
    <!-- Red Box: Amateur Approach -->
    <rect x="75" y="245" width="930" height="215" rx="20" fill="#260d16" stroke="#f43f5e" stroke-width="3"/>
    <rect x="110" y="270" width="350" height="34" rx="8" fill="#f43f5e"/>
    <text x="125" y="293" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">AMATEUR APPROACH (AUTO-REJECTED)</text>
    <text x="110" y="345" fill="#fecdd3" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-style="italic">&quot;Scraped Yahoo Finance option chains and fitted cubic splines across implied vol.&quot;</text>
    <text x="110" y="390" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Why it fails: Standard splines violate no-arbitrage bounds, producing negative</text>
    <text x="110" y="420" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">butterfly probability densities and imaginary Dupire local volatilities.</text>

    <!-- Green Box: Production Standard -->
    <rect x="75" y="485" width="930" height="455" rx="20" fill="#082b20" stroke="#10b981" stroke-width="3"/>
    <rect x="110" y="515" width="370" height="34" rx="8" fill="#10b981"/>
    <text x="125" y="538" fill="#040b17" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">PRODUCTION DESK STANDARD (BUY-SIDE)</text>
    <text x="110" y="585" fill="#6ee7b7" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">What volatility desks (Citadel, Goldman, Millennium) demand:</text>
    
    <text x="110" y="635" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Gatheral Quasi-Explicit SVI / SSVI: Consistent parameterization across strike &amp; maturity</text>
    <text x="110" y="680" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Calendar Arbitrage Elimination: Enforce strict dW/dT &gt;= 0 across total variance curves</text>
    <text x="110" y="725" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Breeden-Litzenberger Density: Enforce d2C/dK2 &gt;= 0 for positive risk-neutral density</text>
    <text x="110" y="770" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Dupire Local Vol Inversion: Smooth PDE pricing grid for exotic autocallables &amp; barriers</text>
    <text x="110" y="815" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Roger Lee Extreme Wing Bounds: Enforce asymptotic slope limits to stop tail explosion</text>
    
    <rect x="110" y="855" width="860" height="48" rx="10" fill="#0e4433" stroke="#10b981" stroke-width="1.5"/>
    <text x="125" y="885" fill="#a7f3d0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold">CV Impact: Shows complete mastery of continuous-time stochastic volatility modeling.</text>

    <!-- Interview Question Box -->
    <rect x="75" y="965" width="930" height="235" rx="20" fill="#0d2547" stroke="#00f0ff" stroke-width="3"/>
    <rect x="110" y="995" width="315" height="32" rx="8" fill="#0284c7"/>
    <text x="125" y="1017" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">DESK INTERVIEW DEFENSE QUESTION</text>
    
    <text x="110" y="1065" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">&quot;Under what conditions does SSVI surface calibration produce</text>
    <text x="110" y="1100" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">butterfly arbitrage? How does your optimizer enforce wing limits?&quot;</text>
    <text x="110" y="1145" fill="#93c5fd" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Direct mathematical derivations and runnable C++ code included in the pack.</text>
  </svg>
  `,

  // Slide 4: Project 3: Stat Arb & Kalman Filter Pairs Trading
  `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070c18"/>
    <rect x="35" y="35" width="1010" height="1280" rx="28" fill="none" stroke="#1e2d4a" stroke-width="2.5"/>
    
    <!-- Top Header -->
    <rect x="75" y="70" width="330" height="42" rx="21" fill="#d97706"/>
    <text x="95" y="97" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" letter-spacing="1">PROJECT 03 // QUANT RESEARCH</text>
    
    <rect x="855" y="70" width="150" height="42" rx="21" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
    <text x="880" y="97" fill="#fbbf24" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold">SLIDE 04 / 06</text>
    
    <text x="75" y="170" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="42" font-weight="bold">Kalman Filter Stat Arb Engine</text>
    <text x="75" y="212" fill="#fbbf24" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">Language: Python | Focus: Cointegration, OU Mean-Reversion &amp; Frictions</text>
    
    <!-- Red Box: Amateur Approach -->
    <rect x="75" y="245" width="930" height="215" rx="20" fill="#260d16" stroke="#f43f5e" stroke-width="3"/>
    <rect x="110" y="270" width="350" height="34" rx="8" fill="#f43f5e"/>
    <text x="125" y="293" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">AMATEUR APPROACH (AUTO-REJECTED)</text>
    <text x="110" y="345" fill="#fecdd3" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-style="italic">&quot;Calculated Pearson correlation between KO and PEP, traded when Z-score &gt; 2.&quot;</text>
    <text x="110" y="390" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Why it fails: Correlation != Cointegration. High correlation between non-stationary</text>
    <text x="110" y="420" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">prices is often spurious. Unhedged spreads drift apart and blow up the portfolio.</text>

    <!-- Green Box: Production Standard -->
    <rect x="75" y="485" width="930" height="455" rx="20" fill="#082b20" stroke="#10b981" stroke-width="3"/>
    <rect x="110" y="515" width="370" height="34" rx="8" fill="#10b981"/>
    <text x="125" y="538" fill="#040b17" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">PRODUCTION DESK STANDARD (BUY-SIDE)</text>
    <text x="110" y="585" fill="#6ee7b7" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">What quantitative equity &amp; statistical arbitrage teams test for:</text>
    
    <text x="110" y="635" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Cointegration Rigor: Augmented Dickey-Fuller (ADF) &amp; Johansen eigenvector trace rank</text>
    <text x="110" y="680" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• State-Space Kalman Filter: Dynamically update beta in real time with transition matrix</text>
    <text x="110" y="725" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Ornstein-Uhlenbeck (OU) Fitting: Exact analytical half-life calculation for trade sizing</text>
    <text x="110" y="770" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Almgren-Chriss Market Impact: Square-root slippage model to eliminate phantom alpha</text>
    <text x="110" y="815" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">• Structural Break Guards: CUSUM filter halting orders when cointegration breaks down</text>
    
    <rect x="110" y="855" width="860" height="48" rx="10" fill="#0e4433" stroke="#10b981" stroke-width="1.5"/>
    <text x="125" y="885" fill="#a7f3d0" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold">CV Impact: Proves you design robust econometric alphas that survive real market friction.</text>

    <!-- Interview Question Box -->
    <rect x="75" y="965" width="930" height="235" rx="20" fill="#0d2547" stroke="#00f0ff" stroke-width="3"/>
    <rect x="110" y="995" width="315" height="32" rx="8" fill="#0284c7"/>
    <text x="125" y="1017" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">DESK INTERVIEW DEFENSE QUESTION</text>
    
    <text x="110" y="1065" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">&quot;Why does rolling OLS fail for hedge ratio estimation compared to</text>
    <text x="110" y="1100" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">a Kalman filter? How do you tune process noise covariance Q?&quot;</text>
    <text x="110" y="1145" fill="#93c5fd" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Step-by-step state-space formulation and math derivations in the pack.</text>
  </svg>
  `,

  // Slide 5: Projects 4 & 5: Multi-Curve SOFR Discounting & XVA Simulation
  `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070c18"/>
    <rect x="35" y="35" width="1010" height="1280" rx="28" fill="none" stroke="#1e2d4a" stroke-width="2.5"/>
    
    <!-- Top Header -->
    <rect x="75" y="70" width="385" height="42" rx="21" fill="#9333ea"/>
    <text x="95" y="97" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" letter-spacing="1">PROJECTS 04 &amp; 05 // FIXED INCOME &amp; RISK</text>
    
    <rect x="855" y="70" width="150" height="42" rx="21" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
    <text x="880" y="97" fill="#c084fc" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold">SLIDE 05 / 06</text>
    
    <text x="75" y="170" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="42" font-weight="bold">SOFR Multi-Curve &amp; XVA Engine</text>
    <text x="75" y="212" fill="#c084fc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">Modern C++ | Dual-Curve Bootstrapping &amp; American Monte Carlo</text>
    
    <!-- Top Box: Multi-Curve SOFR -->
    <rect x="75" y="245" width="930" height="340" rx="20" fill="#0d2547" stroke="#00f0ff" stroke-width="3"/>
    <rect x="110" y="275" width="280" height="34" rx="8" fill="#0284c7"/>
    <text x="125" y="298" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">PROJECT 04: MULTI-CURVE SOFR</text>
    <text x="110" y="348" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">The Post-LIBOR Dual-Curve Architecture:</text>
    <text x="110" y="390" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Dual-Curve Separation: SOFR/OIS discounting vs. Term SOFR projection curves</text>
    <text x="110" y="430" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Monotone Convex Splines: Hagan-West interpolation preventing negative forward rates</text>
    <text x="110" y="470" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Jacobian Solving: Simultaneous multi-instrument root finding for IRS and basis swaps</text>
    
    <rect x="110" y="510" width="860" height="45" rx="8" fill="#07304f" stroke="#0284c7" stroke-width="1.5"/>
    <text x="125" y="538" fill="#7dd3fc" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold">Desk takeaway: Single-curve discounting is obsolete. Desks test dual-curve mastery.</text>

    <!-- Bottom Box: XVA Simulation Engine -->
    <rect x="75" y="615" width="930" height="340" rx="20" fill="#2d0a37" stroke="#d946ef" stroke-width="3"/>
    <rect x="110" y="645" width="315" height="34" rx="8" fill="#c026d3"/>
    <text x="125" y="668" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">PROJECT 05: XVA SIMULATION ENGINE</text>
    <text x="110" y="718" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">Counterparty Credit Risk Under Longstaff-Schwartz:</text>
    <text x="110" y="760" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• American Monte Carlo (AMC): Longstaff-Schwartz boundary across 10,000 paths</text>
    <text x="110" y="800" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Exposure Profiles: Expected Exposure (EE) and 99% Potential Future Exposure (PFE)</text>
    <text x="110" y="840" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• CSA Master Agreements: Netting sets, collateral thresholds, and MPOR modeling</text>
    
    <rect x="110" y="880" width="860" height="45" rx="8" fill="#4a0e5b" stroke="#c026d3" stroke-width="1.5"/>
    <text x="125" y="908" fill="#f5d0fe" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold">Desk takeaway: Risk quants must model netting and default intensity jump curves.</text>

    <!-- Interview Question Box -->
    <rect x="75" y="985" width="930" height="215" rx="20" fill="#132742" stroke="#f59e0b" stroke-width="3"/>
    <rect x="110" y="1015" width="315" height="32" rx="8" fill="#d97706"/>
    <text x="125" y="1037" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">DESK INTERVIEW DEFENSE QUESTION</text>
    
    <text x="110" y="1085" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">&quot;How do you calculate CVA on a netting set with daily margin calls</text>
    <text x="110" y="1120" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">vs. an uncollateralized trade? How does your code model WWR?&quot;</text>
    <text x="110" y="1165" fill="#93c5fd" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Production Longstaff-Schwartz C++ implementation included in the pack.</text>
  </svg>
  `,

  // Slide 6: Conversion Slide (Desk2Quant Production Blueprint)
  `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070c18"/>
    <rect x="35" y="35" width="1010" height="1280" rx="28" fill="none" stroke="#1e2d4a" stroke-width="2.5"/>
    
    <!-- Top Header -->
    <rect x="75" y="70" width="370" height="42" rx="21" fill="#0f2038" stroke="#0284c7" stroke-width="1.5"/>
    <text x="98" y="97" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" letter-spacing="2">THE FULL PRODUCTION BLUEPRINT</text>
    
    <rect x="855" y="70" width="150" height="42" rx="21" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
    <text x="880" y="97" fill="#facc15" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold">SLIDE 06 / 06</text>
    
    <text x="75" y="170" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="48" font-weight="bold">Don't Just Learn Theory.</text>
    <text x="75" y="230" fill="#00f0ff" font-family="DejaVu Sans, Arial, sans-serif" font-size="48" font-weight="bold">Build Real Quant Engines.</text>
    
    <text x="75" y="285" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="22">We compiled all 45 production-grade projects into a complete blueprint:</text>

    <!-- Product Showcase Card -->
    <rect x="75" y="325" width="930" height="490" rx="24" fill="#0c2242" stroke="#00f0ff" stroke-width="3.5"/>
    
    <!-- Badge & Price -->
    <rect x="110" y="355" width="280" height="34" rx="8" fill="#00f0ff"/>
    <text x="125" y="378" fill="#040b17" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">45 INDUSTRY GRADE PROJECTS</text>
    
    <rect x="735" y="355" width="235" height="34" rx="8" fill="#152e4d" stroke="#facc15" stroke-width="1.5"/>
    <text x="750" y="378" fill="#facc15" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">OFFICIAL DESK RELEASE</text>
    
    <text x="110" y="435" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="bold">Ultimate Industry Grade Quant Project Pack</text>
    <text x="110" y="470" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold">Mathematical Derivations · Python Prototypes · Production C++20</text>
    
    <!-- Features -->
    <text x="110" y="525" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">• 45 Full Desk Projects: Pricing, Risk, XVA, Rates, FX &amp; Equity Stat Arb</text>
    <text x="110" y="570" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">• Dual-Implementation: Math Derivations to Python Prototypes to C++</text>
    <text x="110" y="615" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">• Interview Defense Guide: 90+ technical desk questions with verified answers</text>
    <text x="110" y="660" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">• Resume-Ready Bullets: Pre-written impact bullet points for your quant CV</text>
    <text x="110" y="705" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">• 600+ Pages of Code: Runnable Jupyter notebooks &amp; production C++ engines</text>
    
    <!-- High-Contrast Launch Offer Banner -->
    <rect x="110" y="740" width="860" height="54" rx="12" fill="#facc15"/>
    <text x="140" y="775" fill="#000000" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">OFFICIAL CODE: PROJECT20  |  GET 20% OFF AT CHECKOUT</text>

    <!-- Next Steps Card -->
    <rect x="75" y="845" width="930" height="245" rx="20" fill="#0d1f3b" stroke="#38bdf8" stroke-width="2.5"/>
    <text x="110" y="895" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="25" font-weight="bold">How to access the full 45 Project Pack:</text>
    <text x="110" y="945" fill="#00f0ff" font-family="DejaVu Sans, Arial, sans-serif" font-size="23" font-weight="bold">➔ Direct link pinned in Comment #1 below</text>
    <text x="110" y="990" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">Available instantly at desk2quant.com</text>
    <text x="110" y="1035" fill="#facc15" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="bold">• Bookmark this carousel to reference during portfolio &amp; interview prep.</text>

    <!-- Footer Branding -->
    <text x="390" y="1215" fill="#64748b" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Desk2Quant © 2026 · Desk Practitioner Series</text>
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
  execSync(`rsvg-convert -w 1080 -h 1350 ${svgPath} -o ${pngPath}`);
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
