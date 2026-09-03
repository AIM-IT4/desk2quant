/**
 * Desk2Quant shared UI component helpers.
 *
 * Existing product, booking, payment and simulator scripts keep ownership of
 * business behaviour. This layer only normalises navigation state and modal
 * accessibility across the static pages.
 */
(function () {
    'use strict';

    const MODAL_SELECTOR = [
        '.modal',
        '.promo-popup-modal',
        '.success-modal',
        '#user-details-modal',
        '.scorecard-overlay'
    ].join(',');

    const CLOSE_SELECTOR = [
        '.modal-close',
        '.promo-popup-close',
        '.success-modal-close',
        '[data-modal-close]',
        '[aria-label*="Close"]'
    ].join(',');

    const FOCUSABLE_SELECTOR = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    const modalState = new WeakMap();

    function isVisible(element) {
        if (!element || element.hidden) {
            return false;
        }

        const styles = window.getComputedStyle(element);
        return styles.display !== 'none' &&
            styles.visibility !== 'hidden' &&
            Number(styles.opacity || 1) !== 0;
    }

    function syncModalOpenClass() {
        document.body.classList.toggle('modal-open', getVisibleModals().length > 0);
    }

    function getVisibleModals() {
        return Array.from(document.querySelectorAll(MODAL_SELECTOR)).filter(isVisible);
    }

    function ensureModalLabel(modal) {
        if (modal.hasAttribute('aria-label') || modal.hasAttribute('aria-labelledby')) {
            return;
        }

        const heading = modal.querySelector('h1, h2, h3');
        if (!heading) {
            modal.setAttribute('aria-label', 'Dialog');
            return;
        }

        if (!heading.id) {
            heading.id = `d2q-modal-title-${Math.random().toString(36).slice(2, 9)}`;
        }
        modal.setAttribute('aria-labelledby', heading.id);
    }

    function enhanceModal(modal) {
        if (modal.dataset.d2qModalReady === 'true') {
            return;
        }

        modal.dataset.d2qModalReady = 'true';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('tabindex', '-1');
        ensureModalLabel(modal);

        modalState.set(modal, {
            wasVisible: false,
            returnFocus: null
        });
    }

    function syncModal(modal) {
        enhanceModal(modal);

        const state = modalState.get(modal);
        const visible = isVisible(modal);

        if (visible && !state.wasVisible) {
            state.returnFocus = document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            if (modal.getAttribute('aria-hidden') !== 'false') {
                modal.setAttribute('aria-hidden', 'false');
            }

            window.requestAnimationFrame(function () {
                const firstTarget = modal.querySelector(CLOSE_SELECTOR) ||
                    modal.querySelector(FOCUSABLE_SELECTOR) ||
                    modal;
                if (firstTarget instanceof HTMLElement) {
                    firstTarget.focus({ preventScroll: true });
                }
            });
        }

        if (!visible) {
            if (modal.getAttribute('aria-hidden') !== 'true') {
                modal.setAttribute('aria-hidden', 'true');
            }
            if (state.wasVisible && state.returnFocus && document.contains(state.returnFocus)) {
                state.returnFocus.focus({ preventScroll: true });
            }
        }

        state.wasVisible = visible;
        syncModalOpenClass();
        // isVisible() reads computed opacity, so during a modal's CSS fade-out
        // the element still measures as visible and 'modal-open' (which sets
        // overflow: hidden on body) gets re-added. Nothing fires afterwards to
        // clear it, so the page stayed unscrollable. Re-check once the
        // transition finishes, and again on a short fallback timer for browsers
        // or reduced-motion settings where transitionend never fires.
        modal.addEventListener('transitionend', syncModalOpenClass, { once: true });
        window.setTimeout(syncModalOpenClass, 450);
    }

    function closeModal(modal) {
        const closeControl = modal.querySelector(CLOSE_SELECTOR);
        if (closeControl instanceof HTMLElement) {
            closeControl.click();
            return;
        }

        modal.classList.remove('active', 'show', 'visible');
        modal.style.display = 'none';
        modal.dispatchEvent(new CustomEvent('d2q:modal-close', { bubbles: true }));
        syncModal(modal);
    }

    function openModal(modalOrSelector) {
        const modal = typeof modalOrSelector === 'string'
            ? document.querySelector(modalOrSelector)
            : modalOrSelector;

        if (!(modal instanceof HTMLElement)) {
            return null;
        }

        enhanceModal(modal);
        modal.style.display = 'flex';
        modal.classList.add('active');
        modal.dispatchEvent(new CustomEvent('d2q:modal-open', { bubbles: true }));
        syncModal(modal);
        return modal;
    }

    function trapModalFocus(event, modal) {
        const focusable = Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter(function (element) {
                return isVisible(element);
            });

        if (!focusable.length) {
            event.preventDefault();
            modal.focus();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function initialiseFavicon() {
        document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(function (link) {
            link.setAttribute('href', 'assets/images/desk2quant-favicon.svg?v=2');
            link.setAttribute('type', 'image/svg+xml');
        });
    }

    function initialiseBrandMarks() {
        document.querySelectorAll('.logo-img').forEach(function (image) {
            image.setAttribute('src', 'assets/images/desk2quant-mark.svg?v=1');
        });

        document.querySelectorAll('.navbar .logo-img').forEach(function (image) {
            if (image.parentElement && image.parentElement.classList.contains('logo-mark')) {
                return;
            }

            const mark = document.createElement('span');
            mark.className = 'logo-mark';
            mark.setAttribute('aria-hidden', 'true');
            image.parentNode.insertBefore(mark, image);
            mark.appendChild(image);
        });
    }

    function markCurrentNavigation() {
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.navbar a[href], .footer a[href]').forEach(function (link) {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:')) {
                return;
            }

            const linkPath = href.split('#')[0].split('?')[0] || 'index.html';
            if (linkPath === currentPath) {
                link.setAttribute('aria-current', 'page');
            }
        });
    }

    function ensureStylesheet(id, href) {
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    // Presentation/observability enhancements only. These modules never own
    // checkout, payment verification, delivery, booking or access authorization.
    function loadPageEnhancements() {
        const path = window.location.pathname;
        const modules = [
            ['d2q-funnel-analytics', '/funnel-analytics.js?v=20260828a']
        ];
        if (path === '/' || path === '/index.html') {
            ensureStylesheet('d2q-blog-reader-style', '/blog-modal-fix.css?v=20260828b');
            modules.push(['d2q-homepage-exa-v2', '/homepage-exa-v2.js?v=20260828a']);
        }
        if (path === '/my-access.html') {
            modules.push(['d2q-my-access-learning', '/my-access-learning.js?v=20260828a']);
        }
        modules.forEach(function ([id, src]) {
            if (document.getElementById(id)) return;
            const script = document.createElement('script');
            script.id = id;
            script.src = src;
            script.defer = true;
            document.head.appendChild(script);
        });
    }

    function initialiseComponents() {
        initialiseFavicon();
        initialiseBrandMarks();
        markCurrentNavigation();
        loadPageEnhancements();

        document.querySelectorAll(MODAL_SELECTOR).forEach(function (modal) {
            enhanceModal(modal);
            syncModal(modal);
        });

        const observer = new MutationObserver(function (mutations) {
            const touchedModals = new Set();
            mutations.forEach(function (mutation) {
                const target = mutation.target instanceof Element
                    ? mutation.target.closest(MODAL_SELECTOR)
                    : null;
                if (target) {
                    touchedModals.add(target);
                }
            });
            touchedModals.forEach(syncModal);
        });

        observer.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
        });
    }

    document.addEventListener('keydown', function (event) {
        const visibleModals = getVisibleModals();
        const modal = visibleModals[visibleModals.length - 1];
        if (!modal) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            closeModal(modal);
        } else if (event.key === 'Tab') {
            trapModalFocus(event, modal);
        }
    });

    window.D2QModal = {
        open: openModal,
        close: closeModal,
        sync: syncModal
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialiseComponents, { once: true });
    } else {
        initialiseComponents();
    }
}());

