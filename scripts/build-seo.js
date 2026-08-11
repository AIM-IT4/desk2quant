const fs = require('fs');
const path = require('path');
const {
  getProductSlug,
  fetchProducts,
  fetchBlogs,
  fetchProductReviews,
  esc,
  clamp,
  SITE,
  OUT_DIR
} = require('./generate-seo-pages.js');
const { renderPage } = require('./seo-template.js');
const { getBlogSlug, renderBlogPage } = require('./blog-seo-template.js');
const { renderAllGuides } = require('./seo-guide-template.js');
const { GUIDES } = require('./seo-guides-data.js');

const BLOG_OUT_DIR = path.join(__dirname, '..', 'blog');

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

const STATIC_PAGES = [
  ['/', '1.0'], ['/desk-simulator.html', '0.9'], ['/interview.html', '0.8'],
  ['/blog.html', '0.8'], ['/faq.html', '0.6'], ['/code-playground.html', '0.6'],
  ['/products/', '0.9'], ['/guides/', '0.9'], ['/gauntlet.html', '0.8'], ['/gauntlet-playground.html', '0.7'],
  ['/resources.html', '0.7'], ['/testimonials.html', '0.6'], ['/salary-explorer.html', '0.6'],
  ['/share-salary.html', '0.5'], ['/refund.html', '0.3'], ['/privacy.html', '0.3'],
  ['/terms.html', '0.3']
];

function assertNonEmptyPublishedBlogs(blogs) {
  if (!Array.isArray(blogs) || blogs.length === 0) {
    throw new Error('Invalid or empty published blogs response; refusing to delete or deploy article pages.');
  }
  return blogs;
}

