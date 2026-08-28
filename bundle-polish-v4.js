(function () {
    'use strict';

    const BUNDLE_ID = '164308cd-e3cd-4026-8fdc-337a5955ffff';

    function isBundlePage() {
        try {
            return String(new URLSearchParams(window.location.search).get('id') || '')
                .replace(/^['"]|['"]$/g, '') === BUNDLE_ID;
        } catch (_) {
            return false;
        }
    }

    if (!isBundlePage()) return;

    function addStyles() {
        if (document.getElementById('bundle-polish-v4-styles')) return;
        const style = document.createElement('style');
        style.id = 'bundle-polish-v4-styles';
        style.textContent = `
            /* Keep the entire bundle page in one light editorial visual system. */
            body.bundle-v2 .bundle-final-cta {
                background: #ffffff !important;
                color: #111827 !important;
                border: 1px solid #dfe7e5 !important;
                border-top: 4px solid #0f766e !important;
                box-shadow: 0 14px 38px rgba(15, 23, 42, .07) !important;
            }
            body.bundle-v2 .bundle-final-cta h2 {
                color: #111827 !important;
                -webkit-text-fill-color: #111827 !important;
                background: none !important;
                background-image: none !important;
                text-shadow: none !important;
            }
            body.bundle-v2 .bundle-final-cta p {
                color: #4b5563 !important;
                -webkit-text-fill-color: #4b5563 !important;
            }
            body.bundle-v2 .bundle-final-cta .bundle-final-price {
                color: #0f766e !important;
                -webkit-text-fill-color: #0f766e !important;
            }
            body.bundle-v2 .bundle-final-buy {
                background: #0f766e !important;
                color: #ffffff !important;
                border: 1px solid #0f766e !important;
                box-shadow: 0 8px 20px rgba(15, 118, 110, .16) !important;
            }
            body.bundle-v2 .bundle-final-buy:hover {
                background: #115e59 !important;
                border-color: #115e59 !important;
            }

            /* Do not show an arbitrary crossed-out original/list price on this bundle. */
            body.bundle-v2 #p-price span[style*="line-through"] {
                display: none !important;
            }
            body.bundle-v2 .bundle-price-note {
                margin-top: 2px;
                padding: 9px 11px;
                width: fit-content;
                max-width: 100%;
                border: 1px solid #dfe7e5;
                border-radius: 9px;
                background: #fbfdfc;
                color: #4b5563;
            }
            body.bundle-v2 .bundle-price-note code {
                background: transparent;
                border: 0;
                padding: 0;
            }

            /* Make the price-proof block read as evidence, not promotion. */
            body.bundle-v2 .bundle-compare-card,
            body.bundle-v2 .bundle-value-card,
            body.bundle-v2 .bundle-proof-reviews {
                box-shadow: none !important;
                background: #ffffff !important;
            }
            body.bundle-v2 .bundle-saving {
                background: #fbfdfc;
            }

            @media (max-width: 768px) {
                body.bundle-v2 .bundle-final-cta {
                    border-radius: 16px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function formatCurrentPrice() {
        const buy = document.getElementById('buy-btn');
        if (!buy) return '₹7,999';
        const amount = Number(buy.dataset.price);
        const currency = String(buy.dataset.currency || 'INR').toUpperCase();
        if (!Number.isFinite(amount) || amount <= 0) return '₹7,999';
        if (currency === 'INR') return `₹${Math.round(amount).toLocaleString('en-IN')}`;
        return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
    }

    function cleanHeroPricing() {
        const note = document.querySelector('.bundle-price-note');
        if (note) {
            note.innerHTML = 'Use <code>COMBINED10</code> at checkout for 10% off.';
        }
    }

    function syncFinalPrice() {
        const target = document.getElementById('bundle-final-price');
        const buy = document.getElementById('buy-btn');
        if (!target) return;
        const applied = buy && buy.dataset.couponCode;
        target.textContent = applied
            ? `${formatCurrentPrice()} • ${String(applied).toUpperCase()} applied`
            : `${formatCurrentPrice()} • Use COMBINED10 for 10% off`;
    }

    function cleanFinalCard() {
        const card = document.getElementById('bundle-buy');
        if (!card) return;
        const heading = card.querySelector('h2');
        const body = card.querySelector('p:not(.bundle-final-price)');
        if (heading) heading.textContent = 'One structured quant library. One clear next step.';
        if (body) body.textContent = '41+ PDFs • 60+ scripts • 1000+ interview problems • Python + C++ + SQL';
        syncFinalPrice();
    }

    function cleanProofSection() {
        const proof = document.getElementById('bundle-proof');
        if (!proof) return;

        const sectionHead = proof.querySelector('.bundle-section-head');
        if (sectionHead) {
            const eyebrow = sectionHead.querySelector('span');
            const heading = sectionHead.querySelector('h2');
            const copy = sectionHead.querySelector('p');
            if (eyebrow) eyebrow.textContent = 'Transparent comparison';
            if (heading) heading.textContent = 'Compare against actual standalone resources.';
            if (copy) copy.textContent = 'The prices below are current catalogue prices for selected resources already included in the bundle. No artificial “list value” is used.';
        }

        const compare = proof.querySelector('.bundle-compare-card');
        if (compare) {
            compare.innerHTML = `
                <h3>Simple price comparison</h3>
                <p class="bundle-proof-muted">Use the live total on the left as the reference point. The bundle includes those resources plus additional PDFs, scripts, projects and interview material.</p>
                <div class="bundle-savings-stack">
                    <div class="bundle-saving"><span>Complete Bundle</span><strong>₹7,999</strong></div>
                    <div class="bundle-saving"><span>With COMBINED10</span><strong>≈ ₹7,199</strong></div>
                    <div class="bundle-saving"><span>Delivery</span><strong>Digital + My Access</strong></div>
                </div>
                <div class="bundle-compare-table" aria-label="Individual resources versus complete bundle">
                    <div class="bundle-compare-row"><span></span><span>Individual</span><span>Bundle</span></div>
                    <div class="bundle-compare-row"><span>Learning sequence</span><span>Self-assemble</span><span class="bundle-compare-good">Structured</span></div>
                    <div class="bundle-compare-row"><span>Pricing + risk + XVA + validation</span><span>Separate</span><span class="bundle-compare-good">Together</span></div>
                    <div class="bundle-compare-row"><span>Projects + interview bank</span><span>Separate</span><span class="bundle-compare-good">Included</span></div>
                </div>
                <button type="button" class="bundle-proof-cta" id="bundle-proof-buy-clean">Get Complete Bundle <i class="fas fa-arrow-right"></i></button>`;

            const buy = document.getElementById('buy-btn');
            const proofBuy = document.getElementById('bundle-proof-buy-clean');
            if (buy && proofBuy) proofBuy.addEventListener('click', () => buy.click());
        }
    }

    function observePrice() {
        const price = document.getElementById('p-price');
        if (!price || price.dataset.bundlePolishObserved === '1') return;
        price.dataset.bundlePolishObserved = '1';
        new MutationObserver(() => {
            window.requestAnimationFrame(syncFinalPrice);
        }).observe(price, { childList: true, subtree: true, characterData: true });
    }

    function apply() {
        addStyles();
        cleanHeroPricing();
        cleanFinalCard();
        cleanProofSection();
        observePrice();
    }

    function init() {
        addStyles();
        let attempts = 0;
        const timer = window.setInterval(() => {
            attempts += 1;
            apply();
            if ((document.getElementById('bundle-buy') && document.getElementById('bundle-proof')) || attempts > 120) {
                window.clearInterval(timer);
                apply();
            }
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
