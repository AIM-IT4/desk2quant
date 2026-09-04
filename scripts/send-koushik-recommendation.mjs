import fs from 'node:fs';
import { emailShell, escapeHtml } from '../lib/emailBranding.js';

const dotenv = fs.readFileSync('.env.local', 'utf8');
const env = {};
dotenv.split('\n').forEach(l => {
    const i = l.indexOf('=');
    if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
});

const BREVO_API_KEY = env.BREVO_API_KEY;
const SUPABASE_URL = env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!BREVO_API_KEY) {
    console.error('❌ Missing BREVO_API_KEY');
    process.exit(1);
}

const customerEmail = 'ghoshkiu@gmail.com';
const customerName = 'Koushik';
const purchasedProduct = 'Fixed Income Math & Bond Pricing';
const couponCode = 'KOUSHIK20';
const discountPercent = 20;

const sender = {
    name: 'Amit Kumar Jha | Desk2Quant',
    email: 'hello@desk2quant.com'
};
const replyTo = {
    name: 'Amit Kumar Jha',
    email: 'jha.8@alumni.iitj.ac.in'
};

const subject = `Koushik, your next steps after Fixed Income Math (+ exclusive 20% code)`;

// Neobrutalist body using Desk2Quant standard design tokens
const emailBody = `
    <h1 style="font-size:22px; line-height:1.3; color:#090909; margin:0 0 16px; font-weight:800;">
        Hi ${escapeHtml(customerName)},
    </h1>

    <p style="font-size:15px; line-height:1.7; color:#333330; margin:0 0 14px;">
        Thank you for picking up the <strong>Fixed Income Math notes</strong> via Topmate!
    </p>

    <p style="font-size:15px; line-height:1.7; color:#333330; margin:0 0 20px;">
        Mastering yield curve bootstrapping, duration/convexity, and multi-curve OIS discounting gives you the bedrock foundation. But on trading desks and in senior quant interviews, interviewers immediately push past the static curve:
    </p>

    <!-- Neobrutalist Callout Box -->
    <div style="background:#f7f7f3; border:1px solid #090909; box-shadow:4px 4px 0 #090909; padding:16px 20px; margin:0 0 24px;">
        <p style="margin:0; font-size:14px; line-height:1.6; color:#090909;">
            <strong style="color:#090909; text-transform:uppercase; font-size:11px; letter-spacing:1px; display:block; margin-bottom:4px;">Desk Reality</strong>
            Once you know how to build the discount curve, the next questions are: <em>"How do you price swaptions when rates are negative?", "Where does SABR break down near zero?",</em> and <em>"What is the CVA charge on this 10Y swap?"</em>
        </p>
    </div>

    <!-- Neobrutalist VIP Coupon Box -->
    <div style="background:#ffca3a; border:1px solid #090909; box-shadow:5px 5px 0 #090909; padding:20px; text-align:center; margin-bottom:28px;">
        <span style="font-size:12px; font-weight:800; color:#090909; text-transform:uppercase; letter-spacing:1.2px;">Your Exclusive VIP Code (20% OFF)</span>
        <div style="font-size:28px; font-weight:900; color:#090909; letter-spacing:2px; margin:8px 0; font-family:Consolas,'Courier New',monospace;">${escapeHtml(couponCode)}</div>
        <p style="font-size:13px; color:#4a4a42; margin:0; font-weight:600;">Valid across all Desk2Quant resources. Enter code at checkout.</p>
    </div>

    <h2 style="font-size:17px; font-weight:800; color:#090909; margin:0 0 16px; text-transform:uppercase; letter-spacing:0.5px;">
        Recommended Next Steps for You:
    </h2>

    <!-- Card 1: Interest Rate Models -->
    <div style="background:#ffffff; border:1px solid #090909; box-shadow:4px 4px 0 #090909; margin-bottom:20px; overflow:hidden;">
        <div style="background:#f7f7f3; border-bottom:1px solid #090909; padding:8px 16px;">
            <span style="font-size:11px; font-weight:800; color:#0b7f79; text-transform:uppercase; letter-spacing:0.8px;">Direct Continuation</span>
        </div>
        <div style="padding:18px;">
            <h3 style="font-size:16px; font-weight:800; color:#090909; margin:0 0 8px;">1. Interest Rate Models: Quant Interview Playbook</h3>
            <p style="font-size:13px; line-height:1.6; color:#555550; margin:0 0 14px;">
                Takes you from static bond pricing into dynamic term-structure models: Hull-White 1F/2F, Vasicek, CIR, Black-76 on swaptions, SABR calibration on swaption vol cubes, and HJM drift restrictions.
            </p>
            <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                    <td style="vertical-align:middle;">
                        <span style="font-size:13px; color:#888882; text-decoration:line-through;">₹499</span>
                        <span style="font-size:19px; font-weight:900; color:#0b7f79; margin-left:6px;">₹399</span>
                    </td>
                    <td align="right">
                        <a href="https://desk2quant.com/products/interest-rate-models-quant-interview-playbook.html" style="display:inline-block; background:#ffca3a; color:#090909; font-size:13px; font-weight:800; padding:9px 18px; text-decoration:none; border:1px solid #090909; box-shadow:3px 3px 0 #090909;">View &amp; Buy →</a>
                    </td>
                </tr>
            </table>
        </div>
    </div>

    <!-- Card 2: Common Mistakes in Quant Interviews -->
    <div style="background:#ffffff; border:1px solid #090909; box-shadow:4px 4px 0 #090909; margin-bottom:20px; overflow:hidden;">
        <div style="background:#f7f7f3; border-bottom:1px solid #090909; padding:8px 16px;">
            <span style="font-size:11px; font-weight:800; color:#0b7f79; text-transform:uppercase; letter-spacing:0.8px;">Interview Diagnostic Manual</span>
        </div>
        <div style="padding:18px;">
            <h3 style="font-size:16px; font-weight:800; color:#090909; margin:0 0 8px;">2. Common Mistakes in Quant Interviews (Desk Fixes Edition)</h3>
            <p style="font-size:13px; line-height:1.6; color:#555550; margin:0 0 14px;">
                106 pages across 29 modules detailing the exact textbook answers that fail interviews. Features dedicated chapters on Multi-Curve OIS errors, SABR beta-fixing pitfalls, Hagan formula breakdown, and discrete hedging slippage.
            </p>
            <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                    <td style="vertical-align:middle;">
                        <span style="font-size:13px; color:#888882; text-decoration:line-through;">₹799</span>
                        <span style="font-size:19px; font-weight:900; color:#0b7f79; margin-left:6px;">₹639</span>
                    </td>
                    <td align="right">
                        <a href="https://desk2quant.com/products/common-mistakes-in-quant-interviews-desk-fixes-edition.html" style="display:inline-block; background:#ffca3a; color:#090909; font-size:13px; font-weight:800; padding:9px 18px; text-decoration:none; border:1px solid #090909; box-shadow:3px 3px 0 #090909;">View &amp; Buy →</a>
                    </td>
                </tr>
            </table>
        </div>
    </div>

    <!-- Card 3: XVA Calculus Lab -->
    <div style="background:#ffffff; border:1px solid #090909; box-shadow:4px 4px 0 #090909; margin-bottom:24px; overflow:hidden;">
        <div style="background:#f7f7f3; border-bottom:1px solid #090909; padding:8px 16px;">
            <span style="font-size:11px; font-weight:800; color:#0b7f79; text-transform:uppercase; letter-spacing:0.8px;">Bank Front-Office Essential</span>
        </div>
        <div style="padding:18px;">
            <h3 style="font-size:16px; font-weight:800; color:#090909; margin:0 0 8px;">3. XVA Calculus Lab: Master Counterparty Credit Risk</h3>
            <p style="font-size:13px; line-height:1.6; color:#555550; margin:0 0 14px;">
                Fixed income swaps dominate modern bank XVA balance sheets. Covers CVA, DVA, FVA, MVA, KVA, ColVA, and Wrong-Way Risk under ISDA collateral agreements and multi-curve discounting.
            </p>
            <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                    <td style="vertical-align:middle;">
                        <span style="font-size:13px; color:#888882; text-decoration:line-through;">₹699</span>
                        <span style="font-size:19px; font-weight:900; color:#0b7f79; margin-left:6px;">₹559</span>
                    </td>
                    <td align="right">
                        <a href="https://desk2quant.com/products/xva-calculus-lab.html" style="display:inline-block; background:#ffca3a; color:#090909; font-size:13px; font-weight:800; padding:9px 18px; text-decoration:none; border:1px solid #090909; box-shadow:3px 3px 0 #090909;">View &amp; Buy →</a>
                    </td>
                </tr>
            </table>
        </div>
    </div>

    <!-- Browse All Button -->
    <div style="text-align:center; margin:24px 0 20px;">
        <a href="https://desk2quant.com/products/" style="display:inline-block; background:#ffffff; color:#090909; font-size:14px; font-weight:800; padding:12px 24px; text-decoration:none; border:1px solid #090909; box-shadow:4px 4px 0 #090909;">Browse All 40 Resources on Desk2Quant →</a>
    </div>

    <!-- Signoff -->
    <p style="font-size:14px; line-height:1.6; color:#555550; margin:0 0 6px;">
        If you have any questions while working through the Fixed Income notes, just hit reply to this email.
    </p>
    <p style="font-size:14px; line-height:1.6; color:#090909; font-weight:800; margin:0;">
        Best regards,<br>
        Amit Kumar Jha<br>
        <span style="font-size:12px; color:#666761; font-weight:600;">Desk2Quant · IIT Jodhpur Alumni</span>
    </p>
`;

