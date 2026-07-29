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

// Recommendation-email coupons are validated by exact issued code only.
// No email or other customer detail is requested at checkout.
document.addEventListener('click', async function (event) {
    const applyButton = event.target.closest('#apply-coupon-btn');
    if (!applyButton) return;

    const codeInput = document.getElementById('coupon-input');
    const feedbackMsg = document.getElementById('coupon-feedback');
    const priceEl = document.getElementById('p-price');
    const buyBtn = document.getElementById('buy-btn');
    if (!codeInput || !feedbackMsg || !priceEl || !buyBtn) return;

    const code = codeInput.value.trim().toUpperCase();
    // Recommendation codes contain a name/token prefix and end in 20.
    // Other campaign/product coupons continue through the existing handler.
    if (!/^[A-Z]{3,40}20$/.test(code)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const originalButtonText = applyButton.textContent;
    applyButton.disabled = true;
    applyButton.textContent = 'Checking...';
    feedbackMsg.textContent = '';

    try {
        const response = await fetch('/api/validate-recommendation-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
        });
        const result = await response.json().catch(function () { return {}; });

        if (!response.ok) {
            throw new Error(result.error || 'Coupon validation failed');
        }

        if (!result.valid || result.discount !== 20) {
            feedbackMsg.textContent = 'This recommendation coupon is not valid.';
            feedbackMsg.style.color = '#ef4444';
            return;
        }

        const originalPrice = Number.parseFloat(buyBtn.dataset.price);
        if (!Number.isFinite(originalPrice)) {
            throw new Error('Product price is unavailable');
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
        feedbackMsg.textContent = "Coupon '" + code + "' applied! 20% OFF applied successfully.";
        feedbackMsg.style.color = '#22c55e';
        codeInput.disabled = true;
        applyButton.textContent = 'Applied';
    } catch (error) {
        console.error('Recommendation coupon validation failed:', error);
        feedbackMsg.textContent = 'Could not verify this coupon right now. Please try again.';
        feedbackMsg.style.color = '#ef4444';
    } finally {
        if (!codeInput.disabled) {
            applyButton.disabled = false;
            applyButton.textContent = originalButtonText;
        }
    }
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
