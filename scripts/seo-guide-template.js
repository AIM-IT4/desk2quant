'use strict';

const fs = require('fs');
const path = require('path');
const { GUIDES } = require('./seo-guides-data.js');

const SITE = 'https://desk2quant.com';
const GUIDE_ROOT = '/guides/';
const DEFAULT_OUT_DIR = path.join(__dirname, '..', 'guides');
const PROJECT_ROOT = path.join(__dirname, '..');
const SOCIAL_IMAGE = `${SITE}/assets/images/desk2quant-editorial-og.jpg`;
const PUBLISHED = '2026-08-11';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function guideUrl(guide) {
  return `${SITE}${GUIDE_ROOT}${guide.slug}.html`;
}

function renderList(items, className) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<ul${className ? ` class="${esc(className)}"` : ''}>\n${items.map(item => `  <li>${esc(item)}</li>`).join('\n')}\n</ul>`;
}

function renderTable(table) {
  if (!table) return '';
  const head = table.headers.map(header => `<th scope="col">${esc(header)}</th>`).join('');
  const rows = table.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('\n');
  return `<div class="guide-table-wrap" tabindex="0" role="region" aria-label="${esc(table.caption)}">
    <table class="guide-table">
      <caption>${esc(table.caption)}</caption>
      <thead><tr>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderSection(section) {
  return `<section class="guide-section" id="${esc(section.id)}">
    <h2>${esc(section.title)}</h2>
    ${(section.paragraphs || []).map(paragraph => `<p>${esc(paragraph)}</p>`).join('\n    ')}
    ${renderList(section.bullets, 'guide-bullet-list')}
    ${renderTable(section.table)}
    ${section.callout ? `<aside class="guide-callout"><h3>${esc(section.callout.title)}</h3><p>${esc(section.callout.text)}</p></aside>` : ''}
  </section>`;
}

function renderHeader() {
  return `<a class="guide-skip-link" href="#guide-content">Skip to guide content</a>
<header class="guide-site-header">
  <div class="guide-site-header__inner">
    <a class="guide-brand" href="/" aria-label="Desk2Quant home">
      <img src="/assets/images/desk2quant-favicon.svg" width="36" height="36" alt="">
      <span>Desk2Quant</span>
    </a>
    <nav class="guide-site-nav" aria-label="Primary navigation">
      <a href="/guides/">Guides</a>
      <a href="/products/">Resources</a>
      <a href="/desk-simulator.html">Desk Simulator</a>
      <a class="guide-site-nav__cta" href="/interview.html">AI Interview</a>
    </nav>
  </div>
</header>`;
}

function renderFooter() {
  return `<footer class="guide-footer">
  <div class="guide-footer__inner">
    <div>
      <a class="guide-brand guide-brand--footer" href="/">Desk2Quant</a>
      <p>Practitioner-built preparation for quantitative finance interviews and desk work.</p>
    </div>
    <nav aria-label="Footer navigation">
      <a href="/guides/">All guides</a>
      <a href="/products/">All resources</a>
      <a href="/faq.html">FAQ</a>
      <a href="/privacy.html">Privacy</a>
      <a href="/terms.html">Terms</a>
    </nav>
  </div>
</footer>`;
}

function renderHead({ title, description, canonical, type = 'article', jsonLd = [], articleType }) {
  const articleMeta = articleType ? `
<meta property="article:published_time" content="${PUBLISHED}">
<meta property="article:modified_time" content="${PUBLISHED}">
<meta property="article:section" content="Quantitative Finance Education">` : '';
  return `<head>
<script>/* Canonical host guard; permanent redirects are configured at the edge. */!function(){try{var p=location.protocol,h=location.hostname.toLowerCase(),local=['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(h)>-1;if(/^https?:$/.test(p)&&!local&&h!=='desk2quant.com')location.replace('https://desk2quant.com'+location.pathname+location.search+location.hash)}catch(e){}}();</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="Desk2Quant Editorial Team">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" type="image/svg+xml" href="/assets/images/desk2quant-favicon.svg">
<meta property="og:type" content="${esc(type)}">
<meta property="og:site_name" content="Desk2Quant">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SOCIAL_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">${articleMeta}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:url" content="${esc(canonical)}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SOCIAL_IMAGE}">
${jsonLd.map(data => `<script type="application/ld+json">${safeJson(data)}</script>`).join('\n')}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/seo-guide.css?v=1">
</head>`;
}

