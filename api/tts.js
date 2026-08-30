import { getActiveGeminiKey } from '../lib/geminiKeyManager.js';
import { verifyAnonymousUsageToken } from '../lib/anonymousUsageToken.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

const GEMINI_TTS_MODEL = (process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts').trim();
const DEFAULT_VOICE = (process.env.GEMINI_TTS_VOICE || 'Kore').trim();

function toSafeString(value) {
  return String(value || '').trim();
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function voiceFromRequest(value) {
  const voice = toSafeString(value);
  if (/^[A-Za-z][A-Za-z0-9_-]{1,31}$/.test(voice)) return voice;
  return DEFAULT_VOICE;
}

function rateLimit(req, res) {
  const now = Date.now();
  const windowMs = clampInt(process.env.TTS_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 10 * 60_000);
  const looseLimit = clampInt(process.env.TTS_RATE_LIMIT_PER_WINDOW, 8, 1, 120);
  const strictLimit = clampInt(process.env.TTS_STRICT_RATE_LIMIT_PER_WINDOW, 3, 1, 30);

  const rawForwarded = toSafeString(req.headers?.['x-forwarded-for']);
  const ip = (rawForwarded.split(',')[0] || toSafeString(req.headers?.['x-real-ip']) || 'unknown').trim();
  if (!globalThis.__desk2quantTtsRate) globalThis.__desk2quantTtsRate = new Map();

  const store = globalThis.__desk2quantTtsRate;
  const entry = store.get(ip);
  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    res?.setHeader?.('X-RateLimit-Remaining', String(Math.max(0, looseLimit - 1)));
    return true;
  }

  entry.count += 1;
  res?.setHeader?.('X-RateLimit-Remaining', String(Math.max(0, looseLimit - entry.count)));
  if (entry.count > strictLimit) {
    res?.setHeader?.('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
    return false;
  }
  return true;
}

function normalizeStoredEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hasProAccess(customer) {
  if (!customer) return false;
  const tier = String(customer.membership_tier || '').trim().toLowerCase();
  const status = String(customer.membership_status || '').trim().toLowerCase();
  const expiresAt = customer.membership_expires_at ? new Date(customer.membership_expires_at).getTime() : null;
  const active = status === 'active' || status === 'trialing';
  const notExpired = !expiresAt || expiresAt > Date.now();
  return active && notExpired && (tier === 'pro' || tier === 'plus');
}

async function resolveAnonymousAccess(req) {
  const token = String(req.headers?.['x-dq-usage-token'] || '').trim();
  if (!token) return { ok: false, reason: 'anonymous_token_required' };

  const verified = await verifyAnonymousUsageToken(token);
  if (!verified?.ok) return { ok: false, reason: verified?.reason || 'anonymous_token_invalid' };

  return {
    ok: true,
    mode: 'anonymous',
    usage: verified.usage,
    token: verified.token,
  };
}

async function resolveMemberAccess(req) {
  const auth = String(req.headers?.authorization || '').trim();
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return { ok: false, reason: 'auth_required' };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(match[1].trim());
  const authEmail = normalizeStoredEmail(data?.user?.email);
  if (error || !authEmail) return { ok: false, reason: 'auth_invalid' };

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('email,membership_tier,membership_status,membership_expires_at')
    .eq('email', authEmail)
    .maybeSingle();

  if (customerError) throw customerError;
  if (!hasProAccess(customer)) return { ok: false, reason: 'pro_required' };

  return {
    ok: true,
    mode: 'member',
    email: authEmail,
    tier: String(customer?.membership_tier || '').trim().toLowerCase(),
  };
}

async function resolveAccess(req) {
  const anonymous = await resolveAnonymousAccess(req);
  if (anonymous.ok) return anonymous;
  const member = await resolveMemberAccess(req);
  if (member.ok) return member;
  return {
    ok: false,
    reason: member.reason || anonymous.reason || 'access_required',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-DQ-Usage-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!rateLimit(req, res)) return res.status(429).json({ error: 'Too many TTS requests. Please wait and retry.' });

  try {
    const body = parseBody(req);
    const text = toSafeString(body.text);
    if (!text) return res.status(400).json({ error: 'text is required' });
    if (text.length > 1600) return res.status(400).json({ error: 'text is too long' });

    const access = await resolveAccess(req);
    if (!access.ok) {
      const status = access.reason === 'pro_required' ? 403 : 401;
      return res.status(status).json({
        error: access.reason === 'pro_required'
          ? 'Desk2Quant Pro is required for owned interviewer voice.'
          : 'A valid Study Hub visitor token or signed-in Pro account is required.',
        reason: access.reason,
      });
    }

    const apiKey = await getActiveGeminiKey();
    if (!apiKey) throw new Error('No Gemini API key is configured for TTS.');

    const voiceName = voiceFromRequest(body.voice || DEFAULT_VOICE);
    const prompt = toSafeString(body.prompt) || 'Speak clearly, naturally, and with a neutral professional interviewer tone.';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_TTS_MODEL)}:generateContent`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${prompt}\n\n${text}` }],
        }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = json?.error?.message || `Gemini TTS failed (${response.status})`;
      throw new Error(detail);
    }

    const part = json?.candidates?.[0]?.content?.parts?.find((item) => item?.inlineData?.data);
    const audioBase64 = toSafeString(part?.inlineData?.data);
    if (!audioBase64) throw new Error('Gemini TTS returned no audio payload.');

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      audioBase64,
      mimeType: toSafeString(part?.inlineData?.mimeType) || 'audio/L16;rate=24000',
      model: GEMINI_TTS_MODEL,
      voice: voiceName,
      accessMode: access.mode,
    });
  } catch (err) {
    console.error('tts error', err);
    return res.status(500).json({ error: err?.message || 'Unable to generate speech.' });
  }
}
