// --- Brevo Email Configuration (Global) ---
// Now handled securely via Vercel backend.

// Send email via secure backend API
async function sendEmailWithBrevo(to, subject, htmlContent, textContent) {
    try {
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to,
                subject,
                htmlContent,
                textContent
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            console.log('✅ Email sent successfully via Secure API.', { to });
            return { success: true };
        } else {
            console.error('❌ Email sending error:', data.error);
            return { success: false, error: data.error };
        }
    } catch (error) {
        console.error('❌ Failed to fetch send-email API:', error);
        return { success: false, error: error.message };
    }
}

// Send Notification to Admin
async function sendAdminNotification(subject, htmlContent, textContent) {
    const ADMIN_EMAIL = 'jha.8@alumni.iitj.ac.in';
    console.log('📧 Sending Admin Notification to:', ADMIN_EMAIL);
    return sendEmailWithBrevo(ADMIN_EMAIL, subject, htmlContent, textContent);
}

function stripMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/^>\s+/gm, '')
        .replace(/^[-*+]\s+/gm, '')
        .replace(/^\d+\.\s+/gm, '')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .replace(/!\[.*?\]\(.+?\)/g, '')
        .replace(/---+/g, '')
        .replace(/\n{2,}/g, ' ')
        .trim();
}

function truncateText(text, maxLen) {
    if (!text || text.length <= maxLen) return text;
    const truncated = text.substring(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLen * 0.6) {
        return truncated.substring(0, lastSpace);
    }
    return truncated;
}

