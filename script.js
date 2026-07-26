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
    // Product Filtering
    // --------------------------------
    const filterBtns = document.querySelectorAll('.filter-btn');
    const productCards = document.querySelectorAll('.product-card');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            // Update active button
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const filter = this.dataset.filter;

            productCards.forEach(card => {
                if (filter === 'all' || card.dataset.category === filter) {
                    card.style.display = 'block';
                    card.style.animation = 'fadeIn 0.3s ease';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

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
            }

            if (isValid) {
                const discount = appliedDiscount;
                let discounted = Math.max(0, basePrice * (100 - discount) / 100);
                let displayPrice = '';

                if (currencySymbol === '₹' || currencySymbol === 'INR') {
                    discounted = Math.round(discounted);
                    displayPrice = currencySymbol + discounted;
                } else {
                    discounted = parseFloat(discounted.toFixed(2));
                    displayPrice = currencySymbol + discounted.toFixed(2);
                }

                modalPriceEl.innerHTML = '🎯 <span style="color:#f43f5e;font-size:2rem;font-weight:800;">' + displayPrice + '</span>';
                modalPriceEl.style.background = 'none';
                modalPriceEl.style.webkitTextFillColor = 'initial';
                modalPriceEl.style.color = '';
                window.currentDiscountedPrice = discounted;
                window.isCouponApplied = true;

                if (feedbackEl) {
                    feedbackEl.textContent = `Coupon applied! ${discount}% OFF — ${displayPrice}`;
                    feedbackEl.style.color = '#22c55e';
                } else {
                    alert('Coupon applied: ' + discount + '% off');
                }

                // Disable input and button
                const couponInput = document.getElementById('couponInput');
                if (couponInput) couponInput.disabled = true;
                this.disabled = true;
                this.textContent = 'Applied';
            } else {
                // Error Feedback
                if (feedbackEl) {
                    feedbackEl.textContent = 'Invalid coupon code';
                    feedbackEl.style.color = '#ef4444'; // Red
                } else {
                    alert('Invalid coupon for this product');
                }
                // Do not change price
            }
        });
    }

    // Close modal functions
    function closeModal() {
        modal.classList.remove('active');
        window.currentDiscountedPrice = undefined;
        window.activeModalCoupon = { code: '', percent: 0 };
        window.isCouponApplied = false;
        document.body.style.overflow = '';

        const couponInput = document.getElementById('couponInput');
        const feedbackEl = document.getElementById('modalCouponFeedback');
        if (couponInput) {
            couponInput.value = '';
            couponInput.disabled = false;
        }
        if (feedbackEl) feedbackEl.textContent = '';

        const applyBtn = document.getElementById('applyCouponBtn');
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.textContent = 'Apply';
        }
    }

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeModal);

    // Close modal on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });

    // --------------------------------
    // Service Booking - Pre-fill form
    // --------------------------------
    document.querySelectorAll('.btn-service').forEach(btn => {
        btn.addEventListener('click', function (e) {
            const service = this.dataset.service;
            // Find the matching option in the select
            const serviceSelect = document.getElementById('service');
            if (serviceSelect && service) {
                // Map service names to select values
                const serviceMap = {
                    'Quick Consultation - 30min': 'quick',
                    'Deep Dive Session - 60min': 'deep',
                    'Interview Prep - 90min': 'interview'
                };
                if (serviceMap[service]) {
                    serviceSelect.value = serviceMap[service];
                }
            }
        });
    });

    // --------------------------------
    // Contact Form Handling
    // --------------------------------
    const contactForm = document.getElementById('contactForm');

    if (contactForm) {
        contactForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const formData = new FormData(this);
            const data = Object.fromEntries(formData);

            // Basic validation
            if (!data.name || !data.email || !data.service) {
                alert('Please fill in all required fields.');
                return;
            }

            // Here you can integrate with:
            // 1. Formspree (free): action="https://formspree.io/f/YOUR_FORM_ID"
            // 2. Netlify Forms (free): Just add netlify attribute to form
            // 3. Google Forms

            // For now, show a success message
            alert('Thank you, ' + data.name + '!\n\nYour booking request has been received. I will contact you at ' + data.email + ' within 24 hours.\n\nService: ' + data.service);

            // Reset form
            this.reset();
        });
    }

    // --------------------------------
    // Scroll Reveal Animations (v3.5)
    // --------------------------------
    window.revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                window.revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.01,
        rootMargin: '0px 0px 100px 0px'
    });

    // Target all elements with .reveal-up
    document.querySelectorAll('.reveal-up').forEach(el => {
        window.revealObserver.observe(el);
    });

    // --------------------------------
    // Add fade-in animation keyframes dynamically
    // --------------------------------
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .nav-links.mobile-active {
            display: flex !important;
            flex-direction: column;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: rgba(10, 10, 15, 0.98);
            padding: 20px;
            gap: 16px !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .nav-links.mobile-active .nav-cta {
            text-align: center;
        }
    `;
    document.head.appendChild(style);

    // --------------------------------
    // Console welcome message
    // --------------------------------
    console.log('%c Desk2Quant ', 'background: linear-gradient(135deg, #6366f1, #a855f7); color: white; font-size: 20px; padding: 10px 20px; border-radius: 8px;');
    console.log('%c Expert Quant Mentorship & Digital Resources ', 'color: #a855f7; font-size: 14px;');

    // ================================
    // HERO PARTICLE ANIMATION
    // ================================
    const canvas = document.getElementById('heroParticles');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        // Reduce particles on mobile for better performance
        const isMobile = window.innerWidth < 768;
        const PARTICLE_COUNT = isMobile ? 20 : 60;
        const CONNECTION_DIST = isMobile ? 80 : 120;
        let animId;

        function resizeCanvas() {
            const hero = document.getElementById('hero');
            if (!hero) return;
            canvas.width = hero.offsetWidth;
            canvas.height = hero.offsetHeight;
        }

        function createParticles() {
            particles = [];
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    r: Math.random() * 2 + 1,
                    alpha: Math.random() * 0.5 + 0.2
                });
            }
        }

        function drawParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Detect current theme for particle colors
            const isLight = document.body.classList.contains('light-mode') || document.documentElement.dataset.theme === 'light';
            const particleColor = '15, 23, 42';
            const lineColor = '99, 102, 241';

            // Draw connections
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < CONNECTION_DIST) {
                        const opacity = (1 - dist / CONNECTION_DIST) * (isLight ? 0.2 : 0.15);
                        ctx.strokeStyle = `rgba(${lineColor}, ${opacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }

            // Draw and move particles
            for (const p of particles) {
                ctx.fillStyle = `rgba(${particleColor}, ${p.alpha})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();

                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
            }

            animId = requestAnimationFrame(drawParticles);
        }

        resizeCanvas();
        createParticles();
        drawParticles();
        window.addEventListener('resize', () => {
            resizeCanvas();
            createParticles();
        });
    }

    // ================================
    // SMOOTH NUMBER COUNTER ANIMATION
    // ================================
    function animateCounter(el, target, suffix = '+') {
        const duration = 1500;
        const startTime = performance.now();
        const startVal = 0;

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(startVal + (target - startVal) * eased);
            el.textContent = current + suffix;
            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    }

    // Observe stat values and animate when visible
    const statElements = document.querySelectorAll('.stat-value');
    if (statElements.length > 0) {
        const counterObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.dataset.counted) {
                    entry.target.dataset.counted = 'true';
                    const text = entry.target.textContent.trim();
                    const num = parseInt(text.replace(/[^0-9]/g, ''));
                    const suffix = text.includes('+') ? '+' : '';
                    if (!isNaN(num) && num > 0) {
                        animateCounter(entry.target, num, suffix);
                    }
                }
            });
        }, { threshold: 0.5 });

        statElements.forEach(el => counterObserver.observe(el));
    }

});

// ================================
// RAZORPAY PAYMENT INTEGRATION
// ================================

const RAZORPAY_KEY_ID = 'rzp_live_TDMg5qFcBBSOxf';

// Your business name
const BUSINESS_NAME = 'Desk2Quant';

// ================================
// BREVO EMAIL CONFIGURATION (replaces EmailJS - 9,000 emails/month free!)
// ================================
// ⚠️ Get these from brevo.com (free: 300 emails/day = 9,000/month)

// ================================
// SUPABASE INTEGRATION (for dynamic file links)
// ================================
const SUPABASE_URL = 'https://dntabmyurlrlnoajdnja.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudGFibXl1cmxybG5vYWpkbmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDEyNjUsImV4cCI6MjA4NTY3NzI2NX0.PYpNd_t_px09zi2d5WGjFVOB23sjb3ZPuAnxagYshe0';

// Use global supabase reference (avoid local declaration)
// Initialize Supabase immediately (SDK loads synchronously before this script)
function initSupabaseAndLoad() {
    try {
        // Check if Supabase SDK is available
        if (typeof window.supabase !== 'undefined') {
            // Initialize if not already done
            if (!window.supabaseClient) {
                window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                console.log('✅ Supabase initialized');
            } else {
                console.log('✅ Supabase already initialized');
            }

            // Pre-fetch country & exchange rates in parallel (non-blocking)
            const prefetchPromise = Promise.all([
                getUserCountry().catch(e => console.warn('Country detection deferred:', e)),
                fetchExchangeRates().catch(e => console.warn('Exchange rates deferred:', e))
            ]);

            // Fire all data loads in parallel — they will await prefetch internally
            fetchProductLinks();
            loadProductsFromSupabase(prefetchPromise);
            loadSessionsFromSupabase(prefetchPromise);
            loadBlogs();
            loadApprovedTestimonials();

            // Check for direct product link in URL
            const urlParams = new URLSearchParams(window.location.search);
            const productId = urlParams.get('id') || urlParams.get('product');
            if (productId) {
                console.log('🔗 Direct link detected for product:', productId);
                // small delay to let products load
                setTimeout(() => window.openProductModal(productId), 1500);
            }
            return true; // initialized
        }
        return false; // SDK not yet available
    } catch (e) {
        console.error('Supabase initialization failed:', e);
        console.log('⚠️ Continuing without Supabase - using default links');
        return true; // don't retry on error
    }
}

// Fetched country cache — MUST be declared before initSupabaseAndLoad (TDZ guard)
let userCountryCode = null;

// Cache for exchange rates (persisted to localStorage) — TDZ guard
let exchangeRatesCache = null;
let exchangeRatesTimestamp = null;
const RATES_CACHE_DURATION = 3600000; // 1 hour in milliseconds
const RATES_CACHE_KEY = 'qm_exchange_rates';

// Try immediately, retry briefly if SDK not yet loaded (e.g. slow network)
if (!initSupabaseAndLoad()) {
    let retries = 0;
    const retryInterval = setInterval(() => {
        retries++;
        if (initSupabaseAndLoad() || retries >= 60) { // Max 3s (60 * 50ms)
            clearInterval(retryInterval);
            if (retries >= 60) {
                console.error('❌ Supabase SDK not loaded after 3s');
                console.log('⚠️ Continuing without Supabase - using default links');
            }
        }
    }, 50);
}

async function getUserCountry() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlCountry = urlParams.get('country');
        if (urlCountry && urlCountry.length === 2) {
            userCountryCode = urlCountry.toUpperCase();
            window.userCountryCode = userCountryCode;
            console.log('Using country from URL override:', userCountryCode);
            return userCountryCode;
        }
    } catch (e) {
        console.warn('URL country override parse failed:', e);
    }

    if (userCountryCode) {
        window.userCountryCode = userCountryCode;
        return userCountryCode;
    }

    const fetchWithTimeout = async (url, timeout = 5000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!response.ok) throw new Error('HTTP status ' + response.status);
        return response.json();
    };

    try {
        const services = [
            { url: 'https://freeipapi.com/api/json', parse: (d) => d.countryCode },
            { url: 'https://ipwho.is/', parse: (d) => d.success ? d.country_code : null },
            { url: 'https://ipinfo.io/json', parse: (d) => d.country },
            { url: 'https://ipapi.co/json/', parse: (d) => d.country_code }
        ];

        for (const svc of services) {
            try {
                console.log('Trying IP service:', svc.url);
                const resp = await fetchWithTimeout(svc.url, 5000);
                const code = svc.parse(resp);
                if (code) {
                    userCountryCode = code;
                    window.userCountryCode = userCountryCode;
                    break;
                }
            } catch (e) {
                console.warn('Failed:', svc.url, e.message);
            }
        }

        if (!userCountryCode) throw new Error('All IP services failed');
    } catch (e) {
        console.warn('IP lookup failed, trying timezone fallback:', e);
        const timezoneToCountry = {
            'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
            'Asia/Dubai': 'AE',
            'Asia/Singapore': 'SG',
            'Europe/London': 'GB',
            'Europe/Paris': 'FR',
            'Europe/Berlin': 'DE',
            'Europe/Zurich': 'CH',
            'America/New_York': 'US', 'America/Los_Angeles': 'US', 'America/Chicago': 'US',
            'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
            'Asia/Tokyo': 'JP',
            'Asia/Seoul': 'KR',
            'America/Toronto': 'CA', 'America/Vancouver': 'CA',
            'Asia/Bangkok': 'TH',
            'Asia/Kuala_Lumpur': 'MY',
            'Europe/Warsaw': 'PL',
            'America/Bogota': 'CO',
            'Europe/Amsterdam': 'NL',
            'Europe/Stockholm': 'SE',
            'Europe/Oslo': 'NO',
            'Europe/Copenhagen': 'DK',
            'Asia/Hong_Kong': 'HK',
            'Pacific/Auckland': 'NZ',
            'Asia/Jakarta': 'ID',
            'Asia/Manila': 'PH',
            'Asia/Karachi': 'PK',
            'Asia/Dhaka': 'BD',
            'Asia/Colombo': 'LK',
            'Asia/Qatar': 'QA',
            'Asia/Riyadh': 'SA',
            'Europe/Istanbul': 'TR',
            'America/Mexico_City': 'MX',
            'Africa/Cairo': 'EG',
            'Africa/Lagos': 'NG',
            'Africa/Johannesburg': 'ZA'
        };
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            userCountryCode = timezoneToCountry[tz] || 'IN';
            window.userCountryCode = userCountryCode;
        } catch {
            userCountryCode = 'IN';
            window.userCountryCode = userCountryCode;
        }
    }

    console.log('User country detected:', userCountryCode);
    window.userCountryCode = userCountryCode;
    return userCountryCode;
}

// Currency Configuration - Maps country codes to currency info (rates fetched dynamically)
const CURRENCY_MAP = {
    'IN': { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    'US': { code: 'USD', symbol: '$', name: 'US Dollar' },
    'GB': { code: 'GBP', symbol: '£', name: 'British Pound' },
    // Eurozone
    'EU': { code: 'EUR', symbol: '€', name: 'Euro' },
    'DE': { code: 'EUR', symbol: '€', name: 'Euro' },
    'FR': { code: 'EUR', symbol: '€', name: 'Euro' },
    'IT': { code: 'EUR', symbol: '€', name: 'Euro' },
    'ES': { code: 'EUR', symbol: '€', name: 'Euro' },
    'NL': { code: 'EUR', symbol: '€', name: 'Euro' },
    'BE': { code: 'EUR', symbol: '€', name: 'Euro' },
    'AT': { code: 'EUR', symbol: '€', name: 'Euro' },
    'PT': { code: 'EUR', symbol: '€', name: 'Euro' },
    'GR': { code: 'EUR', symbol: '€', name: 'Euro' },
    'IE': { code: 'EUR', symbol: '€', name: 'Euro' },
    'FI': { code: 'EUR', symbol: '€', name: 'Euro' },
    'HR': { code: 'EUR', symbol: '€', name: 'Euro' },       // Croatia
    'SK': { code: 'EUR', symbol: '€', name: 'Euro' },       // Slovakia
    'SI': { code: 'EUR', symbol: '€', name: 'Euro' },       // Slovenia
    'LT': { code: 'EUR', symbol: '€', name: 'Euro' },       // Lithuania
    'LV': { code: 'EUR', symbol: '€', name: 'Euro' },       // Latvia
    'EE': { code: 'EUR', symbol: '€', name: 'Euro' },       // Estonia
    'MT': { code: 'EUR', symbol: '€', name: 'Euro' },       // Malta
    'CY': { code: 'EUR', symbol: '€', name: 'Euro' },       // Cyprus
    'LU': { code: 'EUR', symbol: '€', name: 'Euro' },       // Luxembourg
    'MC': { code: 'EUR', symbol: '€', name: 'Euro' },       // Monaco
    'SM': { code: 'EUR', symbol: '€', name: 'Euro' },       // San Marino
    'VA': { code: 'EUR', symbol: '€', name: 'Euro' },       // Vatican
    'AD': { code: 'EUR', symbol: '€', name: 'Euro' },       // Andorra
    'ME': { code: 'EUR', symbol: '€', name: 'Euro' },       // Montenegro
    'XK': { code: 'EUR', symbol: '€', name: 'Euro' },       // Kosovo
    // Major economies
    'JP': { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    'KR': { code: 'KRW', symbol: '₩', name: 'Korean Won' },
    'CN': { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    'AU': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    'CA': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    'CH': { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
    'SE': { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
    'NO': { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
    'DK': { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
    'SG': { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
    'HK': { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
    'NZ': { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
    // Emerging markets
    'BR': { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    'MX': { code: 'MXN', symbol: 'Mex$', name: 'Mexican Peso' },
    'ZA': { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
    'RU': { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
    'TR': { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    'AE': { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
    'SA': { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
    'PK': { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
    'BD': { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
    'LK': { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee' },
    'NP': { code: 'NPR', symbol: 'Rs', name: 'Nepalese Rupee' },
    'TH': { code: 'THB', symbol: '฿', name: 'Thai Baht' },
    'MY': { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
    'ID': { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
    'PH': { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
    'VN': { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
    'EG': { code: 'EGP', symbol: '£', name: 'Egyptian Pound' },
    'NG': { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
    'KE': { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
    'GH': { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
    // Middle East
    'KW': { code: 'KWD', symbol: 'KD', name: 'Kuwaiti Dinar' },
    'QA': { code: 'QAR', symbol: 'QR', name: 'Qatari Riyal' },
    'BH': { code: 'BHD', symbol: 'BD', name: 'Bahraini Dinar' },
    'OM': { code: 'OMR', symbol: 'ر.ع.', name: 'Omani Rial' },
    'JO': { code: 'JOD', symbol: 'JD', name: 'Jordanian Dinar' },
    'IQ': { code: 'IQD', symbol: 'ع.د', name: 'Iraqi Dinar' },
    'LB': { code: 'LBP', symbol: 'LL', name: 'Lebanese Pound' },
    'IL': { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
    'IR': { code: 'IRR', symbol: '﷼', name: 'Iranian Rial' },
    'SY': { code: 'SYP', symbol: '£S', name: 'Syrian Pound' },
    'YE': { code: 'YER', symbol: '﷼', name: 'Yemeni Rial' },
    // Europe (non-Euro)
    'HU': { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
    'PL': { code: 'PLN', symbol: 'zł', name: 'Polish Złoty' },
    'CZ': { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
    'RO': { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
    'RS': { code: 'RSD', symbol: 'дин.', name: 'Serbian Dinar' },
    'UA': { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
    'BY': { code: 'BYN', symbol: 'Br', name: 'Belarusian Ruble' },
    'GE': { code: 'GEL', symbol: '₾', name: 'Georgian Lari' },
    'AM': { code: 'AMD', symbol: '֏', name: 'Armenian Dram' },
    'AZ': { code: 'AZN', symbol: '₼', name: 'Azerbaijani Manat' },
    'IS': { code: 'ISK', symbol: 'kr', name: 'Icelandic Króna' },
    'MK': { code: 'MKD', symbol: 'ден', name: 'Macedonian Denar' },
    'BA': { code: 'BAM', symbol: 'KM', name: 'Bosnian Mark' },
    'AL': { code: 'ALL', symbol: 'L', name: 'Albanian Lek' },
    'MD': { code: 'MDL', symbol: 'L', name: 'Moldovan Leu' },
    'BG': { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev' },
    'LI': { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },   // Liechtenstein
    // Asia
    'TW': { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar' },
    'KZ': { code: 'KZT', symbol: '₸', name: 'Kazakhstani Tenge' },
    'UZ': { code: 'UZS', symbol: "so'm", name: 'Uzbekistani Som' },
    'MM': { code: 'MMK', symbol: 'K', name: 'Myanmar Kyat' },
    'KH': { code: 'KHR', symbol: '៛', name: 'Cambodian Riel' },
    'LA': { code: 'LAK', symbol: '₭', name: 'Laotian Kip' },
    'MN': { code: 'MNT', symbol: '₮', name: 'Mongolian Tögrög' },
    'BT': { code: 'BTN', symbol: 'Nu.', name: 'Bhutanese Ngultrum' },
    'MV': { code: 'MVR', symbol: 'Rf', name: 'Maldivian Rufiyaa' },
    'AF': { code: 'AFN', symbol: 'Af', name: 'Afghan Afghani' },
    'KG': { code: 'KGS', symbol: 'с', name: 'Kyrgyzstani Som' },
    'TJ': { code: 'TJS', symbol: 'SM', name: 'Tajikistani Somoni' },
    'TM': { code: 'TMT', symbol: 'T', name: 'Turkmenistani Manat' },
    // Latin America
    'CO': { code: 'COP', symbol: '$', name: 'Colombian Peso' },
    'AR': { code: 'ARS', symbol: '$', name: 'Argentine Peso' },
    'CL': { code: 'CLP', symbol: '$', name: 'Chilean Peso' },
    'PE': { code: 'PEN', symbol: 'S/.', name: 'Peruvian Sol' },
    'VE': { code: 'VES', symbol: 'Bs.S', name: 'Venezuelan Bolívar' },
    'EC': { code: 'USD', symbol: '$', name: 'US Dollar' },          // Ecuador uses USD
    'PA': { code: 'USD', symbol: '$', name: 'US Dollar' },          // Panama uses USD
    'SV': { code: 'USD', symbol: '$', name: 'US Dollar' },          // El Salvador
    'UY': { code: 'UYU', symbol: '$U', name: 'Uruguayan Peso' },
    'PY': { code: 'PYG', symbol: '₲', name: 'Paraguayan Guaraní' },
    'BO': { code: 'BOB', symbol: 'Bs.', name: 'Bolivian Boliviano' },
    'GT': { code: 'GTQ', symbol: 'Q', name: 'Guatemalan Quetzal' },
    'HN': { code: 'HNL', symbol: 'L', name: 'Honduran Lempira' },
    'NI': { code: 'NIO', symbol: 'C$', name: 'Nicaraguan Córdoba' },
    'CR': { code: 'CRC', symbol: '₡', name: 'Costa Rican Colón' },
    'CU': { code: 'CUP', symbol: '$', name: 'Cuban Peso' },
    'DO': { code: 'DOP', symbol: '$', name: 'Dominican Peso' },
    'JM': { code: 'JMD', symbol: 'J$', name: 'Jamaican Dollar' },
    'TT': { code: 'TTD', symbol: 'TT$', name: 'Trinidad & Tobago Dollar' },
    'BB': { code: 'BBD', symbol: '$', name: 'Barbadian Dollar' },
    'GY': { code: 'GYD', symbol: '$', name: 'Guyanese Dollar' },
    'SR': { code: 'SRD', symbol: '$', name: 'Surinamese Dollar' },
    'BZ': { code: 'BZD', symbol: '$', name: 'Belize Dollar' },
    'HT': { code: 'HTG', symbol: 'G', name: 'Haitian Gourde' },
    'BS': { code: 'BSD', symbol: '$', name: 'Bahamian Dollar' },
    // Africa
    'ET': { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr' },
    'TZ': { code: 'TZS', symbol: 'Sh', name: 'Tanzanian Shilling' },
    'UG': { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
    'RW': { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc' },
    'SN': { code: 'XOF', symbol: 'Fr', name: 'West African CFA Franc' },
    'CI': { code: 'XOF', symbol: 'Fr', name: 'West African CFA Franc' },
    'ML': { code: 'XOF', symbol: 'Fr', name: 'West African CFA Franc' },
    'BF': { code: 'XOF', symbol: 'Fr', name: 'West African CFA Franc' },
    'NE': { code: 'XOF', symbol: 'Fr', name: 'West African CFA Franc' },
    'TG': { code: 'XOF', symbol: 'Fr', name: 'West African CFA Franc' },
    'BJ': { code: 'XOF', symbol: 'Fr', name: 'West African CFA Franc' },
    'GW': { code: 'XOF', symbol: 'Fr', name: 'West African CFA Franc' },
    'CM': { code: 'XAF', symbol: 'Fr', name: 'Central African CFA Franc' },
    'CF': { code: 'XAF', symbol: 'Fr', name: 'Central African CFA Franc' },
    'CG': { code: 'XAF', symbol: 'Fr', name: 'Central African CFA Franc' },
    'CD': { code: 'XAF', symbol: 'Fr', name: 'Central African CFA Franc' },
    'GA': { code: 'XAF', symbol: 'Fr', name: 'Central African CFA Franc' },
    'GQ': { code: 'XAF', symbol: 'Fr', name: 'Central African CFA Franc' },
    'TD': { code: 'XAF', symbol: 'Fr', name: 'Central African CFA Franc' },
    'AO': { code: 'AOA', symbol: 'Kz', name: 'Angolan Kwanza' },
    'MZ': { code: 'MZN', symbol: 'MT', name: 'Mozambican Metical' },
    'MG': { code: 'MGA', symbol: 'Ar', name: 'Malagasy Ariary' },
    'ZM': { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha' },
    'ZW': { code: 'ZWL', symbol: '$', name: 'Zimbabwean Dollar' },
    'SD': { code: 'SDG', symbol: 'SDG', name: 'Sudanese Pound' },
    'SS': { code: 'SSP', symbol: '£', name: 'South Sudanese Pound' },
    'SO': { code: 'SOS', symbol: 'Sh', name: 'Somali Shilling' },
    'DZ': { code: 'DZD', symbol: 'دج', name: 'Algerian Dinar' },
    'MA': { code: 'MAD', symbol: 'DH', name: 'Moroccan Dirham' },
    'TN': { code: 'TND', symbol: 'DT', name: 'Tunisian Dinar' },
    'LY': { code: 'LYD', symbol: 'LD', name: 'Libyan Dinar' },
    'MW': { code: 'MWK', symbol: 'MK', name: 'Malawian Kwacha' },
    'NA': { code: 'NAD', symbol: '$', name: 'Namibian Dollar' },
    'BW': { code: 'BWP', symbol: 'P', name: 'Botswana Pula' },
    'LS': { code: 'LSL', symbol: 'L', name: 'Lesotho Loti' },
    'SZ': { code: 'SZL', symbol: 'L', name: 'Swazi Lilangeni' },
    'MU': { code: 'MUR', symbol: '₨', name: 'Mauritian Rupee' },
    'SC': { code: 'SCR', symbol: '₨', name: 'Seychellois Rupee' },
    'MR': { code: 'MRU', symbol: 'UM', name: 'Mauritanian Ouguiya' },
    'GM': { code: 'GMD', symbol: 'D', name: 'Gambian Dalasi' },
    'SL': { code: 'SLE', symbol: 'Le', name: 'Sierra Leonean Leone' },
    'LR': { code: 'LRD', symbol: '$', name: 'Liberian Dollar' },
    'GN': { code: 'GNF', symbol: 'Fr', name: 'Guinean Franc' },
    'BI': { code: 'BIF', symbol: 'Fr', name: 'Burundian Franc' },
    'KM': { code: 'KMF', symbol: 'Fr', name: 'Comorian Franc' },
    'CV': { code: 'CVE', symbol: '$', name: 'Cape Verdean Escudo' },
    'ST': { code: 'STN', symbol: 'Db', name: 'São Tomé Dobra' },
    'DJ': { code: 'DJF', symbol: 'Fr', name: 'Djiboutian Franc' },
    'ER': { code: 'ERN', symbol: 'Nfk', name: 'Eritrean Nakfa' },
    // Oceania
    'PG': { code: 'PGK', symbol: 'K', name: 'Papua New Guinean Kina' },
    'FJ': { code: 'FJD', symbol: '$', name: 'Fijian Dollar' },
    'SB': { code: 'SBD', symbol: '$', name: 'Solomon Islands Dollar' },
    'VU': { code: 'VUV', symbol: 'VT', name: 'Vanuatu Vatu' },
    'WS': { code: 'WST', symbol: 'WS$', name: 'Samoan Tālā' },
    'TO': { code: 'TOP', symbol: 'T$', name: 'Tongan Paʻanga' },
    'KI': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    'NR': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    'TV': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    'PW': { code: 'USD', symbol: '$', name: 'US Dollar' },
    'MH': { code: 'USD', symbol: '$', name: 'US Dollar' },
    'FM': { code: 'USD', symbol: '$', name: 'US Dollar' },
};

// Currencies with no fractional subunits for payment gateways
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);

function getSubunitMultiplier(currencyCode = 'INR') {
    return ZERO_DECIMAL_CURRENCIES.has(String(currencyCode).toUpperCase()) ? 1 : 100;
}

// Fetch real-time exchange rates from API (with localStorage persistence)
async function fetchExchangeRates() {
    // Check in-memory cache first
    if (exchangeRatesCache && exchangeRatesTimestamp) {
        const age = Date.now() - exchangeRatesTimestamp;
        if (age < RATES_CACHE_DURATION) {
            console.log('💱 Using cached exchange rates (age:', Math.round(age / 60000), 'minutes)');
            return exchangeRatesCache;
        }
    }

    // Check localStorage for rates that survive page refreshes
    try {
        const stored = JSON.parse(localStorage.getItem(RATES_CACHE_KEY));
        if (stored && stored.rates && (Date.now() - stored.ts) < RATES_CACHE_DURATION) {
            exchangeRatesCache = stored.rates;
            exchangeRatesTimestamp = stored.ts;
            console.log('💱 Using localStorage exchange rates (age:', Math.round((Date.now() - stored.ts) / 60000), 'minutes)');
            return exchangeRatesCache;
        }
    } catch (_) { /* ignore parse errors */ }

    try {
        // Try multiple exchange rate APIs in case one fails
        const apis = [
            'https://api.frankfurter.app/latest?from=INR',
            'https://open.er-api.com/v6/latest/INR',
            'https://api.exchangerate-api.com/v4/latest/INR'
        ];

        for (const apiUrl of apis) {
            try {
                console.log('Trying exchange rate API:', apiUrl);
                const response = await fetch(apiUrl);

                if (!response.ok) {
                    console.warn('⚠️ API returned status:', response.status, apiUrl);
                    continue;
                }

                const data = await response.json();
                console.log('📊 API Response:', apiUrl, data);

                // Different APIs have different response formats
                let rates = null;

                if (data.rates) {
                    // Standard format
                    rates = data.rates;
                } else if (data.rates && data.rates.rates) {
                    // Nested format
                    rates = data.rates.rates;
                } else if (data.conversion_rates) {
                    // Some APIs use this format
                    rates = data.conversion_rates;
                }

                if (rates && Object.keys(rates).length > 0) {
                    exchangeRatesCache = rates;
                    exchangeRatesTimestamp = Date.now();
                    // Persist to localStorage for future page loads
                    try {
                        localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates, ts: exchangeRatesTimestamp }));
                    } catch (_) { /* quota exceeded */ }
                    console.log('💱 Fetched fresh exchange rates from:', apiUrl);
                    return rates;
                }
            } catch (apiError) {
                console.warn('⚠️ API failed:', apiUrl, apiError.message);
                continue;
            }
        }

        throw new Error('All exchange rate APIs failed');
    } catch (error) {
        console.error('❌ Failed to fetch exchange rates:', error);
        console.log('⚠️ Falling back to hardcoded rates (may be outdated)');
        return getFallbackRates();
    }
}

// Fallback rates in case API fails (INR base)
function getFallbackRates() {
    return {
        'INR': 1,
        'USD': 0.012, 'GBP': 0.0095, 'EUR': 0.011,
        'JPY': 1.8, 'KRW': 16.5, 'CNY': 0.087,
        'AUD': 0.018, 'CAD': 0.016, 'CHF': 0.010,
        'SEK': 0.13, 'NOK': 0.13, 'DKK': 0.084,
        'SGD': 0.016, 'HKD': 0.094, 'NZD': 0.020,
        'BRL': 0.067, 'MXN': 0.24, 'ZAR': 0.22,
        'RUB': 1.1, 'TRY': 0.42, 'AED': 0.044,
        'SAR': 0.045, 'PKR': 3.3, 'BDT': 1.4,
        'LKR': 3.6, 'NPR': 1.6, 'THB': 0.43,
        'MYR': 0.056, 'IDR': 190, 'PHP': 0.70,
        'VND': 300, 'EGP': 0.60, 'NGN': 18.5,
        'KES': 1.6, 'GHS': 0.18,
        // Middle East
        'KWD': 0.0037, 'QAR': 0.044, 'BHD': 0.0045,
        'OMR': 0.0046, 'JOD': 0.0085, 'IQD': 15.7,
        'LBP': 180, 'ILS': 0.045, 'IRR': 500,
        'SYP': 156, 'YER': 3.0,
        // Europe non-Euro
        'HUF': 4.35, 'PLN': 0.048, 'CZK': 0.28,
        'RON': 0.055, 'RSD': 1.29, 'UAH': 0.49,
        'BYN': 0.039, 'GEL': 0.032, 'AMD': 4.6,
        'AZN': 0.020, 'ISK': 1.65, 'MKD': 0.68,
        'BAM': 0.022, 'ALL': 1.1, 'MDL': 0.21,
        'BGN': 0.022, 'TWD': 0.39,
        // Asia
        'KZT': 5.7, 'UZS': 150, 'MMK': 25,
        'KHR': 49, 'LAK': 250, 'MNT': 41,
        'BTN': 1.0, 'MVR': 0.18, 'AFN': 0.84,
        'KGS': 1.05, 'TJS': 0.13, 'TMT': 0.042,
        // Latin America
        'COP': 48, 'ARS': 10.8, 'CLP': 11,
        'PEN': 0.045, 'VES': 0.43, 'UYU': 0.47,
        'PYG': 88, 'BOB': 0.083, 'GTQ': 0.093,
        'HNL': 0.30, 'NIO': 0.44, 'CRC': 6.2,
        'CUP': 0.29, 'DOP': 0.71, 'JMD': 1.85,
        'TTD': 0.081, 'BBD': 0.024, 'GYD': 2.5,
        'SRD': 0.42, 'BZD': 0.024, 'HTG': 1.58,
        'BSD': 0.012,
        // Africa
        'ETB': 0.68, 'TZS': 31, 'UGX': 45,
        'RWF': 15.5, 'XOF': 7.2, 'XAF': 7.2,
        'AOA': 11, 'MZN': 0.77, 'MGA': 55,
        'ZMW': 0.31, 'ZWL': 0.037, 'SDG': 7.2,
        'SSP': 1.56, 'SOS': 6.85, 'DZD': 1.6,
        'MAD': 0.12, 'TND': 0.037, 'LYD': 0.058,
        'MWK': 20, 'NAD': 0.22, 'BWP': 0.16,
        'LSL': 0.22, 'SZL': 0.22, 'MUR': 0.55,
        'SCR': 0.16, 'MRU': 0.48, 'GMD': 0.84,
        'SLE': 0.27, 'LRD': 2.3, 'GNF': 103,
        'BIF': 34, 'KMF': 5.4, 'CVE': 1.2,
        'STN': 0.27, 'DJF': 2.13, 'ERN': 0.18,
        // Oceania
        'PGK': 0.046, 'FJD': 0.027, 'SBD': 0.10,
        'VUV': 1.42, 'WST': 0.033, 'TOP': 0.028,
    };
}

// Get currency info for a country code
function getCurrencyForCountry(countryCode) {
    if (!countryCode) return CURRENCY_MAP['IN']; // Default to INR
    const code = countryCode.toUpperCase();
    if (CURRENCY_MAP[code]) return CURRENCY_MAP[code];
    // Unknown country — default to USD so user at least sees a meaningful price
    return CURRENCY_MAP['US'];
}

// Convert INR price to local currency using live rates
async function convertPrice(inrPrice, countryCode, enablePPP = false) {
    if (!inrPrice || inrPrice <= 0) return { amount: 0, currency: CURRENCY_MAP['IN'] };

    const currency = getCurrencyForCountry(countryCode);
    const rates = await fetchExchangeRates();
    const rate = rates[currency.code] || 1;

    // Calculate raw conversion
    let convertedAmount = inrPrice * rate;

    // PPP Adjustment: Apply 1.5x multiplier for stronger currencies (Developed Markets)
    // ONLY if PPP pricing is explicitly enabled for this product.
    // We EXCLUDE weaker currencies to ensure fair pricing for developing nations.
    // List includes: South Asia, SE Asia, Africa, Latin America, etc.
    const weakersCurrencies = [
        'PKR', 'BDT', 'LKR', 'NPR', // South Asia
        'NGN', 'EGP', 'KES', 'GHS', 'ZAR', // Africa
        'VND', 'IDR', 'PHP', 'MYR', 'THB', // SE Asia
        'TRY', 'RUB', 'UAH', // Eastern Europe/Eurasia
        'BRL', 'MXN', 'ARS', 'COP', 'CLP', 'PEN' // Latin America
    ];

    let pppApplied = false;
    let isWeaker = weakersCurrencies.includes(currency.code);

    if (enablePPP && currency.code !== 'INR') {
        if (!isWeaker) {
            // console.log(`📈 Applying PPP Multiplier (1.5x) for ${currency.code}`);
            convertedAmount = convertedAmount * 1.5;
            pppApplied = true;
        } else {
            pppApplied = true; // Still PPP active, but regional discount pricing applied
        }
    }

    convertedAmount = Math.round(convertedAmount);

    return {
        amount: convertedAmount,
        currency: currency,
        originalInr: inrPrice,
        rate: rate,
        pppApplied: pppApplied,
        isWeaker: isWeaker,
        enablePPP: enablePPP
    };
}

// Format price with currency symbol
function formatPrice(priceObj) {
    if (!priceObj || priceObj.amount === 0) return 'FREE';
    return `${priceObj.currency.symbol}${priceObj.amount.toLocaleString()}`;
}

// Load and display blogs from Supabase
async function loadBlogsFromSupabase() {
    try {
        if (!window.supabaseClient) return;

        const { data, error } = await window.supabaseClient
            .from('blogs')
            .select('*')
            .eq('is_published', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading blogs:', error);
            return;
        }

        const blogGrid = document.getElementById('blog-grid');
        if (!blogGrid) return;

        blogGrid.innerHTML = '';

        if (!data || data.length === 0) {
            blogGrid.innerHTML = '<p style="text-align:center; color:var(--text-muted); grid-column:1/-1;">No articles found. Check back soon!</p>';
            return;
        }

        data.forEach(blog => {
            const date = new Date(blog.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

            const card = document.createElement('div');
            card.className = 'product-card reveal-up';
            card.style.cursor = 'pointer';
            card.onclick = () => {
                // Navigate to blog page with slug for full reading experience
                if (blog.slug) {
                    window.location.href = `blog.html?slug=${blog.slug}`;
                } else {
                    window.openBlogModal(blog.id);
                }
            };

            const imageHtml = blog.cover_image_url
                ? `<div class="product-image" style="height:200px; padding:0; overflow:hidden;"><img src="${blog.cover_image_url}" alt="${blog.title || 'Blog post cover image'}" style="width:100%; height:100%; object-fit:cover; transition:transform 0.5s ease;"></div>`
                : `<div class="product-image" style="height:200px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.05);"><i class="fas fa-newspaper" style="font-size:3em; opacity:0.5;"></i></div>`;

            card.innerHTML = `
                ${imageHtml}
                <div class="product-content">
                    <div style="font-size:0.85em; color:var(--primary); margin-bottom:5px;">${date}</div>
                    <h3 class="product-title" style="margin-bottom:10px;">${blog.title}</h3>
                    <p class="product-description" style="margin-bottom:15px;">${blog.excerpt || ''}</p>
                    <div style="margin-top:auto; display:flex; align-items:center; justify-content:space-between;">
                        <span style="color:var(--text-color); font-weight:600; font-size:0.9em; display:flex; align-items:center; gap:5px;">
                            Read Article <i class="fas fa-arrow-right" style="font-size:0.8em;"></i>
                        </span>
                        <div style="display:flex; gap:6px;" onclick="event.stopPropagation();">
                            <button onclick="navigator.clipboard.writeText('${window.location.origin}/blog.html?slug=${blog.slug}').then(()=>{this.innerHTML='<i class=\\'fas fa-check\\'></i>';setTimeout(()=>this.innerHTML='<i class=\\'fas fa-share-alt\\'></i>',1500)})" title="Copy share link" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); color:var(--text-muted); width:30px; height:30px; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:0.8em; transition:all 0.2s;">
                                <i class="fas fa-share-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            blogGrid.appendChild(card);
            if (window.revealObserver) window.revealObserver.observe(card);
        });

    } catch (err) {
        console.error('Failed to load blogs:', err);
    }
}

