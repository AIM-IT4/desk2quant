import crypto from 'crypto';

const PART_COUNT = 7;
const RESOURCE_ID = 'fx-derivatives-50-problems';
const FILE_NAME = '50-FX-Derivatives-Problems-for-Quant-Interviews.pdf';

function signingKey() {
  const seed = process.env.BREVO_API_KEY;
  if (!seed) return null;
  return crypto.createHash('sha256').update(`desk2quant-free-resource|${seed}`).digest();
}

function verifyToken(token) {
  const key = signingKey();
  if (!key || typeof token !== 'string') return null;
  const pieces = token.split('.');
  if (pieces.length !== 2) return null;
  const [payload, signature] = pieces;
  const expected = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.r !== RESOURCE_ID || !parsed.e || !Number.isFinite(parsed.x) || parsed.x < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchSourcePart(index) {
  const name = String(index).padStart(2, '0');
  const url = `https://desk2quant.com/assets/resources/source/fx-derivatives-workbook-${name}.texpart`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Resource source part ${name} unavailable`);
  return response.text();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method not allowed');
  const access = verifyToken(String(req.query?.token || ''));
  if (!access) return res.status(403).end('This download link is invalid or expired.');

  try {
    await Promise.all(Array.from({ length: PART_COUNT }, (_, i) => fetchSourcePart(i)));
    const pdf = await fetch('https://desk2quant.com/assets/resources/50_FX_Derivatives_Quant_Interview_Problems.pdf', { cache: 'no-store' });
    if (!pdf.ok) throw new Error(`Compiled PDF unavailable (${pdf.status})`);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    if (bytes.length < 1000 || bytes.subarray(0, 4).toString() !== '%PDF') throw new Error('Compiled resource is not a valid PDF');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${FILE_NAME}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).send(bytes);
  } catch (error) {
    console.error('Free resource download error:', error);
    return res.status(503).end('The workbook is temporarily unavailable. Please try again shortly.');
  }
}
