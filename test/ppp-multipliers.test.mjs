import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// PPP multipliers: strong currencies 1.6x, weaker economies 1.3x. The browser
// (script.js, product pages) and the server (lib/pricing.js) must agree, or the
// price shown differs from the price charged.
const STRONG = 1.6;
const WEAK = 1.3;
const RATES = { INR: 1, USD: 0.0114, PKR: 3.2 };

test('server applies 1.6x to strong and 1.3x to weaker currencies', async () => {
    globalThis.fetch = async (url) => {
        url = String(url);
        const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
        if (url.includes('exchange') || url.includes('er-api') || url.includes('frankfurter')) return ok({ rates: RATES, result: 'success' });
        if (url.includes('/rest/v1/products')) {
            const off = url.includes('id=eq.nop');
            return ok([{ id: off ? 'nop' : 'p', name: 'T', price: 1000, discount_percentage: 0, coupon_code: null, enable_ppp: !off }]);
        }
        return ok([]);
    };
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    process.env.SUPABASE_ANON_KEY = 'k';
    const { getExpectedProductOrder } = await import('../lib/pricing.js');
    const usd = await getExpectedProductOrder('p', 'USD', '');
    assert.ok(Math.abs(usd.amountMajor - 1000 * RATES.USD * STRONG) < 1e-6);
    const pkr = await getExpectedProductOrder('p', 'PKR', '');
    assert.ok(Math.abs(pkr.amountMajor - 1000 * RATES.PKR * WEAK) < 1e-6);
    const plain = await getExpectedProductOrder('nop', 'USD', '');
    assert.ok(Math.abs(plain.amountMajor - 1000 * RATES.USD) < 1e-6, 'no uplift when enable_ppp is false');
    const inr = await getExpectedProductOrder('p', 'INR', '');
    assert.equal(inr.amountMajor, 1000, 'INR is never uplifted');
});

test('browser code uses the same multipliers as the server', async () => {
    for (const f of ['script.js', 'product.html', 'product-test.html']) {
        const src = await fs.readFile(f, 'utf8');
        assert.ok(src.includes(`isWeaker ? ${WEAK} : ${STRONG}`), `${f} must use ${WEAK}/${STRONG}`);
        assert.ok(!/isWeaker ? 1\.2 : 1\.5/.test(src), `${f} still has the old multipliers`);
    }
    const server = await fs.readFile('lib/pricing.js', 'utf8');
    assert.ok(server.includes(`const PPP_STRONG = ${STRONG};`));
    assert.ok(server.includes(`const PPP_WEAK = ${WEAK};`));
});

test('server enforces PPP for INR orders from outside India (fail-open when country unknown)', async () => {
    const { geoPppFactor, getExpectedProductOrder, getExpectedSessionOrder } = await import('../lib/pricing.js');
    // factor helper
    assert.equal(geoPppFactor('US', true), STRONG);
    assert.equal(geoPppFactor('gb', true), STRONG);
    assert.equal(geoPppFactor('PK', true), WEAK);
    assert.equal(geoPppFactor('BR', true), WEAK);
    assert.equal(geoPppFactor('IN', true), 1, 'India is never uplifted');
    assert.equal(geoPppFactor('US', false), 1, 'PPP off means no uplift');
    for (const bad of [undefined, null, '', 'XX', 'T1', 'USA', '1', 'U']) {
        assert.equal(geoPppFactor(bad, true), 1, `unknown country ${JSON.stringify(bad)} must fail open`);
    }
    // product orders (price 1000, no coupon)
    const us = await getExpectedProductOrder('p', 'INR', '', 'US');
    assert.equal(us.amountMajor, 1000 * STRONG);
    assert.equal(us.amountInr, 1000, 'amountInr (tamper-check floor) stays the base price');
    const pk = await getExpectedProductOrder('p', 'INR', '', 'PK');
    assert.equal(pk.amountMajor, 1000 * WEAK);
    const india = await getExpectedProductOrder('p', 'INR', '', 'IN');
    assert.equal(india.amountMajor, 1000);
    const unknown = await getExpectedProductOrder('p', 'INR', '', undefined);
    assert.equal(unknown.amountMajor, 1000);
    const nonPpp = await getExpectedProductOrder('nop', 'INR', '', 'US');
    assert.equal(nonPpp.amountMajor, 1000, 'non-PPP products are never uplifted');
    // foreign-currency orders are unchanged by geo (already uplifted)
    const usd = await getExpectedProductOrder('p', 'USD', '', 'US');
    assert.ok(Math.abs(usd.amountMajor - 1000 * RATES.USD * STRONG) < 1e-6);
});
