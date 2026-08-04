// Global fetch is used.
// Env variables loaded via --env-file=.env


const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_OhbTYIuMYgGgmKPQJ9W7RA_rhKyaad0';
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'desk2quant@gmail.com';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'desk2quant@gmail.com';
const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';

async function main() {
    if (!BREVO_API_KEY) {
        console.error("BREVO_API_KEY is not set.");
        return;
    }

    console.log("Fetching purchasers from Supabase...");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/purchases?select=customer_email`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch purchases: ${await res.text()}`);
    }

    const data = await res.json();

    // Extract unique emails
    const emailSet = new Set();
    for (const d of data) {
        if (d.customer_email && d.customer_email.includes('@')) {
            emailSet.add(d.customer_email.toLowerCase().trim());
        }
    }

    const uniqueEmails = Array.from(emailSet);
    console.log(`Found ${uniqueEmails.length} unique purchaser emails.`);

    if (uniqueEmails.length === 0) {
        console.log("No purchasers found. Exiting.");
        return;
    }

    // Email Content - Plain and non-marketing style
    const subject = "New Resource: Common Mistakes in Quant Interviews";
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111; line-height: 1.5;">
            <p>Hi,</p>
            <p>I wanted to quickly let you know that a new resource has been added to the website: <strong>Common Mistakes in Quant Interviews — Desk Fixes Edition</strong>.</p>
            <p>If you're interested, you can check it out here:<br>
            <a href="https://desk2quant.com/product.html?id=df618802-04a8-4fcf-837e-f12dc9db2276">https://desk2quant.com/product.html?id=df618802-04a8-4fcf-837e-f12dc9db2276</a></p>
            <p>Best regards,<br>
            Desk2Quant</p>
        </div>
    `;

    // Batching BCCs to avoid Brevo limits (max 99 recipients per email)
    const BATCH_SIZE = 50;
    let successCount = 0;

    for (let i = 0; i < uniqueEmails.length; i += BATCH_SIZE) {
        const batchEmails = uniqueEmails.slice(i, i + BATCH_SIZE);
        const bccList = batchEmails.map(email => ({ email }));

        console.log(`Sending email batch ${Math.floor(i / BATCH_SIZE) + 1} (${batchEmails.length} recipients)...`);

        try {
            const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: [{ email: ADMIN_EMAIL, name: 'Desk2Quant Admin' }],
                    bcc: bccList,
                    subject: subject,
                    htmlContent: htmlContent
                })
            });

            if (emailResponse.ok) {
                console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1} sent successfully.`);
                successCount += batchEmails.length;
            } else {
                const errorData = await emailResponse.text();
                console.error(`❌ Brevo Error for batch ${Math.floor(i / BATCH_SIZE) + 1}: ${emailResponse.status} - ${errorData}`);
            }
        } catch (err) {
            console.error(`Error sending batch ${Math.floor(i / BATCH_SIZE) + 1}:`, err);
        }
    }

    console.log(`\nFinished! Successfully sent to ${successCount} out of ${uniqueEmails.length} purchasers.`);
}

main().catch(console.error);
