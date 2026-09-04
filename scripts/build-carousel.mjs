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
      <linearGradient id="cyanGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#818cf8"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    
    <!-- Outer Glow Frame -->
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <!-- Top Pill -->
    <rect x="90" y="100" width="370" height="42" rx="21" fill="#1e293b"/>
    <circle cx="115" cy="121" r="6" fill="#38bdf8"/>
    <text x="135" y="128" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" letter-spacing="2">DESK2QUANT PRACTITIONER</text>
    
    <!-- Main Headline -->
    <text x="90" y="270" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="64" font-weight="bold">The 4 Questions</text>
    <text x="90" y="350" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="64" font-weight="bold">That Break Math Ph.D.s</text>
    <text x="90" y="430" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="64" font-weight="bold">In Quant Interviews</text>
    
    <!-- Subtitle Card -->
    <rect x="90" y="490" width="900" height="130" rx="16" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="130" y="545" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="24">Why textbook derivatives theory fails on the trading desk</text>
    <text x="130" y="585" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold">— and what top market-making &amp; vol desks actually look for.</text>
    
    <!-- Visual Pillars -->
    <rect x="90" y="660" width="435" height="160" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="1"/>
    <text x="120" y="710" fill="#f43f5e" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">01 // DELTA HEDGING</text>
    <text x="120" y="750" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">The &quot;Risk-Free&quot; Illusion</text>
    <text x="120" y="785" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Gamma slippage &amp; pin risk</text>

    <rect x="555" y="660" width="435" height="160" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="1"/>
    <text x="585" y="710" fill="#f59e0b" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">02 // FLAT VOLATILITY</text>
    <text x="585" y="750" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">The Black-Scholes Trap</text>
    <text x="585" y="785" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Trading Vanna &amp; Volga</text>

    <rect x="90" y="850" width="435" height="160" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="1"/>
    <text x="120" y="900" fill="#a855f7" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">03 // PNL ATTRIBUTION</text>
    <text x="120" y="940" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">Straddle Realities</text>
    <text x="120" y="975" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Realized vol vs Implied theta</text>

    <rect x="555" y="850" width="435" height="160" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="1"/>
    <text x="585" y="900" fill="#10b981" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">04 // LOCAL VOLATILITY</text>
    <text x="585" y="940" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">The Dupire Breakdown</text>
    <text x="585" y="975" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Why SLV models rule</text>
    
    <!-- Swipe CTA -->
    <rect x="90" y="1130" width="900" height="90" rx="20" fill="#0284c7"/>
    <text x="410" y="1185" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">SWIPE TO UNPACK &gt;&gt;</text>
  </svg>
  `,

  // Slide 2: Question 1
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070a12"/>
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <text x="90" y="120" fill="#f43f5e" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">TRAP 01 // DELTA HEDGING</text>
    <text x="90" y="190" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="bold">&quot;You are delta-hedged. The stock moves 4%.</text>
    <text x="90" y="245" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="bold">What is your exact PnL?&quot;</text>
    
    <!-- Red Box: Textbook -->
    <rect x="90" y="300" width="900" height="230" rx="16" fill="#1c131a" stroke="#4c1d24" stroke-width="1.5"/>
    <rect x="120" y="330" width="180" height="34" rx="6" fill="#f43f5e"/>
    <text x="135" y="353" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">TEXTBOOK ANSWER</text>
    <text x="120" y="405" fill="#fda4af" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-style="italic">&quot;PnL is approximately zero because delta is zero.&quot;</text>
    <text x="120" y="445" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">Why it fails: The interviewer instantly marks you as an academic who has</text>
    <text x="120" y="475" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">never observed a real trading book.</text>

    <!-- Green Box: Desk Reality -->
    <rect x="90" y="560" width="900" height="420" rx="16" fill="#0f1f1a" stroke="#134e4a" stroke-width="1.5"/>
    <rect x="120" y="590" width="170" height="34" rx="6" fill="#10b981"/>
    <text x="135" y="613" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">DESK REALITY</text>
    <text x="120" y="665" fill="#6ee7b7" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">A delta-hedged book is NOT risk-free.</text>
    <text x="120" y="705" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">It is a pure bet on Realized Volatility vs. Implied Volatility.</text>

    <!-- Formula snippet -->
    <rect x="120" y="740" width="840" height="70" rx="10" fill="#06120e"/>
    <text x="140" y="785" fill="#34d399" font-family="monospace" font-size="22" font-weight="bold">d(PnL) ≈ ½ · Γ · (dS)² + Θ · dt + Cost(Rebalancing)</text>

    <text x="120" y="855" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• In discrete time, you rebalance at intervals, suffering Gamma slippage.</text>
    <text x="120" y="890" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• If the move is a discontinuous jump, your hedge fails to cover the gap.</text>
    <text x="120" y="925" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Near expiry, ATM options have exploding Gamma (pin risk).</text>

    <!-- Bottom Takeaway -->
    <rect x="90" y="1010" width="900" height="170" rx="16" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="120" y="1055" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">PRACTITIONER 3-SECOND ANSWER:</text>
    <text x="120" y="1095" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">&quot;Delta eliminates first-order directional drift. My PnL is determined by</text>
    <text x="120" y="1130" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">Gamma convexity gains versus Theta decay over the rebalancing window.&quot;</text>
  </svg>
  `,

  // Slide 3: Question 2
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070a12"/>
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <text x="90" y="120" fill="#f59e0b" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">TRAP 02 // VOLATILITY DYNAMICS</text>
    <text x="90" y="190" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="bold">&quot;Why do market makers trade Vanna &amp; Volga</text>
    <text x="90" y="245" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="bold">instead of single-option flat Vega?&quot;</text>
    
    <!-- Red Box -->
    <rect x="90" y="300" width="900" height="200" rx="16" fill="#1c131a" stroke="#4c1d24" stroke-width="1.5"/>
    <rect x="120" y="330" width="180" height="34" rx="6" fill="#f43f5e"/>
    <text x="135" y="353" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">TEXTBOOK ANSWER</text>
    <text x="120" y="405" fill="#fda4af" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-style="italic">&quot;Vega tells you price sensitivity to volatility σ. You just hedge total Vega.&quot;</text>
    <text x="120" y="445" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">The Trap: Assumes the volatility surface shifts uniformly across all strikes.</text>

    <!-- Green Box -->
    <rect x="90" y="530" width="900" height="470" rx="16" fill="#0f1f1a" stroke="#134e4a" stroke-width="1.5"/>
    <rect x="120" y="560" width="170" height="34" rx="6" fill="#10b981"/>
    <text x="135" y="583" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">DESK REALITY</text>
    <text x="120" y="635" fill="#6ee7b7" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">The Volatility Surface is not flat, and it never shifts in parallel.</text>
    
    <rect x="120" y="670" width="840" height="135" rx="12" fill="#06120e"/>
    <text x="145" y="715" fill="#38bdf8" font-family="monospace" font-size="22" font-weight="bold">Vanna = ∂Δ / ∂σ = ∂Vega / ∂S  (Spot-Vol Cross Risk)</text>
    <text x="145" y="755" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="16">Tells you how your delta hedge changes when implied vol spikes or collapses.</text>
    
    <rect x="120" y="825" width="840" height="135" rx="12" fill="#06120e"/>
    <text x="145" y="870" fill="#a855f7" font-family="monospace" font-size="22" font-weight="bold">Volga = ∂Vega / ∂σ = ∂²V / ∂σ²  (Vol Convexity)</text>
    <text x="145" y="910" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="16">Measures the curvature of options price wrt volatility. Essential for wing pricing.</text>

    <!-- Bottom -->
    <rect x="90" y="1030" width="900" height="180" rx="16" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="120" y="1075" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">WHY INTERVIEWERS LOVE THIS:</text>
    <text x="120" y="1115" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">If you are long wings and short ATM, your net Vega might be zero,</text>
    <text x="120" y="1150" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">but you are massively long Volga and exposed to market skew shocks.</text>
  </svg>
  `,

  // Slide 4: Question 3
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070a12"/>
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <text x="90" y="120" fill="#a855f7" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">TRAP 03 // PNL ATTRIBUTION</text>
    <text x="90" y="190" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="bold">&quot;Walk me through the daily PnL of a long</text>
    <text x="90" y="245" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="bold">ATM Straddle held for 1 month.&quot;</text>
    
    <!-- Red Box -->
    <rect x="90" y="300" width="900" height="190" rx="16" fill="#1c131a" stroke="#4c1d24" stroke-width="1.5"/>
    <rect x="120" y="330" width="180" height="34" rx="6" fill="#f43f5e"/>
    <text x="135" y="353" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">TEXTBOOK ANSWER</text>
    <text x="120" y="405" fill="#fda4af" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-style="italic">&quot;A straddle profits if the stock makes a big move in either direction.&quot;</text>
    <text x="120" y="445" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">The Trap: True at expiration, but completely wrong for daily desk risk management.</text>

    <!-- Green Box -->
    <rect x="90" y="520" width="900" height="490" rx="16" fill="#0f1f1a" stroke="#134e4a" stroke-width="1.5"/>
    <rect x="120" y="550" width="170" height="34" rx="6" fill="#10b981"/>
    <text x="135" y="573" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">DESK REALITY</text>
    <text x="120" y="625" fill="#6ee7b7" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">A straddle is an ongoing race: Gamma profits vs Theta bleed.</text>
    
    <rect x="120" y="660" width="840" height="110" rx="12" fill="#06120e"/>
    <text x="145" y="705" fill="#34d399" font-family="monospace" font-size="22" font-weight="bold">Daily PnL ≈ ½ · S² · Γ · (σ_realized² - σ_implied²) · Δt</text>
    <text x="145" y="745" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">Black-Scholes identity: Θ = -½ · S² · Γ · σ_implied²</text>

    <!-- Key takeaways -->
    <text x="120" y="815" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">The 2 Trading Desk Rules:</text>
    <text x="120" y="855" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">1. If Realized Vol &gt; Implied Vol: Gamma profits exceed Theta decay. You win.</text>
    <text x="120" y="895" fill="#e2e8f0" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">2. If Realized Vol &lt; Implied Vol: The stock moves, but not enough to offset Theta.</text>
    <text x="145" y="930" fill="#f43f5e" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold">Even if the stock rises 5%, you bleed money if realized vol was below implied.</text>

    <!-- Bottom -->
    <rect x="90" y="1040" width="900" height="170" rx="16" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="120" y="1085" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">CANDIDATE DIFFERENTIATOR:</text>
    <text x="120" y="1125" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">Speak in terms of volatility spread (Realized σ vs Implied σ),</text>
    <text x="120" y="1160" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">not naive directional price targets.</text>
  </svg>
  `,

  // Slide 5: Question 4
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070a12"/>
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <text x="90" y="120" fill="#10b981" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">TRAP 04 // MODEL CALIBRATION</text>
    <text x="90" y="190" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="bold">&quot;Why can&apos;t you use Dupire Local Vol</text>
    <text x="90" y="245" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="bold">to price path-dependent options (e.g. Cliquets)?&quot;</text>
    
    <!-- Red Box -->
    <rect x="90" y="300" width="900" height="180" rx="16" fill="#1c131a" stroke="#4c1d24" stroke-width="1.5"/>
    <rect x="120" y="330" width="180" height="34" rx="6" fill="#f43f5e"/>
    <text x="135" y="353" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">TEXTBOOK ANSWER</text>
    <text x="120" y="405" fill="#fda4af" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-style="italic">&quot;Dupire fits European vanilla prices exactly, so it must price exotics correctly.&quot;</text>
    <text x="120" y="445" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">The Trap: Fitting static marginal distributions does NOT determine path dynamics.</text>

    <!-- Green Box -->
    <rect x="90" y="510" width="900" height="490" rx="16" fill="#0f1f1a" stroke="#134e4a" stroke-width="1.5"/>
    <rect x="120" y="540" width="170" height="34" rx="6" fill="#10b981"/>
    <text x="135" y="563" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold">DESK REALITY</text>
    <text x="120" y="615" fill="#6ee7b7" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">Dupire flattens future forward smiles.</text>
    <text x="120" y="655" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">Under a deterministic local vol diffusion dS_t = r S_t dt + σ(t, S_t) S_t dW_t:</text>

    <rect x="120" y="690" width="840" height="130" rx="12" fill="#06120e"/>
    <text x="145" y="735" fill="#f59e0b" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">The Forward Volatility Flaw:</text>
    <text x="145" y="775" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">As time rolls forward, the conditional distribution of spot flattens out,</text>
    <text x="145" y="805" fill="#cbd5e1" font-family="DejaVu Sans, Arial, sans-serif" font-size="17">severely underpricing forward skew, forward-starting options, &amp; cliquets.</text>

    <text x="120" y="865" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">The Production Fix on Desks:</text>
    <text x="120" y="905" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">Stochastic Local Volatility (SLV) — combining Heston stochastic vol</text>
    <text x="120" y="940" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="19">with a non-parametric leverage function to fit both smile &amp; forward skew.</text>

    <!-- Bottom -->
    <rect x="90" y="1030" width="900" height="180" rx="16" fill="#131d33" stroke="#253350" stroke-width="1.5"/>
    <text x="120" y="1075" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold">WHAT INTERVIEWERS ARE TESTING:</text>
    <text x="120" y="1115" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">Do you understand model risk? An arbitrage-free static fit does</text>
    <text x="120" y="1150" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">NOT protect you when hedging path-dependent exotic payouts.</text>
  </svg>
  `,

  // Slide 6: The Roadmap / CTA
  `
  <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#070a12"/>
    <rect x="50" y="50" width="980" height="1250" rx="28" fill="#0d1424" stroke="#1e293b" stroke-width="2"/>
    
    <text x="90" y="120" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" letter-spacing="2">DESK2QUANT // CURATED PREP STACK</text>
    <text x="90" y="190" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="44" font-weight="bold">Stop Studying Like a Student.</text>
    <text x="90" y="250" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="44" font-weight="bold">Prepare Like a Trading Desk.</text>

    <!-- Product 1 -->
    <rect x="90" y="300" width="900" height="210" rx="18" fill="#111a2e" stroke="#1e293b" stroke-width="1.5"/>
    <rect x="120" y="325" width="220" height="32" rx="6" fill="#0284c7"/>
    <text x="135" y="347" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">ABSOLUTE BEGINNERS</text>
    <text x="120" y="395" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">Quant Finance for Absolute Beginners</text>
    <text x="120" y="435" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• 378 pages across 28 structured chapters from the ground up</text>
    <text x="120" y="470" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• 28 runnable Python scripts covering Itô, pricing, and Greeks (Code: BEGINNER10)</text>

    <!-- Product 2 -->
    <rect x="90" y="535" width="900" height="210" rx="18" fill="#111a2e" stroke="#1e293b" stroke-width="1.5"/>
    <rect x="120" y="560" width="230" height="32" rx="6" fill="#f43f5e"/>
    <text x="135" y="582" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">INTERVIEW CANDIDATES</text>
    <text x="120" y="630" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">Common Mistakes in Quant Interviews</text>
    <text x="120" y="670" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• 106 pages covering 29 failure modes that kill interview performance</text>
    <text x="120" y="705" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Wrong Answer → Trap → Correction → 3-Second Answer (Code: MISTAKES10)</text>

    <!-- Product 3 -->
    <rect x="90" y="770" width="900" height="210" rx="18" fill="#111a2e" stroke="#1e293b" stroke-width="1.5"/>
    <rect x="120" y="795" width="220" height="32" rx="6" fill="#10b981"/>
    <text x="135" y="817" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold">DERIVATIVES DESKS</text>
    <text x="120" y="865" fill="#f8fafc" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold">Vol Surface Construction &amp; Derivatives Pack</text>
    <text x="120" y="905" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• SSVI smile calibration, Dupire local vol surfaces, and 0DTE options dynamics</text>
    <text x="120" y="940" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="18">• Discrete delta-hedging Jupyter simulation notebooks included</text>

    <!-- Call to action card -->
    <rect x="90" y="1010" width="900" height="200" rx="20" fill="#131d33" stroke="#38bdf8" stroke-width="2"/>
    <text x="130" y="1065" fill="#ffffff" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" font-weight="bold">Get Instant Digital Access to All Playbooks</text>
    <text x="130" y="1110" fill="#38bdf8" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="bold">desk2quant.com/products/</text>
    <text x="130" y="1155" fill="#94a3b8" font-family="DejaVu Sans, Arial, sans-serif" font-size="20">Bookmark this carousel 📌 and share with someone preparing for quant rounds.</text>
  </svg>
  `
];

const tmpDir = '/tmp/carousel_build';
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

const pdfPath = '/root/desk2quant/assets/downloads/quant-interview-desk-traps-carousel.pdf';
execSync(`magick ${pngPaths.join(' ')} ${pdfPath}`);
console.log(`Compiled PDF carousel: ${pdfPath}`);

// Also copy to artifacts dir
const artifactPdf = '/root/.gemini/antigravity-cli/brain/0e6f3afe-8ae7-4dcb-9545-6c19b6fba26f/quant-interview-desk-traps-carousel.pdf';
fs.copyFileSync(pdfPath, artifactPdf);
console.log(`Copied to artifacts: ${artifactPdf}`);
