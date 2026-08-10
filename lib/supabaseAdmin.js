// Server-side Supabase credentials, single source of truth.
//
// WHY THIS FILE EXISTS: every API route used to resolve its own key with
//
//     process.env.SUPABASE_KEY || '<anon key hardcoded inline>'
//
// which meant a route silently ran as `anon` whenever the env var was unset.
// That was survivable only because RLS was off and `anon` could read and write
// everything. Once RLS is enabled and `anon` is revoked, the same fallback
// turns into a hard outage: the webhook cannot record a purchase, and
// grant-access cannot resolve products.file_url, so a paying customer gets
// nothing.
//
// This module fails CLOSED and LOUD instead. A missing service-role key is a
// deployment error, and it should surface as a 5xx that shows up in logs --
// never as a silent downgrade to a role that is now denied by policy.
//
// SECURITY: the service-role key bypasses RLS by design. It must only ever be
// read here, in server-side code. Never expose it to the browser, never inline
// it as a literal, and never send it in a response body.

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';

/**
 * The service-role key. Accepts SUPABASE_SERVICE_ROLE_KEY (the name Supabase
 * itself uses, and what .env.example documents) and falls back to the legacy
 * SUPABASE_KEY that the existing deployment already sets, so this works before
 * and after the env var is renamed.
 *
 * Returns null when unset -- callers decide whether that is fatal.
 */
export function getServiceKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || null;
}

/**
 * Headers for a privileged REST call. Throws when no service key is
 * configured, so the failure is a clear 5xx in logs rather than a confusing
 * "permission denied for table X" from PostgREST.
 */
export function serviceHeaders(extra = {}) {
    const key = getServiceKey();
    if (!key) {
        throw new Error(
            'SUPABASE_SERVICE_ROLE_KEY is not configured. Server-side Supabase ' +
            'access requires the service-role key; the anon key is denied by RLS.'
        );
    }
    return {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...extra,
    };
}

/**
 * True when the running deployment can talk to Supabase with privileges.
 * Use this to branch on configuration without triggering a throw.
 */
export function hasServiceKey() {
    return Boolean(getServiceKey());
}

/**
 * Guard for the top of a request handler. Logs once and returns a 503 when the
 * key is missing, matching the fail-closed pattern in lib/cronAuth.js.
 * Returns true when the caller should stop handling the request.
 */
export function blockIfUnconfigured(res, context = 'this endpoint') {
    if (hasServiceKey()) return false;
    console.error(
        `SECURITY/CONFIG: SUPABASE_SERVICE_ROLE_KEY is not set — ${context} cannot ` +
        'reach Supabase. Set it in the deployment environment.'
    );
    res.status(503).json({
        error: 'Server is not fully configured. Please contact support.',
    });
    return true;
}
