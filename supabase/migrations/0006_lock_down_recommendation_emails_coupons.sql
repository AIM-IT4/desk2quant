-- Makes NAME20-style coupon codes actually customer-specific: only a code
-- that was genuinely issued (present in recommendation_emails with
-- status='sent') to the given email now works, instead of any string
-- matching /^[A-Z]+20$/.
--
-- Scope note: this migration does NOT lock down table-level SELECT on
-- recommendation_emails. That table currently has no way to distinguish
-- "the site's own reminders.js cron reading it" from "a member of the public
-- reading it", because both use the same anon/publishable key — this project
-- has no SUPABASE_SERVICE_ROLE_KEY configured anywhere (checked via
-- `vercel env ls`), and the cron needs SELECT to find pending emails to send.
-- Locking SELECT today would silently break the send queue. Decision (with
-- user sign-off): leave table reads open for now — the exposed data is just
-- emails + a 20%-off code, not payment/auth data — and revisit by introducing
-- a real service-role key later if tighter isolation is wanted.
--
-- What THIS migration actually does: adds a function that lets the browser
-- check "is this code valid for this email" without the browser ever
-- directly querying the table — the coupon UI in product.html now calls this
-- function instead of accepting any /^[A-Z]+20$/ pattern.
--
-- Run this once in the Supabase SQL Editor.

-- Safe validation function: given an email + code, returns the discount
-- percent if that code was genuinely issued to that email and is still valid
-- to use, otherwise NULL.
CREATE OR REPLACE FUNCTION validate_recommendation_coupon(p_email TEXT, p_code TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_found BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM recommendation_emails
        WHERE lower(customer_email) = lower(trim(p_email))
          AND upper(coupon_code) = upper(trim(p_code))
          AND status = 'sent'
    ) INTO v_found;

    IF v_found THEN
        RETURN 20; -- all issued recommendation coupons are 20% off today
    ELSE
        RETURN NULL;
    END IF;
END;
$$;

-- Allow the anon/public role to call the function (but NOT read the table it queries)
GRANT EXECUTE ON FUNCTION validate_recommendation_coupon(TEXT, TEXT) TO anon, authenticated;
