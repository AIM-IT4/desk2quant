import https from 'https';

// Helper: HTTP Request (Replace fetch to avoid dependency issues)
function httpRequest(url, options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                } else {
                    reject(new Error(`API Error: ${res.statusCode} ${data}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (postData) req.write(JSON.stringify(postData));
        req.end();
    });
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    console.log('--- API Request Received ---');
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    console.log('GROQ_KEY_EXISTS:', !!GROQ_API_KEY);

    if (!GROQ_API_KEY) {
        console.error('CRITICAL: GROQ_API_KEY is missing in environment variables');
        return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    }

    const { action, messages, topic, difficulty, paymentId, durationMinutes, email, name, interviewerGender } = req.body;
    console.log('Action:', action, 'Topic:', topic, 'Gender:', interviewerGender);

    // SECURITY: verify the payment is real/captured/matches the claimed
    // duration before starting a paid interview. Previously `paymentId` was
    // accepted and merely logged -- never checked against Razorpay -- so a
    // fabricated/unrelated paymentId (or none at all) still started the
    // paid session for free.
    if (action === 'start' && Number(durationMinutes) > 10) {
        const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
        const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            return res.status(500).json({ error: 'Payment gateway not configured on server' });
        }
        if (!paymentId || String(paymentId).startsWith('FREE_TRIAL_')) {
            return res.status(402).json({ error: 'Payment required for this interview duration' });
        }
        try {
            const { getExpectedInterviewOrder, isWithinTolerance } = await import('../lib/pricing.js');
            const authHeader = 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
            const payResp = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
                headers: { Authorization: authHeader }
            });
            if (!payResp.ok) {
                return res.status(402).json({ error: 'Payment not found or invalid' });
            }
            const payment = await payResp.json();
            if (payment.status !== 'captured') {
                return res.status(402).json({ error: `Payment not captured (status: ${payment.status})` });
            }
            const expected = await getExpectedInterviewOrder(durationMinutes, payment.currency);
            const capturedMajor = ['JPY', 'KRW', 'VND'].includes(String(payment.currency).toUpperCase())
                ? payment.amount
                : payment.amount / 100;
            if (!expected.ok || !isWithinTolerance(capturedMajor, expected.amountMajor)) {
                console.error('🚨 Interview payment amount mismatch:', { paymentId, durationMinutes, capturedMajor, expected });
                return res.status(402).json({ error: 'Payment amount does not match the selected interview duration' });
            }
        } catch (err) {
            console.error('Interview payment verification error:', err.message);
            return res.status(500).json({ error: 'Could not verify payment. Please try again.' });
        }
    }

    // Determine interviewer persona based on gender
    const isFemale = interviewerGender === 'female';
    const interviewerTitle = isFemale ? 'a senior female quant strategist' : 'a senior male quant strategist';
    const pronounHe = isFemale ? 'She' : 'He';
    const pronounHis = isFemale ? 'Her' : 'His';

    // System prompt — the quant interviewer persona
    const systemPrompt = `You are ${interviewerTitle} at a top-tier investment bank or quantitative hedge fund (Goldman Sachs / Citadel / Two Sigma / Jane Street level). You are conducting a live mock interview for a quantitative finance role.

INTERVIEW RULES:
- PHASE 1: INTRODUCTION. Start by introducing yourself with a realistic name matching your gender. State your title (e.g., "Senior Quant Strategist" or "VP, Quantitative Research"). Ask the candidate to briefly introduce themselves and their background.
- PHASE 2: WARM-UP. After introductions, ask 1-2 lighter questions to ease in (e.g., "What attracted you to quant finance?" or "Walk me through a recent project.").
- PHASE 3: TECHNICAL CORE. Progressively increase difficulty. Ask rigorous, interview-grade questions.
- SPEAK LIKE A HUMAN: Use natural fillers ("Hmm", "Right", "Okay", "Interesting", "Walk me through that"). Pause naturally. This helps voice synthesis sound realistic.
- Ask ONE question at a time. Wait for the candidate's response before proceeding.
- Questions must be realistic, unique, and desk-relevant — the kind asked in actual quant interviews.
- Mix question types: probability puzzles, mental math, stochastic calculus, pricing theory, coding logic, brain teasers, and practical desk scenarios.
- After the candidate answers, give brief, varied feedback (1-2 lines) then ask the next question.
- Track performance internally. Adjust difficulty based on how well the candidate answers.
- Never reveal the full solution immediately — guide with hints if they're stuck.
- SPEECH RECOGNITION CONTEXT: Input comes from live speech-to-text. Expect phonetic errors (e.g., "Mote Carlo" = Monte Carlo, "E toe" = Itô). Contextually infer the intended technical term WITHOUT mentioning the error.

TOPIC FOCUS: ${topic || 'General Quant'}
DIFFICULTY: ${difficulty || 'Mid-level'}

DIFFICULTY GUIDELINES:
- ENTRY-LEVEL: Basic probability (coin flips, dice), simple expected values, Black-Scholes intuition, basic Greeks, simple coding questions, fundamental statistics.
- MID-LEVEL: Conditional probability, Bayes theorem applications, option pricing derivations, basic stochastic calculus (Itô's lemma), Monte Carlo methods, moderate brain teasers, real interview-style questions from top firms.
- SENIOR-LEVEL: Advanced stochastic calculus, exotic option pricing, jump-diffusion models, PDE methods, measure theory intuition, complex brain teasers (e.g., "How many trailing zeros in 100!?"), system design for quant strategies, market microstructure.

IMPORTANT:
- Questions should feel like a REAL quant interview at Goldman Sachs or Citadel, NOT a textbook quiz.
- For mental math, give specific numbers and expect quick approximate answers. Example: "Quick — what's 17 × 23? You have 5 seconds."
- For probability, give concrete scenarios. Example: "You roll two dice. Given that the sum is greater than 7, what's the probability both dice show the same number?"
- For coding, ask about approach/pseudocode, not full syntax.
- Do NOT start every response with "Good job" or "Great answer". Be varied: "Right.", "Okay.", "Hmm, not quite.", "Let's move on.", or just ask the next question directly.
- If the candidate is vague, push back: "Why? Walk me through the reasoning." or "Can you be more precise?"
- If they're wrong, say so directly but diplomatically: "That's not quite right. Think about it differently."
- Maintain the persona of a busy, sharp practitioner — encouraging but demanding. ${pronounHe} has done hundreds of these interviews.`;

    try {
        let conversation = [];

        // 1. START INTERVIEW
        if (action === 'start') {
            conversation = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Begin the interview. Introduce yourself briefly (Name, Role at Bank) and ask the candidate to introduce themselves. Do NOT ask a technical question yet.' }
            ];

            // Log payment if present (future use)
            if (paymentId) console.log(`Starting interview for ${email} (${name}), Payment: ${paymentId}`);

            // Log to Supabase
            const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
            const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_OhbTYIuMYgGgmKPQJ9W7RA_rhKyaad0';
            if (SUPABASE_URL && SUPABASE_KEY) {
                try {
                    // Log to Supabase (Await ensures completion in serverless environments)
                    await fetch(`${SUPABASE_URL}/rest/v1/interview_sessions`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({
                            email: email || 'anonymous',
                            name: name || 'Anonymous',
                            topic: topic,
                            difficulty: difficulty,
                            payment_id: paymentId,
                            created_at: new Date().toISOString()
                        })
                    });
                    console.log('Logged to Supabase Successfully');
                } catch (e) {
                    console.error('Supabase Setup Error:', e);
                }
            }

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: conversation,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Groq API Start Error: ${response.status} ${errText}`);
            }

            const data = await response.json();
            return res.status(200).json({ reply: data.choices[0].message.content });
        }

        // 2. EVALUATE (END)
        if (action === 'evaluate') {
            // Generate Scorecard
            const evalConversation = [
                { role: 'system', content: systemPrompt },
                ...messages,
                { role: 'user', content: 'The interview is over. Generate a detailed performance scorecard in Markdown. Include: 1. Topic-wise rating (1-10), 2. Strengths, 3. Weaknesses, 4. Actionable study plan. Do not ask any more questions. Just the report.' }
            ];

            const data = await callGroqAPI(evalConversation, 0.3, GROQ_API_KEY);
            const markdownReport = data.choices[0].message.content;

            // Send Email
            if (email) {
                try {
                    await sendEmailReport(email, name || 'Candidate', markdownReport);
                } catch (emailErr) {
                    console.error('Failed to send email:', emailErr);
                }
            }

            return res.status(200).json({ reply: "Report generated and sent." });
        }

        // 2. RESPOND TO CANDIDATE
        if (action === 'respond') {
            console.log('Sending chat context to Groq...');
            // Prepend system prompt to ensure LLM stays in persona, remembers difficulty and topic constraints
            const fullHistory = [
                { role: 'system', content: systemPrompt },
                ...messages
            ];
            
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: fullHistory,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Groq API Respond Error: ${response.status} ${errText}`);
            }

            const data = await response.json();
            return res.status(200).json({ reply: data.choices[0].message.content });
        }
        // Default action if not start/evaluate/respond (should not be reached if all actions are handled)
        return res.status(400).json({ error: 'Invalid action specified' });

    } catch (error) {
        console.error('API Error:', error);
        // RETURN ACTUAL ERROR TO FRONTEND FOR DEBUGGING
        return res.status(500).json({ error: error.message || 'AI service error' });
    }
}

// Helper: Call Groq API
async function callGroqAPI(messages, temperature, apiKey) {
    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    };
    const body = {
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: temperature,
        max_tokens: 1024
    };
    return await httpRequest('https://api.groq.com/openai/v1/chat/completions', options, body);
}

// Helper: Simple Markdown to HTML for Email
function markdownToHtml(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^### (.*$)/gm, '<h3 style="color:#2563eb;margin-top:20px;">$1</h3>')
        .replace(/^## (.*$)/gm, '<h2 style="color:#1e40af;margin-top:25px;border-bottom:1px solid #ddd;padding-bottom:5px;">$1</h2>')
        .replace(/^- (.*$)/gm, '<li style="margin-bottom:5px;">$1</li>')
        .replace(/\n/g, '<br>');
}

// Helper: Send Email via Brevo
async function sendEmailReport(toEmail, toName, reportMarkdown) {
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_API_KEY) {
        console.warn('BREVO_API_KEY missing, skipping email');
        return;
    }

    const htmlReport = markdownToHtml(reportMarkdown);
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #333; line-height: 1.6;">
            <div style="background: #1e3a8a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin:0;">Desk2Quant AI Interview Results</h1>
            </div>
            <div style="padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Hi <strong>${toName}</strong>,</p>
                <p>Here is the detailed scorecard from your recent mock interview.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    ${htmlReport}
                </div>

                <div style="margin-top: 30px; text-align: center; font-size: 0.9em; color: #64748b;">
                    <p>Keep practicing! <a href="https://desk2quant.vercel.app" style="color: #2563eb;">Book a 1:1 session</a> for personalized feedback.</p>
                </div>
            </div>
        </div>
    `;

    const options = {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
        }
    };

    const body = {
        sender: { email: 'desk2quant@gmail.com', name: 'Desk2Quant AI' },
        to: [{ email: toEmail, name: toName }],
        subject: 'Your AI Interview Scorecard 📊',
        htmlContent: htmlContent,
        textContent: `Hi ${toName},\n\nHere is your AI Interview Scorecard:\n\n${reportMarkdown}\n\nKeep practicing! Book a 1:1 session for personalized feedback.`
    };

    await httpRequest('https://api.brevo.com/v3/smtp/email', options, body);
    console.log(`Email sent to ${toEmail}`);
}