function renderGuide(guide) {
  const canonical = guideUrl(guide);
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': guide.schemaType,
    headline: guide.h1,
    name: guide.h1,
    description: guide.description,
    image: { '@type': 'ImageObject', url: SOCIAL_IMAGE, width: 1200, height: 630 },
    datePublished: PUBLISHED,
    dateModified: PUBLISHED,
    inLanguage: 'en',
    isAccessibleForFree: true,
    proficiencyLevel: 'Intermediate',
    keywords: guide.keywords.join(', '),
    author: { '@type': 'Organization', name: 'Desk2Quant Editorial Team', url: `${SITE}/` },
    publisher: {
      '@type': 'Organization',
      name: 'Desk2Quant',
      url: `${SITE}/`,
      logo: { '@type': 'ImageObject', url: `${SITE}/assets/images/desk2quant-mark.svg?v=1` }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    isPartOf: { '@type': 'WebSite', name: 'Desk2Quant', url: `${SITE}/` }
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Quant Finance Guides', item: `${SITE}${GUIDE_ROOT}` },
      { '@type': 'ListItem', position: 3, name: guide.h1, item: canonical }
    ]
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faq.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer }
    }))
  };
  const related = guide.relatedSlugs.map(slug => GUIDES.find(item => item.slug === slug));
  const toc = guide.sections.map(section => `<li><a href="#${esc(section.id)}">${esc(section.title.replace(/^\d+\.\s*/, ''))}</a></li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
${renderHead({ title: guide.metaTitle, description: guide.description, canonical, jsonLd: [articleLd, breadcrumbLd, faqLd], articleType: guide.schemaType })}
<body class="guide-page">
${renderHeader()}
<main id="guide-content" class="guide-main">
  <nav class="guide-crumbs" aria-label="Breadcrumb">
    <a href="/">Home</a><span aria-hidden="true">/</span><a href="/guides/">Guides</a><span aria-hidden="true">/</span><span aria-current="page">${esc(guide.h1)}</span>
  </nav>
  <article>
    <header class="guide-hero">
      <p class="guide-eyebrow">${esc(guide.eyebrow)}</p>
      <h1>${esc(guide.h1)}</h1>
      <p class="guide-dek">${esc(guide.description)}</p>
      <div class="guide-meta"><span>Desk2Quant Editorial Team</span><span>${esc(guide.readTime)} minute read</span><time datetime="${PUBLISHED}">Updated August 11, 2026</time></div>
    </header>

    <div class="guide-layout">
      <aside class="guide-toc" aria-label="On this page">
        <p class="guide-toc__title">On this page</p>
        <ol>${toc}
          <li><a href="#interview-drills">Interview drills</a></li>
          <li><a href="#study-plan">Study plan</a></li>
          <li><a href="#frequent-mistakes">Frequent mistakes</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ol>
      </aside>

      <div class="guide-article-body">
        <div class="guide-intro">
          ${guide.intro.map(paragraph => `<p>${esc(paragraph)}</p>`).join('\n          ')}
        </div>

        <aside class="guide-answer-box" aria-label="Quick answer">
          <p class="guide-answer-box__label">Quick answer</p>
          <p>${esc(guide.quickAnswer)}</p>
        </aside>

        <section class="guide-outcomes" aria-labelledby="outcomes-title">
          <h2 id="outcomes-title">What this guide helps you do</h2>
          ${renderList(guide.outcomes, 'guide-check-list')}
        </section>

        ${guide.sections.map(renderSection).join('\n\n        ')}

        <section class="guide-section" id="interview-drills">
          <p class="guide-section-kicker">Practise aloud</p>
          <h2>Interview drills with answer direction</h2>
          <div class="guide-drills">
            ${guide.drills.map((drill, index) => `<article class="guide-drill">
              <p class="guide-drill__number">Question ${index + 1}</p>
              <h3>${esc(drill.question)}</h3>
              <p><strong>Answer direction:</strong> ${esc(drill.answer)}</p>
            </article>`).join('\n            ')}
          </div>
        </section>

        <section class="guide-section" id="study-plan">
          <p class="guide-section-kicker">Turn reading into practice</p>
          <h2>A focused study plan</h2>
          <ol class="guide-plan">
            ${guide.plan.map(step => `<li><span>${esc(step.label)}</span><div><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></div></li>`).join('\n            ')}
          </ol>
        </section>

        <section class="guide-section" id="frequent-mistakes">
          <p class="guide-section-kicker">Self-review</p>
          <h2>Frequent mistakes to catch early</h2>
          ${renderList(guide.pitfalls, 'guide-warning-list')}
        </section>

        <section class="guide-resources" aria-labelledby="resources-title">
          <p class="guide-section-kicker">Continue with structured practice</p>
          <h2 id="resources-title">Relevant Desk2Quant resources</h2>
          <div class="guide-resource-grid">
            ${guide.resources.map(resource => `<article><h3><a href="${esc(resource.href)}">${esc(resource.title)}</a></h3><p>${esc(resource.context)}</p><a class="guide-text-link" href="${esc(resource.href)}">Explore this resource <span aria-hidden="true">&rarr;</span></a></article>`).join('\n            ')}
          </div>
        </section>

        <section class="guide-section" aria-labelledby="related-title">
          <p class="guide-section-kicker">Keep building</p>
          <h2 id="related-title">Related quant finance guides</h2>
          <div class="guide-related-grid">
            ${related.map(item => `<a href="/guides/${esc(item.slug)}.html"><span>${esc(item.eyebrow)}</span><strong>${esc(item.h1)}</strong><small>${esc(item.description)}</small></a>`).join('\n            ')}
          </div>
        </section>

        <section class="guide-section guide-faq" id="faq">
          <p class="guide-section-kicker">Common questions</p>
          <h2>Frequently asked questions</h2>
          ${guide.faq.map(item => `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('\n          ')}
        </section>

        <aside class="guide-next-step">
          <div><p class="guide-section-kicker">Practise under pressure</p><h2>Turn the framework into a live answer</h2><p>Use the free AI interview practice tool, then review your assumptions, structure, checks, and conclusion.</p></div>
          <a href="/interview.html">Start an AI interview</a>
        </aside>
      </div>
    </div>
  </article>
