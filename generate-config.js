const fs = require('fs');
const path = require('path');

// config.js content based on environment variables
const content = `// Auto-generated config.js
const CONFIG = {
    BREVO_API_KEY: '${process.env.BREVO_API_KEY || 'xkeysib-your-api-key-here'}',
    BREVO_SENDER_EMAIL: '${process.env.BREVO_SENDER_EMAIL || 'jha.8@alumni.iitj.ac.in'}',
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

    const originalPrice = Number.parseFloat(buyBtn.dataset.price);
    if (!Number.isFinite(originalPrice)) {
        feedbackMsg.textContent = 'Unable to apply this coupon right now.';
        feedbackMsg.style.color = '#ef4444';
        return;
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