const htmlContent = emailShell({ body: emailBody, admin: false });

const textContent = `Hi ${customerName},

Thank you for picking up the Fixed Income Math notes via Topmate!

Once you understand yield curve bootstrapping, duration/convexity, and multi-curve OIS discounting, the natural next step on trading desks is dynamic term-structure modeling and interview-level diagnostics.

As a thank you, here is your exclusive 20% discount coupon code:
CODE: ${couponCode}
(Applies across all Desk2Quant resources at checkout)

Here are the 3 most relevant next steps for your roadmap:

1. Interest Rate Models: Quant Interview Playbook
- Covers Hull-White 1F/2F, Vasicek, CIR, Black-76 on swaptions, and SABR calibration on swaption vol cubes.
- Regular: ₹499 | With ${couponCode}: ₹399
- Direct Link: https://desk2quant.com/products/interest-rate-models-quant-interview-playbook.html

2. Common Mistakes in Quant Interviews (Desk Fixes Edition)
- 106 pages / 29 chapters detailing where candidates fail. Features dedicated chapters on Multi-Curve OIS errors, SABR beta-fixing, Hagan breakdown, and discrete hedging slippage.
- Regular: ₹799 | With ${couponCode}: ₹639
- Direct Link: https://desk2quant.com/products/common-mistakes-in-quant-interviews-desk-fixes-edition.html

3. XVA Calculus Lab: Master Counterparty Credit Risk
- Covers CVA, DVA, FVA, MVA, KVA, ColVA, and Wrong-Way Risk under ISDA collateral agreements.
- Regular: ₹699 | With ${couponCode}: ₹559
- Direct Link: https://desk2quant.com/products/xva-calculus-lab.html

Browse all 40 resources:
https://desk2quant.com/products/

Feel free to reply to this email if you have any questions as you study!

Best regards,
Amit Kumar Jha
Desk2Quant · IIT Jodhpur Alumni
https://desk2quant.com`;

export { htmlContent, textContent, subject, sender, replyTo };