async function main() {
  let products;
  try {
    products = await fetchProducts();
  } catch (e) {
    throw new Error('Could not fetch products; refusing to deploy stale SEO pages (' + e.message + ').');
  }
  if (!Array.isArray(products) || !products.length) {
    throw new Error('No products returned; refusing to deploy an empty or stale SEO catalog.');
  }

  let blogs;
  try {
    blogs = await fetchBlogs();
  } catch (e) {
    throw new Error('Could not fetch blogs; refusing to deploy stale article pages (' + e.message + ').');
  }
  assertNonEmptyPublishedBlogs(blogs);

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

  // Assign deterministic slugs. Curated high-value slugs are keyed by stable
  // product ID in product-seo.js, so marketing-name edits cannot move them.
  const seen = new Map();
  products.forEach(p => {
    const slug = getProductSlug(p);
    const previous = seen.get(slug);
    if (previous) {
      throw new Error(`Duplicate SEO slug "${slug}" for product IDs ${previous} and ${p.id}. Add a curated ID mapping.`);
    }
    seen.set(slug, p.id);
    p.__slug = slug;
  });

  const seenBlogSlugs = new Map();
  blogs.forEach(blog => {
    const slug = getBlogSlug(blog);
    const previous = seenBlogSlugs.get(slug);
    if (previous) {
      throw new Error(`Duplicate blog slug "${slug}" for blog IDs ${previous} and ${blog.id}.`);
    }
    seenBlogSlugs.set(slug, blog.id);
    blog.__slug = slug;
  });

  // The directory is generated output. Clean it only after a valid catalog
  // has been fetched and validated so renamed/deleted products cannot leave
  // duplicate indexable HTML behind.
  for (const filename of fs.readdirSync(OUT_DIR)) {
    if (filename.endsWith('.html')) fs.unlinkSync(path.join(OUT_DIR, filename));
  }

  products.forEach(p => {
    const related = products
      .filter(r => r.id !== p.id)
      .slice(0, 5)
      .map(r => ({ slug: r.__slug, name: r.name }));
    const reviews = reviewsByProduct[p.id] || [];
    fs.writeFileSync(path.join(OUT_DIR, `${p.__slug}.html`), renderPage(p, p.__slug, related, reviews), 'utf8');
  });

  fs.mkdirSync(BLOG_OUT_DIR, { recursive: true });
  for (const filename of fs.readdirSync(BLOG_OUT_DIR)) {
    if (filename.endsWith('.html')) fs.unlinkSync(path.join(BLOG_OUT_DIR, filename));
  }
  blogs.forEach(blog => {
    fs.writeFileSync(
      path.join(BLOG_OUT_DIR, `${blog.__slug}.html`),
      renderBlogPage(blog, blog.__slug),
      'utf8'
    );
  });

  renderAllGuides(path.join(__dirname, '..', 'guides'));

  // Hub page listing every resource.
  const items = products.map(p =>
    `      <li><a href="/products/${esc(p.__slug)}.html">${esc(p.name)}</a> &mdash; <span>${esc(clamp(p.description, 110))}</span></li>`
  ).join('\n');

  const hubJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/products/#collection`,
        url: `${SITE}/products/`,
        name: 'All Quant Finance Resources | Desk2Quant',
        description: `Browse all ${products.length} practitioner-built Desk2Quant resources.`,
        isPartOf: { '@id': `${SITE}/#website` }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Resources', item: `${SITE}/products/` }
        ]
      },
      {
        '@type': 'ItemList',
        numberOfItems: products.length,
        itemListElement: products.map((p, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE}/products/${p.__slug}.html`,
          name: p.name
        }))
      }
    ]
  };

  const hub = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Quant Finance Resources (${products.length}) | Desk2Quant</title>
<meta name="description" content="Browse all ${products.length} Desk2Quant resources: derivatives pricing, XVA, model validation, numerical methods, interview preparation and more.">
<link rel="canonical" href="${SITE}/products/">
<meta name="robots" content="index,follow">
<link rel="icon" type="image/svg+xml" href="/assets/images/desk2quant-favicon.svg">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/products/">
<meta property="og:title" content="All Quant Finance Resources | Desk2Quant">
<meta property="og:description" content="Browse all ${products.length} practitioner-built quant finance resources.">
<meta property="og:image" content="${SITE}/assets/images/desk2quant-editorial-og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="All Quant Finance Resources | Desk2Quant">
<meta name="twitter:description" content="Browse all ${products.length} practitioner-built quant finance resources.">
<meta name="twitter:image" content="${SITE}/assets/images/desk2quant-editorial-og.jpg">
<script type="application/ld+json">${safeJson(hubJsonLd)}</script>
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/launchzone.css?v=8">
<link rel="stylesheet" href="/launchzone-pages.css?v=10">
<link rel="stylesheet" href="/seo-product.css?v=3">
</head>
<body class="d2q-launchzone">
<header class="seo-topbar">
  <div class="seo-topbar-inner">
    <a class="seo-brand" href="/"><img src="/assets/images/desk2quant-logo.png?v=3" alt="Desk2Quant"></a>
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
    <a href="/">Home</a> <span>/</span> <span aria-current="page">Resources</span>
  </nav>
  <h1>All Desk2Quant resources</h1>
  <p>${products.length} practitioner-built resources covering pricing, risk, model validation and interview preparation.</p>
  <ul class="seo-list">
${items}
  </ul>
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
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), hub, 'utf8');

  // Sitemap.
  const urls = STATIC_PAGES.map(([loc, pri]) =>
    `  <url><loc>${SITE}${loc}</loc><priority>${pri}</priority></url>`
  ).concat(products.map(p =>
    `  <url><loc>${SITE}/products/${p.__slug}.html</loc><priority>0.8</priority></url>`
  )).concat(blogs.map(blog =>
    `  <url><loc>${SITE}/blog/${blog.__slug}.html</loc><priority>0.7</priority></url>`
  )).concat(GUIDES.map(guide =>
    `  <url><loc>${SITE}/guides/${guide.slug}.html</loc><priority>0.8</priority></url>`
  ));

  fs.writeFileSync(path.join(__dirname, '..', 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 'utf8');

  console.log(`[seo] Generated ${products.length} product pages, ${blogs.length} blog pages, ${GUIDES.length} guides, hubs + sitemap (${urls.length} URLs).`);
}

if (require.main === module) {
  main().catch(e => {
    console.error('[seo] build failed:', e.message);
    process.exitCode = 1;
  });
}

module.exports = { main, assertNonEmptyPublishedBlogs };
