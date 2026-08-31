import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTerminalText, wrapTerminalText, isEquationLike } from '../cli/terminal-format.mjs';

test('renderer fixes raw LaTeX and Markdown seen in the v2.0.0 TUI', () => {
  const input = String.raw`Now the model reproduces both 5-y and 10-y vols within 1 bp.

\sigma_{eff}^2 = \sum_{k=1}^{2}\sigma_k^2\int_0^{T_{exp}} B_k(t,T_{exp})^2\,dt
+2\rho\sigma_1\sigma_2\int_0^{T_{exp}} B_1(t,T_{exp})B_2(t,T_{exp})dt.

**Takeaway** — a single-factor Gaussian model often *under-fits* the swaption surface.`;

  const text = formatTerminalText(input);
  assert.match(text, /σ/);
  assert.match(text, /Σ/);
  assert.match(text, /∫/);
  assert.match(text, /ρ/);
  assert.match(text, /Takeaway/);
  assert.doesNotMatch(text, /\\sigma|\\sum|\\int|\\rho|\*\*|\*under-fits\*/);
});

test('renderer converts common scripts when Unicode forms exist', () => {
  const text = formatTerminalText(String.raw`\Gamma = \frac{\phi(d_1)}{S\sigma\sqrt{T}}, \sigma^2_{eff}, x^{-1}`);
  assert.match(text, /Γ/);
  assert.match(text, /φ/);
  assert.match(text, /σ/);
  assert.match(text, /√\(T\)/);
  assert.match(text, /²/);
  assert.match(text, /⁻¹/);
  assert.doesNotMatch(text, /\\Gamma|\\phi|\\sigma|\\sqrt|\\frac/);
});

test('renderer preserves fenced and inline code exactly', () => {
  const input = 'Use `sigma = 0.2`:\n```python\nlatex = r"\\\\frac{a}{b}"\nprint(latex)\n```';
  const text = formatTerminalText(input);
  assert.match(text, /`sigma = 0\.2`/);
  assert.match(text, /```python\nlatex = r"\\\\frac\{a\}\{b\}"\nprint\(latex\)\n```/);
});

test('equations are indented and wrapped without raw terminal overflow', () => {
  const equation = 'σ²_eff = Σₖ₌₁² σₖ² ∫₀ᵀ Bₖ(t,T)² dt + 2ρσ₁σ₂ ∫₀ᵀ B₁(t,T)B₂(t,T) dt';
  assert.equal(isEquationLike(equation), true);
  const lines = wrapTerminalText(equation, 52);
  assert.ok(lines.length >= 2);
  assert.ok(lines.every(line => line.length <= 52));
  assert.ok(lines[0].startsWith('    '));
});
