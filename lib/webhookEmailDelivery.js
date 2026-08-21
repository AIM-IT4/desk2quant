// Idempotent Brevo delivery for Razorpay webhook emails.
//
// Razorpay webhooks are at-least-once: retries and overlapping deliveries are
// normal. The database claim makes only one invocation send each logical
// email, while Brevo's idempotencyKey protects the narrow crash window between
// Brevo accepting a message and Supabase recording it as sent.

const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_LEASE_SECONDS = 90;

function serviceHeaders(serviceKey, extra = {}) {
    return {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        ...extra
    };
}

async function readResponseBody(response) {
    const raw = await response.text();
    if (!raw) return { raw: '', parsed: null };
    try {
        return { raw, parsed: JSON.parse(raw) };
    } catch (_) {
        return { raw, parsed: null };
    }
}

function isDuplicateParameter(body) {
    const code = body.parsed && typeof body.parsed.code === 'string'
        ? body.parsed.code
        : '';
    return code.toLowerCase() === 'duplicate_parameter'
        || body.raw.toLowerCase().includes('duplicate_parameter');
}

function isPermanentBrevoFailure(status) {
    return status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
}

async function callSupabaseRpc({ SUPABASE_URL, SUPABASE_KEY, functionName, body }) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: serviceHeaders(SUPABASE_KEY, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
    });
    const responseBody = await readResponseBody(response);
    if (!response.ok) {
        throw new Error(
            `Supabase RPC ${functionName} failed (${response.status}): ` +
            (responseBody.raw || 'empty response')
        );
    }
    return responseBody.parsed;
}

async function claimDelivery({
    paymentId,
    deliveryType,
    SUPABASE_URL,
    SUPABASE_KEY,
    leaseSeconds = DEFAULT_LEASE_SECONDS
}) {
    const result = await callSupabaseRpc({
        SUPABASE_URL,
        SUPABASE_KEY,
        functionName: 'claim_webhook_email_delivery',
        body: {
            p_payment_id: paymentId,
            p_delivery_type: deliveryType,
            p_lease_seconds: leaseSeconds
        }
    });
    const row = Array.isArray(result) ? result[0] : result;
    if (!row || !row.idempotency_key) {
        throw new Error(`Email delivery claim returned no idempotency key for ${paymentId}/${deliveryType}`);
    }
    return {
        shouldSend: row.should_send === true,
        idempotencyKey: row.idempotency_key,
        status: row.delivery_status || 'unknown'
    };
}

async function completeDelivery({
    paymentId,
    deliveryType,
    idempotencyKey,
    status,
    messageId = null,
    error = null,
    SUPABASE_URL,
    SUPABASE_KEY
}) {
    const completed = await callSupabaseRpc({
        SUPABASE_URL,
        SUPABASE_KEY,
        functionName: 'complete_webhook_email_delivery',
        body: {
            p_payment_id: paymentId,
            p_delivery_type: deliveryType,
            p_idempotency_key: idempotencyKey,
            p_status: status,
            p_message_id: messageId,
            p_error: error
        }
    });
    if (completed !== true) {
        throw new Error(`Email delivery completion did not update ${paymentId}/${deliveryType}`);
    }
}

/**
 * Sends one logical webhook email at most once per payment and delivery type.
 * Transient failures are thrown so Razorpay retries the webhook; permanent
 * Brevo 4xx failures are recorded and returned without retrying forever.
 */
export async function sendWebhookEmailOnce({
    paymentId,
    deliveryType,
    emailPayload,
    BREVO_API_KEY,
    SUPABASE_URL,
    SUPABASE_KEY,
    leaseSeconds = DEFAULT_LEASE_SECONDS
}) {
    if (!paymentId || !deliveryType) {
        throw new Error('paymentId and deliveryType are required for idempotent email delivery');
    }
    if (!BREVO_API_KEY) {
        return { sent: false, skipped: true, reason: 'brevo_not_configured' };
    }

    const claim = await claimDelivery({
        paymentId,
        deliveryType,
        SUPABASE_URL,
        SUPABASE_KEY,
        leaseSeconds
    });

    if (!claim.shouldSend) {
        return { sent: claim.status === 'sent', skipped: true, reason: claim.status };
    }

    let response;
    let responseBody;
    try {
        response = await fetch(BREVO_EMAIL_URL, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                ...emailPayload,
                headers: {
                    ...(emailPayload.headers || {}),
                    idempotencyKey: claim.idempotencyKey
                }
            })
        });
        responseBody = await readResponseBody(response);
    } catch (error) {
        await completeDelivery({
            paymentId,
            deliveryType,
            idempotencyKey: claim.idempotencyKey,
            status: 'failed',
            error: `Network error: ${error.message}`,
            SUPABASE_URL,
            SUPABASE_KEY
        });
        throw error;
    }

    if (response.ok || isDuplicateParameter(responseBody)) {
        const messageId = responseBody.parsed && (
            responseBody.parsed.messageId ||
            (Array.isArray(responseBody.parsed.messageIds) ? responseBody.parsed.messageIds.join(',') : null)
        );
        await completeDelivery({
            paymentId,
            deliveryType,
            idempotencyKey: claim.idempotencyKey,
            status: 'sent',
            messageId,
            SUPABASE_URL,
            SUPABASE_KEY
        });
        return {
            sent: true,
            skipped: false,
            providerDuplicate: !response.ok,
            messageId: messageId || null
        };
    }

    const permanentFailure = isPermanentBrevoFailure(response.status);
    const detail = `Brevo ${response.status}: ${responseBody.raw || 'empty response'}`;
    await completeDelivery({
        paymentId,
        deliveryType,
        idempotencyKey: claim.idempotencyKey,
        status: permanentFailure ? 'permanent_failure' : 'failed',
        error: detail,
        SUPABASE_URL,
        SUPABASE_KEY
    });

    if (permanentFailure) {
        return { sent: false, skipped: false, permanentFailure: true, error: detail };
    }
    throw new Error(detail);
}

export { isDuplicateParameter, isPermanentBrevoFailure };