document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 DOM loaded, initializing all components...');

    const navbar = document.querySelector('.navbar');
    const scrollProgress = document.getElementById('scrollProgress');
    const scrollTopBtn = document.getElementById('scrollTopBtn');

    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }

            // Scroll progress bar
            if (scrollProgress) {
                const scrollTop = window.scrollY;
                const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                const scrollPercent = (scrollTop / docHeight) * 100;
                scrollProgress.style.width = scrollPercent + '%';
            }

            // Scroll-to-top button
            if (scrollTopBtn) {
                if (window.scrollY > 600) {
                    scrollTopBtn.classList.add('visible');
                } else {
                    scrollTopBtn.classList.remove('visible');
                }
            }
        });
    }

    // Scroll-to-top click handler
    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // --- Dynamic Stats & Supabase Init ---
    const STATS_CONFIG = window.QUANT_MENTOR?.stats || {
        products: 36,
        reviews: 25,
        mentees: 50,
        resourceUsers: 500
    };

    function updateStats() {
        const studentStat = document.getElementById('stat-students');
        const reachStat = document.getElementById('stat-experience');
        const productStat = document.getElementById('stat-products');
        if (studentStat) studentStat.textContent = `${STATS_CONFIG.mentees}+`;
        if (reachStat) reachStat.textContent = `${STATS_CONFIG.resourceUsers}+`;
        if (productStat) productStat.textContent = String(STATS_CONFIG.products);
    }
    updateStats();

    // Initialize Dynamic Content
    if (typeof loadProductsFromSupabase === 'function') loadProductsFromSupabase();
    if (typeof loadSessionsFromSupabase === 'function') loadSessionsFromSupabase();
    if (typeof loadBlogsFromSupabase === 'function') loadBlogsFromSupabase();

    // --- Auto-open product modal if ?id= present ---
    const urlParams = new URLSearchParams(window.location.search);
    const productIdCode = urlParams.get('id');
    if (productIdCode) {
        setTimeout(() => {
            if (typeof window.openProductModal === 'function') {
                window.openProductModal(productIdCode);
            }
        }, 300); // Small delay to ensure UI is ready
    }
    // -------------------------------------

    // --------------------------------
    // Mobile Navigation
    // --------------------------------
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function () {
            navLinks.classList.toggle('mobile-active');
            const icon = this.querySelector('i');
            icon.classList.toggle('fa-bars');
            icon.classList.toggle('fa-times');
        });
        console.log('✅ Mobile navigation initialized');
    }

    // --------------------------------
    // Nav "Tools" Dropdown (desktop click/keyboard + mobile flat expand)
    // --------------------------------
    document.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
        const toggle = dropdown.querySelector('.nav-dropdown-toggle');
        if (!toggle) return;

        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = dropdown.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        // Close when a menu link is chosen (relevant on mobile flat expand)
        dropdown.querySelectorAll('.nav-dropdown-menu a').forEach((link) => {
            link.addEventListener('click', () => {
                dropdown.classList.remove('is-open');
                toggle.setAttribute('aria-expanded', 'false');
                if (navLinks) navLinks.classList.remove('mobile-active');
            });
        });
    });

    // Close any open dropdown when clicking outside it
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-dropdown.is-open').forEach((dropdown) => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('is-open');
                dropdown.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
            }
        });
    });

    // --------------------------------
    // Smooth Scrolling for Navigation
    // --------------------------------
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const href = this.getAttribute('href');
            // Prevent error if href is just "#" or empty
            if (!href || href === '#' || href.length <= 1) return;

            const target = document.querySelector(href);
            if (target) {
                // Close mobile menu if open
                if (navLinks) navLinks.classList.remove('mobile-active');

                const offsetTop = target.offsetTop - 80; // Account for fixed navbar
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Navbar Background Scroll Listener replaced by class-based toggle at top of file

    // --------------------------------
    // Product Filtering and Search
    // --------------------------------
    const filterBtns = document.querySelectorAll('.filter-btn');
    const productSearchInput = document.getElementById('productSearchInput');

    // Applies the active category and search query to all rendered product cards.
    // Exposed globally so sorting can re-apply both after a re-render.
    window.applyActiveProductFilter = function () {
        const activeBtn = document.querySelector('.filter-btn.active');
        const filter = activeBtn ? activeBtn.dataset.filter : 'all';
        const query = productSearchInput ? productSearchInput.value.trim().toLowerCase() : '';
        // Query live: product cards are rendered asynchronously from Supabase
        // after DOMContentLoaded, so a NodeList captured at init time would
        // still be empty skeleton cards.
        const productCards = document.querySelectorAll('#products .product-card');
        let visibleCount = 0;

        productCards.forEach(card => {
            const matchesCategory = filter === 'all' || card.dataset.category === filter;
            const searchableText = card.dataset.searchText || card.textContent.toLowerCase();
            const matchesSearch = !query || searchableText.includes(query);

            if (matchesCategory && matchesSearch) {
                card.style.display = 'block';
                card.style.animation = 'fadeIn 0.3s ease';
                visibleCount += 1;
            } else {
                card.style.display = 'none';
            }
        });

        const emptyState = document.getElementById('productSearchEmpty');
        if (emptyState) {
            emptyState.hidden = productCards.length === 0 || visibleCount > 0;
        }
    };

    filterBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            window.applyActiveProductFilter();
        });
    });

    if (productSearchInput) {
        productSearchInput.addEventListener('input', window.applyActiveProductFilter);
    }

    // --------------------------------
    // Product Sorting
    // --------------------------------
    const productSortSelect = document.getElementById('productSortSelect');
    if (productSortSelect) {
        productSortSelect.addEventListener('change', async function () {
            window.currentProductSort = this.value;
            // Re-render from the already-fetched product list rather than refetching
            if (typeof displaySupabaseProducts === 'function' && window.allProducts) {
                await displaySupabaseProducts(window.allProducts);
                if (window.applyActiveProductFilter) window.applyActiveProductFilter();
            }
        });
    }

    // --------------------------------
    // Product Modal
    // --------------------------------
    const modal = document.getElementById('productModal');
    const modalClose = document.getElementById('modalClose');
    const modalOverlay = modal?.querySelector('.modal-overlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalDescription = document.getElementById('modalDescription');
    const modalPrice = document.getElementById('modalPrice');
    const modalPayBtn = document.getElementById('modalPayBtn');

    // Product descriptions
    const productDescriptions = {
        'Python for Quants': 'Complete Python guide for quantitative finance professionals. Covers NumPy, Pandas, SciPy, pricing models, and production-ready code patterns. Includes all code examples.',
        'C++ for Quants': 'Modern C++ patterns for high-performance trading systems. Memory management, optimization techniques, and real-world examples from production systems.',
        'XVA Derivatives Primer': 'Comprehensive guide to derivatives pricing and XVA. CVA, DVA, FVA explained with mathematical derivations and practical examples.',
        'Quant Projects Bundle': '15+ real-world quant projects including option pricing, risk models, backtesting frameworks. All code, data, and documentation included.',
        'Interview Bible': '300+ quant interview questions with detailed solutions. Math, probability, coding challenges, brainteasers, and behavioral questions.',
        'Complete Quant Bundle': 'The ultimate package: All PDFs, all code, all projects. One purchase, lifetime access, free updates forever.'
    };

    // Open modal when product button is clicked
    document.querySelectorAll('.btn-product').forEach(btn => {
        btn.addEventListener('click', function () {
            console.log('🖱️ Product button clicked:', this.dataset.product);
            const product = this.dataset.product;
            const price = this.dataset.price;

            if (!modal) {
                console.error('❌ Modal not found in DOM');
                alert('Error: Product modal not found. Please refresh the page.');
                return;
            }

            modalTitle.textContent = product;
            modalDescription.textContent = productDescriptions[product] || 'Premium digital product for quant professionals.';
            modalPrice.textContent = '₹' + price;
            modalPrice.style.background = '';
            modalPrice.style.webkitTextFillColor = '';
            modalPrice.style.color = '';
            window.currentProductInrPrice = parseInt(price);
            // Reset any previous discount state for a new product
            window.currentDiscountedPrice = undefined;
            // Keep track of product-specific coupon for this modal
            window.activeModalCoupon = {
                code: this.dataset.couponCode || '',
                percent: parseInt(this.dataset.couponPercent) || 0
            };
            window.isCouponApplied = false;
            // Clear coupon input
            const couponInput = document.getElementById('couponInput');
            if (couponInput) couponInput.value = '';

            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            console.log('✅ Modal opened for:', product);
        });
    });

    // Apply coupon for the current product in modal
    const applyCouponBtn = document.getElementById('applyCouponBtn');
    if (applyCouponBtn) {
        applyCouponBtn.addEventListener('click', async function () {
            if (window.isCouponApplied || this.disabled) return;
            const inputCode = document.getElementById('couponInput')?.value.trim() || '';
            const couponInfo = window.activeModalCoupon || { code: '', percent: 0 };
            const modalPriceEl = document.getElementById('modalPrice');
            const feedbackEl = document.getElementById('modalCouponFeedback'); // Get feedback element
            const basePriceText = modalPriceEl?.textContent || '₹0';
            const basePriceMatch = basePriceText.match(/[\d.]+/);
            const basePrice = basePriceMatch ? parseFloat(basePriceMatch[0]) : 0;
            const currencySymbolMatch = basePriceText.match(/^[^\d]+/);
            const currencySymbol = currencySymbolMatch ? currencySymbolMatch[0].trim() : '₹';


            // Clear previous feedback
            if (feedbackEl) {
                feedbackEl.textContent = '';
                feedbackEl.className = '';
            }

            // Campaign 20% discount codes
            const COUPON_MAP_20 = {
                'quantitative finance for absolute beginners': 'BEGINNER20',
                'common mistakes in quant interviews': 'MISTAKES20',
                'quant interview problem book': 'PROBLEMS20',
                'greek explainer lab': 'GLAB20',
                'quant models for each asset class master pack': 'MODELS20',
                'the stochastic calculus visual lab': 'STOCHLAB20',
                'complete quant ats friendly resume': 'RESUME20',
                'mental math & market intuition for quants': 'MENTALMATH20',
                'python for quants': 'PYTHON20',
                'derivatives products & pricing master pack': 'DERIVATIVE20',
                'statistics & econometrics for quants': 'STATS20',
                'pnl attribution & desk diagnostics for quants': 'PNL20',
                'equity models': 'EQUITIES20',
                'interest rate models': 'RATES20',
                'machine learning for quants': 'ML20',
                'stochastic calculus for quants': 'STOCHASTIC20',
                'linear algebra & differential equations for quants': 'LADE20',
                'ultimate industry grade quant project pack': 'PROJECT20',
                'greeks,vols,ycurves,numerical meth./mc & xva guide': 'DESK20',
                'credit models': 'CREDITS20',
                'sql for quant interviews': 'SQL20',
                'regulatory & risk frameworks for quants': 'RISK20',
                'probability theory for quants': 'PROBABILITY20',
                'fx models': 'FXD20',
                'c++ for quants': 'CPP20',
                'r for risk quants': 'R20',
                'fixed income math & bond pricing': 'FIXEDINCOME20',
                'exotic options pricing guide': 'EXOTICS20'
            };

            const expected20Code = couponInfo.code ? couponInfo.code.replace('10', '20').toUpperCase() : null;
            const productName = document.getElementById('modalTitle')?.textContent.toLowerCase().trim() || '';
            const mapKey = Object.keys(COUPON_MAP_20).find(k => productName.includes(k));
            const hardcoded20 = mapKey ? COUPON_MAP_20[mapKey].toUpperCase() : null;

            const inputCodeUpper = inputCode.toUpperCase();

            let appliedDiscount = 0;
            let isValid = false;

            if (inputCodeUpper && couponInfo.code && inputCodeUpper === couponInfo.code.toUpperCase()) {
                isValid = true;
                appliedDiscount = parseInt(couponInfo.percent) || 0;
            } else if (inputCodeUpper && (inputCodeUpper === 'BUNDLE15' || inputCodeUpper.endsWith('15'))) {
                isValid = true;
                appliedDiscount = 15;
                window.activeModalCoupon.percent = 15; // Ensure checkout button uses 15%
            } else if (inputCodeUpper && inputCodeUpper === 'VASUDHA30') {
                isValid = true;
                appliedDiscount = 30;
                window.activeModalCoupon.percent = 30; // Ensure checkout button uses 30%
            } else if (inputCodeUpper && (inputCodeUpper === expected20Code || inputCodeUpper === hardcoded20)) {
                isValid = true;
                appliedDiscount = 20;
                window.activeModalCoupon.percent = 20; // Ensure checkout button uses 20%
            } else if (inputCodeUpper && /^[A-Z]{3,40}20$/.test(inputCodeUpper)) {
                // Personalised post-purchase/post-booking coupon (e.g. AYAN20). Verified
                // server-side by exact issued code against recommendation_emails via an
                // RPC that never exposes the underlying table (see migrations 0006/0008),
                // same check product.html uses for its own checkout. No email prompt —
                // the code itself is the credential.
                this.disabled = true;
                const originalBtnText = this.textContent;
                t…43271 tokens truncated…{
                    customer_email: email,
                    product_name: 'Quant Formula Sheet (Lead Capture)',
                    amount: 0,
                    currency: 'INR',
                    payment_id: 'LEAD_' + Date.now(),
                    source: 'lead_capture',
                    download_link: downloadLink,
                    created_at: new Date().toISOString()
                }).then(() => console.log('✅ Lead logged to Supabase')).catch(err => console.error('❌ Failed to log lead:', err));
            }

            leadForm.style.display = 'none';
            if (note) {
                note.textContent = '✅ Check your inbox — your formula sheet is on its way!';
                note.style.color = '#fff';
            }
        } catch (err) {
            console.error('Lead capture failed:', err);
            if (note) { note.textContent = 'Something went wrong. Please try again.'; note.style.color = '#f43f5e'; }
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Send Me the Sheet <i class="fas fa-arrow-right"></i>';
        }
    });
});

