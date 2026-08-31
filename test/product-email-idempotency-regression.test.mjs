import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('single-product purchase emails use webhook idempotency helper', () => {
  const src = fs.readFileSync(new URL('../api/razorpay-webhook.js', import.meta.url), 'utf8');
  const product = src.split('export async function handleProductPurchase')[1].split('// Handle a multi-item cart checkout')[0];
  assert.match(product, /deliveryType:\s*'product_customer_receipt'/);
  assert.match(product, /deliveryType:\s*'product_admin_sale'/);
  assert.doesNotMatch(product, /const emailResponse = await fetch\('https:\/\/api\.brevo\.com\/v3\/smtp\/email'/);
  assert.doesNotMatch(product, /const adminEmailResponse = await fetch\('https:\/\/api\.brevo\.com\/v3\/smtp\/email'/);
});