// Load and display products from Supabase
async function loadProductsFromSupabase(prefetchPromise) {
    try {
        if (!window.supabaseClient) {
            console.error('Supabase client not initialized');
            return;
        }

        // Fire Supabase query immediately
        const queryPromise = window.supabaseClient
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        // Handle prefetch (country + rates) separately so it doesn't block products if it fails
        const prefetch = prefetchPromise || Promise.all([
            getUserCountry().catch(e => console.warn('getUserCountry failed:', e)),
            fetchExchangeRates().catch(e => console.warn('fetchExchangeRates failed:', e))
        ]);

        // Wait for both, but process products as soon as we can
        const [prefetchResult, queryResult] = await Promise.allSettled([
            prefetch,
            queryPromise
        ]);

        if (queryResult.status === 'rejected') {
            console.error('Error loading products from Supabase:', queryResult.reason);
            return;
        }

        const { data, error } = queryResult.value;

        if (error) {
            console.error('Error loading products from Supabase:', error);
            return;
        }

        if (data && data.length > 0) {
            console.log('📦 Loading ' + data.length + ' products from Supabase');
            window.allProducts = data;
            await displaySupabaseProducts(data);
        }
    } catch (err) {
        console.error('Failed to load products:', err);
    }
}

// Display products from Supabase in the products grid
// Display products separated by Paid and Free
async function displaySupabaseProducts(products) {
    const productsGrid = document.querySelector('#products .products-grid') || document.querySelector('.products-grid');
    const resourcesGrid = document.getElementById('resources-grid');

    if (productsGrid) productsGrid.innerHTML = '';
    if (resourcesGrid) resourcesGrid.innerHTML = '';

    const paidProducts = products.filter(p => p.price > 0);
    const freeProducts = products.filter(p => p.price === 0);

    const renderList = [
        { items: paidProducts, container: productsGrid, isFree: false },
        { items: freeProducts, container: resourcesGrid, isFree: true }
    ];

    // Expose a reference local price globally so the launch popup can convert prices
    // Use a dummy price of 1000 INR to get the rate/currency for the current user
    try {
        const refPrice = await convertPrice(1000, userCountryCode, false);
        window.userLocalPrice = refPrice;
        window.formatPrice = formatPrice; // expose formatter too
    } catch (e) {
        console.warn('Could not set userLocalPrice:', e);
    }

    for (const { items, container, isFree } of renderList) {
        if (!container) continue;
        if (items.length === 0 && isFree) {
            const section = document.getElementById('resources');
            if (section) section.style.display = 'none';
            continue;
        } else if (items.length > 0 && isFree) {
            const section = document.getElementById('resources');
            if (section) section.style.display = 'block';
        }

        function getProductCardVisual(productName) {
            const name = (productName || '').toLowerCase();
            const visuals = [
                { match: 'numerical methods', signal: 'Σ', label: 'Numerical Methods', tag: 'New release' },
                { match: 'cheatcode', signal: '75×', label: 'Speed Hacks', tag: 'Interview' },
                { match: 'trade lifecycle', signal: 'T→R', label: 'Trade Lifecycle', tag: 'Banking' },
                { match: 'model validation', signal: '✓', label: 'Validation', tag: 'Case studies' },
                { match: 'exotic options', signal: '∂V', label: 'Exotics', tag: 'Pricing' },
                { match: 'fixed income', signal: 'DV01', label: 'Fixed Income', tag: 'Rates' },
                { match: 'problem book', signal: '1000+', label: 'Problems', tag: 'Problem book' },
                { match: 'greek explainer', signal: 'Γ', label: 'Greek Lab', tag: 'Notebooks' },
                { match: 'python', signal: 'Py', label: 'Python', tag: 'Code' },
                { match: 'c++', signal: 'C++', label: 'C++', tag: 'Code' },
                { match: 'stochastic', signal: 'dW', label: 'Stochastic', tag: 'Mathematics' },
                { match: 'xva', signal: 'XVA', label: 'XVA', tag: 'Risk' }
            ];
            return visuals.find(item => name.includes(item.match)) || {
                signal: (productName || 'Q').trim().charAt(0).toUpperCase(),
                label: 'Quant Resource',
                tag: 'Premium'
            };
        }

        for (const product of items) {
            const productCard = document.createElement('div');
            const isTargetLaunch = product.id === '6b78550d-e130-41d1-9409-92335ce82a6c';
            productCard.className = isTargetLaunch ? 'product-card reveal-up highlighted-product' : 'product-card reveal-up';
            productCard.dataset.category = 'notes';

            // Convert price to local currency (async)
            const localPrice = await convertPrice(product.price, userCountryCode, product.enable_ppp);
            const isLocalCurrency = localPrice.currency.code !== 'INR';

            const priceDisplay = isFree
                ? `<div class="product-price" style="color:#22c55e">Free</div>`
                : isLocalCurrency
                    ? `<div class="product-price" style="font-size:1.2em;">${formatPrice(localPrice)}</div>`
                    : `<div class="product-price">₹${product.price}</div>`;

            const btnText = isFree ? 'Download' : 'Buy Now';

            const visual = getProductCardVisual(product.name);
            const productHref = `${window.location.pathname.includes('-test') ? 'product-test.html' : 'product.html'}?id=${product.id}`;
            productCard.setAttribute('role', 'link');
            productCard.setAttribute('tabindex', '0');
            productCard.setAttribute('aria-label', `Preview ${product.name}`);
            productCard.addEventListener('click', () => { window.location.href = productHref; });
            productCard.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    window.location.href = productHref;
                }
            });

            // Handle sanitized description
            const rawDesc = product.description || '';
            const displayDesc = (rawDesc === '<p><br></p>') ? '' : rawDesc;

            // Store price info on the card for modal use
            productCard.dataset.localPrice = JSON.stringify(localPrice);
            productCard.dataset.inrPrice = product.price;

            // Handle original price display (fix for INR showing when using other currencies)
            let originalPriceDisplay = '';
            if (product.original_price > product.price) {
                // Calculate discount percentage
                const discountPercent = Math.round((1 - product.price / product.original_price) * 100);
                const discountBadge = `<span style="background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:0.75em;font-weight:700;padding:2px 8px;border-radius:100px;white-space:nowrap">${discountPercent}% OFF</span>`;

                if (isLocalCurrency) {
                    const rate = localPrice.rate || 1;
                    let convertedOriginal = product.original_price * rate;

                    if (product.enable_ppp && !localPrice.isWeaker) {
                        convertedOriginal = convertedOriginal * 1.5;
                    }

                    const originalObj = {
                        amount: Math.round(convertedOriginal),
                        currency: localPrice.currency
                    };
                    originalPriceDisplay = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="text-decoration:line-through;color:var(--text-muted);font-size:0.9em">${formatPrice(originalObj)}</span>${priceDisplay}${discountBadge}</div>`;
                } else {
                    originalPriceDisplay = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="text-decoration:line-through;color:var(--text-muted);font-size:0.9em">₹${product.original_price}</span>${priceDisplay}${discountBadge}</div>`;
                }
            } else {
                originalPriceDisplay = priceDisplay;
            }

            productCard.innerHTML = `
                <div class="product-image reference-cover">
                    <span class="reference-signal">${visual.signal}</span>
                    <span class="reference-cover-label">${visual.label}</span>
                </div>
                <div class="product-content">
                    <h3 class="product-title">${product.name} <button class="share-btn" onclick="event.stopPropagation();copyProductLink('${product.id}')" title="Copy share link" aria-label="Copy share link for ${product.name}" style="background:none;border:none;color:var(--d2q-muted);cursor:pointer;font-size:0.75em;margin-left:6px;transition:color 0.2s;vertical-align:middle;"><i class="fas fa-share-alt"></i></button></h3>
                    <div class="product-description">${truncateText(stripMarkdown(displayDesc.replace(/<[^>]*>?/gm, '')), 250)}</div>
                    <div class="product-footer">
                        <div class="product-card-price-row">
                            <div class="product-price-action">${originalPriceDisplay}</div>
                            <span class="product-reference-tag">${isFree ? 'Free resource' : visual.tag}</span>
                        </div>
                        <button class="btn product-buy-button" type="button" onclick="event.stopPropagation();openProductModal('${product.id}')" aria-label="${btnText} ${product.name}">${btnText}</button>
                    </div>
                </div>
            `;
            container.appendChild(productCard);
            if (window.revealObserver) window.revealObserver.observe(productCard);
        }
    }
}

