const SUPERSCRIPT = {
  '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
  '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ'
};

const SUBSCRIPT = {
  '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
  '+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ',
  'k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ'
};

const LATEX_SYMBOLS = {
  theta:'θ', vartheta:'ϑ', sigma:'σ', Sigma:'Σ', mu:'μ', alpha:'α', beta:'β', gamma:'γ',
  delta:'δ', rho:'ρ', lambda:'λ', kappa:'κ', phi:'φ', varphi:'ϕ', eta:'η', epsilon:'ε',
  omega:'ω', tau:'τ', nu:'ν', xi:'ξ', zeta:'ζ',
  Delta:'Δ', Gamma:'Γ', Theta:'Θ', Lambda:'Λ', Omega:'Ω', Phi:'Φ',
  partial:'∂', nabla:'∇', int:'∫', iint:'∬', iiint:'∭', sum:'Σ', prod:'Π',
  infinity:'∞', infty:'∞', approx:'≈', sim:'∼', neq:'≠', leq:'≤', geq:'≥', le:'≤', ge:'≥',
  times:'×', cdot:'·', pm:'±', mp:'∓', to:'→', rightarrow:'→', leftarrow:'←',
  Rightarrow:'⇒', Leftarrow:'⇐', iff:'⇔', mapsto:'↦',
  forall:'∀', exists:'∃', in:'∈', notin:'∉', subset:'⊂', subseteq:'⊆', cup:'∪', cap:'∩'
};

function unicodeScript(value, table) {
  const raw = String(value || '');
  let out = '';
  for (const ch of raw) {
    if (!(ch in table)) return null;
    out += table[ch];
  }
  return out;
}

function cleanNamedScript(value) {
  return String(value || '').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_+\-=]/g, '');
}

function renderScriptValue(value, marker, table) {
  const raw = String(value || '');
  // Multi-letter names are semantic labels (model, mkt, eff, exp), not indices.
  if (/^[A-Za-z]{2,}$/.test(raw)) return `${marker}${cleanNamedScript(raw)}`;
  return unicodeScript(raw, table) ?? `${marker}${cleanNamedScript(raw)}`;
}

function replaceScript(text, marker, table) {
  let out = text;
  const braced = marker === '^' ? /\^\{([^{}]+)\}/g : /_\{([^{}]+)\}/g;
  const paren = marker === '^' ? /\^\(([^()]+)\)/g : /_\(([^()]+)\)/g;
  const simple = marker === '^'
    ? /\^([0-9+\-=in]+)(?![A-Za-z])/g
    : /_([0-9+\-=aehijklmnoprstuvx]+)(?![A-Za-z])/g;

  out = out.replace(braced, (_m, v) => renderScriptValue(v, marker, table));
  out = out.replace(paren, (_m, v) => renderScriptValue(v, marker, table));
  out = out.replace(simple, (m, v) => unicodeScript(v, table) ?? m);
  return out;
}

function replaceFractions(text) {
  let out = text;
  for (let i = 0; i < 10; i += 1) {
    const next = out.replace(/\\(?:d|t)?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)');
    if (next === out) break;
    out = next;
  }
  return out;
}

function stripMarkdown(text) {
  return text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:---+|___+|\*\*\*+)\s*$/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
}

