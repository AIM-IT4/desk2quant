const { esc, SITE, slugify, seoTitle, metaDescription } = require('./generate-seo-pages.js');
const { FOOTER_HTML } = require('./seo-template.js');

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'dd', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'kbd',
  'li', 'mark', 'ol', 'p', 'pre', 'q', 'samp', 'section', 'small', 'span', 'strong',
  'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'ul'
]);
const VOID_TAGS = new Set(['br', 'hr', 'img']);
const DROP_CONTENT_TAGS = new Set([
  'embed', 'form', 'iframe', 'math', 'noscript', 'object', 'script', 'style', 'svg', 'template'
]);

const HTML_ENTITIES = Object.freeze({
  amp: '&', apos: "'", bull: '•', colon: ':', copy: '©', euro: '€', gt: '>', hellip: '…',
  laquo: '«', ldquo: '“', lsquo: '‘', lt: '<', mdash: '—', middot: '·', nbsp: '\u00a0',
  ndash: '–', newline: '\n', pound: '£', quot: '"', raquo: '»', rarr: '→', rdquo: '”',
  reg: '®', rsquo: '’', tab: '\t', times: '×', trade: '™', yen: '¥'
});

// These are deliberately exact replacements for common UTF-8 bytes decoded
// as Windows-1252/Latin-1. A broad re-encode can corrupt legitimate maths,
// names, and currency symbols, so only unambiguous sequences are repaired.
const MOJIBAKE_REPLACEMENTS = [
  ['\u00e2\u20ac\u201d', '—'], ['\u00e2\u0080\u0094', '—'],
  ['\u00e2\u20ac\u201c', '–'], ['\u00e2\u0080\u0093', '–'],
  ['\u00e2\u20ac\u2122', '’'], ['\u00e2\u0080\u0099', '’'],
  ['\u00e2\u20ac\u02dc', '‘'], ['\u00e2\u0080\u0098', '‘'],
  ['\u00e2\u20ac\u0153', '“'], ['\u00e2\u0080\u009c', '“'],
  ['\u00e2\u20ac\u009d', '”'], ['\u00e2\u0080\u009d', '”'],
  ['\u00e2\u20ac\u00a6', '…'], ['\u00e2\u0080\u00a6', '…'],
  ['\u00e2\u20ac\u00a2', '•'], ['\u00e2\u0080\u00a2', '•'],
  ['\u00e2\u201a\u00b9', '₹'], ['\u00e2\u0082\u00b9', '₹'],
  ['\u00e2\u2020\u2019', '→'], ['\u00e2\u0086\u0092', '→'],
  ['\u00e2\u02c6\u2019', '−'], ['\u00e2\u0088\u0092', '−'],
  ['\u00c2\u00a0', '\u00a0'], ['\u00c2\u00b7', '·'], ['\u00c2\u00a3', '£'],
  ['\u00c2\u00a9', '©'], ['\u00c2\u00ae', '®'], ['\u00c3\u0097', '×']
];

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function getBlogSlug(blog) {
  const requested = String(blog && blog.slug || '').trim().toLowerCase();
  const safe = requested
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '');
  return safe || slugify(blog && blog.title);
}

function repairMojibake(value) {
  let text = String(value == null ? '' : value);
  for (const [broken, repaired] of MOJIBAKE_REPLACEMENTS) {
    text = text.split(broken).join(repaired);
  }
  return text;
}

function decodeHtmlEntities(value) {
  let text = repairMojibake(value);
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi, (entity, name) => {
      if (name[0] !== '#') return HTML_ENTITIES[name.toLowerCase()] ?? entity;
      const hexadecimal = name[1].toLowerCase() === 'x';
      const codePoint = Number.parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)) return '\ufffd';
      return String.fromCodePoint(codePoint);
    });
    if (decoded === text) break;
    text = decoded;
  }
  return repairMojibake(text);
}

function escapeText(value) {
  return esc(decodeHtmlEntities(value));
}

function cleanAttributeText(value) {
  return decodeHtmlEntities(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '');
}

// Legacy hostnames that still appear in `blogs.cover_image_url` rows from
// before the custom domain landed. They resolve (vercel.json redirects them),
// but emitting them in og:image / twitter:image / JSON-LD hands crawlers a
// non-canonical host for the same asset, which splits image signals and makes
// the markup disagree with the canonical URL on the very same page.
// Rewrite them to SITE rather than "fixing" the data on every build.
const LEGACY_ASSET_HOSTS = new Set([
  'desk2quant.vercel.app',
  'quant-mentor.vercel.app',
  'www.desk2quant.com'
]);

