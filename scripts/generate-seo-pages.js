// Build-time SEO page generator.
// Creates a static, crawlable page per product at /products/<slug>.html
// with a real <title>, meta description, canonical, OG tags, JSON-LD and
// server-rendered copy — instead of 37 identical JS-only shells.
const fs = require('fs');
const path = require('path');

const SITE = 'https://desk2quant.com';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudGFibXl1cmxybG5vYWpkbmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDEyNjUsImV4cCI6MjA4NTY3NzI2NX0.PYpNd_t_px09zi2d5WGjFVOB23sjb3ZPuAnxagYshe0';

const OUT_DIR = path.join(__dirname, '..', 'products');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(text, max) {
  const t = stripHtml(text);
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '') || 'product';
}

async function fetchProducts() {
  // NOTE: only anon-readable columns may be selected here. average_rating and
  // sales_count are RLS-sealed (42501), which made this query fail at every
  // build — build-seo.js then skipped SEO generation and the static product
  // pages silently went stale (DB description edits never appeared). coupon_code
  // and discount_percentage are public (granted for PPP display) so the pages
  // can advertise each product's real code.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/products?select=id,name,description,price,original_price,cover_image_url,coupon_code,discount_percentage,created_at&order=created_at.desc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}


// Real, product-linked reviews for JSON-LD aggregateRating/review. Sourced
// from product_reviews (the linking table) joined to testimonials -- NOT
// products.average_rating/sales_count, which are placeholder-looking (mostly
// rating=5, sales=0) and unrelated to actual review counts.
// Returns { [productId]: [{ name, rating, review, title }] }.
async function fetchProductReviews() {
  const [linksRes, testRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/product_reviews?select=product_id,testimonial_id`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }),
    fetch(`${SUPABASE_URL}/rest/v1/testimonials?select=id,name,rating,review,title`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
  ]);
  if (!linksRes.ok) throw new Error(`Supabase product_reviews ${linksRes.status}`);
  if (!testRes.ok) throw new Error(`Supabase testimonials ${testRes.status}`);

  const links = await linksRes.json();
  const testimonials = await testRes.json();
  const byId = new Map(testimonials.map(t => [t.id, t]));

  const byProduct = {};
  for (const link of links) {
    const t = byId.get(link.testimonial_id);
    if (!t || !t.rating || !t.review) continue;
    (byProduct[link.product_id] ??= []).push(t);
  }
  return byProduct;
}
module.exports = { esc, stripHtml, clamp, slugify, fetchProducts, fetchProductReviews, SITE, OUT_DIR };
