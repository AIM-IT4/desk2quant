// One-off catch-up send: recommendation emails that should have gone out
// automatically after purchase but didn't fire (see razorpay-webhook.js
// fire-and-forget bug — being fixed separately).
//
// Sends each customer a NAME20 coupon (their first name + '20', e.g. VENKAT20)
// which is universally accepted by product.html's coupon logic
// (any code matching /^[A-Z]+20$/ = 20% off), so these codes are guaranteed
// to work at checkout — same mechanism as the automated post-purchase email.
//
// Run: node scripts/send-missed-recommendations.js [--dry-run]

const fs = require('fs');
const path = require('path');

let brevoApiKey = '';
try {
    const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
    const match = envContent.match(/BREVO_API_KEY\s*=\s*"?([^"\n]*)"?/);
    if (match) brevoApiKey = match[1].trim();
} catch (err) {
    console.error('Error reading .env.local:', err);
}
if (!brevoApiKey) {
    console.error('Error: BREVO_API_KEY not found');
    process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');

// Real customers + real purchases confirmed via Supabase/Razorpay
const customers = require('./missed-recs-data.js');

async function sendOne(customer) {
    const { buildEmail } = require('./missed-recs-template.js');
    const { subject, htmlContent, textContent } = buildEmail(customer);

    console.log(`${isDryRun ? '[DRY RUN] Would send' : 'Sending'} to ${customer.email} (coupon ${customer.couponCode})...`);
    if (isDryRun) return;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { accept: 'application/json', 'api-key': brevoApiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
            sender: { email: 'jha.8@alumni.iitj.ac.in', name: 'Desk2Quant' },
            to: [{ email: customer.email, name: customer.name }],
            subject,
            htmlContent,
            textContent
        })
    });

    if (response.ok) {
        const data = await response.json();
        console.log(`  ✅ Sent. Message ID: ${data.messageId}`);
    } else {
        const errText = await response.text();
        console.error(`  ❌ Failed: ${response.status} ${errText}`);
    }
}

(async () => {
    for (const c of customers) {
        await sendOne(c);
    }
    console.log('Done.');
})();
