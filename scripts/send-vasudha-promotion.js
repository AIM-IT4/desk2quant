const fs = require('fs');
const path = require('path');

// Simple parse for BREVO_API_KEY in .env file
let brevoApiKey = '';
try {
    const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const match = envContent.match(/BREVO_API_KEY\s*=\s*(.*)/);
    if (match) {
        brevoApiKey = match[1].trim();
    }
} catch (err) {
    console.error('Error reading .env file:', err);
}

if (!brevoApiKey) {
    console.error('Error: BREVO_API_KEY not found in .env');
    process.exit(1);
}

const customerEmail = 'vasudhasriperambuduru@gmail.com';
const customerName = 'Vasudha Sriperambuduru';
const couponCode = 'VASUDHA30';

// Recommended products details
const recommendations = [
    {
        name: "Quant Models for Each Asset Class Master Pack : IR, FX, CREDITS , EQUITY",
        price: 1999,
        discountedPrice: 1399,
        id: "75f6118b-c10e-43c6-acc6-ec48cd6a6cbc",
        coverImage: "https://dntabmyurlrlnoajdnja.supabase.co/storage/v1/object/public/product-covers/quant_models_for_each_asset_class_master_pack___ir__fx__credits___equity__cover_1770558243661.jpg",
        description: "Comprehensive pricing models & implementations across major asset classes."
    },
    {
        name: "Derivatives Products & Pricing Master Pack (6 PDFs): IR, FX, Equity, Credit, Inflation & Commodities",
        price: 1999,
        discountedPrice: 1399,
        id: "bdb3c59e-c8c0-430f-8705-b7467514458e",
        coverImage: "https://dntabmyurlrlnoajdnja.supabase.co/storage/v1/object/public/product-covers/derivatives_products___pricing_master_pack__6_pdfs___ir__fx__equity__credit__inflation___commodities_cover_1770437873121.jpg",
        description: "The complete manual for derivative instruments theory and quantitative pricing methods."
    },
    {
        name: "Ultimate Industry Grade Quant Project Pack (45 Projects)",
        price: 799,
        discountedPrice: 559,
        id: "bd2e57b7-32c4-44ad-8a2a-d156222b7ff7",
        coverImage: "https://dntabmyurlrlnoajdnja.supabase.co/storage/v1/object/public/product-covers/ultimate_industry_grade_quant_project_pack__45_projects__cover_1770367062769.jpg",
        description: "Hands-on projects with codebase templates, covering pricing, backtesting, and validation."
    },
    {
        name: "Quant Interview Problem Book (1000+ Problems with solutions)",
        price: 899,
        discountedPrice: 629,
        id: "73806d69-768b-497e-87b7-d94fa4cfd772",
        coverImage: "https://dntabmyurlrlnoajdnja.supabase.co/storage/v1/object/public/product-covers/quant_interview_problem_book__1000__problems_with_solutions__cover_1771227232432.jpg",
        description: "Over a thousand targeted questions & solutions covering brainteasers, calculus, and finance."
    }
];

