import test from 'node:test';
import assert from 'node:assert/strict';

const { default: ttsHandler } = await import('../api/tts.js');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
    end(payload) { if (payload) this.body = payload; return this; }
  };
}

function mockReq({ method = 'POST', body = {}, headers = {} } = {}) {
  return {
    method,
    body,
    headers: { 'content-type': 'application/json', ...headers }
  };
}

test('api/tts: imports cleanly and handles OPTIONS preflight', async () => {
  const req = mockReq({ method: 'OPTIONS' });
  const res = mockRes();
  await ttsHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
});

test('api/tts: rejects non-POST non-OPTIONS methods with 405', async () => {
  const req = mockReq({ method: 'GET' });
  const res = mockRes();
  await ttsHandler(req, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body?.error, 'Method not allowed');
});

test('api/tts: validates input text', async () => {
  const req = mockReq({ method: 'POST', body: { text: '' } });
  const res = mockRes();
  await ttsHandler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.error, 'Text is required');
});

test('api/tts: returns 500 cleanly when no API keys are configured', async () => {
  const oldGroq = process.env.GROQ_API_KEY;
  const oldGemini = process.env.GEMINI_API_KEY;
  const oldGoogle = process.env.GOOGLE_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;

  try {
    const req = mockReq({ method: 'POST', body: { text: 'Testing TTS speech generation' } });
    const res = mockRes();
    await ttsHandler(req, res);
    assert.equal(res.statusCode, 500);
    assert.match(res.body?.error, /TTS service not configured/);
  } finally {
    if (oldGroq) process.env.GROQ_API_KEY = oldGroq;
    if (oldGemini) process.env.GEMINI_API_KEY = oldGemini;
    if (oldGoogle) process.env.GOOGLE_API_KEY = oldGoogle;
  }
});

test('api/tts: successfully proxies Groq TTS audio response', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';

  const originalFetch = globalThis.fetch;
  const fakeAudio = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]); // RIFF header

  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('groq.com')) {
      assert.equal(opts.method, 'POST');
      assert.equal(opts.headers['Authorization'], 'Bearer test-groq-key');
      const payload = JSON.parse(opts.body);
      assert.equal(payload.input, 'Hello quant candidate');
      assert.equal(payload.voice, 'troy');
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'audio/wav' }),
        arrayBuffer: async () => fakeAudio.buffer
      };
    }
    throw new Error('Unexpected fetch url: ' + url);
  };

  try {
    const req = mockReq({ method: 'POST', body: { text: 'Hello quant candidate', voice: 'troy' } });
    const res = mockRes();
    await ttsHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'audio/wav');
    assert.ok(Buffer.isBuffer(res.body));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
  }
});

test('api/tts: forwards Groq rate limits with 429 and Retry-After', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    headers: new Headers({ 'Retry-After': '15' }),
    text: async () => 'Rate limit exceeded'
  });

  try {
    const req = mockReq({ method: 'POST', body: { text: 'Testing rate limit forward' } });
    const res = mockRes();
    await ttsHandler(req, res);

    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['Retry-After'], '15');
    assert.equal(res.body?.retryAfter, 15);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
  }
});

test('api/tts: uses Gemini TTS when GEMINI_API_KEY is set and GROQ_API_KEY is absent', async () => {
  delete process.env.GROQ_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  const originalFetch = globalThis.fetch;
  const fakeAudioBase64 = Buffer.from([0x52, 0x49, 0x46, 0x46]).toString('base64');

  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('googleapis.com')) {
      assert.equal(opts.method, 'POST');
      assert.equal(opts.headers['x-goog-api-key'], 'test-gemini-key');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: fakeAudioBase64,
                  mimeType: 'audio/wav'
                }
              }]
            }
          }]
        })
      };
    }
    throw new Error('Unexpected fetch url: ' + url);
  };

  try {
    const req = mockReq({ method: 'POST', body: { text: 'Hello via Gemini voice', voice: 'Kore' } });
    const res = mockRes();
    await ttsHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'audio/wav');
    assert.ok(Buffer.isBuffer(res.body));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  }
});

test('api/tts: maps Orpheus voice to valid Gemini voice and safely handles non-string text', async () => {
  delete process.env.GROQ_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  const originalFetch = globalThis.fetch;
  const fakeAudioBase64 = Buffer.from([0x52, 0x49, 0x46, 0x46]).toString('base64');
  let capturedPayload = null;

  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('googleapis.com')) {
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: fakeAudioBase64,
                  mimeType: 'audio/wav'
                }
              }]
            }
          }]
        })
      };
    }
    throw new Error('Unexpected fetch url: ' + url);
  };

  try {
    // Pass numeric text and Orpheus voice 'troy'
    const req = mockReq({ method: 'POST', body: { text: 123456, voice: 'troy' } });
    const res = mockRes();
    await ttsHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(capturedPayload);
    // Voice should have been mapped to Gemini 'Charon'
    assert.equal(
      capturedPayload.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
      'Charon'
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  }
});

test('api/tts: falls back to Gemini when Groq fetch fails with 500', async () => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  const originalFetch = globalThis.fetch;
  const fakeAudioBase64 = Buffer.from([0x52, 0x49, 0x46, 0x46]).toString('base64');
  let groqCalled = false;
  let geminiCalled = false;

  globalThis.fetch = async (url) => {
    if (String(url).includes('groq.com')) {
      groqCalled = true;
      return {
        ok: false,
        status: 500,
        text: async () => 'Groq Internal Error'
      };
    }
    if (String(url).includes('googleapis.com')) {
      geminiCalled = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: fakeAudioBase64,
                  mimeType: 'audio/wav'
                }
              }]
            }
          }]
        })
      };
    }
    throw new Error('Unexpected fetch url: ' + url);
  };

  try {
    const req = mockReq({ method: 'POST', body: { text: 'Testing fallback from Groq to Gemini' } });
    const res = mockRes();
    await ttsHandler(req, res);

    assert.equal(groqCalled, true);
    assert.equal(geminiCalled, true);
    assert.equal(res.statusCode, 200);
    assert.ok(Buffer.isBuffer(res.body));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }
});


