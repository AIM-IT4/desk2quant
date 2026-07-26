// Razorpay Webhook Handler
// This endpoint is called by Razorpay when payment events occur
// Handles product purchases and session bookings

import crypto from 'crypto';

// Disable Vercel body parsing so we can read the raw stream for signature verification
export const config = {
    api: {
        bodyParser: false,
    },
};

// Helper function to read the raw body from the request stream
async function getRawBody(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

function normalizeProductName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ');
}

export default async function handler(req, res) {
    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Configuration
    const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudGFibXl1cmxybG5vYWpkbmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDEyNjUsImV4cCI6MjA4NTY3NzI2NX0.PYpNd_t_px09zi2d5WGjFVOB23sjb3ZPuAnxagYshe0';
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jha.8@alumni.iitj.ac.in';
    const SENDER_EMAIL = process.env.SENDER_EMAIL || 'jha.8@alumni.iitj.ac.in';
    const SENDER_NAME = process.env.SENDER_NAME || 'Desk2Quant';

    // 1. Capture Raw Body for Signature Verification
    let rawBody;
    try {
        rawBody = await getRawBody(req);
    } catch (err) {
        console.error('Error reading raw body:', err);
        return res.status(500).json({ error: 'Could not read request body' });
    }

    // 2. Verify Webhook Signature (mandatory — reject if secret not configured)
    if (!RAZORPAY_WEBHOOK_SECRET) {
        console.error('CRITICAL: RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook');
        return res.status(500).json({ error: 'Webhook secret not configured' });
    }
    {
        const signature = req.headers['x-razorpay-signature'];

        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
            .update(rawBody)
            .digest('hex');

        const sigBuf = Buffer.from(signature || '', 'utf8');
        const expBuf = Buffer.from(expectedSignature, 'utf8');
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            console.error('CRITICAL: Webhook signature verification failed');
            console.log('Raw body preview (50 chars):', rawBody.toString('utf8').substring(0, 50));
            return res.status(401).json({ error: 'Invalid signature' });
        }
        console.log('✅ Signature verified successfully');
    }

    // 3. Parse JSON body for logic
    let event;
    try {
        event = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
        console.error('Error parsing JSON body:', err);
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    console.log('Razorpay webhook received:', event.event);

    try {
        // Handle payment.captured event (successful payment)
        if (event.event === 'payment.captured') {
            const payment = event.payload.payment.entity;
            const paymentId = payment.id;
            const currency = payment.currency;
            const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'PYG', 'UGX'];
            const amount = zeroDecimalCurrencies.includes(currency) ? payment.amount : payment.amount / 100;
            const customerEmail = payment.email;
            const customerName = payment.notes?.customer_name || 'Customer';
            const customerPhone = payment.notes?.customer_phone || '';
            const customerCountry = payment.notes?.customer_country || payment.notes?.country || 'Unknown';
            const inrAmount = payment.notes?.inr_amount ? parseFloat(payment.notes.inr_amount) : amount;
            let productName = payment.notes?.product_name;
            let productType = payment.notes?.type; // 'product' or 'session'

            // Razorpay does NOT copy order notes to payment notes.
            // Fallback: fetch the order to get the original notes.
            if (!productType && payment.order_id && RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
                try {
                    const orderResp = await fetch(
                        `https://api.razorpay.com/v1/orders/${payment.order_id}`,
                        {
                            headers: {
                                'Authorization': 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')
                            }
                        }
                    );
                    if (orderResp.ok) {
                        const order = await orderResp.json();
                        const orderNotes = order.notes || {};
                        console.log('Fetched order notes as fallback:', orderNotes);
                        // Use order notes as the source of truth
                        productType = orderNotes.type || productType;
                        if (!productName) productName = orderNotes.product_name;
                        // Merge: prefer payment.notes, fall back to order.notes
                        payment.notes = { ...orderNotes, ...payment.notes };
                    } else {
                        console.warn('Could not fetch order for notes fallback:', orderResp.status);
                    }
                } catch (err) {
                    console.error('Error fetching order for notes fallback:', err.message);
                }
            }

            // Default to 'product' if still no type detected
            productType = productType || 'product';

            console.log('Payment captured:', { paymentId, amount, inrAmount, customerEmail, customerCountry, productName, productType });

            if (productType === 'product' && productName) {
                // Handle product purchase
                await handleProductPurchase({
                    paymentId,
                    amount,
                    inrAmount,
                    currency,
                    customerEmail,
                    customerName,
                    customerPhone,
                    customerCountry,
                    productName,
                    downloadLink: payment.notes?.download_link || '',
                    SUPABASE_URL,
                    SUPABASE_KEY,
                    BREVO_API_KEY,
                    ADMIN_EMAIL,
                    SENDER_EMAIL,
                    SENDER_NAME
                });
            } else if (productType === 'session') {
                // Handle session booking (Server-side fulfillment for reliability)
                await handleSessionBooking({
                    paymentId,
                    amount,
                    currency,
                    customerEmail,
                    notes: payment.notes,
                    SUPABASE_URL,
                    SUPABASE_KEY,
                    BREVO_API_KEY,
                    ADMIN_EMAIL,
                    SENDER_EMAIL,
                    SENDER_NAME
                });
            }

            return res.status(200).json({ status: 'success', paymentId });
        }

        // Handle other events
        return res.status(200).json({ status: 'acknowledged', event: event.event });

    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive API Helpers for Secure Sharing
// ─────────────────────────────────────────────────────────────────────────────

// Helper function to extract File/Folder ID from Google Drive URL
function extractDriveFileId(url) {
    if (!url) return null;
    let match = url.match(/[?&]id=([^&]+)/);
    if (match) return match[1];
    match = url.match(/\/file\/d\/([^/]+)/);
    if (match) return match[1];
    match = url.match(/\/drive\/folders\/([^/?]+)/);
    if (match) return match[1];
    match = url.match(/\/open\?id=([^&]+)/);
    if (match) return match[1];
    return null;
}

// Helper function to authenticate service account and grant reader permission
async function grantDrivePermission(clientEmail, privateKey, fileId, customerEmail) {
    if (!clientEmail || !privateKey) {
        console.warn('Google Drive credentials missing in environment; skipping permission grant');
        return null;
    }

    // 1. Get access token via JWT authentication flow
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claimSet = {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const base64Encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const tokenInput = `${base64Encode(header)}.${base64Encode(claimSet)}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.write(tokenInput);
    signer.end();

    // Format newlines if private key is stored as single line string in env
    const formattedKey = privateKey.replace(/\\n/g, '\n');
    const signature = signer.sign(formattedKey, 'base64url');

    const jwt = `${tokenInput}.${signature}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Google Drive API auth token creation failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.access_token;

    // 2. Add editor permission via Google Drive API
    const permissionResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?sendNotificationEmail=false`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            role: 'writer',
            type: 'user',
            emailAddress: customerEmail
        })
    });

    if (!permissionResponse.ok) {
        const errorText = await permissionResponse.text();
        throw new Error(`Google Drive share permissions failed: ${errorText}`);
    }

    return await permissionResponse.json();
}

// Handle product purchase - send email and log to Supabase
export async function handleProductPurchase(data) {
    const {
        paymentId, amount, inrAmount, currency, customerEmail, customerName, customerPhone, customerCountry, productName,
        downloadLink: checkoutDownloadLink,
        SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME
    } = data;

    console.log(`Processing product purchase: ${productName} for ${customerEmail}`);

    const PRODUCT_DOWNLOAD_LINKS = {
        'Quant Interview Problem Book (1000+ Problems with solutions)': 'https://drive.google.com/uc?export=download&id=1sp48XJi8VZt5ufw4o6pHgg_EwBA0nkVJ',
        'Quant Interview Problem Book (1000+)': 'https://drive.google.com/uc?export=download&id=1sp48XJi8VZt5ufw4o6pHgg_EwBA0nkVJ',
        'Quant Models for Each Asset Class Master Pack: IR, FX, Credits, Equity': 'https://drive.google.com/uc?export=download&id=1CvriZOEfqiGkSRiKwR33kC3ny1T2oQSs',
        'Quant Models for Each Asset Class Master Pack : IR, FX, CREDITS , EQUITY': 'https://drive.google.com/uc?export=download&id=1CvriZOEfqiGkSRiKwR33kC3ny1T2oQSs',
        'Derivatives Products & Pricing Master Pack (6 PDFs): IR, FX, Equity, Credit, Inflation & Commodities': 'https://drive.google.com/uc?export=download&id=1kf_Qln0AFRi_Z1zvzaRHMojmZ152tY0j',
        'Ultimate Industry Grade Quant Project Pack (45 Projects)': 'https://drive.google.com/uc?export=download&id=1jktrsnX880xtd3RVBw0nwC18beSc-toz',
        'Complete Front Office & Risk Quant Professional Bundle (40+ PDFs & 60+ scripts)': 'https://drive.google.com/uc?export=download&id=1XrgmUHRy-QjCt5IOTWg1e0WTM_4_Kaid',
        'Complete Front Office & Risk Quant Professional Bundle (40+ high quality PDFs & 55 scripts)': 'https://drive.google.com/uc?export=download&id=1XrgmUHRy-QjCt5IOTWg1e0WTM_4_Kaid',
        'Python for Quants: Complete Interview Guide': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'Python for Quants': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'C++ for Quants: Desk-Ready Notes': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'C++ for Quants': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'XVA Derivatives Primer': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'Quant Projects Bundle': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'Interview Bible': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing',
        'Complete Quant Bundle': 'https://drive.google.com/file/d/13DP6sF_II4LE9cwBRc6QZzeg9ngellmf/view?usp=sharing'
    };

    let downloadLink = checkoutDownloadLink || '';
    let frontendAlreadyProcessed = false;

    try {
        const existingResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/purchases?payment_id=eq.${paymentId}&select=id,source,download_link`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        if (existingResponse.ok) {
            const existing = await existingResponse.json();
            if (existing && existing.length > 0) {
                const sources = existing.map((entry) => entry.source);
                if (sources.includes('webhook')) {
                    console.log('Payment already fully processed by webhook:', paymentId);
                    return;
                }
                if (sources.includes('frontend_legacy') || sources.includes('frontend')) {
                    console.log('Payment logged by frontend, but ensuring webhook email delivery:', paymentId);
                    frontendAlreadyProcessed = true;
                }
                if (!downloadLink) {
                    const loggedLink = existing.map((entry) => entry.download_link).find(Boolean);
                    if (loggedLink) {
                        downloadLink = loggedLink;
                        console.log('Reusing download link from purchase log');
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error checking existing purchase:', err);
    }

    if (!downloadLink) {
        try {
            const productResponse = await fetch(
                `${SUPABASE_URL}/rest/v1/products?select=name,file_url`,
                {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                }
            );

            if (productResponse.ok) {
                const products = await productResponse.json();
                const normalizedProductName = normalizeProductName(productName);
                const matchedProduct = Array.isArray(products)
                    ? products.find((product) => normalizeProductName(product.name) === normalizedProductName && product.file_url)
                    : null;

                if (matchedProduct) {
                    downloadLink = matchedProduct.file_url;
                    console.log('Found product link in Supabase:', matchedProduct.name);
                }
            }
        } catch (err) {
            console.warn('Error fetching product from Supabase, falling back to static link map:', err);
        }
    }

    if (!downloadLink) {
        const normalizedProductName = normalizeProductName(productName);
        const fallbackEntry = Object.entries(PRODUCT_DOWNLOAD_LINKS)
            .find(([name]) => normalizeProductName(name) === normalizedProductName);
        if (fallbackEntry) {
            downloadLink = fallbackEntry[1];
            console.log('Using fallback product link for webhook fulfillment');
        }
    }

    if (!downloadLink) {
        console.error('No download link found for product:', productName);
        downloadLink = '#';
    }

    // Google Drive Secure Sharing Flow
    let hasSharedSecurely = false;
    let fallbackToManualInfo = false;
    const driveFileId = extractDriveFileId(downloadLink);

    if (driveFileId) {
        const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

        if (GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
            console.log(`Google Drive Secure Flow: Sharing ID ${driveFileId} with ${customerEmail}...`);
            try {
                await grantDrivePermission(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, driveFileId, customerEmail);
                console.log(`✅ Successfully shared Drive ID ${driveFileId} with ${customerEmail}`);
                hasSharedSecurely = true;
            } catch (err) {
                console.error(`❌ Failed to share Google Drive item: ${err.message}`);
                fallbackToManualInfo = true;
            }

            // Secure viewer URL instead of direct download link
            const isFolder = downloadLink.includes('/folders/') || downloadLink.includes('/drive/folders/');
            downloadLink = isFolder
                ? `https://drive.google.com/drive/folders/${driveFileId}?usp=drivesdk`
                : `https://drive.google.com/file/d/${driveFileId}/view?usp=drivesdk`;
        } else {
            console.warn('GCP Google Drive credentials not configured in environment variables. Sharing bypassed.');
        }
    }

    if (!frontendAlreadyProcessed) {
        try {
            const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/purchases`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    customer_email: customerEmail,
                    product_name: productName,
                    amount: Math.round(amount),
                    currency: currency || 'INR',
                    payment_id: paymentId,
                    source: 'webhook',
                    customer_country: customerCountry,
                    inr_amount: inrAmount,
                    download_link: downloadLink
                })
            });
            if (insertResp.ok) {
                console.log('✅ Purchase logged to Supabase by webhook. PaymentId:', paymentId);
            } else {
                const errBody = await insertResp.text();
                console.error('❌ SUPABASE INSERT FAILED. Status:', insertResp.status, '| Body:', errBody, '| PaymentId:', paymentId);
            }
        } catch (err) {
            console.error('❌ Error logging to Supabase (network):', err.message, '| PaymentId:', paymentId);
        }
    }

    if (BREVO_API_KEY && customerEmail) {
        const customerHtml = `
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
                        
                        ${hasSharedSecurely ? `
                        <div style="background: #e0f2fe; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7; margin-bottom: 25px; font-size: 13px; color: #0369a1; line-height: 1.5;">
                            <strong>🔒 Secured Resource:</strong> We have shared this resource with your email address <strong>${customerEmail}</strong>. Please ensure you are logged into Google Drive with this email address to view it.
                        </div>
                        ` : ''}
                        
                        ${fallbackToManualInfo ? `
                        <div style="background: #fffbeb; padding: 15px; border-radius: 6px; border-left: 4px solid #d97706; margin-bottom: 25px; font-size: 13px; color: #b45309; line-height: 1.5;">
                            <strong>⚠️ Custom Share Access:</strong> We attempted to automatically share this secure Google Drive resource with <strong>${customerEmail}</strong>. If your email is not associated with a Google Account, or if you cannot access the link, please reply to this email with your Google/Gmail address, and we will grant access manually!
                        </div>
                        ` : ''}

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Digital Product</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${productName}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold;">Amount</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right;">${currency} ${amount}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <center>
                            <a href="${downloadLink}" style="display: inline-block; background: #e95836; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-size: 16px; margin-bottom: 30px;">Download / View Resource</a>
                        </center>
 
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Direct Link Backup</p>
                            <p style="font-size: 14px; margin: 0 0 8px 0; color: #1a1a1a;">If the button does not open in your email app, copy and paste this link into your browser:</p>
                            <p style="font-size: 13px; margin: 0; word-break: break-all;">
                                <a href="${downloadLink}" style="color: #2563eb; text-decoration: underline;">${downloadLink}</a>
                            </p>
                        </div>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Purchase Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Name</td><td style="padding: 5px 0; color: #1a1a1a;">${customerName}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Email</td><td style="padding: 5px 0; color: #1a1a1a;"><a href="mailto:${customerEmail}" style="color: #2563eb; text-decoration: none;">${customerEmail}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Phone</td><td style="padding: 5px 0; color: #1a1a1a;">${customerPhone || 'N/A'}</td></tr>
                            </table>
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

        try {
            const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: [{ email: customerEmail, name: customerName }],
                    subject: `Your Purchase: ${productName}`,
                    htmlContent: customerHtml,
                    textContent: `Hi ${customerName},\n\nThank you for your purchase!\n\nProduct: ${productName}\nAmount: ${currency} ${amount}\n\nPlease download your resource using this link:\n${downloadLink}\n\nIf the button does not work, copy and paste the same link into your browser.\n\nPayment ID: ${paymentId}\n\nHave an issue? Reply to this email.\n\nSent by Desk2Quant`
                })
            });

            if (emailResponse.ok) {
                console.log(`Customer purchase email sent to ${customerEmail}`);
            } else {
                const errorData = await emailResponse.text();
                console.error(`Brevo Error (Product Email): ${emailResponse.status} - ${errorData}`);
            }
        } catch (err) {
            console.error('Error sending customer email:', err);
        }
    }

    if (BREVO_API_KEY) {
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
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold;">Amount Received</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; color: #16a34a;">${currency} ${amount}</td>
                                </tr>
                            </table>
                        </div>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Customer Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Name</td><td style="padding: 5px 0; color: #1a1a1a;">${customerName}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Email</td><td style="padding: 5px 0; color: #1a1a1a;"><a href="mailto:${customerEmail}" style="color: #2563eb; text-decoration: none;">${customerEmail}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Phone</td><td style="padding: 5px 0; color: #1a1a1a;">${customerPhone || 'Not provided'}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Download Link</td><td style="padding: 5px 0; color: #1a1a1a; word-break: break-all;">${downloadLink}</td></tr>
                                <tr><td style="padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px; color: #666;">Payment ID</td><td style="padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px; color: #1a1a1a;">${paymentId} (Webhook)</td></tr>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        try {
            const adminEmailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: ADMIN_EMAIL.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
                    subject: `New Sale: ${productName}`,
                    htmlContent: adminHtml,
                    textContent: `New Sale Received!\n\n${customerName} just purchased a digital product.\n\nProduct Sold: ${productName}\nAmount Received: ${currency} ${amount}\nDownload Link: ${downloadLink}\n\nCustomer Details:\nName: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone || 'Not provided'}\nPayment ID: ${paymentId} (Webhook)`
                })
            });

            if (adminEmailResponse.ok) {
                console.log('Admin notification sent via webhook');
            } else {
                const errorData = await adminEmailResponse.text();
                console.error(`Brevo Error (Admin Product): ${adminEmailResponse.status} - ${errorData}`);
            }
        } catch (err) {
            console.error('Error sending admin notification:', err);
        }
    }

    // 📧 Send personalised recommendation email after purchase
    // Skip if the customer bought the Complete Bundle (nothing more to upsell)
    const isBundle = productName.toLowerCase().includes('complete') && productName.toLowerCase().includes('bundle');
    if (!isBundle && BREVO_API_KEY && customerEmail) {
        sendPostPurchaseRecommendations({
            customerEmail, customerName, purchasedProductName: productName,
            trigger: 'product_purchase',
            SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME
        }).catch(err => console.error('Post-purchase recs failed:', err));
    } else if (isBundle) {
        console.log('⏭️ Skipping recommendation for bundle purchase');
    }
}

