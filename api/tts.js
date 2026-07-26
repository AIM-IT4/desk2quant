import { createUniqueMeetEvent } from '../lib/google-calendar.js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Preview-only, idempotent Calendar API health check. It has no attendee and sends no email.
    if (req.query.calendar_test === '1') {
        try {
            const result = await createUniqueMeetEvent({
                paymentId: 'desk2quant_calendar_api_healthcheck_20260726',
                customerEmail: '',
                customerName: '',
                sessionName: 'Desk2Quant Calendar API health check (do not attend)',
                sessionDate: '2030-01-02',
                sessionTime: '10:00',
                sessionDuration: '15'
            });
            if (!result.meetLink) throw new Error('Google Calendar returned no Meet link');
            return res.status(200).json({ ok: true, meetLink: result.meetLink });
        } catch (error) {
            return res.status(502).json({ ok: false, error: error.message });
        }
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        return res.status(500).json({ error: 'Missing GROQ_API_KEY' });
    }

    const { text, voice } = req.body;
    if (!text || text.trim().length < 2) {
        return res.status(400).json({ error: 'Text is required' });
    }

    // Truncate to keep audio small + reduce rate limit pressure
    const inputText = text.substring(0, 1500);

    console.log(`TTS Request: voice=${voice || 'troy'}, text_len=${inputText.length}`);

    try {
        const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'canopylabs/orpheus-v1-english',
                input: inputText,
                voice: voice || 'troy',
                response_format: 'wav'
            })
        });

        // Handle rate limits — forward Retry-After header to client
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || response.headers.get('retry-after') || '10';
            console.warn(`Groq TTS rate limited. Retry-After: ${retryAfter}s`);
            res.setHeader('Retry-After', retryAfter);
            return res.status(429).json({
                error: 'Rate limited',
                retryAfter: parseInt(retryAfter) || 10
            });
        }

        if (!response.ok) {
            const errText = await response.text();
            console.error('Groq TTS Error:', response.status, errText);
            return res.status(response.status).json({
                error: `TTS API Error: ${response.status}`,
                detail: errText.substring(0, 200)
            });
        }

        // Stream the audio binary directly to the client
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        console.log(`TTS Response: ${audioBuffer.length} bytes`);

        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Length', audioBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(200).send(audioBuffer);

    } catch (error) {
        console.error('TTS Proxy Error:', error.message);
        return res.status(500).json({ error: error.message || 'TTS service error' });
    }
}
