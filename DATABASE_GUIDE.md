# Database Management Guide

This project uses a version-controlled migration system to manage Supabase database changes.

## Directory Structure
- `supabase/migrations/`: Contains chronological `.sql` files representing the database schema.
- `archive/sql/`: Contains legacy SQL scripts for reference.

## Current Migration Status

> ⚠️ **Known drift (verified 26 Aug 2026):** production has been hardened
> **by hand** beyond what the migration files describe. The anon role cannot
> read or write `purchases` or `bookings` at all (table-level `401 permission
> denied`), and `products` / `sessions` are granted **column-level** access
> (`file_url` sealed, `select *` denied) even though `0009` is fully commented
> out. Treat this table as "what the codebase intends", and probe production
> (`scripts/probe-db.js`) before assuming either state.

| Migration File | Description | Status |
|----------------|-------------|--------|
| `0001_initial_schema.sql` | Baseline schema (Tables, Policies, Storage, Data) | **Baseline** |
| `0002_add_country_and_normalized_revenue.sql` | country + inr_amount columns, backfill | applied |
| `0003_add_product_preview_fields.sql` | product preview fields | applied |
| `0003_create_salary_submissions_table.sql` | salary submissions table | applied |
| `0004_add_download_link_to_purchases.sql` | purchases.download_link | applied |
| `0005_extend_recommendation_emails.sql` | recommendation email fields | applied |
| `0006_lock_down_recommendation_emails_coupons.sql` | coupon lockdown | applied |
| `0007_fix_purchases_created_at_timezone.sql` | created_at timezone fix | applied |
| `0008_validate_coupon_by_code_only.sql` | coupon validation | applied |
| `0009_rls_hardening_BLOCKED.sql` | RLS hardening target state | **BLOCKED — see below** |
| `0010_dedupe_and_unique_payment_id.sql` | dedupe + unique payment_id indexes | applied |
| `20260821011526_webhook_cart_email_idempotency.sql` | webhook email idempotency | applied |

## About `0009_rls_hardening_BLOCKED.sql`

This file is committed as the **documented target state**, not as a
ready-to-apply migration. Every statement in it is commented out because
applying it as written would break the admin panel and checkout flows that
still write to Supabase from the browser.

However, the **table-level half** of that hardening has already been applied
in production by hand (anon denied on `purchases`/`bookings`, column grants on
`products`/`sessions`). That is why the old browser-side writes broke. The
**RLS-policy half** (dropping permissive `USING (true)` policies on
`testimonials`, `storage.objects`, etc.) is still pending and remains blocked
until the remaining browser writes are moved behind server routes.

To eventually finish it:
1. Move `script.js`'s post-checkout `purchases` insert behind a server action.
2. Move the admin panel's remaining direct mutations behind the service key
   flow it already uses (`get-key`), and remove the anon fallbacks.
3. Only then uncomment and apply the policy statements, and rotate the anon key.

## How to add a new change
1. Create a new file in `supabase/migrations/` with a numbered prefix (e.g., `0002_add_discount_logic.sql`).
2. Write your SQL standard commands (CREATE TABLE, ALTER TABLE, etc.).
3. Copy the SQL content and run it in the **Supabase SQL Editor**.
4. Register the migration in the `_migrations` table:
   ```sql
   INSERT INTO _migrations (name) VALUES ('0002_add_discount_logic.sql');
   ```

## Why this system?
- **Consistency**: Ensures the local codebase matches the production database.
- **Predictability**: New developers (or AI assistants) know exactly what the schema looks like.
- **Rollback**: Provides a history of changes for debugging.

## Operational notes
- Use `scripts/probe-db.js` (read-only, anon key) to confirm live permission state.
- Do **not** run `0009` statements against production until the prerequisites above are done.