// --- REVIEW FORM HANDLER ---
document.addEventListener('DOMContentLoaded', function () {
    const reviewForm = document.getElementById('reviewForm');
    const reviewSuccess = document.getElementById('reviewSuccess');

    if (reviewForm) {
        reviewForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const formData = new FormData(reviewForm);
            const data = {
                name: formData.get('name'),
                title: formData.get('title'),
                rating: formData.get('rating'),
                review: formData.get('review'),
                product: formData.get('product') || 'Not specified',
                created_at: new Date().toISOString()
            };

            if (!data.name || !data.title || !data.rating || !data.review) {
                alert('Please fill in all required fields.');
                return;
            }

            try {
                if (window.supabaseClient) {
                    const { error } = await window.supabaseClient
                        .from('testimonials')
                        .insert([{
                            name: data.name,
                            title: data.title,
                            rating: parseInt(data.rating),
                            review: data.review,
                            product: data.product,
                            is_verified: false,
                            is_published: false,
                            created_at: data.created_at
                        }]);

                    if (error) {
                        console.error('Error submitting review:', error);
                        alert('There was an error submitting your review. Please try again.');
                        return;
                    }
                } else {
                    console.log('Supabase not available, storing review locally:', data);
                    let reviews = JSON.parse(localStorage.getItem('pendingReviews') || '[]');
                    reviews.push(data);
                    localStorage.setItem('pendingReviews', JSON.stringify(reviews));
                }

                reviewForm.style.display = 'none';
                reviewSuccess.classList.add('show');

            } catch (error) {
                console.error('Review submission error:', error);
                alert('There was an error submitting your review. Please try again.');
            }
        });
    }
});