function normalizeLatex(text) {
  let out = String(text || '')
    .replace(/\\\[/g, '\n')
    .replace(/\\\]/g, '\n')
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\$\$?/g, '')
    .replace(/\\begin\{(?:aligned|align\*?|equation\*?|gather\*?|split)\}/g, '')
    .replace(/\\end\{(?:aligned|align\*?|equation\*?|gather\*?|split)\}/g, '')
    .replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr|big|Big)\b/g, '')
    .replace(/\\!/g, '')
    .replace(/\\[,;:]/g, ' ')
    .replace(/\\qquad\b/g, '    ')
    .replace(/\\quad\b/g, '  ')
    .replace(/\\\\/g, '\n');

  out = replaceFractions(out)
    .replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^{}]+)\}/g, '($2)^(1/$1)')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:text|textrm|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}/g, '$1')
    .replace(/\\mathbb\{Q\}/g, 'ℚ')
    .replace(/\\mathbb\{R\}/g, 'ℝ')
    .replace(/\\mathbb\{P\}/g, 'ℙ')
    .replace(/\\mathbb\{N\}/g, 'ℕ')
    .replace(/\\mathbb\{Z\}/g, 'ℤ')
    .replace(/\\boxed\{([^{}]*)\}/g, '$1');

  for (const [command, symbol] of Object.entries(LATEX_SYMBOLS)) {
    out = out.replace(new RegExp(`\\\\${command}(?![A-Za-z])`, 'g'), symbol);
  }

  out = out
    .replace(/\\exp(?![A-Za-z])/g, 'exp')
    .replace(/\\ln(?![A-Za-z])/g, 'ln')
    .replace(/\\log(?![A-Za-z])/g, 'log')
    .replace(/\\sin(?![A-Za-z])/g, 'sin')
    .replace(/\\cos(?![A-Za-z])/g, 'cos')
    .replace(/\\tan(?![A-Za-z])/g, 'tan')
    .replace(/\\min(?![A-Za-z])/g, 'min')
    .replace(/\\max(?![A-Za-z])/g, 'max')
    .replace(/\\lim(?![A-Za-z])/g, 'lim')
    .replace(/\\Pr(?![A-Za-z])/g, 'P')
    .replace(/\\mathcal\{([^{}]+)\}/g, '$1');

  // A labelled model quantity is clearer as σ_model,j than as a half-rendered superscript.
  out = out.replace(/([A-Za-z0-9σρμθλκΓΔΘ])\^\{([A-Za-z][A-Za-z0-9_-]*)\}_\{([^{}]+)\}/g, '$1_$2,$3');

  out = replaceScript(out, '^', SUPERSCRIPT);
  out = replaceScript(out, '_', SUBSCRIPT);

  out = out
    .replace(/\^\(2\)/g, '²')
    .replace(/\^\(3\)/g, '³')
    .replace(/\^\(-1\)/g, '⁻¹')
    .replace(/\\([A-Za-z]+)/g, '$1');

  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatHumanSegment(value) {
  const raw = String(value || '');
  if (!raw) return raw;
  const leading = raw.match(/^\s+/)?.[0] || '';
  const trailing = raw.match(/\s+$/)?.[0] || '';
  const core = raw.trim();
  if (!core) return raw;
  return `${leading}${normalizeLatex(stripMarkdown(core))}${trailing}`;
}

function formatCodeBlock(block) {
  const match = String(block).match(/^```([^\n`]*)\n?([\s\S]*?)\n?```$/);
  if (!match) return block;
  const language = String(match[1] || '').trim();
  const code = String(match[2] || '').replace(/^\n|\n$/g, '');
  const label = language ? language[0].toUpperCase() + language.slice(1) : 'Code';
  const indented = code.split('\n').map((line) => `    ${line}`).join('\n');
  return `${label}\n${indented}`;
}

export function formatTerminalText(value = '') {
  const source = String(value ?? '').replace(/\r\n/g, '\n');
  if (!source) return source;

  return source
    .split(/(```[\s\S]*?```|`[^`\n]+`)/g)
    .map((part) => {
      if (part.startsWith('```')) return formatCodeBlock(part);
      if (part.startsWith('`')) return part;
      return formatHumanSegment(part);
    })
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isEquationLike(line = '') {
  const s = String(line).trim();
  if (!s || /^[-*•]\s+/.test(s)) return false;
  return /[=∫ΣΠ∂√]|\b(?:exp|ln|log)\s*\(|[σρμθλκΓΔΘ][A-Za-z0-9₀-₉²³⁻_()]/.test(s);
}

export function wrapTerminalText(value = '', width = 80) {
  const target = Math.max(28, Number(width) || 80);
  const result = [];

  for (const original of String(value).replace(/\r\n/g, '\n').split('\n')) {
    const line = original.trimEnd();
    if (!line.trim()) {
      result.push('');
      continue;
    }

    // Code emitted by formatCodeBlock is already indented. Preserve its structure.
    if (/^\s{4}/.test(original)) {
      if (line.length <= target) result.push(original);
      else {
        for (let i = 0; i < line.length; i += target) result.push(line.slice(i, i + target));
      }
      continue;
    }

    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+/)?.[0] || '';
    const equationIndent = isEquationLike(line) ? '    ' : '';
    const prefix = bullet || equationIndent;
    const body = bullet ? line.trim().slice(bullet.trim().length).trim() : line.trim();
    const words = body.split(/\s+/);
    let current = prefix;

    for (const word of words) {
      const spacer = current.trim().length ? ' ' : '';
      const candidate = `${current}${spacer}${word}`;
      if (candidate.length > target && current.trim()) {
        result.push(current.trimEnd());
        current = `${' '.repeat(prefix.length)}${word}`;
      } else if (word.length > target - prefix.length && !current.trim()) {
        for (let i = 0; i < word.length; i += target - prefix.length) {
          result.push(`${prefix}${word.slice(i, i + target - prefix.length)}`);
        }
        current = prefix;
      } else {
        current = candidate;
      }
    }
    if (current.trim()) result.push(current.trimEnd());
  }

  return result;
}
