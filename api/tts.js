import { GROQ_TTS_MODEL } from '../lib/groqModels.js';

const GEMINI_TTS_MODEL = (process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts').trim();

const GEMINI_VOICES = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede']);
const ORPHEUS_TO_GEMINI_VOICE = {
  troy: 'Charon',
  austin: 'Puck',
  daniel: 'Fenrir',
  autumn: 'Aoede',
  diana: 'Kore',
  hannah: 'Kore'
};

function resolveGeminiVoice(voice) {
  if (voice && GEMINI_VOICES.has(voice)) return voice;
  const mapped = voice ? ORPHEUS_TO_GEMINI_VOICE[String(voice).toLowerCase()] : null;
  if (mapped) return mapped;
  return 'Kore';
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

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = parseBody(req);
    const text = (typeof body?.text === 'string' ? body.text : (body?.text != null ? String(body.text) : '')).trim();
    const rawVoice = typeof body?.voice === 'string' ? body.voice : (body?.voice != null ? String(body.voice) : 'troy');
    const voice = rawVoice.trim() || 'troy';

    if (!text || text.length < 2) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Truncate to safe limit to keep audio small and reduce latency
    const inputText = text.substring(0, 1500);

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!GROQ_API_KEY && !GEMINI_API_KEY) {
      return res.status(500).json({ error: 'TTS service not configured (missing API key)' });
    }

    // Primary: Groq Orpheus TTS (used by interview.html)
    if (GROQ_API_KEY) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: GROQ_TTS_MODEL,
            input: inputText,
            voice: voice || 'troy',
            response_format: 'wav'
          })
        });

        // Handle rate limits — forward Retry-After header to client
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || response.headers.get('retry-after') || '10';
          res.setHeader('Retry-After', retryAfter);
          return res.status(429).json({
            error: 'Rate limited',
            retryAfter: parseInt(retryAfter, 10) || 10
          });
        }

        if (response.ok) {
          const audioBuffer = Buffer.from(await response.arrayBuffer());
          res.setHeader('Content-Type', 'audio/wav');
          res.setHeader('Content-Length', audioBuffer.length);
          res.setHeader('Cache-Control', 'no-cache');
          if (typeof res.send === 'function') {
            return res.status(200).send(audioBuffer);
          }
          return res.status(200).end(audioBuffer);
        }

        // If Groq fails and no Gemini fallback, return error
        const errText = await response.text();
        console.error('Groq TTS Error:', response.status, errText);
        if (!GEMINI_API_KEY) {
          return res.status(response.status).json({
            error: `TTS API Error: ${response.status}`,
            detail: errText.substring(0, 200)
          });
        }
      } catch (err) {
        console.error('Groq TTS fetch error:', err.message);
        if (!GEMINI_API_KEY) {
          return res.status(500).json({ error: err.message || 'TTS service error' });
        }
      }
    }

    // Fallback / Alternative: Gemini TTS
    if (GEMINI_API_KEY) {
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_TTS_MODEL)}:generateContent`;
        const geminiVoice = resolveGeminiVoice(voice);
        const prompt = (typeof body?.prompt === 'string' ? body.prompt.trim() : '') || 'Speak clearly, naturally, and with a neutral professional interviewer tone.';

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `${prompt}\n\n${inputText}` }]
            }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: geminiVoice }
                }
              }
            }
          })
        });

        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          const detail = json?.error?.message || `Gemini TTS failed (${response.status})`;
          return res.status(response.status).json({ error: detail });
        }

        const part = json?.candidates?.[0]?.content?.parts?.find((item) => item?.inlineData?.data);
        const audioBase64 = part?.inlineData?.data;
        if (!audioBase64) {
          return res.status(500).json({ error: 'Gemini TTS returned no audio payload.' });
        }

        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const mimeType = part?.inlineData?.mimeType || 'audio/wav';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', audioBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');
        if (typeof res.send === 'function') {
          return res.status(200).send(audioBuffer);
        }
        return res.status(200).end(audioBuffer);
      } catch (err) {
        console.error('Gemini TTS Error:', err);
        return res.status(500).json({ error: err.message || 'Unable to generate speech.' });
      }
    }
  } catch (err) {
    console.error('Unhandled TTS Error:', err);
    return res.status(500).json({ error: err?.message || 'Unable to generate speech.' });
  }
}