// Helper to copy product link for social sharing
window.copyProductLink = function (id) {
    if (id === undefined || id === null || id === '') {
        console.error('❌ copyProductLink called with invalid ID:', id);
        alert('❌ Error: Invalid Product ID');
        return;
    }
    const safeId = String(id).trim(); // Ensure it is a clean string
    console.log('🔗 copyProductLink called with ID:', safeId);

    const shareUrl = `${window.location.origin}/product.html?id=${safeId}`;
    console.log('🔗 Generated Share URL:', shareUrl);

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert('✅ Shareable link copied to clipboard!');
        }).catch(err => {
            console.error('Clipboard copy failed:', err);
            prompt('Copy this link to share:', shareUrl);
        });
    } else {
        prompt('Copy this link to share:', shareUrl);
    }
};

/**
 * Send Testimonial Request Email on Session Completion
 */
async function sendTestimonialRequestEmail(bookingData) {
    // Map DB columns (email, name, service_name) to function variables
    const userEmail = bookingData.email || bookingData.user_email;
    const userName = bookingData.name || bookingData.user_name;
    const sessionType = bookingData.service_name || bookingData.session_type;

    if (!userEmail) return;

    console.log('📧 Sending Testimonial Request securely via API to:', userEmail);

    const testimonialLink = window.location.origin + '/index.html#testimonials'; // Point to testimonials section
    const customerName = userName || 'Valued Learner';

    const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2563eb;">🚀 Session Completed!</h2>
                <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                <p>Hi <strong>${customerName}</strong>,</p>
                <p>Thank you for attending the session: <strong>${sessionType || 'Mentorship Session'}</strong>.</p>
                <p>I hope you found it valuable! 💡</p>
                <br>
                <p><strong>Could you do me a quick favor?</strong></p>
                <p>It would mean a lot if you could share your feedback or a short testimonial. It helps others trust the process.</p>
                
                <a href="${testimonialLink}" style="display: inline-block; background: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0;">Leave a Review / Testimonial</a>
                
                <p style="margin-top: 20px; color: #6b7280;">If the button doesn't work, click here: <a href="${testimonialLink}">${testimonialLink}</a></p>
                <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #6b7280;">Keep learning & growing! 🚀</p>
                <p style="color: #6b7280;">Best regards,<br>${BUSINESS_NAME}</p>
            </div>
        `;

    const textContent = `🚀 Session Completed!

Hi ${customerName},

Thank you for attending the session: ${sessionType}. I hope you found it valuable!

Could you do me a quick favor?
Please share your feedback or a short testimonial here:
${testimonialLink}

It helps others trust the process.

Best regards,
${BUSINESS_NAME}`;

    try {
        const result = await sendEmailWithBrevo(
            userEmail,
            `Thanks for the session! How was it? 🚀`,
            htmlContent,
            textContent
        );

        if (result.success) {
            console.log('✅ Testimonial email sent successfully.');
            return true;
        } else {
            console.error('❌ Failed to send testimonial email:', result.error);
            return false;
        }
    } catch (error) {
        console.error('❌ Error sending testimonial email:', error);
        return false;
    }
}

// Make it available globally so admin.html can use it
window.sendTestimonialRequestEmail = sendTestimonialRequestEmail;



// --- LAUNCH PROMOTION CAMPAIGN LOGIC ---
(function () {
    console.log('🎉 Initializing Launch Promotion Campaign for Numerical Methods...');

    // Expose promo functions globally so inline HTML onclick handlers can trigger them
    window.dismissPromoBanner = function (e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        const banner = document.getElementById('launchPromoBanner');
        if (banner) {
            banner.style.transform = 'translateY(-100%)';
            banner.style.marginTop = '-' + banner.offsetHeight + 'px';
            setTimeout(() => banner.remove(), 300);
        }
        localStorage.setItem('launch_promo_banner_dismissed', 'true');
    };

    window.triggerPromoModal = function () {
        const modal = document.getElementById('launchPromoModal');
        if (!modal) return;

        // Convert prices to local currency if available
        const originalInr = 1299;
        const discountedInr = 699;
        const origEl = document.getElementById('launchOriginalPrice');
        const discEl = document.getElementById('launchDiscountedPrice');

        const localPrice = window.userLocalPrice;
        if (localPrice && localPrice.rate && localPrice.currency && localPrice.currency.code !== 'INR' && typeof window.formatPrice === 'function') {
            const rate = localPrice.rate;
            const convertedOrig = { amount: Math.round(originalInr * rate), currency: localPrice.currency };
            const convertedDisc = { amount: Math.round(discountedInr * rate), currency: localPrice.currency };
            if (origEl) origEl.textContent = window.formatPrice(convertedOrig);
            if (discEl) discEl.textContent = window.formatPrice(convertedDisc);
        } else {
            // Fallback: keep INR
            if (origEl) origEl.textContent = '\u20b91,299';
            if (discEl) discEl.textContent = '\u20b9699';
        }

        modal.classList.add('active');
        sessionStorage.setItem('launch_promo_shown', 'true');
    };

    window.closePromoModal = function () {
        const modal = document.getElementById('launchPromoModal');
        if (modal) {
            modal.classList.remove('active');
        }
    };

    window.copyPromoCoupon = function () {
        const couponText = 'LAUNCH15';
        navigator.clipboard.writeText(couponText).then(() => {
            const btnText = document.getElementById('copyCouponBtnText');
            if (btnText) {
                btnText.textContent = 'Copied!';
                setTimeout(() => {
                    btnText.textContent = 'Copy';
                }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy coupon code:', err);
        });
    };

    window.buyLaunchProduct = function () {
        window.closePromoModal();

        // Scroll to products section
        const productsSec = document.getElementById('products');
        if (productsSec) {
            productsSec.scrollIntoView({ behavior: 'smooth' });
        }

        // Open the product checkout modal
        setTimeout(() => {
            if (typeof window.openProductModal === 'function') {
                window.openProductModal('6b78550d-e130-41d1-9409-92335ce82a6c');

                // Auto-fill and apply LAUNCH15 coupon in the checkout modal
                setTimeout(() => {
                    const couponInput = document.getElementById('couponInput');
                    const applyBtn = document.getElementById('applyCouponBtn');
                    if (couponInput && applyBtn) {
                        couponInput.value = 'LAUNCH15';
                        applyBtn.click();
                    }
                }, 800);
            }
        }, 500);
    };

    window.previewLaunchProduct = function () {
        window.closePromoModal();
        const isTest = window.location.pathname.includes('-test');
        window.location.href = (isTest ? 'product-test.html' : 'product.html') + '?id=6b78550d-e130-41d1-9409-92335ce82a6c';
    };

    // Setup Triggers
    document.addEventListener('DOMContentLoaded', () => {
        // 1. Check banner dismissal
        const bannerDismissed = localStorage.getItem('launch_promo_banner_dismissed');
        const banner = document.getElementById('launchPromoBanner');
        if (bannerDismissed === 'true' && banner) {
            banner.remove();
        }

        // 2. Setup Popup Triggers (Only if not already shown in this session)
        const promoShown = sessionStorage.getItem('launch_promo_shown');
        if (promoShown !== 'true') {
            // Trigger 2a: Time-delay (20 seconds)
            setTimeout(() => {
                if (sessionStorage.getItem('launch_promo_shown') !== 'true') {
                    window.triggerPromoModal();
                }
            }, 20000);

            // Trigger 2b: Exit Intent (mouse moves out of top viewport)
            document.addEventListener('mouseleave', (e) => {
                if (e.clientY < 20) { // mouse moved out towards address bar
                    if (sessionStorage.getItem('launch_promo_shown') !== 'true') {
                        window.triggerPromoModal();
                    }
                }
            });
        }
    });
})();


// --- PURCHASE SUCCESS & CROSS-SELL RECOMMENDATION SYSTEM ---
(function () {
    console.log('🛍️ Initializing Purchase Success & Cross-Sell Recommendation System...');

    // Mapping for product categories to recommend complements
    const CROSS_SELL_STRATEGY = {
        'python': {
            keys: ['python'],
            recs: [
                {
                    name: 'C++ for Quants',
                    valueProp: 'Modern quants are expected to be bilingual. Step up from Python to low-latency C++ to design high-frequency pricing engines.'
                },
                {
                    name: 'Numerical Methods for Quants',
                    valueProp: 'Implement advanced mathematical solvers, PDEs, and Monte Carlo methods directly in your Python/C++ code.'
                }
            ]
        },
        'numerical': {
            keys: ['numerical', 'methods'],
            recs: [
                {
                    name: 'Stochastic Calculus for Quants',
                    valueProp: 'Understand the continuous-time stochastic models (SDEs, Itô’s Lemma) that underpin the numerical PDE and Monte Carlo solvers.'
                },
                {
                    name: 'Complete Front Office & Risk Quant Professional Bundle',
                    valueProp: 'Get all notes, codebases, and playbooks at a heavily discounted price to master both modeling and coding.'
                }
            ]
        },
        'stochastic': {
            keys: ['stochastic', 'calculus'],
            recs: [
                {
                    name: 'Numerical Methods for Quants',
                    valueProp: 'Translate abstract stochastic differential equations (SDEs) into concrete finite difference schemes and Monte Carlo paths.'
                },
                {
                    name: 'Greeks & Risk Management Guide',
                    valueProp: 'Master how to hedge and manage derivative risk exposures derived from stochastic models.'
                }
            ]
        },
        'cpp': {
            keys: ['c++', 'cpp'],
            recs: [
                {
                    name: 'Python for Quants',
                    valueProp: 'Master prototyping, backtesting, and analysis in Python, then port your core execution code to low-latency C++.'
                },
                {
                    name: 'Numerical Methods for Quants',
                    valueProp: 'Implement advanced pricing and simulation algorithms in low-latency C++ structures.'
                }
            ]
        },
        'default': {
            keys: [],
            recs: [
                {
                    name: 'Numerical Methods for Quants',
                    valueProp: 'Our latest master playbook with TikZ diagrams and Python codes — essential for all desks.'
                },
                {
                    name: 'Complete Front Office & Risk Quant Professional Bundle',
                    valueProp: 'Get the complete library of quant manuals, resume templates, and playbooks at a massive discount.'
                }
            ]
        }
    };

    window.closeSuccessModal = function () {
        const modal = document.getElementById('purchaseSuccessModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    window.showSuccessModal = async function (purchasedName, downloadLink) {
        console.log('🏆 Triggering Purchase Success Modal for:', purchasedName);

        // 1. Set the main download button
        const dlBtn = document.getElementById('successDownloadBtn');
        if (dlBtn) {
            dlBtn.href = downloadLink;
        }

        // 2. Identify the strategy keys
        const nameLower = purchasedName.toLowerCase();
        let strategy = CROSS_SELL_STRATEGY['default'];

        for (const [key, config] of Object.entries(CROSS_SELL_STRATEGY)) {
            if (key === 'default') continue;
            if (config.keys.some(k => nameLower.includes(k))) {
                strategy = config;
                break;
            }
        }

        // 3. Render recommendations
        const grid = document.getElementById('crossSellGrid');
        if (grid) {
            grid.innerHTML = '';

            // Loop through the 2 target recommendations
            for (const rec of strategy.recs) {
                // Find matching product in globally loaded window.allProducts
                let matchingProduct = null;
                if (window.allProducts) {
                    matchingProduct = window.allProducts.find(p =>
                        p.name.toLowerCase().includes(rec.name.toLowerCase()) ||
                        rec.name.toLowerCase().includes(p.name.toLowerCase())
                    );
                }

                // If not found in dynamic products, use default mock config or search by parts
                const prodName = matchingProduct ? matchingProduct.name : rec.name;
                const prodPrice = matchingProduct ? matchingProduct.price : 799;
                const prodId = matchingProduct ? matchingProduct.id : '';

                // Convert price to local currency
                const localPrice = await convertPrice(prodPrice, window.userCountryCode || 'IN');
                const priceFormatted = formatPrice(localPrice);

                const card = document.createElement('div');
                card.className = 'cross-sell-card';
                card.innerHTML = `
                    <div class="cross-sell-card-header">
                        <h4 class="cross-sell-card-title">${prodName}</h4>
                        <p class="cross-sell-value-prop">${rec.valueProp}</p>
                    </div>
                    <div class="cross-sell-footer">
                        <span class="cross-sell-price">${priceFormatted}</span>
                        ${prodId ? `<button class="btn btn-primary btn-cross-sell-buy" onclick="window.closeSuccessModal(); window.openProductModal('${prodId}');">Buy Now</button>` : ''}
                    </div>
                `;
                grid.appendChild(card);
            }
        }

        // 4. Open the modal
        const modal = document.getElementById('purchaseSuccessModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };
})();
