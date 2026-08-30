import { getServiceKey } from '../lib/supabaseAdmin.js';

const RECIPIENT = 'aryan.manjunatha17@gmail.com';
const CUSTOMER_NAME = 'Aryan';
const PRODUCT_NAME = 'Quant Researcher Interview Playbook: Time Series, Signals & Statistical Research';
const PRODUCT_URL = 'https://desk2quant.com/product.html?id=ff04eb72-ff48-4917-b56c-0694fa4f4ee6';
const COUPON = 'RESEARCH10';
const IDEMPOTENCY_PAYMENT_ID = 'recovery_aryan_20260830';
const DELIVERY_TYPE = 'payment_recovery';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
  const SUPABASE_KEY = getServiceKey();
  if (!BREVO_API_KEY || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Email service is not configured' });
  }

  const dbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  // One-time, fixed-recipient endpoint. The composite primary key makes the send
  // idempotent even if this URL is requested more than once.
  const existingResp = await fetch(
    `${SUPABASE_URL}/rest/v1/webhook_email_deliveries?payment_id=eq.${encodeURIComponent(IDEMPOTENCY_PAYMENT_ID)}&delivery_type=eq.${encodeURIComponent(DELIVERY_TYPE)}&select=status,message_id,attempt_count&limit=1`,
    { headers: dbHeaders }
  );
  if (existingResp.ok) {
    const existing = await existingResp.json();
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(200).json({ status: existing[0].status, messageId: existing[0].message_id || null, duplicateSuppressed: true });
    }
  }

  const claimResp = await fetch(`${SUPABASE_URL}/rest/v1/webhook_email_deliveries`, {
    method: 'POST',
    headers: { ...dbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      payment_id: IDEMPOTENCY_PAYMENT_ID,
      delivery_type: DELIVERY_TYPE,
      status: 'sending',
      attempt_count: 1
    })
  });
  if (!claimResp.ok) {
    if (claimResp.status === 409) return res.status(200).json({ status: 'already_claimed', duplicateSuppressed: true });
    return res.status(500).json({ error: `Could not claim recovery email (${claimResp.status})` });
  }

  const subject = 'Your Desk2Quant payment didn’t complete — retry anytime';
  const textContent = `Hi ${CUSTOMER_NAME},\n\nWe noticed that your payment attempt for “${PRODUCT_NAME}” did not complete successfully.\n\nYou can retry your purchase here:\n${PRODUCT_URL}\n\nYour ${COUPON} coupon is still valid, so you can retry with the same 10% discount.\n\nIf the payment fails again or you face any issue accessing the notes after payment, simply reply to this email and we’ll help.\n\nRegards,\nDesk2Quant\nhello@desk2quant.com`;
  const htmlContent = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f7f7f3;margin:0;padding:24px;color:#090909"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #090909;box-shadow:6px 6px 0 #090909;padding:28px"><h2 style="margin-top:0">Hi ${CUSTOMER_NAME},</h2><p>We noticed that your payment attempt for <strong>${PRODUCT_NAME}</strong> did not complete successfully.</p><p>You can retry the purchase whenever convenient:</p><p><a href="${PRODUCT_URL}" style="display:inline-block;background:#ffca3a;color:#090909;text-decoration:none;font-weight:800;border:1px solid #090909;box-shadow:3px 3px 0 #090909;padding:12px 18px">Retry your purchase</a></p><p>Your <strong>${COUPON}</strong> coupon is still valid, so you can retry with the same <strong>10% discount</strong>.</p><p>If the payment fails again or you face any issue accessing the notes after payment, simply reply to this email and we’ll help.</p><p style="margin-bottom:0">Regards,<br><strong>Desk2Quant</strong><br>hello@desk2quant.com</p></div></body></html>`;

  try {
    const brevoResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Desk2Quant', email: 'hello@desk2quant.com' },
        replyTo: { name: 'Desk2Quant', email: 'hello@desk2quant.com' },
        to: [{ email: RECIPIENT, name: CUSTOMER_NAME }],
        subject,
        htmlContent,
        textContent
      })
    });

    if (!brevoResp.ok) {
      const detail = (await brevoResp.text()).slice(0, 500);
      await fetch(`${SUPABASE_URL}/rest/v1/webhook_email_deliveries?payment_id=eq.${encodeURIComponent(IDEMPOTENCY_PAYMENT_ID)}&delivery_type=eq.${encodeURIComponent(DELIVERY_TYPE)}`, {
        method: 'PATCH',
        headers: { ...dbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed', last_error: `Brevo ${brevoResp.status}: ${detail}` })
      });
      return res.status(502).json({ error: `Brevo send failed (${brevoResp.status})` });
    }

    const brevoData = await brevoResp.json();
    const messageId = brevoData?.messageId || null;
    await fetch(`${SUPABASE_URL}/rest/v1/webhook_email_deliveries?payment_id=eq.${encodeURIComponent(IDEMPOTENCY_PAYMENT_ID)}&delivery_type=eq.${encodeURIComponent(DELIVERY_TYPE)}`, {
      method: 'PATCH',
      headers: { ...dbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'sent', message_id: messageId, sent_at: new Date().toISOString(), last_error: null })
    });

    return res.status(200).json({ status: 'sent', messageId, recipient: RECIPIENT });
  } catch (error) {
    await fetch(`${SUPABASE_URL}/rest/v1/webhook_email_deliveries?payment_id=eq.${encodeURIComponent(IDEMPOTENCY_PAYMENT_ID)}&delivery_type=eq.${encodeURIComponent(DELIVERY_TYPE)}`, {
      method: 'PATCH',
      headers: { ...dbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'failed', last_error: String(error?.message || error).slice(0, 500) })
    });
    return res.status(500).json({ error: 'Recovery email send threw an exception' });
  }
}
