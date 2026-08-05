const fs = require('fs');
const path = require('path');
const { slugify, fetchProducts, fetchProductReviews, esc, clamp, SITE, OUT_DIR } = require('./generate-seo-pages.js');
const { renderPage } = require('./seo-template.js');

const STATIC_PAGES = [
  ['/', '1.0'], ['/desk-simulator.html', '0.9'], ['/interview.html', '0.8'],
  ['/blog.html', '0.8'], ['/faq.html', '0.6'], ['/code-playground.html', '0.6'],
  ['/products/', '0.9'], ['/gauntlet.html', '0.8'], ['/gauntlet-playground.html', '0.7'],
  ['/privacy.html', '0.3'], ['/terms.html', '0.3']
];

async function main() {
  let products;
  try {
    products = await fetchProducts();
  } catch (e) {
    console.warn('[seo] Could not fetch products (' + e.message + '). Skipping SEO generation; existing files kept.');
    return;
  }
  if (!Array.isArray(products) || !products.length) {
    console.warn('[seo] No products returned. Skipping.');
    return;
  }

  // Real per-product reviews for JSON-LD aggregateRating/review. Non-fatal --
  // a fetch failure here should not block the whole SEO build, it just means
  // pages ship without review markup instead of with truthful ratings.
  let reviewsByProduct = {};
  try {
    reviewsByProduct = await fetchProductReviews();
  } catch (e) {
    console.warn('[seo] Could not fetch product reviews (' + e.message + '). Pages will ship without aggregateRating/review.');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Assign unique slugs.
  const seen = new Map();
  products.forEach(p => {
    let s = slugify(p.name);
    if (seen.has(s)) { const n = seen.get(s) + 1; seen.set(s, n); s = `${s}-${n}`; }
    else seen.set(s, 1);
    p.__slug = s;
  });

  products.forEach(p => {
    const related = products
      .filter(r => r.id !== p.id)
      .slice(0, 5)
      .map(r => ({ slug: r.__slug, name: r.name }));
    const reviews = reviewsByProduct[p.id] || [];
    fs.writeFileSync(path.join(OUT_DIR, `${p.__slug}.html`), renderPage(p, p.__slug, related, reviews), 'utf8');
  });

  // Hub page listing every resource.
  const items = products.map(p =>
    `      <li><a href="/products/${esc(p.__slug)}.html">${esc(p.name)}</a> &mdash; <span>${esc(clamp(p.description, 110))}</span></li>`
  ).join('\n');

  const hub = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Quant Finance Resources (${products.length}) | Desk2Quant</title>
<meta name="description" content="Browse all ${products.length} Desk2Quant resources: derivatives pricing, XVA, model validation, numerical methods, interview preparation and more.">
<link rel="canonical" href="${SITE}/products/">
<meta name="robots" content="index,follow">
<link rel="icon" type="image/png" href="/assets/images/desk2quant-logo.png?v=3">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/products/">
<meta property="og:title" content="All Quant Finance Resources | Desk2Quant">
<meta property="og:description" content="Browse all ${products.length} practitioner-built quant finance resources.">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/seo-product.css?v=1">
</head>
<body>
<main class="seo-doc">
  <nav class="seo-crumbs" aria-label="Breadcrumb">
    <a href="/">Home</a> <span>/</span> <span aria-current="page">Resources</span>
  </nav>
  <h1>All Desk2Quant resources</h1>
  <p>${products.length} practitioner-built resources covering pricing, risk, model validation and interview preparation.</p>
  <ul class="seo-list">
${items}
  </ul>
</main>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), hub, 'utf8');

  // Sitemap.
  const today = new Date().toISOString().slice(0, 10);
  const urls = STATIC_PAGES.map(([loc, pri]) =>
    `  <url><loc>${SITE}${loc}</loc><lastmod>${today}</lastmod><priority>${pri}</priority></url>`
  ).concat(products.map(p =>
    `  <url><loc>${SITE}/products/${p.__slug}.html</loc><lastmod>${today}</lastmod><priority>0.8</priority></url>`
  ));

  fs.writeFileSync(path.join(__dirname, '..', 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 'utf8');

  console.log(`[seo] Generated ${products.length} product pages + hub + sitemap (${urls.length} URLs).`);
}

main().catch(e => { console.warn('[seo] non-fatal:', e.message); });