// Handle session booking - send email and log to Supabase
async function handleSessionBooking(data) {
    const {
        paymentId, amount, currency, customerEmail, notes,
        SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, ADMIN_EMAIL, SENDER_EMAIL, SENDER_NAME
    } = data;

    const customerName = notes.customer_name || 'Customer';
    const sessionName = notes.session_name || 'Consultation Session';
    const sessionDate = notes.session_date || 'TBD';
    const sessionTime = notes.session_time || 'TBD';
    const sessionDuration = notes.session_duration || '60';
    const sessionPrice = notes.session_price || amount;
    const customerPhone = notes.customer_phone || '';
    const customerMessage = notes.customer_message || '';
    const meetLink = "https://meet.google.com/hfp-npyq-qho";

    let displayTime = sessionTime;
    if (displayTime !== 'TBD' && !displayTime.toLowerCase().match(/am|pm/)) {
        const parts = displayTime.split(':');
        if (parts.length >= 2) {
            let hour = parseInt(parts[0], 10);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            hour = hour % 12 || 12;
            displayTime = `${hour}:${parts[1]} ${ampm}`;
        }
    }

    console.log('Processing session booking via webhook:', { paymentId, customerEmail, sessionName });

    // 1. Check if already processed (prevent duplicate bookings)
    try {
        const existingResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/bookings?payment_id=eq.${paymentId}&select=id`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        if (existingResponse.ok) {
            const existing = await existingResponse.json();
            if (existing && existing.length > 0) {
                console.log('Booking already processed:', paymentId);
                return; // Already processed
            }
        }
    } catch (err) {
        console.error('Error checking existing booking:', err);
    }

    // 2. Log to Supabase bookings table
    try {
        const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                email: customerEmail,
                name: customerName,
                phone: customerPhone,
                service_name: sessionName,
                service_price: Math.round(sessionPrice),
                service_duration: parseInt(sessionDuration),
                booking_date: sessionDate,
                booking_time: sessionTime,
                message: customerMessage,
                status: 'upcoming',
                payment_id: paymentId,
                meet_link: meetLink,
                source: 'webhook', // Mark for debugging
                customer_country: notes.customer_country || notes.country || 'Unknown'
            })
        });

        if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            console.error('Supabase booking insert failed:', errorText);
        } else {
            console.log('✅ Booking logged to Supabase');
        }
    } catch (err) {
        console.error('Error logging booking to Supabase:', err);
    }

    // 3. Send confirmation email to customer via Brevo
    if (BREVO_API_KEY && customerEmail) {
        const customerHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-right: 10px;">New Booking</span>
                            <span style="display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">Confirmed</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;">Hi <strong>${customerName}</strong>, your session is confirmed.</p>
                        
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Details</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${sessionName}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Date</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${sessionDate}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${displayTime} (${sessionDuration} mins)</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px;">Amount Paid</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px;">${currency === 'INR' ? '₹' : (currency || '$')}${sessionPrice}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <center>
                            <a href="${meetLink}" style="display: inline-block; background: #e95836; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-size: 16px; margin-bottom: 30px;">Join Meeting</a>
                        </center>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Need to Reschedule?</p>
                            <p style="font-size: 14px; margin: 0; color: #1a1a1a;">You can view and manage your bookings on our website.</p>
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

        try {
            const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: [{ email: customerEmail, name: customerName }],
                    subject: `Booking Confirmed: ${sessionName}`,
                    htmlContent: customerHtml,
                    textContent: `Hi ${customerName},\n\nYour session is confirmed!\n\nSession: ${sessionName}\nDate: ${sessionDate}\nTime: ${displayTime} (${sessionDuration} mins)\nAmount Paid: ₹${sessionPrice}\n\nJoin Meeting Link:\n${meetLink}\n\nPayment ID: ${paymentId}\n\nNeed to reschedule? You can view and manage your bookings on our website.\n\nHave an issue? Reply to this email.\n\nSent by Desk2Quant`
                })
            });

            if (emailResponse.ok) {
                console.log(`✅ Customer booking email sent to ${customerEmail}`);
            } else {
                const errorData = await emailResponse.text();
                console.error(`❌ Brevo Error (Booking Email): ${emailResponse.status} - ${errorData}`);
            }
        } catch (err) {
            console.error('Error sending customer booking email:', err);
        }
    }

    // 4. Send admin notification email
    if (BREVO_API_KEY) {
        const adminHtml = `
            <div style="font-family: Arial, sans-serif; background-color: #f9f8f4; padding: 40px 20px; color: #1a1a1a;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="background-color: #1a1a1a; padding: 20px; text-align: center;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: bold; letter-spacing: 1px;">Desk2Quant Admin</span>
                    </div>
                    <div style="padding: 30px;">
                        <div style="margin-bottom: 20px;">
                            <span style="display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase;">New Booking Received</span>
                        </div>
                        <p style="font-size: 16px; margin-bottom: 25px;"><strong>${customerName}</strong> just booked a new session.</p>
                        
                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 10px 0; letter-spacing: 0.5px;">Session Booked</p>
                            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; border-bottom: 1px solid #e5e5e5; padding-bottom: 15px;">${sessionName}</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Date & Time</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; padding: 5px 0;">${sessionDate} at ${displayTime}</td>
                                </tr>
                                <tr>
                                    <td style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; padding: 5px 0;">Amount Received</td>
                                    <td style="font-size: 14px; font-weight: bold; text-align: right; color: #16a34a; padding: 5px 0;">${currency === 'INR' ? '₹' : (currency || '$')}${sessionPrice}</td>
                                </tr>
                                <tr>
                                    <td colspan="2" style="padding: 15px 0 5px 0;">
                                        <a href="${meetLink}" style="color: #e95836; font-weight: bold; text-decoration: none; font-size: 14px;">🔗 Join Meeting</a>
                                    </td>
                                </tr>
                            </table>
                        </div>

                        <div style="background: #f9f8f4; padding: 20px; border-radius: 6px;">
                            <p style="font-size: 11px; color: #666; text-transform: uppercase; font-weight: bold; margin: 0 0 15px 0; letter-spacing: 0.5px;">Customer Details</p>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr><td style="padding: 5px 0; color: #666; width: 30%;">Name</td><td style="padding: 5px 0; color: #1a1a1a;">${customerName}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Email</td><td style="padding: 5px 0; color: #1a1a1a;"><a href="mailto:${customerEmail}" style="color: #2563eb; text-decoration: none;">${customerEmail}</a></td></tr>
                                <tr><td style="padding: 5px 0; color: #666;">Phone</td><td style="padding: 5px 0; color: #1a1a1a;">${customerPhone || 'Not provided'}</td></tr>
                                <tr><td style="padding: 5px 0; color: #666; vertical-align: top;">Message</td><td style="padding: 5px 0; color: #1a1a1a;">${customerMessage || 'None'}</td></tr>
                                <tr><td style="padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px; color: #666;">Payment ID</td><td style="padding: 5px 0; border-top: 1px solid #e5e5e5; margin-top: 5px; color: #1a1a1a;">${paymentId}</td></tr>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        try {
            const adminEmailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                    to: ADMIN_EMAIL.split(',').map(email => ({ email: email.trim() })).filter(item => item.email),
                    subject: `🆕 New Booking: ${customerName} - ${sessionName}`,
                    htmlContent: adminHtml,
                    textContent: `New Booking Received!\n\n${customerName} just booked a new session.\n\nSession Booked: ${sessionName}\nDate & Time: ${sessionDate} at ${displayTime}\nAmount Received: ₹${sessionPrice}\nLink: ${meetLink}\n\nCustomer Details:\nName: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone || 'Not provided'}\nMessage: ${customerMessage || 'None'}\nPayment ID: ${paymentId}`
                })
            });

            if (adminEmailResponse.ok) {
                console.log('✅ Admin booking notification sent');
            } else {
                const errorData = await adminEmailResponse.text();
                console.error(`❌ Brevo Error (Admin Booking): ${adminEmailResponse.status} - ${errorData}`);
            }
        } catch (err) {
            console.error('Error sending admin booking notification:', err);
        }
    }

    // 📧 Send personalised recommendation email after session booking
    if (BREVO_API_KEY && customerEmail) {
        sendPostPurchaseRecommendations({
            customerEmail, customerName, purchasedProductName: sessionName,
            trigger: 'session_booking',
            SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME
        }).catch(err => console.error('Post-session recs failed:', err));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// sendPostPurchaseRecommendations
// Generates a personalised FIRSTNAME20 coupon (20% off) and emails 3-4
// relevant products the customer hasn't purchased yet.
// ─────────────────────────────────────────────────────────────────────────────
async function sendPostPurchaseRecommendations({
    customerEmail, customerName, purchasedProductName, trigger,
    SUPABASE_URL, SUPABASE_KEY, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME
}) {
    // Build personalised coupon: first name (letters only) uppercased + '20'
    const firstName = (customerName || 'Customer').split(' ')[0].replace(/[^a-zA-Z]/g, '').toUpperCase();
    const couponCode = `${firstName}20`;
    const discountPct = 20;

    console.log(`📧 Sending post-${trigger} recommendations to ${customerEmail} with coupon ${couponCode}`);

    // Fetch all paid products
    let allProducts = [];
    try {
        const productsResp = await fetch(
            `${SUPABASE_URL}/rest/v1/products?select=id,name,description,price,cover_image_url&price=gt.0&order=price.desc`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        if (productsResp.ok) allProducts = await productsResp.json();
    } catch (err) { console.error('Failed to fetch products for recs:', err); }

    // Exclude complete bundle and the product just purchased
    const normPurchased = (purchasedProductName || '').toLowerCase().trim();
    const recommendable = allProducts.filter(p => {
        const n = (p.name || '').toLowerCase();
        const isCompleteBundle = n.includes('complete') && n.includes('bundle');
        const isJustBought = n === normPurchased;
        return !isCompleteBundle && !isJustBought;
    });

    if (recommendable.length === 0) {
        console.log('⏭️ No products to recommend');
        return;
    }

    // Pick up to 4: prioritise complete bundles/packs, then price desc
    const packs = recommendable.filter(p => (p.name || '').toLowerCase().includes('pack') || (p.name || '').toLowerCase().includes('bundle'));
    const singles = recommendable.filter(p => !packs.includes(p));
    const picks = [...packs, ...singles].slice(0, 4);

    // Build premium product cards
    const productCards = picks.map(p => {
        const desc = (p.description || '').replace(/<[^>]*>/g, '').substring(0, 110);
        const originalPrice = p.price;
        const discountedPrice = Math.round(originalPrice * (1 - discountPct / 100));
        const coverImg = p.cover_image_url
            ? `<img src="${p.cover_image_url}" alt="${p.name}" style="width:100%; height:140px; object-fit:contain; border-radius:4px; margin-bottom:12px; background:#f8fafc;">`
            : '';
        return `
            <div style="background:#ffffff; border-radius:12px; overflow:hidden; margin-bottom:20px; box-shadow:0 2px 10px rgba(0,0,0,0.06); border:1px solid #eef2f6;">
                <div style="background:#f8fafc; padding:12px; text-align:center;">${coverImg}</div>
                <div style="padding:18px;">
                    <h3 style="margin:0 0 6px 0; font-size:15px; color:#0f172a; font-weight:700; line-height:1.4;">${p.name}</h3>
                    <p style="margin:0 0 12px 0; font-size:12px; color:#64748b; line-height:1.5;">${desc}...</p>
                    <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:14px;">
                        <span style="font-size:13px; color:#94a3b8; text-decoration:line-through;">₹${originalPrice}</span>
                        <span style="font-size:20px; font-weight:800; color:#4f46e5;">₹${discountedPrice}</span>
                        <span style="font-size:11px; color:#10b981; font-weight:700; margin-left:auto;">Save ${discountPct}%</span>
                    </div>
                    <a href="https://desk2quant.vercel.app/product.html?id=${p.id}" style="display:block; text-align:center; background:#4f46e5; color:#ffffff; font-weight:700; text-decoration:none; padding:10px 16px; border-radius:8px; font-size:13px;">View &amp; Buy →</a>
                </div>
            </div>`;
    }).join('');

    const triggerText = trigger === 'session_booking'
        ? 'completing a mentorship session with us'
        : `purchasing <strong>${purchasedProductName}</strong>`;

    const htmlContent = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#f1f5f9; padding:0; margin:0;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9; padding:32px 10px;">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 8px 24px -4px rgba(0,0,0,0.1);">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); padding:32px; text-align:center;">
        <h1 style="color:#ffffff; font-size:26px; font-weight:800; margin:0 0 4px 0;">Desk2Quant</h1>
        <p style="color:#94a3b8; font-size:13px; text-transform:uppercase; letter-spacing:1.5px; margin:0;">Exclusively For You</p>
      </td></tr>
      <!-- Intro -->
      <tr><td style="padding:32px 28px 16px 28px;">
        <p style="font-size:16px; color:#334155; margin:0 0 10px 0;">Hi <strong>${customerName}</strong>,</p>
        <p style="font-size:14px; color:#475569; line-height:1.7; margin:0 0 14px 0;">
          Thank you for ${triggerText}! To help you go even further, here are resources handpicked to complement your journey — with an exclusive discount just for you.
        </p>
      </td></tr>
      <!-- Coupon box -->
      <tr><td style="padding:0 28px 24px 28px;">
        <div style="background:linear-gradient(135deg,#e0f2fe,#bae6fd); border:2px dashed #0284c7; border-radius:12px; padding:18px; text-align:center;">
          <span style="font-size:12px; color:#0369a1; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Your Exclusive ${discountPct}% Coupon — Better Than The Default!</span>
          <div style="font-size:26px; font-weight:900; color:#0369a1; letter-spacing:4px; margin:8px 0;">${couponCode}</div>
          <span style="font-size:11px; color:#0284c7;">Apply at checkout on any product below</span>
        </div>
      </td></tr>
      <!-- Products -->
      <tr><td style="padding:0 28px 16px 28px; background:#f8fafc;">
        <h2 style="font-size:16px; color:#0f172a; font-weight:700; margin:20px 0 14px 0;">Recommended For You:</h2>
        ${productCards}
      </td></tr>
      <!-- CTA -->
      <tr><td style="padding:20px 28px; text-align:center;">
        <a href="https://desk2quant.vercel.app/#products" style="display:inline-block; background:#e95836; color:#ffffff; font-weight:700; text-decoration:none; padding:14px 28px; border-radius:8px; font-size:15px;">Browse All Resources</a>
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#0f172a; padding:20px; text-align:center; color:#94a3b8; font-size:11px;">
        <p style="margin:0 0 4px 0;">Desk2Quant &copy; 2026. All rights reserved.</p>
        <p style="margin:0;"><a href="https://desk2quant.vercel.app" style="color:#38bdf8; text-decoration:none;">desk2quant.vercel.app</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    const recNames = picks.map(p => `• ${p.name} — ₹${Math.round(p.price * 0.8)} (${discountPct}% off with ${couponCode})`).join('\n');
    const textContent = `Hi ${customerName},\n\nThank you for ${trigger === 'session_booking' ? 'booking your mentorship session' : `purchasing "${purchasedProductName}"`}!\n\nHere are some resources handpicked for you — use code ${couponCode} for ${discountPct}% OFF at checkout:\n\n${recNames}\n\nBrowse all: https://desk2quant.vercel.app/#products\n\nSent by Desk2Quant`;

    // Schedule 1 hour after purchase so confirmation email lands first
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
            sender: { name: SENDER_NAME, email: SENDER_EMAIL },
            to: [{ email: customerEmail, name: customerName }],
            subject: `${customerName}, here's an exclusive 20% off on our top quant resources 🎯`,
            htmlContent,
            textContent,
            scheduledAt
        })
    });

    if (resp.ok) {
        console.log(`✅ Recommendation email scheduled at ${scheduledAt} for ${customerEmail} [coupon: ${couponCode}]`);
    } else {
        const errData = await resp.text();
        console.error('❌ Failed to schedule recommendation email:', errData);
    }
}