// Global scope for product modal
window.openProductModal = async function (id) {
    if (!window.supabaseClient) return;
    try {
        const { data: product, error } = await window.supabaseClient.from('products').select('*').eq('id', id).single();
        if (error || !product) return;

        const modal = document.getElementById('productModal');
        if (!modal) return;

        // Convert price to local currency
        const localPrice = await convertPrice(product.price, userCountryCode, product.enable_ppp);
        const isLocalCurrency = localPrice.currency.code !== 'INR';

        // Store price info for calculations
        window.currentProductInrPrice = product.price;
        window.currentProductLocalPrice = localPrice;
        window.currentProductIsLocalCurrency = isLocalCurrency;

        document.getElementById('modalTitle').textContent = product.name;
        document.getElementById('modalDescription').innerHTML = product.description || 'Premium digital product.';

        // Display price with local currency
        const priceElement = document.getElementById('modalPrice');
        const pppInfoElement = document.getElementById('pppInfo');
        const pppTextElement = document.getElementById('pppText');

        // Check if Free or Paid
        const isFree = (product.price === 0 || !product.price);
        const modalPayBtn = document.getElementById('modalPayBtn');
        const couponRow = document.querySelector('.coupon-row');
        const modalNote = document.querySelector('.modal-note');

        if (isFree) {
            priceElement.textContent = 'FREE';
            if (pppInfoElement) pppInfoElement.style.display = 'none';

            // UI Updates for FREE
            if (couponRow) couponRow.style.display = 'none';
            if (modalNote) modalNote.style.display = 'none';

            if (modalPayBtn) {
                modalPayBtn.innerHTML = '<i class="fas fa-download"></i> Download Now';
                modalPayBtn.style.background = '#22c55e'; // Green for download
            }
        } else {
            // UI Updates for PAID (Reset)
            if (couponRow) couponRow.style.display = 'flex';
            if (modalNote) modalNote.style.display = 'block';

            if (modalPayBtn) {
                modalPayBtn.innerHTML = '<i class="fas fa-credit-card"></i> Pay Now';
                modalPayBtn.style.background = '';
            }

            priceElement.style.background = '';
            priceElement.style.webkitTextFillColor = '';
            priceElement.style.color = '';

            if (isLocalCurrency) {
                // Show local currency only
                priceElement.innerHTML = `<span style="font-size:1.3em;font-weight:600;">${formatPrice(localPrice)}</span>`;
                if (pppInfoElement) pppInfoElement.style.display = 'none';
            } else {
                // Show INR for Indian users
                priceElement.textContent = '₹' + product.price;
                if (pppInfoElement) pppInfoElement.style.display = 'none';
            }
        }

        window.currentDiscountedPrice = undefined;
        window.activeModalCoupon = {
            code: product.coupon_code || '',
            percent: product.discount_percentage || 0
        };
        window.isCouponApplied = false;

        const couponInput = document.getElementById('couponInput');
        if (couponInput) couponInput.value = '';

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    } catch (err) { console.error(err); }
};

