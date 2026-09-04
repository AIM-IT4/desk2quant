import fs from 'node:fs';

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

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Recommended Next Steps for Koushik</title>
</head>
<body style="margin:0;padding:0;background-color:#0B0F17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#E2E8F0;">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0B0F17;padding:30px 15px;">
  <tr>
    <td align="center">
      
      <!-- Container -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#111827;border:1px solid #1E293B;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <tr>
          <td style="padding:28px 32px;background:linear-gradient(135deg, #0B0F17 0%, #1E293B 100%);border-bottom:1px solid #1E293B;text-align:left;">
            <div style="font-size:20px;font-weight:800;letter-spacing:1px;color:#00E599;text-transform:uppercase;">Desk2Quant</div>
            <div style="font-size:12px;color:#94A3B8;margin-top:4px;letter-spacing:0.5px;">Practitioner-Grade Quantitative Finance</div>
          </td>
        </tr>

        <!-- Main Body -->
        <tr>
          <td style="padding:32px;">
            
            <h1 style="font-size:22px;line-height:1.4;color:#FFFFFF;margin:0 0 16px;font-weight:700;">
              Hi ${customerName},
            </h1>

            <p style="font-size:15px;line-height:1.7;color:#CBD5E1;margin:0 0 16px;">
              Thank you for picking up the <strong>Fixed Income Math notes</strong> via Topmate!
            </p>

            <p style="font-size:15px;line-height:1.7;color:#CBD5E1;margin:0 0 24px;">
              Mastering yield curve bootstrapping, duration/convexity, and multi-curve OIS discounting gives you the bedrock foundation. But on trading desks and in senior quant interviews, interviewers immediately push past the static curve:
            </p>

            <!-- Key Insight Callout Box -->
            <div style="background-color:#0B0F17;border-left:4px solid #00E599;border-radius:6px;padding:16px 20px;margin:0 0 28px;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:#94A3B8;">
                <strong style="color:#00E599;">Desk Reality:</strong> Once you know how to build the discount curve, the next questions are: <em>"How do you price swaptions when rates are negative?", "Where does SABR break down near zero?",</em> and <em>"What is the CVA charge on this 10Y swap?"</em>
              </p>
            </div>

            <!-- VIP Discount Banner -->
            <div style="background:linear-gradient(135deg, rgba(0,229,153,0.1) 0%, rgba(0,180,216,0.1) 100%);border:1px dashed #00E599;border-radius:10px;padding:20px;text-align:center;margin-bottom:32px;">
              <span style="font-size:12px;font-weight:700;color:#00E599;text-transform:uppercase;letter-spacing:1px;">Your VIP Customer Code (20% OFF)</span>
              <div style="font-size:28px;font-weight:900;color:#FFFFFF;letter-spacing:3px;margin:8px 0;font-family:monospace;">${couponCode}</div>
              <p style="font-size:13px;color:#94A3B8;margin:0;">Valid on any Desk2Quant resource. Enter at checkout.</p>
            </div>

            <h2 style="font-size:17px;font-weight:700;color:#FFFFFF;margin:0 0 18px;text-transform:uppercase;letter-spacing:0.5px;">
              Recommended Next Steps for You:
            </h2>

            <!-- Card 1: Interest Rate Models -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1E293B;border:1px solid #334155;border-radius:8px;margin-bottom:20px;overflow:hidden;">
              <tr>
                <td style="padding:20px;">
                  <div style="font-size:11px;font-weight:700;color:#00E599;text-transform:uppercase;margin-bottom:6px;">Direct Continuation</div>
                  <h3 style="font-size:16px;font-weight:700;color:#FFFFFF;margin:0 0 8px;">1. Interest Rate Models: Quant Interview Playbook</h3>
                  <p style="font-size:13px;line-height:1.6;color:#94A3B8;margin:0 0 14px;">
                    Takes you from static bond pricing into dynamic term-structure models: Hull-White 1F/2F, Vasicek, CIR, Black-76 on swaptions, SABR calibration on swaption vol cubes, and HJM drift restrictions.
                  </p>
                  <table width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <span style="font-size:13px;color:#64748B;text-decoration:line-through;">₹499</span>
                        <span style="font-size:18px;font-weight:800;color:#00E599;margin-left:6px;">₹399</span>
                      </td>
                      <td align="right">
                        <a href="https://desk2quant.com/products/interest-rate-models-quant-interview-playbook.html" style="display:inline-block;background-color:#00E599;color:#0B0F17;font-size:13px;font-weight:700;padding:8px 16px;text-decoration:none;border-radius:6px;">View & Buy →</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Card 2: Common Mistakes in Quant Interviews -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1E293B;border:1px solid #334155;border-radius:8px;margin-bottom:20px;overflow:hidden;">
              <tr>
                <td style="padding:20px;">
                  <div style="font-size:11px;font-weight:700;color:#00B4D8;text-transform:uppercase;margin-bottom:6px;">Interview Diagnostic Manual</div>
                  <h3 style="font-size:16px;font-weight:700;color:#FFFFFF;margin:0 0 8px;">2. Common Mistakes in Quant Interviews (Desk Fixes Edition)</h3>
                  <p style="font-size:13px;line-height:1.6;color:#94A3B8;margin:0 0 14px;">
                    106 pages across 29 modules detailing the exact textbook answers that fail interviews. Features dedicated chapters on Multi-Curve OIS errors, SABR beta-fixing pitfalls, Hagan formula breakdown, and discrete hedging slippage.
                  </p>
                  <table width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <span style="font-size:13px;color:#64748B;text-decoration:line-through;">₹799</span>
                        <span style="font-size:18px;font-weight:800;color:#00E599;margin-left:6px;">₹639</span>
                      </td>
                      <td align="right">
                        <a href="https://desk2quant.com/products/common-mistakes-in-quant-interviews-desk-fixes-edition.html" style="display:inline-block;background-color:#00E599;color:#0B0F17;font-size:13px;font-weight:700;padding:8px 16px;text-decoration:none;border-radius:6px;">View & Buy →</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Card 3: XVA Calculus Lab -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1E293B;border:1px solid #334155;border-radius:8px;margin-bottom:28px;overflow:hidden;">
              <tr>
                <td style="padding:20px;">
                  <div style="font-size:11px;font-weight:700;color:#F59E0B;text-transform:uppercase;margin-bottom:6px;">Bank Front-Office Essential</div>
                  <h3 style="font-size:16px;font-weight:700;color:#FFFFFF;margin:0 0 8px;">3. XVA Calculus Lab: Master Counterparty Credit Risk</h3>
                  <p style="font-size:13px;line-height:1.6;color:#94A3B8;margin:0 0 14px;">
                    Fixed income swaps dominate modern bank XVA balance sheets. Covers CVA, DVA, FVA, MVA, KVA, ColVA, and Wrong-Way Risk under ISDA collateral agreements and multi-curve discounting.
                  </p>
                  <table width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <span style="font-size:13px;color:#64748B;text-decoration:line-through;">₹699</span>
                        <span style="font-size:18px;font-weight:800;color:#00E599;margin-left:6px;">₹559</span>
                      </td>
                      <td align="right">
                        <a href="https://desk2quant.com/products/xva-calculus-lab.html" style="display:inline-block;background-color:#00E599;color:#0B0F17;font-size:13px;font-weight:700;padding:8px 16px;text-decoration:none;border-radius:6px;">View & Buy →</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Browse All Button -->
            <div style="text-align:center;margin-bottom:28px;">
              <a href="https://desk2quant.com/products/" style="display:inline-block;background-color:transparent;color:#CBD5E1;font-size:14px;font-weight:600;padding:12px 24px;text-decoration:none;border:1px solid #334155;border-radius:6px;">Browse All 40 Resources on Desk2Quant →</a>
            </div>

            <!-- Signoff -->
            <p style="font-size:14px;line-height:1.6;color:#94A3B8;margin:0 0 6px;">
              If you have any questions while working through the Fixed Income notes, just hit reply to this email.
            </p>
            <p style="font-size:14px;line-height:1.6;color:#FFFFFF;font-weight:600;margin:0;">
              Best regards,<br>
              Amit Kumar Jha<br>
              <span style="font-size:12px;color:#94A3B8;font-weight:400;">Desk2Quant · IIT Jodhpur Alumni</span>
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background-color:#0B0F17;border-top:1px solid #1E293B;text-align:center;font-size:11px;color:#64748B;line-height:1.6;">
            You received this recommendation because you recently purchased Fixed Income Math notes from Topmate.<br>
            Desk2Quant · <a href="https://desk2quant.com" style="color:#00E599;text-decoration:none;">desk2quant.com</a>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;

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

async function sendEmail() {
    console.log(`Sending personalized recommendation email to ${customerEmail}...`);

    const brevoResp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender,
            replyTo,
            to: [{ email: customerEmail, name: customerName }],
            subject,
            htmlContent,
            textContent
        })
    });

    if (!brevoResp.ok) {
        const errText = await brevoResp.text();
        throw new Error(`Brevo API send failed (${brevoResp.status}): ${errText}`);
    }

    const brevoData = await brevoResp.json();
    console.log('✅ Email successfully sent via Brevo!');
    console.log('Brevo Message ID:', brevoData.messageId);

    // Update Supabase row 351 with the Brevo message ID
    const patchResp = await fetch(`${SUPABASE_URL}/rest/v1/recommendation_emails?id=eq.351`, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            brevo_message_id: brevoData.messageId,
            status: 'sent',
            sent: true,
            sent_at: new Date().toISOString()
        })
    });

    if (patchResp.ok) {
        console.log('✅ Supabase row 351 updated with messageId and sent_at timestamp.');
    } else {
        console.warn('⚠️ Could not update Supabase row 351:', await patchResp.text());
    }

    return brevoData;
}

sendEmail().catch(err => {
    console.error('❌ Error sending email:', err.message);
    process.exit(1);
});
