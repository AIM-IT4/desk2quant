/**
 * Desk2Quant // Mini Thermal Receipt Printer & Tax Invoice Generator
 * Renders an animated POS thermal printer popup with a jagged paper-cut receipt.
 */
(function () {
    'use strict';

    // Simple Web Audio API Synthesizer for Authentic Thermal Printer Sound
    function playPrinterSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            // Create 3 subtle rhythmic micro-bursts of filtered thermal stepper buzz
            const bursts = [0, 0.35, 0.75, 1.15];
            bursts.forEach((startTime) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();

                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(140, ctx.currentTime + startTime);
                osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + startTime + 0.18);

                filter.type = 'bandpass';
                filter.frequency.value = 850;
                filter.Q.value = 3;

                gain.gain.setValueAtTime(0.045, ctx.currentTime + startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + 0.18);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);

                osc.start(ctx.currentTime + startTime);
                osc.stop(ctx.currentTime + startTime + 0.2);
            });
        } catch (_) {
            // Audio policy or unsupported: fail silently
        }
    }

    function formatReceiptDate(d) {
        const date = d ? new Date(d) : new Date();
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const day = String(date.getDate()).padStart(2, '0');
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const mins = String(date.getMinutes()).padStart(2, '0');
        return `${day}-${month}-${year} ${hours}:${mins}`;
    }

    function generateInvoiceNumber(paymentId) {
        const year = new Date().getFullYear();
        if (paymentId && paymentId.startsWith('pay_')) {
            const clean = paymentId.replace('pay_', '').substring(0, 7).toUpperCase();
            return `INV-${year}-${clean}`;
        }
        if (paymentId && /^FREE(?:_|-|$)/i.test(paymentId)) {
            const clean = paymentId
                .replace(/^FREE(?:_|-)?/i, '')
                .replace(/[^a-zA-Z0-9]/g, '')
                .substring(0, 7)
                .toUpperCase();
            return `INV-${year}-FREE-${clean || Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        }
        const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `INV-${year}-${rand}`;
    }

    function escapeHtml(text) {
        if (text == null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeDownloadLink(link) {
        if (!link || typeof link !== 'string' || link.trim() === '#') {
            return 'my-access.html';
        }
        const trimmed = link.trim();
        // Strictly allow https: scheme
        if (/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)) {
            return trimmed;
        }
        // Allow relative paths: must not contain a protocol scheme (no ':' before '/')
        // and must not start with '//' (protocol-relative)
        if (!trimmed.startsWith('//') && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
            return trimmed;
        }
        return 'my-access.html';
    }

    function notifyInvoiceUnavailable() {
        const message = 'Invoice details are unavailable for this access event.';
        console.warn('[Desk2Quant receipt]', message);
        if (typeof window.showToast === 'function') {
            window.showToast(message, 'info', 4500);
        }
    }

    function createOrGetModal() {
        let modal = document.getElementById('receiptPrinterModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'receiptPrinterModal';
            modal.className = 'receipt-printer-backdrop';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-label', 'Tax Invoice & Receipt Printer');
            document.body.appendChild(modal);

            // Close on backdrop click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    window.closeReceiptPrinter();
                }
            });

            // Close on ESC key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.classList.contains('active')) {
                    window.closeReceiptPrinter();
                }
            });
        }
        return modal;
    }

    window.closeReceiptPrinter = function () {
        const modal = document.getElementById('receiptPrinterModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflowY = '';
        }
    };

    window.printReceipt = function () {
        window.print();
    };

    window.showReceiptPrinter = function (orderData) {
        const data = (orderData && typeof orderData === 'object') ? orderData : null;
        if (!data) {
            notifyInvoiceUnavailable();
            return;
        }

        let items = [];
        if (Array.isArray(data.items) && data.items.length > 0) {
            items = data.items;
        } else if (data.productName) {
            const names = Array.isArray(data.productName) ? data.productName : [data.productName];
            const perItemAmt = data.amount ? Math.round(data.amount / names.length) : 0;
            items = names.map(name => ({ name, price: perItemAmt }));
        } else {
            notifyInvoiceUnavailable();
            return;
        }

        const totalAmount = data.amount !== undefined
            ? Number(data.amount)
            : items.reduce((acc, i) => acc + (Number(i.price) || 0), 0);
        if (!Number.isFinite(totalAmount) || totalAmount < 0) {
            notifyInvoiceUnavailable();
            return;
        }

        // Zero-value/free resources still receive a proper invoice. They must never
        // inherit a previous paid transaction or the old ₹7,999 demo fallback.
        const isFree = data.isFree === true || totalAmount === 0 || /^FREE(?:_|-|$)/i.test(String(data.paymentId || ''));
        let paymentId = (typeof data.paymentId === 'string') ? data.paymentId.trim() : '';
        if (!paymentId && isFree) {
            paymentId = `FREE_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
        }
        if (!paymentId) {
            notifyInvoiceUnavailable();
            return;
        }

        const modal = createOrGetModal();
        const invoiceNo = generateInvoiceNumber(paymentId);
        const dateStr = formatReceiptDate(data.date);
        const customerEmail = data.customerEmail || data.email || 'customer@desk2quant.com';
        const currency = data.currency || 'INR';
        const currSymbol = currency === 'USD' ? '$' : (currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : '₹'));
        const invoiceBadge = isFree ? 'ZERO-VALUE INVOICE & OFFICIAL RECEIPT' : 'TAX INVOICE & OFFICIAL RECEIPT';
        const paymentLabel = isFree ? 'COMPLIMENTARY / NO CHARGE' : 'ONLINE / PAID';
        const statusLabel = isFree ? 'FREE RESOURCE • NO PAYMENT REQUIRED' : 'PAYMENT CAPTURED • VERIFIED';
        const accessMessage = isFree
            ? 'Complimentary lifetime access has been authorized.'
            : 'Immediate lifetime access has been authorized.';

        // Compute 18% inclusive GST for display. For a free resource this is
        // naturally ₹0 subtotal and ₹0 tax.
        const gstAmount = Math.round((totalAmount - (totalAmount / 1.18)) * 100) / 100;
        const subtotal = Math.round((totalAmount - gstAmount) * 100) / 100;

        const downloadLink = sanitizeDownloadLink(data.downloadLink);

        // Render HTML inside modal
        modal.innerHTML = `
            <div class="receipt-printer-dialog">
                <!-- MINI POS PRINTER CASING -->
                <div class="thermal-printer-machine is-printing" id="printerMachineCasing">
                    <div class="printer-controls-bar">
                        <div class="printer-brand">
                            <span class="printer-brand-logo"></span>
                            <span>Desk2Quant POS-80</span>
                        </div>
                        <div class="printer-status-light" id="printerStatusBadge">
                            <span class="status-dot"></span>
                            <span id="printerStatusText">PRINTING INVOICE...</span>
                        </div>
                    </div>
                    <div class="printer-eject-mouth">
                        <div class="printer-tear-blade"></div>
                    </div>
                </div>

                <!-- PAPER FEED CHAMBER (JAGGED SAWTOOTH CUT DESIGN) -->
                <div class="printer-feed-chamber">
                    <div class="receipt-paper-sheet" id="receiptPaperSheet">
                        <!-- RECEIPT HEADER -->
                        <div class="receipt-header">
                            <h2 class="receipt-logo-title">DESK2QUANT</h2>
                            <p class="receipt-subtitle">Desk-Ready Quant Finance Preparation</p>
                            <span class="receipt-badge-tax">${escapeHtml(invoiceBadge)}</span>
                        </div>

                        <!-- METADATA -->
                        <div class="receipt-meta-grid">
                            <div class="receipt-row">
                                <span class="receipt-row-label">INVOICE NO:</span>
                                <span class="receipt-row-value">${escapeHtml(invoiceNo)}</span>
                            </div>
                            <div class="receipt-row">
                                <span class="receipt-row-label">DATE &amp; TIME:</span>
                                <span class="receipt-row-value">${escapeHtml(dateStr)}</span>
                            </div>
                            <div class="receipt-row">
                                <span class="receipt-row-label">TXN REF:</span>
                                <span class="receipt-row-value">${escapeHtml(paymentId)}</span>
                            </div>
                            <div class="receipt-row">
                                <span class="receipt-row-label">BILLED TO:</span>
                                <span class="receipt-row-value">${escapeHtml(customerEmail)}</span>
                            </div>
                            <div class="receipt-row">
                                <span class="receipt-row-label">PAYMENT:</span>
                                <span class="receipt-row-value">${escapeHtml(paymentLabel)}</span>
                            </div>
                        </div>

                        <div class="receipt-divider"></div>

                        <!-- ITEMS TABLE -->
                        <div class="receipt-items-heading">
                            <span>ITEM DESCRIPTION</span>
                            <span>TOTAL</span>
                        </div>
                        <div class="receipt-items-list">
                            ${items.map(item => `
                                <div class="receipt-item-row">
                                    <span class="receipt-item-desc">1x ${escapeHtml(item.name)}</span>
                                    <span class="receipt-item-amount">${currSymbol}${Number(item.price ?? totalAmount).toLocaleString('en-IN')}</span>
                                </div>
                            `).join('')}
                        </div>

                        <div class="receipt-divider"></div>

                        <!-- TOTALS -->
                        <div class="receipt-total-section">
                            <div class="receipt-total-row">
                                <span class="receipt-row-label">Net Subtotal:</span>
                                <span class="receipt-row-value">${currSymbol}${subtotal.toLocaleString('en-IN')}</span>
                            </div>
                            <div class="receipt-total-row">
                                <span class="receipt-row-label">GST / Taxes (18% Incl):</span>
                                <span class="receipt-row-value">${currSymbol}${gstAmount.toLocaleString('en-IN')}</span>
                            </div>
                            <div class="receipt-grand-total">
                                <span>TOTAL PAID:</span>
                                <span>${currSymbol}${totalAmount.toLocaleString('en-IN')}</span>
                            </div>
                        </div>

                        <!-- STATUS STAMP -->
                        <div class="receipt-paid-stamp">
                            <i class="fas fa-check-circle"></i>
                            <span>${escapeHtml(statusLabel)}</span>
                        </div>

                        <!-- BARCODE -->
                        <div class="receipt-barcode-box">
                            <div class="receipt-barcode-bars"></div>
                            <span class="receipt-barcode-num">${escapeHtml(paymentId.toUpperCase())}</span>
                        </div>

                        <div class="receipt-footer-thanks">
                            <p>${escapeHtml(accessMessage)}</p>
                            <p>Thank you for choosing Desk2Quant!</p>
                            <p style="font-size: 8px; color: #9ca3af; margin-top: 4px;">desk2quant.com &bull; support@desk2quant.com</p>
                        </div>
                    </div>
                </div>

                <!-- ACTION BUTTONS -->
                <div class="printer-actions-bar">
                    <a href="${escapeHtml(downloadLink)}" target="_blank" rel="noopener noreferrer" class="printer-btn-primary" id="receiptDownloadBtn">
                        <i class="fas fa-arrow-down"></i> Download / Access Files
                    </a>
                    <div class="printer-btn-group">
                        <button type="button" class="printer-btn-action" onclick="window.printReceipt()">
                            <i class="fas fa-print"></i> Print / Save PDF
                        </button>
                        <button type="button" class="printer-btn-action printer-btn-close" onclick="window.closeReceiptPrinter()">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.classList.add('active');
        document.body.style.overflowY = 'hidden';

        // Play authentic printer acoustic feed chirp
        playPrinterSound();

        // Switch printer status indicator from "PRINTING" to "READY" after feed finishes
        setTimeout(() => {
            const casing = document.getElementById('printerMachineCasing');
            const statusText = document.getElementById('printerStatusText');
            if (casing) casing.classList.remove('is-printing');
            if (statusText) statusText.textContent = 'INVOICE READY';
        }, 2200);
    };

    // Keep the success modal's invoice action tied to the CURRENT access event.
    // Paid flows already pass order metadata as the third argument. Free product
    // flows call showSuccessModal(productName, freeLink), so synthesize a clean
    // zero-value invoice record from that current free resource instead of hiding
    // the invoice button or reusing stale paid-order data from an earlier purchase.
    (function installReceiptAwareSuccessModal() {
        const original = window.showSuccessModal;
        if (typeof original !== 'function' || original.__d2qReceiptAware) return;

        const wrapped = function (purchasedName, downloadLink, orderData) {
            let receiptData = (orderData && typeof orderData === 'object') ? orderData : null;

            if (!receiptData && purchasedName && downloadLink && downloadLink !== '#') {
                const emailInput = document.getElementById('main-ud-email');
                const customerEmail = emailInput && emailInput.value ? emailInput.value.trim() : '';
                receiptData = {
                    paymentId: `FREE_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`,
                    amount: 0,
                    currency: 'INR',
                    customerEmail: customerEmail,
                    productName: purchasedName,
                    downloadLink: downloadLink,
                    isFree: true,
                    date: new Date().toISOString()
                };
            }

            const invoiceBtn = document.querySelector('#purchaseSuccessModal button[onclick*="showReceiptPrinter"]');
            if (receiptData) {
                // Always replace stale data with the CURRENT paid or free order.
                window.__lastOrderData = receiptData;
                if (invoiceBtn) invoiceBtn.style.display = '';
            } else {
                window.__lastOrderData = null;
                if (invoiceBtn) invoiceBtn.style.display = 'none';
            }

            return original.apply(this, arguments);
        };

        wrapped.__d2qReceiptAware = true;
        if (original.__d2qFunnelWrapped) wrapped.__d2qFunnelWrapped = true;
        window.showSuccessModal = wrapped;
    })();

    // Global testing/preview helper
    window.previewReceiptPrinter = function (customData) {
        const sample = Object.assign({
            paymentId: 'pay_sample' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            amount: 7999,
            currency: 'INR',
            customerEmail: 'amit.quant@example.com',
            productName: 'The Complete Quant Finance Arsenal (Flagship Bundle)',
            downloadLink: 'https://drive.google.com'
        }, customData || {});

        window.showReceiptPrinter(sample);
    };

    // Auto-trigger if URL has ?preview_invoice=1 or ?test_receipt=1
    if (window.location.search.includes('preview_invoice') || window.location.search.includes('test_receipt')) {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                window.previewReceiptPrinter();
            }, 600);
        });
    }
})();