// Load Sessions from Supabase and Update Services Section
async function loadSessionsFromSupabase(prefetchPromise) {
    try {
        if (!window.supabaseClient) {
            console.error('Supabase client not initialized');
            return;
        }

        // Fire Supabase query immediately
        const queryPromise = window.supabaseClient
            .from('sessions')
            .select('*')
            .eq('is_active', true)
            .order('price', { ascending: true });

        // Handle prefetch (country + rates) separately
        const prefetch = prefetchPromise || Promise.all([
            getUserCountry().catch(e => console.warn('getUserCountry failed:', e)),
            fetchExchangeRates().catch(e => console.warn('fetchExchangeRates failed:', e))
        ]);

        // Wait for both, but process sessions as soon as we can
        const [prefetchResult, queryResult] = await Promise.allSettled([
            prefetch,
            queryPromise
        ]);

        if (queryResult.status === 'rejected') {
            console.error('Error loading sessions from Supabase:', queryResult.reason);
            return;
        }

        const { data, error } = queryResult.value;

        if (error) {
            console.error('Error loading sessions from Supabase:', error);
            return;
        }

        if (data && data.length > 0) {
            console.log('🎯 Loading ' + data.length + ' sessions from Supabase');
            // Store sessions globally for booking form reference
            window.dynamicSessions = data;
            await updateServicesSection(data);
            await updateBookingForm(data);
        }
    } catch (err) {
        console.error('Failed to load sessions:', err);
    }
}

// Update Services Section with Dynamic Sessions
async function updateServicesSection(sessions) {
    const servicesContainer = document.querySelector('.services-grid');
    if (!servicesContainer) {
        // console.log('Services container not found (likely on non-index page)');
        return;
    }

    // Clear existing services (except hardcoded structure, we'll replace content)
    servicesContainer.innerHTML = '';

    let popularAssigned = false;

    for (let index = 0; index < sessions.length; index++) {
        const session = sessions[index];
        const serviceCard = document.createElement('div');
        const showPopular = session.is_popular && !popularAssigned;
        if (showPopular) popularAssigned = true;
        serviceCard.className = showPopular ? 'service-card popular reveal-up' : 'service-card reveal-up';

        // Generate features HTML
        const featuresHtml = session.features ? session.features.map(feature =>
            `<li><i class="fas fa-check" style="color: #22c55e; margin-right: 8px;"></i>${feature}</li>`
        ).join('') : '';

        // Convert price to local currency
        const localPrice = await convertPrice(session.price, userCountryCode, true);
        const isLocalCurrency = localPrice.currency.code !== 'INR';

        const priceDisplay = session.price === 0
            ? '<span class="price-free">FREE</span>'
            : isLocalCurrency
                ? `<span style="font-weight:700;">${formatPrice(localPrice)}</span>`
                : `₹${session.price}`;

        serviceCard.innerHTML = `
            <div class="service-header">
                <div class="service-icon">
                    <i class="fas fa-${index === 0 ? 'headset' : index === 1 ? 'comments' : index === 2 ? 'graduation-cap' : 'briefcase'}"></i>
                </div>
                <h3 class="service-title">${session.name}</h3>
                ${showPopular ? '<span class="popular-badge">Most Popular</span>' : ''}
            </div>
            <div class="service-content">
                <div class="service-price">
                    ${priceDisplay}
                    <span class="price-duration">/${session.duration} min</span>
                </div>
                <p class="service-description">${session.description || 'Personalized mentorship session.'}</p>
                <ul class="service-features" style="list-style: none; padding: 0; margin: 0;">
                    ${featuresHtml}
                </ul>
            </div>
            <div class="service-footer">
                <a href="#" class="btn btn-product btn-full btn-service" data-service="${session.name}">
                    ${session.price === 0 ? '🆓 Book Free Session' : 'Book Session'}
                </a>
            </div>
`;

        servicesContainer.appendChild(serviceCard);
        if (window.revealObserver) window.revealObserver.observe(serviceCard);

        // Add event listener for the booking button
        const bookBtn = serviceCard.querySelector('.btn-service');
        if (bookBtn) {
            bookBtn.addEventListener('click', function (e) {
                e.preventDefault(); // Prevent hash from being added to URL (breaks Razorpay)
                const service = this.dataset.service;
                const serviceSelect = document.getElementById('bookingService');
                if (serviceSelect) {
                    // Find the option with matching session name
                    const options = Array.from(serviceSelect.options);
                    const option = options.find(opt => opt.text.includes(service));
                    if (option) {
                        serviceSelect.value = option.value;
                        // Scroll to booking form
                        document.getElementById('contact').scrollIntoView({ behavior: 'smooth' });
                    }
                }
            });
        }
    }

    console.log('✅ Services section updated with ' + sessions.length + ' sessions');
}

