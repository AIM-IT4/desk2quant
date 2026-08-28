const ALLOWED_ORIGIN_HOSTS = new Set([
  'desk2quant.com',
  'www.desk2quant.com',
  'localhost',
  '127.0.0.1'
]);

const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const buckets = new Map();

function requestHost(req) {
  const raw = req.headers?.origin || req.headers?.referer || '';
  try { return new URL(raw).hostname.toLowerCase(); } catch { return ''; }
}

function allowedOrigin(req) {
  const host = requestHost(req);
  return ALLOWED_ORIGIN_HOSTS.has(host) || host.endsWith('.vercel.app');
}

function clientIp(req) {
  return String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

function rateLimited(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (buckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  buckets.set(ip, recent);
  if (buckets.size > 5000) {
    for (const [key, times] of buckets) {
      if (!times.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) buckets.delete(key);
    }
  }
  return recent.length > RATE_LIMIT_MAX;
}

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

async function signingKey() {
  const seed = process.env.BREVO_API_KEY;
  if (!seed) return null;
  return globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`desk2quant-free-resource|${seed}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function createDownloadToken(email) {
  const key = await signingKey();
  if (!key) throw new Error('Lead service is not configured');
  const payload = Buffer.from(JSON.stringify({
    e: email,
    r: 'fx-derivatives-50-problems',
    x: Date.now() + TOKEN_TTL_MS
  })).toString('base64url');
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  );
  return `${payload}.${toBase64Url(signature)}`;
}

async function addToBrevo(email) {
  const listId = Number(process.env.BREVO_LEADS_LIST_ID || 0);
  const body = { email, updateEnabled: true };
  if (Number.isInteger(listId) && listId > 0) body.listIds = [listId];

  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo contact capture failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

async function sendResourceEmail(email, downloadUrl) {
  const senderEmail = process.env.SENDER_EMAIL || 'hello@desk2quant.com';
  const senderName = process.env.SENDER_NAME || 'Desk2Quant';
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6">
      <h2 style="color:#17365d">Your FX Derivatives Quant Interview Workbook</h2>
      <p>Thanks for joining the Desk2Quant free-resource list.</p>
      <p>Your workbook contains <strong>50 FX derivatives interview problems</strong>, a formula reference sheet, and complete worked solutions in the appendix.</p>
      <p style="margin:28px 0"><a href="${downloadUrl}" style="background:#17365d;color:white;text-decoration:none;padding:13px 20px;border-radius:7px;display:inline-block">Download the PDF</a></p>
      <p style="font-size:13px;color:#667085">This private download link expires in 7 days. You opted in to occasional Desk2Quant quant-finance resources and updates. Future marketing emails will include an unsubscribe option.</p>
      <p>Desk2Quant<br><a href="https://desk2quant.com">desk2quant.com</a></p>
    </div>`;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email }],
      subject: 'Your free FX Derivatives Quant Interview Workbook',
      htmlContent,
      textContent: `Your Desk2Quant FX Derivatives Quant Interview Workbook: ${downloadUrl}`
    })
  });

  if (!response.ok) {
    console.error('Free-resource email failed:', response.status, await response.text());
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!allowedOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
  if (rateLimited(req)) return res.status(429).json({ error: 'Too many requests. Please try again later.' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  const consent = req.body?.consent === true;
  const honeypot = String(req.body?.company || '').trim();

  if (honeypot) return res.status(200).json({ success: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!consent) return res.status(400).json({ error: 'Consent is required to receive this free resource.' });
  if (!process.env.BREVO_API_KEY) return res.status(503).json({ error: 'Lead capture is temporarily unavailable.' });

  try {
    await addToBrevo(email);
    const token = await createDownloadToken(email);
    const relativeUrl = `/api/free-resource-download?token=${encodeURIComponent(token)}`;
    const absoluteUrl = `https://desk2quant.com${relativeUrl}`;
    await sendResourceEmail(email, absoluteUrl);
    return res.status(200).json({ success: true, downloadUrl: relativeUrl });
  } catch (error) {
    console.error('Free resource lead error:', error);
    return res.status(500).json({ error: 'Could not unlock the workbook. Please try again.' });
  }
}
