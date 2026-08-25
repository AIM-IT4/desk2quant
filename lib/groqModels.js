// Single source of truth for the Groq model IDs this project calls.
//
// Groq retires model IDs on a published schedule, and a request to a retired ID
// fails with 404 model_not_found rather than degrading. `llama-3.3-70b-versatile`
// was shut down on 2026-08-16 and took both the AI mock interview and the
// product advisor widget down with it, with no warning on the site itself.
//
// So the IDs live here and are overridable from the Vercel dashboard: the next
// retirement is an environment-variable change, not a code deploy. Check the
// schedule before picking a replacement -- some listed replacements are
// themselves already deprecated: https://console.groq.com/docs/deprecations

export const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b';
export const GROQ_TTS_MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