const productCardsHtml = recommendations.map(rec => {
    return `
        <div style="background:#ffffff; border-radius:12px; overflow:hidden; margin-bottom:24px; box-shadow:0 4px 15px rgba(0,0,0,0.05); border:1px solid #eef2f6; transition: transform 0.2s ease;">
            <div style="background:#f8fafc; padding:15px; text-align:center;">
                <img src="${rec.coverImage}" alt="${rec.name}" style="max-height:150px; max-width:100%; object-fit:contain; border-radius:4px;">
            </div>
            <div style="padding:20px;">
                <h3 style="margin:0 0 8px 0; font-size:16px; color:#0f172a; font-weight:700; line-height:1.4;">${rec.name}</h3>
                <p style="margin:0 0 16px 0; font-size:13px; color:#64748b; line-height:1.5;">${rec.description}</p>
                <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:16px;">
                    <span style="font-size:14px; color:#94a3b8; text-decoration:line-through;">₹${rec.price}</span>
                    <span style="font-size:22px; font-weight:800; color:#4f46e5;">₹${rec.discountedPrice}</span>
                    <span style="font-size:12px; color:#10b981; font-weight:600; margin-left:auto;">Save 30%</span>
                </div>
                <a href="https://desk2quant.vercel.app/product.html?id=${rec.id}" style="display:block; text-align:center; background:#4f46e5; color:#ffffff; font-weight:700; text-decoration:none; padding:12px 20px; border-radius:8px; font-size:14px;">Apply Code & View →</a>
            </div>
        </div>
    `;
}).join('');

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Personalized Quant Resources Recommendations</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background-color:#f1f5f9; padding:0; margin:0; -webkit-font-smoothing:antialiased;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f1f5f9; padding:40px 10px;">
        <tr>
            <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); padding:40px 30px; text-align:center;">
                            <h1 style="color:#ffffff; font-size:28px; font-weight:800; margin:0 0 6px 0; letter-spacing:-0.5px;">QuantMentor</h1>
                            <p style="color:#94a3b8; font-size:14px; text-transform:uppercase; letter-spacing:1.5px; margin:0;">Personalized Recommendations</p>
                        </td>
                    </tr>
                    
                    <!-- Intro -->
                    <tr>
                        <td style="padding:40px 30px 20px 30px;">
                            <p style="font-size:16px; color:#334155; margin:0 0 12px 0;">Hi <strong>${customerName}</strong>,</p>
                            <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 0 16px 0;">
                                Hope you had a great session recently! To help you take your quant preparations even further, I have compiled a list of handpicked resources that align perfectly with the topics we covered. 
                            </p>
                            <p style="font-size:15px; color:#475569; line-height:1.6; margin:0;">
                                I've also created a custom **30% coupon code** exclusively for you, which you can apply at checkout on any of the resources below:
                            </p>
                        </td>
                    </tr>

                    <!-- Coupon Code Box -->
                    <tr>
                        <td style="padding:0 30px 30px 30px;">
                            <div style="background:linear-gradient(135deg,#e0f2fe 0%,#bae6fd 100%); border:2px dashed #0284c7; border-radius:12px; padding:20px; text-align:center;">
                                <span style="font-size:13px; color:#0369a1; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Your Exclusive 30% Coupon Code</span>
                                <div style="font-size:28px; font-weight:900; color:#0369a1; letter-spacing:3px; margin:8px 0;">${couponCode}</div>
                                <span style="font-size:12px; color:#0284c7;">Copy and paste this code in the checkout window.</span>
                            </div>
                        </td>
                    </tr>

                    <!-- Recommendations List -->
                    <tr>
                        <td style="padding:0 30px 20px 30px; background-color:#f8fafc;">
                            <h2 style="font-size:18px; color:#0f172a; font-weight:700; margin:24px 0 16px 0;">Recommended Resources For You:</h2>
                            ${productCardsHtml}
                        </td>
                    </tr>

                    <!-- Closing -->
                    <tr>
                        <td style="padding:30px; text-align:center; border-top:1px solid #e2e8f0;">
                            <p style="font-size:14px; color:#64748b; line-height:1.5; margin:0 0 16px 0;">
                                If you have any questions about any of these resources or need help with your studies, feel free to reply directly to this email.
                            </p>
                            <p style="font-size:14px; color:#4f46e5; font-weight:750; margin:0;">
                                Best regards,<br>Amit Kumar Jha
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color:#0f172a; padding:24px; text-align:center; color:#94a3b8; font-size:12px;">
                            <p style="margin:0 0 8px 0;">Desk2Quant &copy; 2026. All rights reserved.</p>
                            <p style="margin:0;"><a href="https://desk2quant.vercel.app" style="color:#38bdf8; text-decoration:none;">desk2quant.vercel.app</a></p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`.trim();

const textContent = `
QuantMentor Personalised Recommendations

Hi ${customerName},

Hope you had a great session recently! To help you take your quant preparations even further, I have compiled a list of handpicked resources that align perfectly with the topics we covered.

I've also created a custom 30% coupon code exclusively for you, which you can apply at checkout on any of the resources below:

🎟️ YOUR EXCLUSIVE COUPON: ${couponCode} (30% OFF)

Recommended Resources:

1. Quant Models for Each Asset Class
   - Original Price: ₹1999 -> Your Price: ₹1399
   - View: https://desk2quant.vercel.app/product.html?id=75f6118b-c10e-43c6-acc6-ec48cd6a6cbc

2. Derivatives Products & Pricing
   - Original Price: ₹1999 -> Your Price: ₹1399
   - View: https://desk2quant.vercel.app/product.html?id=bdb3c59e-c8c0-430f-8705-b7467514458e

3. Ultimate Industry Grade Quant Projects
   - Original Price: ₹799 -> Your Price: ₹559
   - View: https://desk2quant.vercel.app/product.html?id=bd2e57b7-32c4-44ad-8a2a-d156222b7ff7

4. Quant Interview Problem Book
   - Original Price: ₹899 -> Your Price: ₹629
   - View: https://desk2quant.vercel.app/product.html?id=73806d69-768b-497e-87b7-d94fa4cfd772

Reply to this email if you have any questions!

Best regards,
Amit Kumar Jha
`.trim();

async function sendEmail() {
    console.log(`Sending personalized recommendation email to ${customerEmail}...`);
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': brevoApiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { email: 'desk2quant@gmail.com', name: 'QuantMentor' },
                to: [{ email: customerEmail, name: customerName }],
                subject: `📚 Handpicked Quant Resources + Special 30% Discount Code for You`,
                htmlContent: htmlContent,
                textContent: textContent
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Success! Message ID:', data.messageId);
        } else {
            const error = await response.text();
            console.error('❌ Brevo API Error:', error);
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Network error sending email:', error);
        process.exit(1);
    }
}

sendEmail();