function canonicalizeAssetHost(href) {
  try {
    const parsed = new URL(href);
    if (LEGACY_ASSET_HOSTS.has(parsed.hostname.toLowerCase())) {
      return `${SITE}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return href;
  }
  return href;
}

function safeUrl(value, { image = false, absolute = false } = {}) {
  const decoded = cleanAttributeText(value).trim();
  if (!decoded) return '';

  // Browsers ignore embedded ASCII whitespace/control characters while
  // detecting schemes, so validate against the same compact representation.
  const probe = decoded.replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  const scheme = probe.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
  if (scheme && !['http', 'https', 'mailto', 'tel'].includes(scheme)) return '';
  if (image && scheme && !['http', 'https'].includes(scheme)) return '';
  if (image && probe.startsWith('#')) return '';

  try {
    const parsed = new URL(probe, SITE);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      if (!image && ['mailto:', 'tel:'].includes(parsed.protocol)) return probe;
      return '';
    }
    if (absolute || scheme || probe.startsWith('//')) return canonicalizeAssetHost(parsed.href);
  } catch {
    return '';
  }
  return decoded;
}

function readTag(source, start) {
  let quote = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return { raw: source.slice(start, index + 1), end: index + 1 };
    }
  }
  return null;
}

function parseTag(raw) {
  const match = raw.match(/^<\s*(\/?)\s*([a-z][a-z0-9-]*)\b([\s\S]*?)>$/i);
  if (!match) return null;
  return {
    closing: Boolean(match[1]),
    name: match[2].toLowerCase(),
    attributes: match[3].replace(/\/\s*$/, ''),
    selfClosing: /\/\s*>$/.test(raw)
  };
}

function parseAttributes(source) {
  const attributes = new Map();
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /[\s/]/.test(source[index])) index += 1;
    const start = index;
    while (index < source.length && !/[\s=/>]/.test(source[index])) index += 1;
    if (start === index) {
      index += 1;
      continue;
    }

    const name = source.slice(start, index).toLowerCase();
    while (index < source.length && /\s/.test(source[index])) index += 1;
    let value = '';
    if (source[index] === '=') {
      index += 1;
      while (index < source.length && /\s/.test(source[index])) index += 1;
      const quote = source[index] === '"' || source[index] === "'" ? source[index++] : '';
      const valueStart = index;
      if (quote) {
        while (index < source.length && source[index] !== quote) index += 1;
        value = source.slice(valueStart, index);
        if (source[index] === quote) index += 1;
      } else {
        while (index < source.length && !/[\s>]/.test(source[index])) index += 1;
        value = source.slice(valueStart, index);
      }
    }
    // Match browser behaviour for duplicate attributes: the first wins.
    if (!attributes.has(name)) attributes.set(name, value);
  }
  return attributes;
}

function safeClassList(value) {
  return cleanAttributeText(value)
    .split(/\s+/)
    .filter(token => /^[a-z0-9_-]{1,64}$/i.test(token))
    .slice(0, 8)
    .join(' ');
}

function sanitiseAttributes(tag, source) {
  const input = parseAttributes(source);
  const output = [];
  const add = (name, value) => {
    if (value !== '') output.push(`${name}="${esc(value)}"`);
  };

  const className = safeClassList(input.get('class') || '');
  if (className) add('class', className);

  if (tag === 'a') {
    const href = safeUrl(input.get('href') || '');
    if (href) add('href', href);
    const title = cleanAttributeText(input.get('title') || '').trim();
    if (title) add('title', title);
    if (href && input.get('target') === '_blank') {
      add('target', '_blank');
      add('rel', 'noopener noreferrer');
    }
  } else if (tag === 'img') {
    const src = safeUrl(input.get('src') || '', { image: true });
    if (src) add('src', src);
    add('alt', cleanAttributeText(input.get('alt') || ''));
    const title = cleanAttributeText(input.get('title') || '').trim();
    if (title) add('title', title);
    for (const dimension of ['width', 'height']) {
      const value = (input.get(dimension) || '').trim();
      if (/^\d{1,4}$/.test(value) && Number(value) > 0) add(dimension, value);
    }
    add('loading', input.get('loading') === 'eager' ? 'eager' : 'lazy');
    add('decoding', 'async');
  } else if (tag === 'th' || tag === 'td') {
    for (const span of ['colspan', 'rowspan']) {
      const value = (input.get(span) || '').trim();
      if (/^\d{1,2}$/.test(value) && Number(value) > 0) add(span, value);
    }
    if (tag === 'th' && ['col', 'row', 'colgroup', 'rowgroup'].includes(input.get('scope'))) {
      add('scope', input.get('scope'));
    }
  } else if (tag === 'ol') {
    const start = (input.get('start') || '').trim();
    if (/^-?\d{1,6}$/.test(start)) add('start', start);
  } else if (tag === 'li') {
    const value = (input.get('value') || '').trim();
    if (/^-?\d{1,6}$/.test(value)) add('value', value);
  } else if (tag === 'blockquote' || tag === 'q') {
    const cite = safeUrl(input.get('cite') || '');
    if (cite) add('cite', cite);
  } else if (tag === 'time') {
    const datetime = cleanAttributeText(input.get('datetime') || '').trim();
    if (/^[0-9T:+.Z -]{4,40}$/i.test(datetime)) add('datetime', datetime);
  } else if (tag === 'abbr') {
    const title = cleanAttributeText(input.get('title') || '').trim();
    if (title) add('title', title);
  }

  return output;
}

function sanitiseRichHtml(value) {
  const source = repairMojibake(value).trim();
  if (!source) return '';

  // A plain-text record is still valid content. Keep explicit paragraph and
  // line boundaries instead of feeding it through the HTML tokenizer.
  if (!/<\/?[a-z][a-z0-9-]*(?:\s|\/?>)/i.test(source)) {
    return source.split(/\n\s*\n/)
      .map(paragraph => `<p>${escapeText(paragraph.trim()).replace(/\r?\n/g, '<br>')}</p>`)
      .join('\n');
  }

  const output = [];
  const openTags = [];
  const droppedTags = [];
  let cursor = 0;

  const appendText = (text) => {
    if (!droppedTags.length && text) output.push(escapeText(text));
  };

  while (cursor < source.length) {
    const nextTag = source.indexOf('<', cursor);
    if (nextTag === -1) {
      appendText(source.slice(cursor));
      break;
    }
    appendText(source.slice(cursor, nextTag));

    if (source.startsWith('<!--', nextTag)) {
      const commentEnd = source.indexOf('-->', nextTag + 4);
      cursor = commentEnd === -1 ? source.length : commentEnd + 3;
      continue;
    }
    if (source[nextTag + 1] === '!' || source[nextTag + 1] === '?') {
      const declaration = readTag(source, nextTag);
      cursor = declaration ? declaration.end : source.length;
      continue;
    }
    if (!/^<\/?[a-z][a-z0-9-]*(?:\s|\/?>)/i.test(source.slice(nextTag))) {
      appendText('<');
      cursor = nextTag + 1;
      continue;
    }

    const token = readTag(source, nextTag);
    if (!token) {
      appendText(source.slice(nextTag));
      break;
    }
    cursor = token.end;
    const parsed = parseTag(token.raw);
    if (!parsed) {
      appendText(token.raw);
      continue;
    }

    if (droppedTags.length) {
      if (DROP_CONTENT_TAGS.has(parsed.name)) {
        if (!parsed.closing && !parsed.selfClosing) droppedTags.push(parsed.name);
        else if (parsed.closing) {
          const matchIndex = droppedTags.lastIndexOf(parsed.name);
          if (matchIndex !== -1) droppedTags.splice(matchIndex, 1);
        }
      }
      continue;
    }
    if (DROP_CONTENT_TAGS.has(parsed.name)) {
      if (!parsed.closing && !parsed.selfClosing) droppedTags.push(parsed.name);
      continue;
    }

    // The page template owns its single H1. An H1 in stored article HTML is
    // retained as a section heading without creating a second document H1.
    const tag = parsed.name === 'h1' ? 'h2' : parsed.name;
    if (!ALLOWED_TAGS.has(tag)) continue;

    if (parsed.closing) {
      if (VOID_TAGS.has(tag)) continue;
      const matchIndex = openTags.lastIndexOf(tag);
      if (matchIndex === -1) continue;
      while (openTags.length > matchIndex) output.push(`</${openTags.pop()}>`);
      continue;
    }

    const attributes = sanitiseAttributes(tag, parsed.attributes);
    if (tag === 'img' && !attributes.some(attribute => attribute.startsWith('src='))) continue;
    output.push(`<${tag}${attributes.length ? ` ${attributes.join(' ')}` : ''}>`);
    if (!VOID_TAGS.has(tag) && !parsed.selfClosing) openTags.push(tag);
  }

  while (openTags.length) output.push(`</${openTags.pop()}>`);
  return output.join('').trim();
}

function plainText(value) {
  return decodeHtmlEntities(sanitiseRichHtml(value).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function clampText(value, max) {
  const text = plainText(value);
  if (text.length <= max) return text;
  return text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function renderBlogPage(blog, slug) {
  const url = `${SITE}/blog/${slug}.html`;
  const headline = plainText(blog.title) || 'Desk2Quant quant finance article';
  const title = seoTitle(headline);
  const description = metaDescription(plainText(blog.excerpt || blog.content), 158) ||
    'A practitioner-written quantitative finance article from Desk2Quant.';
  const image = safeUrl(blog.cover_image_url || '', { image: true, absolute: true }) ||
    `${SITE}/assets/images/desk2quant-editorial-og.jpg`;
  const richContent = sanitiseRichHtml(blog.content || blog.excerpt);
  const mathSource = `${blog.content || ''}\n${blog.excerpt || ''}`;
  const needsMathJax = /(?:\$\$[\s\S]+?\$\$|(^|[^\\])\$(?!\s)(?:\\.|[^$\n])+\$|\\(?:\(|\[|frac\b|sqrt\b|sum\b|int\b|mathbb\b|mathrm\b|sigma\b|theta\b|rho\b|kappa\b|xi\b|Delta\b|Gamma\b))/m.test(mathSource);
  const mathJax = needsMathJax ? `<script>
window.MathJax = {
  tex: { inlineMath: [['$', '$'], ['\\\\(', '\\\\)']], displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']] },
  options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" async></script>` : '';

  const article = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline,
    description,
    image: [image],
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Person', name: 'Amit Kumar Jha' },
    publisher: {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: 'Desk2Quant',
      logo: { '@type': 'ImageObject', url: `${SITE}/assets/images/desk2quant-logo.png?v=3` }
    },
    inLanguage: 'en'
  };
  if (blog.created_at) article.datePublished = blog.created_at;
  if (blog.updated_at || blog.created_at) article.dateModified = blog.updated_at || blog.created_at;

  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Articles', item: `${SITE}/blog.html` },
      { '@type': 'ListItem', position: 3, name: headline, item: url }
    ]
  };

  const published = blog.created_at
    ? new Date(blog.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script>/* CANONICAL-HOST-GUARD v1 */!function(){try{var h=location.hostname.toLowerCase(),d=/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(h);if(!d&&h!=='desk2quant.com')location.replace('https://desk2quant.com'+location.pathname+location.search+location.hash)}catch(e){}}();</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(url)}">
<meta name="google-site-verification" content="google4995af590646a7a2">
<meta name="msvalidate.01" content="7afbcd7bddd64cab99b826937d973894">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Desk2Quant">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<script type="application/ld+json">${safeJson(article)}</script>
<script type="application/ld+json">${safeJson(crumbs)}</script>
<link rel="icon" type="image/png" href="/assets/images/desk2quant-logo.png?v=3">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/seo-product.css?v=1">
${mathJax}
</head>
<body>
<main class="seo-doc">
  <nav class="seo-crumbs" aria-label="Breadcrumb">
    <a href="/">Home</a> <span>/</span>
    <a href="/blog.html">Articles</a> <span>/</span>
    <span aria-current="page">${esc(headline)}</span>
  </nav>
  <article>
    <p class="seo-kicker">Quant finance article${published ? ` &middot; ${esc(published)}` : ''}</p>
    <h1>${esc(headline)}</h1>
    <p><img src="${esc(image)}" alt="${esc(headline)}" width="840" fetchpriority="high"></p>
    <div class="seo-article-body">
${richContent.split('\n').map(line => `      ${line}`).join('\n') || `      <p>${esc(description)}</p>`}
    </div>
    <hr>
    <p>Continue with the <a href="/guides/">quant interview guides</a> or browse the
      <a href="/products/">Desk2Quant resource catalog</a>.</p>
  </article>
</main>
${FOOTER_HTML}
</body>
</html>
`.replace(/[ \t]+$/gm, '');
}

module.exports = { getBlogSlug, renderBlogPage, sanitiseRichHtml };
