const { esc, clamp, stripHtml, SITE } = require('./generate-seo-pages.js');

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function renderPage(p, slug, related, reviews) {
  const url = `${SITE}/products/${slug}.html`;
  const title = `${p.name} | Desk2Quant`;
  const desc = clamp(p.description, 158) ||
    'Practitioner-built quantitative finance resource from Desk2Quant.';
  const img = p.cover_image_url || `${SITE}/assets/images/desk2quant-mark.svg?v=1`;
  const price = Number(p.price) || 0;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: desc,
    image: img,
    url,
    brand: { '@type': 'Brand', name: 'Desk2Quant' },
    offers: {
      '@type': 'Offer', url, priceCurrency: 'INR',
      price: String(price), availability: 'https://schema.org/InStock'
    }
  };
  // aggregateRating/review must reflect REAL reviews, not sales_count or a
  // placeholder average_rating -- schema.org (and Google) treat fabricated
  // ratings as a policy violation, not just a missed enhancement. Products
  // with no linked reviews get neither field, which is correct and truthful.
  const realReviews = Array.isArray(reviews) ? reviews.filter(r => r && r.rating && r.review) : [];
  if (realReviews.length) {
    const avg = realReviews.reduce((sum, r) => sum + Number(r.rating), 0) / realReviews.length;
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(Math.round(avg * 10) / 10),
      reviewCount: String(realReviews.length)
    };
    jsonLd.review = realReviews.slice(0, 10).map(r => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.name || 'Verified buyer' },
      reviewRating: { '@type': 'Rating', ratingValue: String(r.rating), bestRating: '5' },
      reviewBody: clamp(r.review, 400)
    }));
  }

  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Resources', item: `${SITE}/products/` },
      { '@type': 'ListItem', position: 3, name: p.name, item: url }
    ]
  };

  const faqItems = [
    {
      question: `How is ${p.name} delivered?`,
      answer: 'Access is delivered digitally by email after payment is verified. Keep the purchase email so you can find the delivery link later.'
    },
    {
      question: `Who is ${p.name} designed for?`,
      answer: 'It is designed for quantitative-finance candidates and practitioners who want desk-focused explanations, practical diagnostics and interview-ready reasoning.'
    },
    {
      question: 'Where can I review the price and purchase details?',
      answer: 'Use the product details link on this page to review the current price, any available offer and the secure checkout information before buying.'
    }
  ];
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer }
    }))
  };

  const body = stripHtml(p.description);
  const paras = body
    ? body.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).reduce((acc, s) => {
        if (!acc.length) acc.push(s);
        else if (acc[acc.length - 1].length < 260) acc[acc.length - 1] += ' ' + s;
        else acc.push(s);
        return acc;
      }, []).slice(0, 6)
    : [];

  const relHtml = related.map(r =>
    `        <li><a href="/products/${esc(r.slug)}.html">${esc(r.name)}</a></li>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script>/* CANONICAL-HOST-GUARD v1: Razorpay is registered to desk2quant.com - force canonical host + root path before any checkout code runs. */!function(){try{var h=location.hostname.toLowerCase(),dev=/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(h);if(!dev&&h!=='desk2quant.com'){location.replace('https://desk2quant.com'+location.pathname+location.search+location.hash)}else if(location.pathname==='/index.html'){location.replace('https://desk2quant.com/'+location.search+location.hash)}}catch(e){}}();</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="icon" type="image/svg+xml" href="/assets/images/desk2quant-favicon.svg">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Desk2Quant">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<script type="application/ld+json">${safeJson(jsonLd)}</script>
<script type="application/ld+json">${safeJson(crumbs)}</script>
<script type="application/ld+json">${safeJson(faq)}</script>
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/launchzone.css?v=8">
<link rel="stylesheet" href="/launchzone-pages.css?v=10">
<link rel="stylesheet" href="/seo-product.css?v=3">
</head>
<body class="d2q-launchzone">
<header class="seo-topbar">
  <div class="seo-topbar-inner">
    <a class="seo-brand" href="/"><img src="/assets/images/desk2quant-mark.svg" width="30" height="30" alt="Desk2Quant mark"><span>Desk2Quant</span></a>
    <nav class="seo-topnav" aria-label="Site">
      <a href="/products/">Resources</a>
      <a href="/guides/">Guides</a>
      <a href="/interview.html">AI Interview</a>
      <a href="/gauntlet.html">Gauntlet</a>
      <a href="/faq.html">FAQs</a>
    </nav>
  </div>
</header>
<main class="seo-doc">
  <nav class="seo-crumbs" aria-label="Breadcrumb">
    <a href="/">Home</a> <span>/</span>
    <a href="/products/">Resources</a> <span>/</span>
    <span aria-current="page">${esc(p.name)}</span>
  </nav>

  <article>
    <h1>${esc(p.name)}</h1>
    <p class="seo-price"><strong>&#8377;${esc(price)}</strong></p>

    ${p.coupon_code ? `<p class="seo-coupon"><strong>Use coupon code ${esc(p.coupon_code)} at checkout for ${esc(p.discount_percentage || 10)}% off.</strong></p>` : ''}

    <p class="seo-cta-row">
      <a class="seo-cta" href="/product.html?id=${esc(p.id)}">View details &amp; buy</a>
    </p>

    ${img ? `<p><img src="${esc(img)}" alt="${esc(p.name)} cover" width="420" loading="lazy"></p>` : ''}

    <h2>About this resource</h2>
${paras.map(t => `    <p>${esc(t)}</p>`).join('\n') || '    <p>Practitioner-built quantitative finance material from Desk2Quant.</p>'}

    <h2>What you get</h2>
    <ul>
      <li>Instant digital delivery by email after purchase</li>
      <li>Written by a practising quantitative risk modeller</li>
      <li>Desk-focused material, not textbook theory</li>
    </ul>

    <h2>Delivery &amp; refunds</h2>
    <p>Access is delivered by email immediately after payment. See our
      <a href="/terms.html">terms</a> and <a href="/privacy.html">privacy policy</a>.</p>

    <section aria-labelledby="product-faq-heading">
      <h2 id="product-faq-heading">Frequently asked questions</h2>
${faqItems.map(item => `      <h3>${esc(item.question)}</h3>\n      <p>${esc(item.answer)}</p>`).join('\n')}
    </section>

    ${relHtml ? `<h2>Related resources</h2>\n    <ul>\n${relHtml}\n    </ul>` : ''}

    <p class="seo-cta-row">
      <a class="seo-cta" href="/product.html?id=${esc(p.id)}">Get ${esc(p.name)}</a>
    </p>
  </article>
</main>
<footer class="seo-footer">
  <div class="seo-footer-inner">
    <span>&copy; Desk2Quant</span>
    <span>
      <a href="/terms.html">Terms</a> &middot;
      <a href="/refund.html">Refunds</a> &middot;
      <a href="/privacy.html">Privacy</a> &middot;
      <a href="mailto:hello@desk2quant.com">hello@desk2quant.com</a>
    </span>
  </div>
</footer>
</body>
</html>
`;
}

module.exports = { renderPage };