</main>
${renderFooter()}
</body>
</html>
`;
}

function renderGuidesIndex() {
  const canonical = `${SITE}${GUIDE_ROOT}`;
  const description = 'Explore practical Desk2Quant guides for quant interviews, C++, Python, stochastic calculus, numerical methods, model validation, risk, and XVA.';
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Quant Finance Guides', item: canonical }
    ]
  };
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Quant Finance Interview and Technical Guides',
    description,
    url: canonical,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'Desk2Quant', url: `${SITE}/` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: GUIDES.length,
      itemListElement: GUIDES.map((guide, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: guide.h1,
        url: guideUrl(guide)
      }))
    }
  };

  return `<!DOCTYPE html>
<html lang="en">
${renderHead({ title: 'Quant Finance Interview & Technical Guides | Desk2Quant', description, canonical, type: 'website', jsonLd: [collectionLd, breadcrumbLd] })}
<body class="guide-page guide-index-page">
${renderHeader()}
<main id="guide-content" class="guide-main">
  <nav class="guide-crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span aria-current="page">Guides</span></nav>
  <header class="guide-index-hero">
    <p class="guide-eyebrow">Desk2Quant learning library</p>
    <h1>Quant finance interview and technical guides</h1>
    <p>Clear, desk-aware preparation for the questions, code, models, numerical methods, and judgment that quantitative roles demand.</p>
  </header>
  <section class="guide-index-route" aria-labelledby="route-title">
    <div><p class="guide-section-kicker">Choose a starting point</p><h2 id="route-title">Build the common core, then specialize</h2></div>
    <ol>
      <li><span>01</span><div><strong>Start broad</strong><p>Map the role and secure probability, statistics, coding, and finance foundations.</p></div></li>
      <li><span>02</span><div><strong>Choose your track</strong><p>Go deeper in development, risk, validation, pricing mathematics, or XVA.</p></div></li>
      <li><span>03</span><div><strong>Practise aloud</strong><p>Use the drills and plans to turn reading into timed, testable interview performance.</p></div></li>
    </ol>
  </section>
  <section class="guide-index-grid" aria-label="All quant finance guides">
    ${GUIDES.map((guide, index) => `<article>
      <div class="guide-index-card__meta"><span>${String(index + 1).padStart(2, '0')}</span><span>${esc(guide.readTime)} min</span></div>
      <p class="guide-section-kicker">${esc(guide.eyebrow)}</p>
      <h2><a href="/guides/${esc(guide.slug)}.html">${esc(guide.h1)}</a></h2>
      <p>${esc(guide.description)}</p>
      <a class="guide-text-link" href="/guides/${esc(guide.slug)}.html">Read the guide <span aria-hidden="true">&rarr;</span></a>
    </article>`).join('\n    ')}
  </section>
  <aside class="guide-next-step guide-index-cta">
    <div><p class="guide-section-kicker">Apply what you learn</p><h2>Practise with desk-ready resources</h2><p>Move from topic maps to worked problems, runnable code, case studies, and full technical playbooks.</p></div>
    <a href="/products/">Browse all resources</a>
  </aside>