/*
 * Bundle merchandising guard.
 * The homepage sales layer historically hard-coded the flagship price and
 * bundle counts, so a catalog price change could leave stale copy on-screen.
 * This small presentation-only guard reads the live bundle record and keeps
 * the visible homepage offer aligned with the product database.
 */
(function () {
    'use strict';

    const BUNDLE_ID = '164308cd-e3cd-4026-8fdc-337a5955ffff';
    const FALLBACK_PRICE = 8999;

    function formatInr(value) {
        const amount = Number(value);
        return `₹${Math.round(Number.isFinite(amount) ? amount : FALLBACK_PRICE).toLocaleString('en-IN')}`;
    }

    function replaceText(root, from, to) {
        if (!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (node) {
            if (node.nodeValue && node.nodeValue.includes(from)) {
                node.nodeValue = node.nodeValue.split(from).join(to);
            }
        });
    }

    function applyBundleCopy(price) {
        const formatted = formatInr(price);
        const homeRoots = [
            document.getElementById('hero'),
            document.getElementById('flagship-bundle')
        ].filter(Boolean);

        homeRoots.forEach(function (root) {
            replaceText(root, '₹7,999', formatted);
            replaceText(root, '41+ high-quality PDFs', '46+ high-quality PDFs');
            replaceText(root, '41+ PDFs', '46+ PDFs');
        });

        const flagship = document.getElementById('flagship-bundle');
        if (flagship) {
            const grid = flagship.querySelector('.flagship-grid');
            if (grid && !grid.querySelector('[data-d2q-notebooks]')) {
                const item = document.createElement('div');
                item.className = 'flagship-point';
                item.setAttribute('data-d2q-notebooks', 'true');
                item.innerHTML = '<i class="fas fa-check-circle"></i><span><strong>59 Jupyter notebooks</strong> for executable research and model workflows</span>';
                const scriptPoint = Array.from(grid.children).find(function (child) {
                    return /60\+ scripts/i.test(child.textContent || '');
                });
                if (scriptPoint && scriptPoint.nextSibling) {
                    grid.insertBefore(item, scriptPoint.nextSibling);
                } else {
                    grid.appendChild(item);
                }
            }
        }
    }

    async function getLivePrice() {
        try {
            const response = await fetch('/api/products', { cache: 'no-store' });
            if (!response.ok) throw new Error(`products ${response.status}`);
            const payload = await response.json();
            const products = Array.isArray(payload) ? payload : (payload.products || []);
            const bundle = products.find(function (product) {
                return String(product && product.id) === BUNDLE_ID;
            });
            return bundle && Number(bundle.price) > 0 ? Number(bundle.price) : FALLBACK_PRICE;
        } catch (_) {
            return FALLBACK_PRICE;
        }
    }

    async function initBundleGuard() {
        const path = window.location.pathname;
        if (!(path === '/' || path === '/index.html')) return;

        const price = await getLivePrice();
        applyBundleCopy(price);

        let queued = false;
        const observer = new MutationObserver(function () {
            if (queued) return;
            queued = true;
            window.requestAnimationFrame(function () {
                queued = false;
                applyBundleCopy(price);
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(function () {
            applyBundleCopy(price);
            observer.disconnect();
        }, 12000);
    }

    function initWhatsAppHotline() {
        if (document.getElementById('d2q-whatsapp-widget')) return;
        const widget = document.createElement('aside');
        widget.id = 'd2q-whatsapp-widget';
        widget.className = 'd2q-whatsapp-widget';
        widget.setAttribute('aria-label', 'Chat with Amit on WhatsApp');
        widget.innerHTML = `
            <a href="https://wa.me/919958742542?text=Hi%20Amit%2C%20I%20am%20exploring%20Desk2Quant%20for%20quant%20finance%20preparation.%20Could%20you%20help%20guide%20me%20on%20the%20best%20path%3F"
               target="_blank" rel="noopener noreferrer" class="whatsapp-float-btn" title="Chat directly with Amit on WhatsApp" aria-label="Chat directly with Amit on WhatsApp">
                <i class="fab fa-whatsapp" aria-hidden="true"></i>
                <span class="whatsapp-tooltip">Ask Amit on WhatsApp</span>
                <span class="whatsapp-pulse-dot"></span>
            </a>
        `;
        document.body.appendChild(widget);
    }

    function onReady() {
        initBundleGuard();
        initWhatsAppHotline();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
        onReady();
    }
}());
