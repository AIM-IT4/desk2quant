const { esc, clamp, stripHtml, SITE } = require('./generate-seo-pages.js');

function renderPage(p, slug, related) {
  const url = `${SITE}/products/${slug}.html`;
  const canonicalApp = `${SITE}/product.html?id=${p.id}`;
  const title = `${p.name} | Desk2Quant`;
  const desc = clamp(p.description, 158) ||
    'Practitioner-built quantitative finance resource from Desk2Quant.';
  const img = p.cover_image_url || `${SITE}/assets/images/desk2quant-logo.png`;
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
  if (p.average_rating && Number(p.average_rating) > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(p.average_rating),
      reviewCount: String(p.sales_count && p.sales_count > 0 ? p.sales_count : 1)
    };
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
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="icon" type="image/png" href="/assets/images/desk2quant-logo.png?v=3">
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
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/seo-product.css?v=1">
</head>
<body>
<main class="seo-doc">
  <nav class="seo-crumbs" aria-label="Breadcrumb">
    <a href="/">Home</a> <span>/</span>
    <a href="/products/">Resources</a> <span>/</span>
    <span aria-current="page">${esc(p.name)}</span>
  </nav>

  <article>
    <h1>${esc(p.name)}</h1>
    <p class="seo-price"><strong>&#8377;${esc(price)}</strong>${p.average_rating ? ` &middot; rated ${esc(p.average_rating)}/5` : ''}${p.sales_count ? ` &middot; ${esc(p.sales_count)} purchases` : ''}</p>

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

    ${relHtml ? `<h2>Related resources</h2>\n    <ul>\n${relHtml}\n    </ul>` : ''}

    <p class="seo-cta-row">
      <a class="seo-cta" href="/product.html?id=${esc(p.id)}">Get ${esc(p.name)}</a>
    </p>
  </article>
</main>
</body>
</html>
`;
}

module.exports = { renderPage };