</main>
${renderFooter()}
</body>
</html>
`;
}

function validateGuides() {
  const expected = [
    'quant-interview-guide', 'quant-interview-questions', 'quant-developer-interview',
    'risk-quant-interview', 'model-validation-interview', 'cpp-quant-interview',
    'python-quant-interview', 'stochastic-calculus-interview',
    'xva-interview-questions', 'numerical-methods-quant-finance'
  ];
  const slugs = GUIDES.map(guide => guide.slug);
  if (GUIDES.length !== expected.length || expected.some(slug => !slugs.includes(slug))) {
    throw new Error(`Guide data must contain exactly the ${expected.length} required slugs.`);
  }
  if (new Set(slugs).size !== slugs.length) throw new Error('Guide slugs must be unique.');

  for (const guide of GUIDES) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.slug)) throw new Error(`Invalid guide slug: ${guide.slug}`);
    if (!['Article', 'TechArticle'].includes(guide.schemaType)) throw new Error(`Invalid schema type for ${guide.slug}.`);
    if (!guide.metaTitle || !guide.description || !guide.h1 || !guide.quickAnswer) throw new Error(`Missing core SEO copy for ${guide.slug}.`);
    if (guide.description.length < 110 || guide.description.length > 170) throw new Error(`Meta description length is outside 110-170 characters for ${guide.slug}.`);
    if (!Array.isArray(guide.sections) || guide.sections.length < 5) throw new Error(`At least five sections are required for ${guide.slug}.`);
    if (!Array.isArray(guide.drills) || guide.drills.length < 4) throw new Error(`At least four drills are required for ${guide.slug}.`);
    if (!Array.isArray(guide.faq) || guide.faq.length < 4) throw new Error(`At least four FAQ entries are required for ${guide.slug}.`);
    if (!Array.isArray(guide.resources) || guide.resources.length < 2) throw new Error(`At least two contextual product links are required for ${guide.slug}.`);
    if (!Array.isArray(guide.relatedSlugs) || guide.relatedSlugs.some(slug => !slugs.includes(slug))) throw new Error(`Broken related-guide link in ${guide.slug}.`);
    const sectionIds = guide.sections.map(section => section.id);
    if (new Set(sectionIds).size !== sectionIds.length) throw new Error(`Duplicate section id in ${guide.slug}.`);
    for (const resource of guide.resources) {
      if (!resource.href.startsWith('/products/') || !resource.href.endsWith('.html')) throw new Error(`Invalid product link in ${guide.slug}: ${resource.href}`);
      const file = path.join(PROJECT_ROOT, ...resource.href.slice(1).split('/'));
      if (!fs.existsSync(file)) throw new Error(`Product link does not resolve for ${guide.slug}: ${resource.href}`);
    }
  }
}

function renderAllGuides(outDir = DEFAULT_OUT_DIR) {
  validateGuides();
  const resolvedOutDir = path.resolve(outDir);
  fs.mkdirSync(resolvedOutDir, { recursive: true });
  const files = [];
  for (const guide of GUIDES) {
    const output = path.join(resolvedOutDir, `${guide.slug}.html`);
    fs.writeFileSync(output, renderGuide(guide).replace(/[ \t]+$/gm, ''), 'utf8');
    files.push(output);
  }
  const indexOutput = path.join(resolvedOutDir, 'index.html');
  fs.writeFileSync(indexOutput, renderGuidesIndex().replace(/[ \t]+$/gm, ''), 'utf8');
  files.push(indexOutput);
  return { outDir: resolvedOutDir, files };
}

if (require.main === module) {
  const result = renderAllGuides(process.argv[2] || DEFAULT_OUT_DIR);
  console.log(`[seo-guides] Generated ${GUIDES.length} guides and hub in ${result.outDir}.`);
}

module.exports = {
  SITE,
  GUIDE_ROOT,
  renderGuide,
  renderGuidesIndex,
  renderAllGuides,
  validateGuides
};
