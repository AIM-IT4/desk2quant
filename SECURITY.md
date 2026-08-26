# Security Guide: Keys, Permissions and Current State

This document reflects the **current** state of the repository and the live
production database (verified 26 Aug 2026). It supersedes older versions of
this file that described an "exposed service-role key" — that key is not, and
has not been, in this repository.

## What is actually in the repository

Every hardcoded Supabase JWT in the repo (33 occurrences across `script.js`,
`product.html`, `salary-explorer.html`, `desk-simulator.mjs`, `admin.html` and
several `scripts/*`) decodes to `role: anon`. The anon key is **public by
design** — it is the publishable client key for Supabase, the same way a Stripe
publishable key is. It is not a secret, but it must only ever work against
tables RLS deliberately exposes to anonymous visitors.

There is **no service-role key anywhere in the repository or in git history of
the current tree**. The service key:

- is read server-side only, from Vercel environment variables
  (`SUPABASE_SERVICE_ROLE_KEY`, fallback `SUPABASE_KEY`), see `lib/supabaseAdmin.js`
- is handed to the admin panel **in memory only**, after password auth, via
  `POST /api/admin-auth` with `action: 'get-key'` — it is never persisted to
  localStorage and never appears in a static file

## Live production permission state (verified with the public anon key)

Production has been hardened **by hand** beyond what the repo documents
(see DATABASE_GUIDE.md). Current reality:

| Table | anon access | Notes |
|---|---|---|
| `purchases` | **none** (401) | reads and writes fully denied |
| `bookings` | **none** (401) | reads and writes fully denied |
| `products` | column-level | readable except `file_url` (sealed) and `select *` |
| `sessions` | column-level | readable via explicit public column list only |
| `testimonials`, `blogs`, `salary_submissions`, `product_reviews`, `availability_patterns`, `blocked_date_ranges` | readable | per existing RLS policies |

Consequences that matter:

1. **Browser writes to `purchases` are denied.** Every client-side insert with
   the anon key fails with `401 permission denied for table purchases`. The
   lead-capture forms (homepage + desk simulator) were broken by this and are
   now fixed via the server-side `log-lead` action in `api/interview.js`.
   The frontend post-checkout insert (`script.js`) is still a dead write — the
   webhook is authoritative, so this is a safety-net gap, not a functional one.
2. **`file_url` is sealed from the browser** — buyers cannot read the raw
   deliverable pointer; all downloads go through signed URLs or Drive grants.
3. **Some tables are still wide open to anon** (`testimonials` INSERT/UPDATE/
   DELETE per RLS). That is acceptable for public content, but `purchases` and
   `bookings` must stay sealed.

## Known open items (not yet fixed)

- `api/grant-access.js` email-ownership check fails open when a payment record
  carries no email at all. Fix: fail closed / verify against the purchase row.
- `script.js` post-checkout `purchases` insert (source: `frontend`) still runs
  with the anon key and 401s silently — restore as a server-side action to
  bring back the webhook-failure safety net.
- The admin panel falls back to the anon key if the `get-key` fetch fails,
  which produces a silently empty panel. Should fail loudly instead.
- Magic-link rate limiting is per-instance in-memory; a persistent limiter
  would be stronger.

## Rotation notes

The anon key has been public (it is in GitHub history and every page source),
which is fine **for anon** — but rotation is still advisable because some
tables it could reach historically (pre-hardening) are now sealed, and a
compromised-but-weakened key is a confusing key. The service-role key has never
been committed; if it ever is, rotate it immediately — it bypasses RLS by design.

## Good practices (still current)

1. Never commit `.env` or any file under `.secrets/` (gitignored/outside repo).
2. Server-side secrets live in Vercel env vars and are read only in `api/*` and
   `lib/*`. `lib/supabaseAdmin.js` fails closed (503) if the key is missing.
3. All privileged Supabase writes go through server routes that authenticate
   (admin password, webhook HMAC, cron secret, access token).
4. `vercel.json` redirects seal `lib/`, `scripts/`, `supabase/`, `test/`,
   `archive/`, `gauntlet/hidden/` and `generate-config.js` from web access;
   `.vercelignore` is the second layer.
