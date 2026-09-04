import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
    const envPath = path.join(ROOT, '.env.local');
    if (!fs.existsSync(envPath)) {
        throw new Error('.env.local file not found. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    }
    const content = fs.readFileSync(envPath, 'utf8');
    const env = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            env[key] = val;
        }
    }
    return env;
}

export async function supabaseRequest(endpoint, options = {}, retries = 3) {
    const env = loadEnv();
    const url = `${env.SUPABASE_URL}/rest/v1${endpoint}`;
    const headers = {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact',
        ...(options.headers || {})
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                ...options,
                headers
            });

            const contentRange = res.headers.get('content-range');
            const totalCount = contentRange ? Number(contentRange.split('/')[1]) : null;

            let data;
            const text = await res.text();
            try {
                data = text ? JSON.parse(text) : null;
            } catch {
                data = text;
            }

            if (!res.ok) {
                throw new Error(`Supabase error (${res.status}): ${typeof data === 'object' ? JSON.stringify(data) : data}`);
            }

            return { data, totalCount, status: res.status };
        } catch (err) {
            if (attempt === retries || err.message.startsWith('Supabase error')) {
                throw err;
            }
            await new Promise(r => setTimeout(r, 500 * attempt));
        }
    }
}

async function getStats() {
    const tables = ['products', 'purchases', 'bookings', 'blogs', 'testimonials', 'product_reviews'];
    const results = {};
    for (const table of tables) {
        try {
            const { totalCount } = await supabaseRequest(`/${table}?select=count`, {
                headers: { 'Range': '0-0' }
            });
            results[table] = totalCount ?? 'unknown';
        } catch (err) {
            results[table] = `error: ${err.message}`;
        }
    }
    return results;
}

async function main() {
    const [,, command = 'stats', ...args] = process.argv;

    if (command === 'stats') {
        console.log('Fetching Supabase database metrics...');
        const stats = await getStats();
        console.table(stats);
    } else if (command === 'purchases') {
        const limit = args[0] || 5;
        const { data, totalCount } = await supabaseRequest(`/purchases?select=id,customer_email,product_name,amount,currency,payment_id,created_at&order=created_at.desc&limit=${limit}`);
        console.log(`Recent Purchases (Total: ${totalCount}):`);
        console.table(data);
    } else if (command === 'bookings') {
        const limit = args[0] || 5;
        const { data, totalCount } = await supabaseRequest(`/bookings?select=id,name,email,service_name,booking_date,booking_time,status,created_at&order=created_at.desc&limit=${limit}`);
        console.log(`Recent Bookings (Total: ${totalCount}):`);
        console.table(data);
    } else if (command === 'products') {
        const limit = args[0] || 10;
        const { data, totalCount } = await supabaseRequest(`/products?select=id,name,price,is_active&order=price.desc&limit=${limit}`);
        console.log(`Products (Total: ${totalCount}):`);
        console.table(data);
    } else if (command === 'customer') {
        const query = args[0];
        if (!query) {
            console.error('Usage: node scripts/db.mjs customer <email-or-name-or-paymentId>');
            process.exit(1);
        }
        console.log(`\n🔍 Searching for customer matching "${query}"...\n`);

        // Search purchases
        const pFilter = query.includes('@')
            ? `/purchases?customer_email=ilike.*${encodeURIComponent(query)}*&order=created_at.desc`
            : `/purchases?or=(customer_email.ilike.*${encodeURIComponent(query)}*,payment_id.eq.${encodeURIComponent(query)})&order=created_at.desc`;
        const purchases = await supabaseRequest(pFilter);

        // Search bookings
        const bFilter = query.includes('@')
            ? `/bookings?email=ilike.*${encodeURIComponent(query)}*&order=created_at.desc`
            : `/bookings?or=(email.ilike.*${encodeURIComponent(query)}*,name.ilike.*${encodeURIComponent(query)}*,payment_id.eq.${encodeURIComponent(query)})&order=created_at.desc`;
        const bookings = await supabaseRequest(bFilter);

        console.log(`--- Purchases Found (${purchases.data?.length || 0}) ---`);
        if (purchases.data?.length) {
            console.table(purchases.data.map(p => ({
                id: p.id,
                email: p.customer_email,
                product: p.product_name,
                amount: `${p.currency || 'INR'} ${p.amount}`,
                payment_id: p.payment_id,
                date: new Date(p.created_at).toLocaleString()
            })));
        } else {
            console.log('No purchases found.');
        }

        console.log(`\n--- Bookings Found (${bookings.data?.length || 0}) ---`);
        if (bookings.data?.length) {
            console.table(bookings.data.map(b => ({
                id: b.id,
                name: b.name,
                email: b.email,
                service: b.service_name,
                date: b.booking_date,
                time: b.booking_time,
                status: b.status,
                meet_link: b.meet_link || 'N/A'
            })));
        } else {
            console.log('No bookings found.');
        }
    } else if (command === 'query') {
        const [endpoint, ...rest] = args;
        if (!endpoint) {
            console.error('Usage: node scripts/db.mjs query <endpoint>');
            process.exit(1);
        }
        const res = await supabaseRequest(endpoint.startsWith('/') ? endpoint : `/${endpoint}`);
        console.log(JSON.stringify(res.data, null, 2));
    } else {
        console.log(`Unknown command: ${command}`);
        console.log('Available commands: stats, purchases, bookings, products, customer <email|name|paymentId>, query <endpoint>');
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(err => {
        console.error('DB Error:', err.message);
        process.exit(1);
    });
}