// Update Booking Form with Dynamic Sessions
async function updateBookingForm(sessions) {
    const bookingSelect = document.getElementById('bookingService');
    const bookingForm = document.getElementById('bookingForm');
    const bookingService = document.getElementById('bookingService');
    const bookingDate = document.getElementById('bookingDate');
    const priceDisplay = document.getElementById('priceDisplay');
    const bookingPrice = document.getElementById('bookingPrice');

    // Check if elements exist (might be missing on admin page)
    if (!bookingForm || !bookingService || !bookingDate || !priceDisplay || !bookingPrice) {
        // console.log('Booking form elements not found (likely on non-index page). Skipping init.');
        return;
    }

    // Clear existing options (keep placeholder)
    const placeholder = bookingSelect.options[0];
    bookingSelect.innerHTML = '';
    bookingSelect.appendChild(placeholder);

    for (const session of sessions) {
        const option = document.createElement('option');
        const valueType = session.name.toLowerCase().replace(/\s+/g, '_');

        // Convert price to local currency for display
        const localPrice = await convertPrice(session.price, userCountryCode, true);
        const isLocalCurrency = localPrice.currency.code !== 'INR';

        option.value = `${valueType}| ${session.price}| ${session.duration} `;
        if (session.price === 0) {
            option.innerHTML = `🆓 ${session.name} (${session.duration} min) - FREE`;
        } else if (isLocalCurrency) {
            option.innerHTML = `${session.name} (${session.duration} min) - ${formatPrice(localPrice)}`;
        } else {
            option.innerHTML = `${session.name} (${session.duration} min) - ₹${session.price}`;
        }
        option.style.color = session.price === 0 ? '#22c55e' : '';

        bookingSelect.appendChild(option);
    }

    console.log('✅ Booking form updated with ' + sessions.length + ' sessions');
}

// Default links (fallback) - will be updated from Supabase
const PRODUCT_DOWNLOAD_LINKS = {
    'Python for Quants': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
    'C++ for Quants': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
    'XVA Derivatives Primer': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
    'Quant Projects Bundle': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
    'Interview Bible': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
    'Complete Quant Bundle': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
    'Free Sample - Quant Cheatsheet': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing'
};

