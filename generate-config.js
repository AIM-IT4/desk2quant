const fs = require('fs');
const path = require('path');

// config.js content based on environment variables
//
// NOTE: BREVO_API_KEY is deliberately NOT emitted here anymore. This file is
// served as a public static asset (config.js), and shipping the real Brevo
// key in it exposed a live credential to anyone who fetched /config.js.
// All email now goes through the /api/send-email serverless relay (which
// reads BREVO_API_KEY from the environment server-side), so no client code
// needs the key. The sender identity is harmless and kept for reference.
//
// Coupon handling deliberately does NOT live in config.js. product.html,
// script.js/cart and lib/pricing.js already contain the validated coupon
// rules and propagate the applied code into server-authoritative checkout.
// Duplicating coupon logic here previously intercepted broad *20 codes before
// the real validator, which could make an invalid/mis-targeted code look
// discounted in the UI until create-order.js corrected the amount.
const content = `// Auto-generated config.js
const CONFIG = {
    BREVO_SENDER_EMAIL: '${process.env.BREVO_SENDER_EMAIL || 'desk2quant@gmail.com'}',
    BREVO_SENDER_NAME: '${process.env.BREVO_SENDER_NAME || 'Desk2Quant'}'
};
window.CONFIG = CONFIG;
`;

const configPath = path.join(__dirname, 'config.js');

try {
    fs.writeFileSync(configPath, content);
    console.log('✅ Successfully generated config.js from environment variables');
} catch (err) {
    console.error('❌ Failed to generate config.js:', err);
    process.exit(1);
}
