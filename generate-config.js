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
const content = `// Auto-generated config.js
const CONFIG = {
    BREVO_SENDER_EMAIL: '${process.env.BREVO_SENDER_EMAIL || 'desk2quant@gmail.com'}',
    BREVO_SENDER_NAME: '${process.env.BREVO_SENDER_NAME || 'Desk2Quant'}'
};
window.CONFIG = CONFIG;

// Recommendation-email coupons use a simple NAME20 format.
// Accept them directly without asking the customer to verify an email address.
document.addEventListener('click', function (event) {
    const applyButton = event.target.closest('#apply-coupon-btn');
    if (!applyButton) return;

    const codeInput = document.getElementById('coupon-input');
    const feedbackMsg = document.getElementById('coupon-feedback');
    const priceEl = document.getElementById('p-price');
    const buyBtn = document.getElementById('buy-btn');
    if (!codeInput || !feedbackMsg || !priceEl || !buyBtn) return;

    const code = codeInput.value.trim().toUpperCase();
    if (!/^[A-Z]+20$/.test(code)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    let originalPrice = Number.parseFloat(buyBtn.dataset.price);
    if (!Number.isFinite(originalPrice)) {
        const match = (priceEl.textContent || '').match(/\d+/);
        originalPrice = match ? Number.parseFloat(match[0]) : 799;
    }

    const discountedPrice = Math.max(0, originalPrice * 0.8);
    const currentCurrency = buyBtn.dataset.currency || 'INR';
    let priceDisplay;

    if (currentCurrency === 'INR') {
        const roundedPrice = Math.round(discountedPrice);
        priceDisplay = '₹' + roundedPrice;
        priceEl.innerHTML = '<span style="text-decoration:line-through; color:var(--text-muted); font-size:0.8em; margin-right:10px;">₹' + originalPrice + '</span> ' + priceDisplay;
        buyBtn.dataset.price = String(roundedPrice);
    } else {
        const fixedPrice = discountedPrice.toFixed(2);
        priceDisplay = fixedPrice + ' ' + currentCurrency;
        priceEl.innerHTML = '<span style="text-decoration:line-through; color:var(--text-muted); font-size:0.8em; margin-right:10px;">' + originalPrice.toFixed(2) + ' ' + currentCurrency + '</span> ' + priceDisplay;
        buyBtn.dataset.price = fixedPrice;
    }

    buyBtn.innerHTML = '<i class="fas fa-credit-card"></i> Buy Now - ' + priceDisplay;
    buyBtn.dataset.couponCode = code;
    feedbackMsg.textContent = "Coupon '" + codeInput.value.trim() + "' applied! 20% OFF applied successfully.";
    feedbackMsg.style.color = '#22c55e';
    codeInput.disabled = true;
    applyButton.disabled = true;
    applyButton.textContent = 'Applied';
}, true);
`;

const configPath = path.join(__dirname, 'config.js');

try {
    fs.writeFileSync(configPath, content);
    console.log('✅ Successfully generated config.js from environment variables');
} catch (err) {
    console.error('❌ Failed to generate config.js:', err);
    process.exit(1);
}