// Fetch dynamic links from Supabase
async function fetchProductLinks() {
    try {
        if (!window.supabaseClient) {
            console.error('Supabase client not initialized');
            console.log('📚 Using default download links');
            return;
        }

        const { data, error } = await window.supabaseClient
            .from('products')
            .select('name, file_url');

        if (error) {
            if (error.status === 401) {
                console.error('❌ Supabase authentication failed (401): Invalid API key');
                console.log('📚 Using default download links - check Supabase configuration');
            } else {
                console.error('Error fetching Supabase products:', error);
            }
            console.log('📚 Continuing with default download links');
            return;
        }

        if (data && data.length > 0) {
            console.log('📚 Loaded ' + data.length + ' products from Supabase');
            data.forEach(product => {
                PRODUCT_DOWNLOAD_LINKS[product.name] = product.file_url;
                // Log for debugging
                console.log(`🔗 Link updated for: ${product.name} `);
            });
        } else {
            console.log('📚 No products found in Supabase, using default links');
        }
    } catch (err) {
        console.error('Failed to fetch product links:', err);
        console.log('📚 Continuing with default download links');
    }

    // ---------------- Admin Panel Helpers ----------------
    // Admin: fetch and render products in Admin panel
    async function fetchAdminProducts() {
        if (typeof window.supabaseClient === 'undefined') return;
        try {
            const { data, error } = await window.supabaseClient
                .from('products')
                .select('*')
                .order('id', { ascending: false });
            if (error) {
                console.error('Admin: error loading products:', error);
                return;
            }
            if (data && data.length > 0) {
                renderAdminProductsTable(data);
            }
        } catch (e) {
            console.error('Admin: failed to fetch products', e);
        }
    }

    // Admin: handle Add Product form
    const adminAddForm = document.getElementById('adminAddProductForm');
    if (adminAddForm) {
        adminAddForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            if (typeof window.supabaseClient === 'undefined') return;
            const name = (document.getElementById('adminProductName').value || '').trim();
            const price = parseFloat(document.getElementById('adminProductPrice').value || '0');
            const description = (document.getElementById('adminProductDescription').value || '').trim();
            const couponCode = (document.getElementById('adminCouponCode').value || '').trim();
            const couponPercent = parseInt(document.getElementById('adminCouponPercent').value || '0');

            if (!name) {
                alert('Please enter a product name.');
                return;
            }

            const payload = {
                name,
                price: isNaN(price) ? 0 : price,
                description,
                coupon_code: couponCode || null,
                coupon_percent: isNaN(couponPercent) ? 0 : couponPercent
            };
            try {
                const { data, error } = await window.supabaseClient
                    .from('products')
                    .insert(payload)
                    .select();
                if (error) {
                    alert('Error adding product: ' + error.message);
                    return;
                }
                fetchAdminProducts();
                adminAddForm.reset();
            } catch (err) {
                console.error('Admin: add product failed', err);
            }
        });
    }

    // Render admin products in the admin table
    function renderAdminProductsTable(products) {
        const tbody = document.querySelector('#adminProductsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        products.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
    < td style = "padding:8px 6px;" > ${p.id ?? ''}</td >
                <td style="padding:8px 6px;">${p.name ?? ''}</td>
                <td style="padding:8px 6px;">₹${p.price ?? 0}</td>
                <td style="padding:8px 6px;">${p.coupon_code ?? ''} (${p.coupon_percent ?? 0}%)</td>
                <td style="padding:8px 6px;">${p.description ?? ''}</td>
                <td style="padding:8px 6px;">
                    <button class="btn btn-secondary" data-id="${p.id}" data-name="${p.name ?? ''}" data-price="${p.price ?? 0}" data-description="${p.description ?? ''}" data-code="${p.coupon_code ?? ''}" data-percent="${p.coupon_percent ?? 0}" onclick="adminEditProduct(this)">Edit</button>
                    <button class="btn btn-secondary" onclick="copyProductLink('${p.id}')" title="Copy Link" style="margin-left:5px;"><i class="fas fa-link"></i></button>
                </td>
`;
            tbody.appendChild(tr);
        });
    }

    // Called when user clicks Edit in Admin panel. Simple prompt-based editor.
    window.adminEditProduct = async function (button) {
        const id = button.getAttribute('data-id');
        const currentName = button.getAttribute('data-name') || '';
        const currentPrice = button.getAttribute('data-price') || 0;
        const currentDescription = button.getAttribute('data-description') || '';
        const currentCode = button.getAttribute('data-code') || '';
        const currentPercent = button.getAttribute('data-percent') || 0;

        const name = prompt('Product Name', currentName) || currentName;
        const price = parseFloat(prompt('Price (INR)', currentPrice) || currentPrice);
        const description = prompt('Description', currentDescription) || currentDescription;
        const code = prompt('Coupon Code', currentCode) || '';
        const percent = parseInt(prompt('Coupon Percent', currentPercent) || currentPercent);

        // Persist only if id exists and user provided changes
        if (!id) return;
        try {
            const payload = {
                name,
                price: isNaN(price) ? 0 : price,
                description,
                coupon_code: code,
                coupon_percent: isNaN(percent) ? 0 : percent
            };
            const { data, error } = await window.supabaseClient
                .from('products')
                .update(payload)
                .eq('id', id)
                .select();
            if (error) {
                alert('Failed to update product: ' + error.message);
                return;
            }
            // Refresh admin table
            fetchAdminProducts();
        } catch (e) {
            console.error('Admin: update failed', e);
        }
    }
}

async function initRazorpayCheckout(productName, amount, currency = 'INR', inrAmountForLogging = null, userDetails = null) {
    const downloadLink = PRODUCT_DOWNLOAD_LINKS[productName] || '';

    // Handle FREE products (0 value) - skip payment, go directly to download
    if (amount <= 0) {
        console.log('🆓 Free product detected');
        if (downloadLink && downloadLink !== 'YOUR_DRIVE_LINK_HERE') {
            const customerName = (userDetails && userDetails.name) ? userDetails.name : (prompt('Enter your Name:') || 'Customer');
            const customerEmail = (userDetails && userDetails.email) ? userDetails.email : prompt('Enter your email to receive the free download:');

            if (customerEmail && customerEmail.includes('@')) {
                sendProductEmail(customerEmail, productName, 'FREE', downloadLink, customerName, 0, 'INR');
            }
            if (typeof window.showSuccessModal === 'function') {
                window.showSuccessModal(productName, downloadLink);
            } else {
                alert('🎉 Free Download!\n\nClick OK to download.');
                window.open(downloadLink, '_blank');
            }
        } else {
            alert('⚠️ Download link not configured. Please contact support.');
        }
        return;
    }

    // Validate key for paid products
    if (RAZORPAY_KEY_ID === 'YOUR_RAZORPAY_KEY_ID_HERE') {
        alert('⚠️ Razorpay not configured!\n\nAdd your Razorpay Key ID in script.js');
        return;
    }

    // Check Razorpay SDK loaded
    if (typeof Razorpay === 'undefined') {
        console.log('❌ Razorpay SDK not loaded, attempting to load...');
        alert('⏳ Loading payment system...\nPlease wait and try again in 2 seconds.');

        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = function () {
            console.log('✅ Razorpay SDK loaded successfully');
            alert('✅ Payment system loaded!\nPlease click "Buy Now" again.');
        };
        script.onerror = function () {
            console.error('❌ Failed to load Razorpay SDK');
            alert('❌ Unable to load payment system.\nPlease refresh the page and try again.');
        };
        document.head.appendChild(script);
        return;
    }

    // Create server-side order with all metadata
    let orderData = null;
    try {
        const orderNotes = {
            type: 'product',
            product_name: productName,
            download_link: downloadLink,
            customer_name: userDetails ? userDetails.name : '',
            customer_email: userDetails ? userDetails.email : '',
            customer_phone: userDetails ? userDetails.phone : '',
            inr_amount: String(inrAmountForLogging || amount)
        };
        const orderRes = await fetch('/api/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, currency, notes: orderNotes })
        });
        if (orderRes.ok) {
            orderData = await orderRes.json();
        } else {
            const errText = await orderRes.text();
            console.warn('⚠️ Order creation failed, proceeding without order_id:', errText);
        }
    } catch (orderErr) {
        console.warn('⚠️ Could not create order (network error), proceeding without order_id:', orderErr);
    }

    // Build Razorpay checkout options
    const options = {
        key: RAZORPAY_KEY_ID,
        amount: orderData ? orderData.amount : Math.round(amount * 100),
        currency: orderData ? orderData.currency : currency.toUpperCase(),
        name: 'Desk2Quant',
        description: productName,
        order_id: orderData ? orderData.order_id : undefined,
        handler: function (response) {
            const paymentId = response.razorpay_payment_id;
            const customerEmail = (userDetails && userDetails.email) ? userDetails.email : prompt('Enter your email to receive the download link:');

            // Grant Drive access server-side (fallback if webhook fails)
            if (customerEmail) {
                fetch('/api/grant-access', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ payment_id: paymentId, email: customerEmail })
                }).then(r => r.json())
                    .then(d => console.log('🔑 grant-access:', d.drive_access_granted ? 'Drive access granted' : (d.drive_error || 'no Drive grant needed')))
                    .catch(err => console.warn('grant-access call failed:', err));
            }

            if (window.supabaseClient && customerEmail) {
                const loggedAmount = inrAmountForLogging !== null ? inrAmountForLogging : ((currency === 'INR') ? amount : 0);
                window.supabaseClient.from('purchases').insert({
                    customer_email: customerEmail,
                    product_name: productName,
                    amount: Math.round(loggedAmount),
                    currency: currency || 'INR',
                    payment_id: paymentId,
                    source: 'frontend',
                    download_link: downloadLink
                }).then(() => console.log('✅ Purchase logged to Supabase')).catch(err => console.error('❌ Failed to log purchase:', err));
            }

            // NOTE: purchase emails (customer + admin) are sent server-side by
            // /api/razorpay-webhook — do not send from frontend (caused duplicates)

            if (downloadLink && downloadLink !== 'YOUR_DRIVE_LINK_HERE') {
                if (typeof window.showSuccessModal === 'function') {
                    window.showSuccessModal(productName, downloadLink);
                } else {
                    alert('🎉 Payment Successful!\n\nCheck your email for the download link.\n\nIMPORTANT: Please check your Spam/Junk folder.\n\nClick OK to also open it now.');
                    window.open(downloadLink, '_blank');
                }
            } else {
                alert('🎉 Payment Successful!\n\nDownload link not configured. Please contact support.');
            }
        },
        modal: {
            ondismiss: function () {
                console.log('Razorpay checkout closed by user');
            }
        },
        prefill: {
            name: userDetails ? userDetails.name : '',
            email: userDetails ? userDetails.email : '',
            contact: userDetails ? userDetails.phone : ''
        },
        theme: {
            color: '#e95836'
        }
    };

    const razorpay = new Razorpay(options);
    razorpay.open();
}

// Export for product-test.html
window.initRazorpayCheckout = initRazorpayCheckout;

/**
 * Send product purchase email to customer via Brevo (replaces EmailJS)
 * Free tier: 300 emails/day = 9,000/month
 */
async function sendProductEmail(customerEmail, productName, paymentId, downloadLink, customerName = 'Customer', amount = '', currency = 'INR') {
    console.log('📧 sendProductEmail called with:', customerEmail);

    // Send to CUSTOMER via Brevo backend
    console.log('📧 Attempting to send via Brevo secure API...');

    const htmlContent = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-right: 10px;">New Purchase</span>
                            <span style="display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Confirmed</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${customerName}</strong>, thank you for purchasing from Desk2Quant.</p>
                        
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Digital Product</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${productName}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold;">Status</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; color: #16a34a;">Payment Processed</td>
                                </tr>
                            </table>
                        </div>
                        
                        <center>
                            <a href="${downloadLink}" style="display: inline-block; background: #e95836; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-size: 16px; margin-bottom: 30px;">Download Resource</a>
                        </center>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Direct Link Backup</p>
                            <p style="font-size: 14px; margin: 0 0 8px 0; color: #1a1a1a;">If the button does not open in your email app, copy and paste this link into your browser:</p>
                            <p style="font-size: 13px; margin: 0; word-break: break-all;">
                                <a href="${downloadLink}" style="color: #2563eb; text-decoration: underline;">${downloadLink}</a>
                            </p>
                        </div>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Order Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Payment ID</td><td style="padding: 5px 0; color: #1a1a1a;">${paymentId}</td></tr>
                            </table>
                        </div>
                    </div>
                    <div style="background-color: #1a1a1a; padding: 25px 20px; text-align: center; color: #888; font-size: 12px;">
                        <p style="margin: 0 0 10px 0;">Sent by Desk2Quant</p>
                        <p style="margin: 0;">Have an issue? Reply to this email.</p>
                    </div>
                </div>
            </div>
        `;

    const textContent = `🎉 Thank you for your purchase!

Hi ${customerName},

Product: ${productName}
Payment ID: ${paymentId}

Download your product here: ${downloadLink}

If you have any questions, simply reply to this email.

Best regards,
${BUSINESS_NAME}`;

    try {
        const result = await sendEmailWithBrevo(
            customerEmail,
            `Your Purchase: ${productName}`,
            htmlContent,
            textContent
        );

        if (result.success) {
            console.log('✅ Brevo SUCCESS: Email sent to', customerEmail);
        } else {
            console.error('❌ Brevo FAILED:', result.error);
        }
    } catch (error) {
        console.error('❌ Brevo email failed:', error);
    }

    // ===== ADMIN NOTIFICATION (NEW) =====
    try {
        const adminEmailBody = `
New Product Purchase:
━━━━━━━━━━━━━━━━━━━━
📦 Product: ${productName}
💰 Amount: ${currency} ${amount}
🆔 Payment ID: ${paymentId}

👤 Customer Details:
   Name: ${customerName}
   Email: ${customerEmail}

📥 Download Link Provided:
   ${downloadLink}
━━━━━━━━━━━━━━━━━━━━
        `.trim();

        const adminHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant Admin</span>
                      </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">New Sale Received</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;"><strong>${customerName}</strong> just purchased a digital product.</p>
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Product Sold</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${productName}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold;">Amount</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; color: #16a34a;">${currency} ${amount}</td>
                                </tr>
                            </table>
                        </div>
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Customer Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Name</td><td style="padding: 5px 0; color: #1a1a1a;">${customerName}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Email</td><td style="padding: 5px 0; color: #1a1a1a;"><a href="mailto:${customerEmail}" style="color: #2563eb; text-decoration: none;">${customerEmail}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Payment ID</td><td style="padding: 5px 0; color: #1a1a1a;">${paymentId}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Download Link</td><td style="padding: 5px 0; color: #1a1a1a; word-break: break-all;"><a href="${downloadLink}" style="color: #2563eb;">${downloadLink}</a></td></tr>
                            </table>
                        </div>
                    </div>
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center; color: #888; font-size: 12px;">
                        <p style="margin: 0;">Sent by Desk2Quant</p>
                    </div>
                </div>
            </div>
        `;

        await sendAdminNotification(`Sale: ${productName} - ${customerName}`, adminHtml, adminEmailBody);
        console.log('✅ Admin notified of product purchase.');
    } catch (adminErr) {
        console.error('⚠️ Admin notification failed:', adminErr);
    }
}

// Connect to product modal - MOVED INSIDE MAIN DOMContentLoaded
const modalPayBtn = document.getElementById('modalPayBtn');

if (modalPayBtn) {
    console.log('✅ Pay button found, attaching listener');
    modalPayBtn.addEventListener('click', function (e) {
        e.preventDefault();
        console.log('🖱️ Pay button clicked');

        const productName = document.getElementById('modalTitle').textContent;
        const priceText = document.getElementById('modalPrice').textContent;
        console.log('Payment Request:', { productName, priceText });

        // Default to INR basics
        // FIX: Check for undefined/null explicitly because 0 is falsy but valid
        let payAmount = (window.currentProductInrPrice !== undefined && window.currentProductInrPrice !== null)
            ? window.currentProductInrPrice
            : parseInt(priceText.replace(/[^\d]/g, ''));

        // If price text is "FREE", parseInt might be NaN, so force 0 if we know it's free
        if (priceText.trim().toUpperCase() === 'FREE') {
            payAmount = 0;
        }

        let payCurrency = 'INR';
        let logAmountInr = payAmount; // For database stats

        // CHECK 1: International Currency Mode? Use local price for Razorpay checkout
        if (window.currentProductIsLocalCurrency && window.currentProductLocalPrice) {
            payAmount = window.currentProductLocalPrice.amount;
            payCurrency = window.currentProductLocalPrice.currency.code;
            console.log(`🌍 International Mode: Paying ${payCurrency} ${payAmount} (INR ${logAmountInr} tracked in backend)`);
        }

        // CHECK 2: Coupon Applied?
        // We use activeModalCoupon because currentDiscountedPrice is often INR-only
        if (window.isCouponApplied && window.activeModalCoupon && window.activeModalCoupon.percent > 0) {
            const discountPercent = window.activeModalCoupon.percent;

            // Calculate discounted Pay Amount
            const originalPayAmount = payAmount;
            const discountValue = (originalPayAmount * discountPercent) / 100;
            payAmount = originalPayAmount - discountValue;

            // Calculate discounted Log Amount (INR)
            const originalLogAmount = logAmountInr;
            const logDiscountValue = (originalLogAmount * discountPercent) / 100;
            logAmountInr = originalLogAmount - logDiscountValue;

            console.log('🎟️ Coupon applied:', {
                percent: discountPercent,
                originalPay: originalPayAmount,
                finalPay: payAmount,
                currency: payCurrency
            });
        }

        // Round amounts to 2 decimal places for payment (standard currency precision)
        // initRazorpayCheckout expects 'amount' in MAJOR units (e.g., 500)
        // which it then converts to subunits (paise/cents).
        // So we keep it as integer or float major units.

        // Ensure we don't send crazy floats
        payAmount = parseFloat(payAmount.toFixed(2));
        logAmountInr = Math.round(logAmountInr); // Database stores integer INR

        console.log('🚀 Final Payment Config:', { payAmount, payCurrency, logAmountInr });

        if (isNaN(payAmount)) {
            alert('Error parsing price. Please try again.');
            return;
        }

        // Allow 0 for free products, initiate checkout flow (handler will separate free vs paid)
        if (payAmount < 0) {
            alert('Invalid price detected.');
            return;
        }

        // --- NEW: Open User Details Modal instead of direct Checkout ---
        const mainUserModal = document.getElementById('user-details-modal');
        const mainUserForm = document.getElementById('main-user-details-form');
        const mainUserClose = document.getElementById('main-ud-close');

        if (mainUserModal && mainUserForm) {
            // Close Product Modal first (optional, or keep it open behind)
            // document.getElementById('productModal').classList.remove('active');

            // Show User Details Modal
            mainUserModal.style.display = 'flex';

            // Handle Close
            mainUserClose.onclick = function () {
                mainUserModal.style.display = 'none';
            };

            // Handle Submit
            mainUserForm.onsubmit = function (e) {
                e.preventDefault();

                const udName = document.getElementById('main-ud-name').value.trim();
                const udEmail = document.getElementById('main-ud-email').value.trim();
                const udPhone = document.getElementById('main-ud-phone').value.trim();

                // Email validation regex
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!udName || !udEmail) {
                    alert('❌ Please fill in required fields');
                    return;
                }
                if (!emailRegex.test(udEmail)) {
                    alert('❌ Please enter a valid email address');
                    return;
                }

                if (udName && udEmail) {
                    mainUserModal.style.display = 'none';
                    document.getElementById('productModal').classList.remove('active');
                    document.body.style.overflow = '';

                    console.log('Calling initRazorpayCheckout with User Details...');
                    initRazorpayCheckout(productName, payAmount, payCurrency, logAmountInr, {
                        name: udName,
                        email: udEmail,
                        phone: udPhone,
                        country: window.userCountryCode || 'Unknown',
                        inr_amount: String(logAmountInr)
                    });
                }
            };
        } else {
            console.error('User details modal not found, falling back to direct checkout');
            document.getElementById('productModal').classList.remove('active');
            document.body.style.overflow = '';
            initRazorpayCheckout(productName, payAmount, payCurrency, logAmountInr);
        }
    });
} else {
    // This script is shared across pages; not all pages include the product modal.
    console.info('ℹ️ modalPayBtn not present on this page; product modal payment handler skipped.');
}

// ================================
// SESSION BOOKING SYSTEM
// ================================

// ⚠️ YOUR EMAIL - Where booking notifications will be sent
const ADMIN_EMAIL = 'jha.8@alumni.iitj.ac.in';

// Google Meet link for all sessions (reliable, no setup needed)
const GOOGLE_MEET_LINK = "https://meet.google.com/hfp-npyq-qho";

/**
 * Get meeting link for booking
 * Using your existing Google Meet link - most reliable option
 */
function generateUniqueMeetLink(customerName, bookingDate) {
    return GOOGLE_MEET_LINK;
}

// Session types (loaded dynamically from Supabase)
let SESSION_TYPES = {};

// Check if a date falls within any blocked date range
async function isDateBlocked(dateString) {
    if (!window.supabaseClient) return false;

    try {
        const { data, error } = await window.supabaseClient
            .from('blocked_date_ranges')
            .select('start_date, end_date');

        if (error || !data || data.length === 0) return false;

        const checkDate = new Date(dateString + 'T00:00:00'); // Normalize to start of day

        return data.some(block => {
            const start = new Date(block.start_date + 'T00:00:00');
            const end = new Date(block.end_date + 'T23:59:59');
            return checkDate >= start && checkDate <= end;
        });
    } catch (err) {
        console.error('Error checking blocked dates:', err);
        return false;
    }
}

// Initialize booking form
const bookingForm = document.getElementById('bookingForm');
const bookingService = document.getElementById('bookingService');
const bookingDate = document.getElementById('bookingDate');
const bookingPrice = document.getElementById('bookingPrice');
const priceDisplay = document.getElementById('priceDisplay');

if (bookingForm) {
    console.log('✅ Booking form found, initializing...');

    // Set minimum date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    bookingDate.min = tomorrow.toISOString().split('T')[0];

    // Show price when service is selected
    if (bookingService) {
        bookingService.addEventListener('change', async function () {
            const value = this.value;
            if (value) {
                const [type, price, duration] = value.split('|');
                const priceValue = parseInt(price.trim());

                // Convert price to local currency
                const localPrice = await convertPrice(priceValue, userCountryCode);
                const isLocalCurrency = localPrice.currency.code !== 'INR';

                // Store for submit handler to avoid re-fetching
                window.selectedSessionLocalPrice = {
                    amount: isLocalCurrency ? localPrice.amount : priceValue,
                    currency: isLocalCurrency ? localPrice.currency.code : 'INR',
                    originalInr: priceValue,
                    isLocal: isLocalCurrency
                };

                if (isLocalCurrency) {
                    priceDisplay.textContent = formatPrice(localPrice);
                } else {
                    priceDisplay.textContent = '₹' + priceValue;
                }

                bookingPrice.style.display = 'flex';
            } else {
                bookingPrice.style.display = 'none';
                window.selectedSessionLocalPrice = null; // Clear on deselect
            }
        });
    }

    // Dynamic Time Slot Logic (Time Zone Conversion)
    if (bookingDate) {
        bookingDate.addEventListener('change', async function () {
            const dateValue = this.value;
            const timeSelect = document.getElementById('bookingTime');
            if (!dateValue || !timeSelect) return;

            timeSelect.innerHTML = '<option value="">Loading available slots...</option>';
            timeSelect.disabled = true;

            try {
                // 1. Detect User Timezone
                const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const dateObj = new Date(dateValue);
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

                // 2. Fetch Availability Pattern & Existing Bookings from Supabase
                let availability = null;
                let hasRecord = false;
                let existingBookings = [];

                if (window.supabaseClient) {
                    // Fetch slots availability
                    const { data: availData, error: availError } = await window.supabaseClient
                        .from('availability_patterns')
                        .select('*')
                        .eq('day_of_week', dayName)
                        .single();

                    if (availData) {
                        hasRecord = true;
                        if (availData.is_active) {
                            availability = availData;
                        }
                    }

                    // Fetch existing bookings for this date (to prevent collision)
                    // booking_date is DATE type, so we should query with YYYY-MM-DD
                    const { data: bookingsData, error: bookingsError } = await window.supabaseClient
                        .from('bookings')
                        .select('booking_time')
                        .eq('booking_date', dateValue); // Use dateValue (YYYY-MM-DD) directly

                    if (bookingsData) {
                        // DB stores times in IST. Normalize them in IST before comparing
                        // them with generated slot labels, regardless of visitor timezone.
                        existingBookings = bookingsData.map(b => {
                            const istDate = new Date(`1970-01-01T${b.booking_time}+05:30`);
                            return istDate.toLocaleTimeString('en-US', {
                                timeZone: 'Asia/Kolkata',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                            });
                        });
                        console.log('📅 Existing bookings for ' + dateValue + ' (DB raw -> formatted):', bookingsData, existingBookings);
                    }

                    // --- NEW: Check for Blocked Date Ranges ---
                    const { data: blockedData, error: blockedError } = await window.supabaseClient
                        .from('blocked_date_ranges')
                        .select('id')
                        .lte('start_date', dateValue)
                        .gte('end_date', dateValue);

                    if (blockedError) {
                        console.error('Error checking blocked dates:', blockedError);
                    } else if (blockedData && blockedData.length > 0) {
                        console.log('🚫 This date is blocked:', dateValue);
                        timeSelect.innerHTML = '<option value="" disabled>Mentorship Unavailable Today</option>';
                        timeSelect.disabled = false;
                        return;
                    }
                    // ------------------------------------------
                }

                // Fallback only if no record exists for this day at all
                if (!availability && !hasRecord) {
                    availability = {
                        start_time: '10:00:00',
                        end_time: '18:00:00'
                    };
                    if (dayName === 'Sunday') availability = null;
                }

                timeSelect.innerHTML = '<option value="">Select time slot</option>';

                if (!availability) {
                    timeSelect.innerHTML = '<option value="" disabled>No slots available today</option>';
                    return;
                }

                // 3. Generate Slots (30-minute intervals)
                const startHour = parseInt(availability.start_time.split(':')[0]);
                const endHour = parseInt(availability.end_time.split(':')[0]);

                // Helper to format time
                const formatIstTime = (date) => {
                    return date.toLocaleTimeString('en-US', {
                        timeZone: 'Asia/Kolkata',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    });
                };

                // Generate slots from startHour to endHour with 30 min intervals
                // Create a base date in IST (Mentor time)
                // We construct the start time: 
                let currentSlot = new Date(dateValue + `T${startHour.toString().padStart(2, '0')}:00:00+05:30`);
                const endTime = new Date(dateValue + `T${endHour.toString().padStart(2, '0')}:00:00+05:30`);

                while (currentSlot < endTime) {
                    // Convert to User Timezone for display
                    const displayTime = currentSlot.toLocaleTimeString('en-US', {
                        timeZone: userTimeZone,
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    });

                    // --- NEW: Block Lunch Break (12:00 PM - 1:30 PM IST) ---
                    const slotHour = currentSlot.getHours();
                    const slotMinute = currentSlot.getMinutes();
                    if (slotHour === 12 || (slotHour === 13 && slotMinute < 30)) {
                        // Skip 12:00, 12:30, 13:00. Resume at 13:30.
                        currentSlot.setMinutes(currentSlot.getMinutes() + 30);
                        continue;
                    }
                    // -------------------------------------------------------

                    // Format timezone name (e.g., IST, GMT, EST)
                    const tzName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: userTimeZone }).formatToParts(currentSlot).find(p => p.type === 'timeZoneName')?.value || '';

                    const istTimeLabel = formatIstTime(currentSlot); // e.g. "10:00 AM" or "10:30 AM"

                    const option = document.createElement('option');
                    option.value = istTimeLabel;

                    // Check collision
                    const isBooked = existingBookings.includes(istTimeLabel);

                    if (isBooked) {
                        option.textContent = `${istTimeLabel} IST - Booked ❌`;
                        option.disabled = true;
                        option.style.color = '#ef4444'; // Red color
                    } else {
                        option.textContent = `${istTimeLabel} IST (${displayTime} ${tzName})`;
                    }

                    timeSelect.appendChild(option);

                    // Add 30 minutes
                    currentSlot.setMinutes(currentSlot.getMinutes() + 30);
                }

            } catch (err) {
                console.error('Error generating slots:', err);
                timeSelect.innerHTML = '<option value="">Error loading slots</option>';
            } finally {
                timeSelect.disabled = false;
            }
        });
    }

    // Handle form submission
    bookingForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        console.log('🚀 Booking form submitted!'); // Debug log

        const name = document.getElementById('bookingName').value;
        const email = document.getElementById('bookingEmail').value;
        const phone = document.getElementById('bookingPhone').value || 'Not provided';
        const serviceValue = document.getElementById('bookingService').value;
        const date = document.getElementById('bookingDate').value;
        const time = document.getElementById('bookingTime').value;
        const message = document.getElementById('bookingMessage').value || 'No specific message';

        if (!serviceValue || !date || !time) {
            alert('Please fill in all required fields');
            return;
        }

        const [sessionType, price, duration] = serviceValue.split('|');

        // Try to find session info from dynamic sessions
        let sessionInfo = null;

        if (window.dynamicSessions) {
            sessionInfo = window.dynamicSessions.find(s =>
                s.name.toLowerCase().replace(/\s+/g, '_') === sessionType ||
                s.name.toLowerCase() === sessionType.replace(/_/g, ' ')
            );
        }

        // If still not found, create session info from the dropdown text
        if (!sessionInfo) {
            const selectedOption = bookingService.options[bookingService.selectedIndex];
            if (selectedOption && selectedOption.text) {
                const match = selectedOption.text.match(/[🆓\s]*([^\(]+)/);
                const sessionName = match ? match[1].trim() : 'Session';
                sessionInfo = {
                    name: sessionName,
                    price: parseInt(price) || 0,
                    duration: parseInt(duration) || 60
                };
            }
        }

        if (!sessionInfo) {
            alert('Error: Invalid session type. Please refresh and try again.');
            return;
        }

        // Format date for display
        const dateObj = new Date(date);
        const formattedDate = dateObj.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Create session description for payment
        const sessionDescription = `${sessionInfo.name} on ${formattedDate} at ${time}`;

        // Prepare Payment Details
        let payAmount = sessionInfo.price;
        let payCurrency = 'INR';
        let logAmountInr = sessionInfo.price;

        // Check for Local Currency (use local price for Razorpay checkout)
        try {
            if (userCountryCode && userCountryCode !== 'IN') {
                const localPrice = await convertPrice(sessionInfo.price, userCountryCode, true);
                if (localPrice.currency.code !== 'INR') {
                    payAmount = localPrice.amount;
                    payCurrency = localPrice.currency.code;
                    console.log(`🌍 Booking International: Paying ${payCurrency} ${payAmount} (INR ${logAmountInr} tracked in backend)`);
                }
            }
        } catch (e) {
            console.warn('Currency conversion failed for booking, defaulting to INR', e);
        }

        // Store booking details for after payment (with localStorage backup)
        window.pendingBooking = {
            name,
            email,
            phone,
            sessionType: sessionInfo.name,
            duration: sessionInfo.duration,
            price: Math.round(logAmountInr), // Store INR price in DB
            pay_currency: payCurrency, // Store actual payment currency for email display
            bookingDate: date, // ISO YYYY-MM-DD for Supabase DATE column
            date: formattedDate,
            time,
            message
        };
        // Persist to localStorage as backup
        try {
            localStorage.setItem('pendingBooking', JSON.stringify(window.pendingBooking));
        } catch (e) { console.warn('Could not persist booking to localStorage:', e); }

        // Initiate session payment
        initSessionPayment(sessionDescription, payAmount, email, payCurrency, logAmountInr, window.pendingBooking);
    });
}

/**
 * Initialize Razorpay for session booking payment
 */
async function initSessionPayment(description, amount, customerEmail, currency = 'INR', inrAmountForLogging = null, bookingData = null) {
    // Safety net: remove any URL hash before opening Razorpay (hash breaks domain verification)
    if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    // Handle FREE sessions (0 value)
    if (amount <= 0) {
        handleSessionPaymentSuccess({ payment_id: 'FREE_SESSION_' + Date.now() });
        return;
    }

    if (RAZORPAY_KEY_ID === 'YOUR_RAZORPAY_KEY_ID_HERE') {
        alert('⚠️ Payment system not configured. Please contact the admin.');
        return;
    }

    // Initialize Razorpay SDK
    if (typeof Razorpay === 'undefined') {
        console.log('❌ Razorpay SDK not loaded');
        alert('❌ Payment system not available. Please refresh the page.');
        return;
    }

    // Create server-side order with all metadata
    let orderData = null;
    try {
        const orderNotes = {
            type: 'session',
            customer_name: bookingData ? bookingData.name : '',
            customer_email: customerEmail,
            session_name: bookingData ? bookingData.sessionType : '',
            session_date: bookingData ? bookingData.date : '',
            session_time: bookingData ? bookingData.time : '',
            session_duration: bookingData ? String(bookingData.duration) : '',
            session_price: String(inrAmountForLogging || amount),
            inr_amount: String(inrAmountForLogging || amount),
            customer_phone: bookingData ? bookingData.phone : '',
            customer_message: bookingData ? bookingData.message : '',
            customer_country: window.userCountryCode || 'Unknown'
        };
        const orderRes = await fetch('/api/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, currency, notes: orderNotes })
        });
        if (orderRes.ok) {
            orderData = await orderRes.json();
        } else {
            const errText = await orderRes.text();
            console.warn('⚠️ Session order creation failed, proceeding without order_id:', errText);
        }
    } catch (orderErr) {
        console.warn('⚠️ Could not create session order (network error), proceeding without order_id:', orderErr);
    }

    // Open Razorpay checkout
    const options = {
        key: RAZORPAY_KEY_ID,
        amount: orderData ? orderData.amount : Math.round(amount * 100),
        currency: orderData ? orderData.currency : currency.toUpperCase(),
        name: 'Desk2Quant',
        description: description || 'Mentorship Session',
        order_id: orderData ? orderData.order_id : undefined,
        handler: function (response) {
            const paymentId = response.razorpay_payment_id;
            handleSessionPaymentSuccess({ payment_id: paymentId });
        },
        modal: {
            ondismiss: function () {
                console.log('Razorpay session checkout closed by user');
            }
        },
        prefill: {
            name: bookingData ? bookingData.name : '',
            email: customerEmail,
            contact: bookingData ? bookingData.phone : ''
        },
        theme: {
            color: '#e95836'
        }
    };

    try {
        const razorpay = new Razorpay(options);
        razorpay.open();
    } catch (e) {
        console.error('Razorpay session checkout failed:', e);
        alert('❌ Payment could not be processed.\n' + e.message + '\n\nPlease try again.');
    }
}

/**
 * Handle successful session payment - send email notification
 */
async function handleSessionPaymentSuccess(response) {
    const paymentId = response.payment_id;

    try {
        // Try to get booking from window, fallback to localStorage
        let booking = window.pendingBooking;
        if (!booking) {
            try {
                const stored = localStorage.getItem('pendingBooking');
                if (stored) booking = JSON.parse(stored);
            } catch (e) { console.warn('Could not retrieve booking from localStorage:', e); }
        }

        if (!booking || !booking.email) {
            console.error('❌ No booking data found!');
            alert('Error: Booking data was lost. Please contact support with Payment ID: ' + paymentId);
            return;
        }

        console.log('📧 Booking object:', booking);
        console.log('📧 Email to send to:', booking.email);

        // Generate unique meeting link for this booking
        const uniqueMeetLink = generateUniqueMeetLink(booking.name, booking.date);
        console.log('🔗 Generated unique meeting link:', uniqueMeetLink);

        // ===== STEP 0: DEDUP CHECK (prevent webhook + client-side double-fire) =====
        if (window.supabaseClient) {
            try {
                const { data: existing } = await window.supabaseClient
                    .from('bookings')
                    .select('id')
                    .eq('payment_id', paymentId)
                    .limit(1);
                if (existing && existing.length > 0) {
                    console.log('ℹ️ Booking already exists for payment', paymentId, '— skipping duplicate client-side insert');
                    alert(`✅ Booking already confirmed!\nPayment ID: ${paymentId}\nCheck your email for details.`);
                    try { localStorage.removeItem('pendingBooking'); } catch (e) { }
                    return;
                }
            } catch (e) { console.warn('Dedup check failed (proceeding):', e); }
        }

        // ===== STEP 1: SEND CUSTOMER EMAIL FIRST (HIGHEST PRIORITY) =====
        console.log('📧 Sending session confirmation to customer:', booking.email);

        console.log('📧 Sending customer email securely via API...');

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-right: 10px;">Booking Confirmed</span>
                            <span style="display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Paid</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${booking.name}</strong>, your mentoring session is confirmed.</p>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Session</td><td style="padding: 5px 0; color: #1a1a1a; font-weight: bold;">${booking.sessionType}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Duration</td><td style="padding: 5px 0; color: #1a1a1a;">${booking.duration} mins</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Date</td><td style="padding: 5px 0; color: #1a1a1a;">${booking.date}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Time</td><td style="padding: 5px 0; color: #1a1a1a;">${booking.time}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Amount Paid</td><td style="padding: 5px 0; color: #1a1a1a;">${booking.pay_currency === 'INR' ? '₹' : '$'}${booking.pay_currency === 'INR' ? booking.price : Math.round(booking.price * 0.012)}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Payment ID</td><td style="padding: 5px 0; color: #1a1a1a;">${paymentId}</td></tr>
                            </table>
                        </div>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Join Your Session</p>
                            <a href="${uniqueMeetLink}" style="display: inline-block; background: #10b981; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px;">Join Meeting</a>
                            <p style="margin-top: 10px; font-size: 13px; color: #666; word-break: break-all;">${uniqueMeetLink}</p>
                        </div>

                        <div style="background: #fffbeb; padding: 20px; border-radius: 6px; border-left: 4px solid #f59e0b;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Need to Reschedule?</p>
                            <p style="margin: 0; font-size: 14px; color: #1a1a1a;">Visit <a href="${window.location.origin}/my-bookings.html" style="color: #2563eb; text-decoration: none;">My Bookings</a> and enter your email (<strong>${booking.email}</strong>) to view and reschedule.</p>
                        </div>
                    </div>
                    <div style="background-color: #1a1a1a; padding: 25px 20px; text-align: center; color: #888; font-size: 12px;">
                        <p style="margin: 0 0 10px 0;">Sent by Desk2Quant</p>
                        <p style="margin: 0;">Have an issue? Reply to this email.</p>
                    </div>
                </div>
            </div>
        `;

        const textContent = `🎉 Your session has been booked!

Hi ${booking.name},

Session: ${booking.sessionType} (${booking.duration} mins)
Date: ${booking.date}
Time: ${booking.time}
Amount Paid: ${booking.pay_currency === 'INR' ? '₹' + booking.price : '$' + Math.round(booking.price * 0.012)}
Payment ID: ${paymentId}

JOIN YOUR SESSION HERE:
${uniqueMeetLink}

Need to Reschedule?
Visit: ${window.location.origin}/my-bookings.html
Enter your email (${booking.email}) to view and reschedule.

Best regards,
${BUSINESS_NAME}`;

        try {
            const result = await sendEmailWithBrevo(
                booking.email,
                `Booking Confirmed: ${booking.sessionType}`,
                htmlContent,
                textContent
            );

            if (result.success) {
                console.log('✅ Session confirmation SUCCESS via Brevo');
            } else {
                console.error('❌ Brevo session email FAILED:', result.error);
            }
        } catch (error) {
            console.error('❌ Session email failed:', error);
        }

        // ===== STEP 2: STORE IN SUPABASE (SECONDARY) =====
        console.log('📋 Attempting to store booking in Supabase...');
        if (window.supabaseClient) {
            try {
                const { data, error } = await window.supabaseClient
                    .from('bookings')
                    .insert({
                        email: booking.email,
                        name: booking.name,
                        phone: booking.phone,
                        service_name: booking.sessionType,
                        service_price: booking.price,
                        service_duration: booking.duration,
                        // Keep display date for emails, but persist a valid DATE value.
                        // Fallback supports an in-flight booking created before this fix.
                        booking_date: booking.bookingDate || new Date(booking.date).toISOString().split('T')[0],
                        booking_time: booking.time,
                        message: booking.message,
                        status: 'upcoming',
                        payment_id: paymentId,
                        meet_link: uniqueMeetLink
                    })
                    .select();

                if (error) {
                    console.error('❌ Supabase insert failed:', error);
                } else {
                    console.log('✅ Booking stored in Supabase:', data);
                }
            } catch (error) {
                console.error('❌ Error storing booking in database:', error);
            }
        } else {
            console.warn('⚠️ Supabase client not available — saving booking to localStorage for webhook pickup');
            try {
                localStorage.setItem('pendingBooking', JSON.stringify({
                    ...booking,
                    payment_id: paymentId,
                    meet_link: uniqueMeetLink,
                    saved_at: Date.now()
                }));
            } catch (e) { console.warn('localStorage save failed:', e); }
        }

        // ===== STEP 3: SEND ADMIN NOTIFICATION (TERTIARY) =====
        try {
            const emailBody = `
New Booking Details:
━━━━━━━━━━━━━━━━━━━━
📋 Session: ${booking.sessionType} (${booking.duration} mins)
💰 Amount Paid: ${booking.pay_currency === 'INR' ? '₹' + booking.price : '$' + Math.round(booking.price * 0.012)}
🆔 Payment ID: ${paymentId}

👤 Customer Details:
   Name: ${booking.name}
   Email: ${booking.email}
   Phone: ${booking.phone}

📅 Scheduled For:
   Date: ${booking.date}
   Time: ${booking.time}

📝 Customer Message:
   ${booking.message}

🔗 Google Meet Link to Share:
   ${uniqueMeetLink}
━━━━━━━━━━━━━━━━━━━━
    `.trim();

            const adminHtml = `
        <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
            <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                    <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant Admin</span>
                </div>
                <div style="padding: 30px;">
                    <div style="margin-bottom: 20px;">
                        <span style="display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">New Booking Received</span>
                    </div>
                    <p style="font-size: 16px; margin-bottom: 25px;"><strong>${booking.name}</strong> booked a mentoring session.</p>
                    <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                        <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Details</p>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <tr><td style="padding: 5px 0; color: #666; width: 30%;">Session</td><td style="padding: 5px 0; color: #1a1a1a; font-weight: bold;">${booking.sessionType}</td></tr>
                            <tr><td style="padding: 5px 0; color: #666;">Duration</td><td style="padding: 5px 0; color: #1a1a1a;">${booking.duration} mins</td></tr>
                            <tr><td style="padding: 5px 0; color: #666;">Date</td><td style="padding: 5px 0; color: #1a1a1a;">${booking.date}</td></tr>
                            <tr><td style="padding: 5px 0; color: #666;">Time</td><td style="padding: 5px 0; color: #1a1a1a;">${booking.time}</td></tr>
                            <tr><td style="padding: 5px 0; color: #666;">Amount</td><td style="padding: 5px 0; color: #1a1a1a;">${booking.pay_currency === 'INR' ? '₹' : (booking.pay_currency || '$')}${booking.pay_currency === 'INR' ? booking.price : Math.round(booking.price * 0.012)}</td></tr>
                        </table>
                    </div>
                    <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                        <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Customer Details</p>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <tr><td style="padding: 5px 0; color: #666; width: 30%;">Name</td><td style="padding: 5px 0; color: #1a1a1a;">${booking.name}</td></tr>
                            <tr><td style="padding: 5px 0; color: #666;">Email</td><td style="padding: 5px 0; color: #1a1a1a;"><a href="mailto:${booking.email}" style="color: #2563eb; text-decoration: none;">${booking.email}</a></td></tr>
                            <tr><td style="padding: 5px 0; color: #666;">Phone</td><td style="padding: 5px 0; color: #1a1a1a;">${booking.phone}</td></tr>
                            <tr><td style="padding: 5px 0; color: #666;">Payment ID</td><td style="padding: 5px 0; color: #1a1a1a;">${paymentId}</td></tr>
                        </table>
                    </div>
                    <div style="background: #f9f8f4; padding: 20px; border-radius: 6px;">
                        <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Meeting Link</p>
                        <a href="${uniqueMeetLink}" style="display: inline-block; background: #10b981; color: #ffffff; font-weight: bold; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px;">Join Meeting</a>
                        <p style="margin-top: 10px; font-size: 13px; color: #666; word-break: break-all;">${uniqueMeetLink}</p>
                    </div>
                    <div style="background: #fffbeb; padding: 20px; border-radius: 6px; margin-top: 16px; border-left: 4px solid #f59e0b;">
                        <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Customer Message</p>
                        <p style="margin: 0; color: #1a1a1a; font-size: 14px;">${booking.message}</p>
                    </div>
                </div>
                <div style="background-color: #1a1a1a; padding: 20px; text-align: center; color: #888; font-size: 12px;">
                    <p style="margin: 0;">Sent by Desk2Quant</p>
                </div>
            </div>
        </div>
    `;
            await sendAdminNotification(`New Booking: ${booking.name} - ${booking.sessionType}`, adminHtml, emailBody);
        } catch (adminErr) {
            console.error('⚠️ Admin notification failed (non-blocking):', adminErr);
        }

        // Clear localStorage backup
        try { localStorage.removeItem('pendingBooking'); } catch (e) { }


        // Show success message to customer
        alert(`🎉 Session Booked Successfully!

Payment ID: ${paymentId}

📅 ${booking.sessionType}
📆 ${booking.date}
⏰ ${booking.time}

✅ Confirmation email with Google Meet link has been sent to ${booking.email}

📩 IMPORTANT: Please check your Spam/Junk folder if you don't see the email in your Inbox.

🔄 Need to Reschedule?
Visit: ${window.location.origin}/my-bookings.html
Enter your email to view and reschedule your session.

Thank you for booking!`);

        // Reset form
        const bookingForm = document.getElementById('bookingForm');
        if (bookingForm) bookingForm.reset();
        const bookingPrice = document.getElementById('bookingPrice');
        if (bookingPrice) bookingPrice.style.display = 'none';

    } catch (outerErr) {
        console.error('❌ handleSessionPaymentSuccess failed:', outerErr);
        alert('Payment received (ID: ' + paymentId + '). If you did not get a confirmation email, please contact support.');
    }
}

// --- BLOG & RESOURCES LOGIC ---

async function loadBlogs() {
    console.log('📰 Attempting to load blogs from Supabase...');
    if (!window.supabaseClient) {
        console.error('❌ Supabase client not ready for blogs');
        return;
    }
    try {
        const { data, error } = await window.supabaseClient.from('blogs').select('*').eq('is_published', true).order('created_at', { ascending: false });
        if (error) {
            console.error('❌ Error fetching blogs:', error);
            return;
        }
        console.log(`📰 Blogs fetched: ${data?.length || 0} published articles found.`);
        if (data) displayBlogs(data);
    } catch (e) { console.error('Blog load error', e); }
}

function displayBlogs(blogs) {
    const grid = document.getElementById('blog-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (blogs.length === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted)">Coming soon.</p>';
        return;
    }

    blogs.forEach(blog => {
        const div = document.createElement('div');
        div.className = 'product-card blog-card';
        div.style.cursor = 'pointer';
        div.onclick = () => openBlogModal(blog.id);

        div.innerHTML = `
            <div class="product-image" style="padding:0; aspect-ratio:16/9; overflow:hidden; background:#1e293b;">
                ${blog.cover_image_url ? `<img src="${blog.cover_image_url}" alt="${blog.title || 'Blog post cover image'}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:gray;"><i class="fas fa-newspaper fa-3x"></i></div>`}
                <div class="product-badge" style="background:#8b5cf6;">ARTICLE</div>
            </div>
            <div class="product-content" style="display:flex; flex-direction:column;">
                <h3 class="product-title">${blog.title}</h3>
                <p class="product-description" style="flex:1; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${blog.excerpt || ''}</p>
                <div class="product-footer" style="margin-top:15px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
                     <span style="font-size:0.85em; color:var(--text-muted);">${new Date(blog.created_at).toLocaleDateString()}</span>
                     <span style="color:var(--accent); font-size:0.9em; font-weight:600;">Read &rarr;</span>
                </div>
            </div>
        `;
        grid.appendChild(div);
    });
}

// --- APPROVED TESTIMONIALS ---
async function loadApprovedTestimonials() {
    const grid = document.getElementById('approved-testimonials-grid');
    if (!grid) return;

    console.log('📣 Loading approved testimonials...');
    if (!window.supabaseClient) {
        console.log('⚠️ Supabase not available for testimonials');
        return;
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('testimonials')
            .select('*')
            .eq('is_published', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error fetching testimonials:', error);
            return;
        }

        console.log(`✅ Loaded ${data?.length || 0} approved testimonials`);
        displayApprovedTestimonials(data || []);
    } catch (e) {
        console.error('Testimonials load error:', e);
    }
}

function displayApprovedTestimonials(testimonials) {
    const grid = document.getElementById('approved-testimonials-grid');
    if (!grid) return;

    // Count static testimonials before clearing them (5 hardcoded 5-star reviews in index.html)
    const staticTestimonialCount = grid.querySelectorAll('.testimonial-card').length;
    const staticRatingSum = staticTestimonialCount * 5; // All static testimonials are 5-star

    grid.innerHTML = '';

    // Calculate Summary Stats (static + dynamic)
    const dynamicCount = testimonials.length;
    const totalTestimonials = staticTestimonialCount + dynamicCount;
    let averageRating = 0;
    if (totalTestimonials > 0) {
        const dynamicSum = testimonials.reduce((acc, curr) => acc + (curr.rating || 5), 0);
        averageRating = ((staticRatingSum + dynamicSum) / totalTestimonials).toFixed(1);
    }

    // Update Summary UI if elements exist (e.g. on index.html)
    const avgDisplay = document.getElementById('average-rating-display');
    const totalDisplay = document.getElementById('total-ratings-display');
    const countDisplay = document.getElementById('total-testimonials-display');

    if (avgDisplay) avgDisplay.textContent = averageRating > 0 ? averageRating : '5.0';
    if (totalDisplay) totalDisplay.textContent = totalTestimonials;
    if (countDisplay) countDisplay.textContent = totalTestimonials;

    if (totalTestimonials === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:40px;">No reviews yet. Be the first to share your experience!</p>';
        return;
    }

    // If on index.html (or root), limit to 5 reviews. Otherwise, show all.
    const isHomePage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
    const reviewsToShow = isHomePage ? testimonials.slice(0, 5) : testimonials;

    reviewsToShow.forEach(t => {
        const stars = '★'.repeat(t.rating) + '☆'.repeat(5 - t.rating);
        const date = new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

        const div = document.createElement('div');
        div.className = 'testimonial-card';
        div.innerHTML = `
            <div class="testimonial-rating">${'★'.repeat(t.rating)}</div>
            <p class="testimonial-text">"${escapeHtml(t.review)}"</p>
            <div class="testimonial-author">
                <div class="author-avatar"><i class="fas fa-user"></i></div>
                <div class="author-info">
                    <span class="author-name">${escapeHtml(t.name)}</span>
                    <span class="author-role">${escapeHtml(t.title)}</span>
                </div>
            </div>
            <div class="verified-badge">
                <i class="fas fa-check-circle"></i> Verified • ${date}
            </div>
        `;
        grid.appendChild(div);
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global scope for HTML access
window.openBlogModal = async function (id) {
    const modal = document.getElementById('blogModal');
    if (!modal) { console.error('Blog Modal Not Found'); return; }

    // Reset & Show Loading
    document.getElementById('blogModalTitle').textContent = 'Loading...';
    document.getElementById('blogModalContent').innerHTML = '';
    document.getElementById('blogModalCover').style.display = 'none';
    modal.classList.add('active');
    modal.style.display = 'flex'; // Ensure display flex overrides any none

    try {
        const { data } = await window.supabaseClient.from('blogs').select('*').eq('id', id).single();
        if (data) {
            document.getElementById('blogModalTitle').textContent = data.title;
            document.getElementById('blogModalMeta').textContent = new Date(data.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            document.getElementById('blogModalContent').innerHTML = data.content;

            // Store current blog info for sharing
            window._currentBlog = {
                title: data.title,
                slug: data.slug,
                excerpt: data.excerpt || ''
            };

            // Update URL without reload for deep linking
            if (data.slug) {
                history.replaceState(null, '', `?slug=${data.slug}`);
            }

            // Trigger MathJax to render equations in the new content
            // Wait for content to be fully inserted, then typeset
            if (window.MathJax) {
                window.MathJax.typesetPromise([document.getElementById('blogModalContent')])
                    .then(() => console.log('✅ MathJax rendering complete'))
                    .catch((err) => console.error('❌ MathJax error:', err));
            } else {
                // MathJax not loaded yet, wait and retry
                setTimeout(() => {
                    if (window.MathJax) {
                        window.MathJax.typesetPromise([document.getElementById('blogModalContent')])
                            .then(() => console.log('✅ MathJax rendering complete (delayed)'))
                            .catch((err) => console.error('❌ MathJax error:', err));
                    }
                }, 100);
            }

            const cover = document.getElementById('blogModalCover');
            if (data.cover_image_url) {
                cover.style.display = 'block';
                const coverImg = cover.querySelector('img');
                coverImg.src = data.cover_image_url;
                coverImg.alt = data.title ? data.title + ' cover image' : 'Blog post cover image';
            }
        }
    } catch (e) {
        document.getElementById('blogModalContent').textContent = 'Error loading article.';
    }
};

// --- BLOG SHARING ---
window.shareBlog = function (platform) {
    const blog = window._currentBlog;
    if (!blog || !blog.slug) {
        alert('No article is currently open.');
        return;
    }

    const shareUrl = `${window.location.origin}/blog.html?slug=${blog.slug}`;
    const shareTitle = blog.title;
    const shareText = `${blog.title} — ${blog.excerpt.substring(0, 100)}`;

    switch (platform) {
        case 'copy':
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(shareUrl).then(() => {
                    // Visual feedback: briefly change the copy button icon
                    const copyBtn = document.querySelector('#blogShareBar button[title="Copy Link"] i');
                    if (copyBtn) {
                        copyBtn.className = 'fas fa-check';
                        copyBtn.style.color = '#10b981';
                        setTimeout(() => { copyBtn.className = 'fas fa-link'; copyBtn.style.color = ''; }, 2000);
                    }
                }).catch(() => {
                    prompt('Copy this link:', shareUrl);
                });
            } else {
                prompt('Copy this link:', shareUrl);
            }
            break;
        case 'linkedin':
            window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank', 'width=600,height=500');
            break;
        case 'twitter':
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`, '_blank', 'width=600,height=400');
            break;
        case 'whatsapp':
            window.open(`https://wa.me/?text=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`, '_blank');
            break;
    }
};

// --- BLOG DEEP LINK SUPPORT ---
// If URL has ?slug=xxx, auto-open that blog post
document.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    if (slug && window.supabaseClient) {
        // Wait for Supabase to be ready, then fetch blog by slug
        setTimeout(async () => {
            try {
                const { data } = await window.supabaseClient.from('blogs').select('id').eq('slug', slug).single();
                if (data && data.id) {
                    window.openBlogModal(data.id);
                }
            } catch (e) {
                console.error('Deep link blog load failed:', e);
            }
        }, 500);
    }
});

// Initialize Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Blogs now loaded in main init sequence above

    const blogClose = document.getElementById('blogModalClose');
    if (blogClose) {
        blogClose.onclick = () => {
            const m = document.getElementById('blogModal');
            m.classList.remove('active');
            m.style.display = 'none';
            window._currentBlog = null;
            history.replaceState(null, '', window.location.pathname);
        }
    }

    window.addEventListener('click', (e) => {
        const m = document.getElementById('blogModal');
        if (e.target === m || (m && e.target.classList.contains('modal-overlay'))) {
            m.classList.remove('active');
            m.style.display = 'none';
        }
    });
});


// Clear pending booking
window.pendingBooking = null;


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
