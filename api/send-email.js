export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { to, subject, htmlContent, textContent } = req.body;

        if (!to || !subject || (!htmlContent && !textContent)) {
            return res.status(400).json({ error: 'Missing required email fields' });
        }

        const brevoApiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.SENDER_EMAIL || 'desk2quant@gmail.com';
        const senderName = process.env.SENDER_NAME || 'Desk2Quant';

        if (!brevoApiKey) {
            console.error('SERVER ERROR: BREVO_API_KEY is not configured in Vercel');
            return res.status(500).json({ error: 'Email service configuration error' });
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': brevoApiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { email: senderEmail, name: senderName },
                to: to.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
                subject: subject,
                htmlContent: htmlContent,
                textContent: textContent
            })
        });

        if (response.ok) {
            const data = await response.json();
            return res.status(200).json({ success: true, messageId: data.messageId });
        } else {
            const error = await response.json();
            console.error('Brevo API Error:', error);
            return res.status(response.status).json({ success: false, error: error.message || 'Failed to send email' });
        }
    } catch (error) {
        console.error('Email Sender Function Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
