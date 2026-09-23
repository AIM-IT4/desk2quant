(() => {
'use strict';

const RAZORPAY_SDK_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpaySdkPromise = null;

function loadRazorpaySdk() {
    if (typeof window.Razorpay !== 'undefined') return Promise.resolve();
    if (razorpaySdkPromise) return razorpaySdkPromise;

    razorpaySdkPromise = new Promise((resolve, reject) => {
        let script = document.querySelector('script[src*="checkout.razorpay.com/v1/checkout.js"]');
        let settled = false;

        const cleanup = () => clearTimeout(timeout);
        const succeed = () => {
            if (settled) return;
            if (typeof window.Razorpay === 'undefined') {
                fail(new Error('Razorpay SDK loaded without exposing the checkout API'));
                return;
            }
            settled = true;
            cleanup();
            resolve();
        };
        const fail = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            razorpaySdkPromise = null;
            if (script?.dataset?.d2qRazorpay === 'lazy') script.remove();
            reject(error instanceof Error ? error : new Error('Razorpay SDK failed to load'));
        };
        const timeout = setTimeout(
            () => fail(new Error('Razorpay SDK load timed out')),
            12000
        );

        if (script) {
            script.addEventListener('load', succeed, { once: true });
            script.addEventListener('error', () => fail(new Error('Razorpay SDK failed to load')), { once: true });
            if (typeof window.Razorpay !== 'undefined') succeed();
            return;
        }

        script = document.createElement('script');
        script.src = RAZORPAY_SDK_SRC;
        script.async = true;
        script.dataset.d2qRazorpay = 'lazy';
        script.addEventListener('load', succeed, { once: true });
        script.addEventListener('error', () => fail(new Error('Razorpay SDK failed to load')), { once: true });
        document.head.appendChild(script);
    });

    return razorpaySdkPromise;
}

if (typeof window.loadRazorpaySdk !== 'function') {
    window.loadRazorpaySdk = loadRazorpaySdk;
}
})();
