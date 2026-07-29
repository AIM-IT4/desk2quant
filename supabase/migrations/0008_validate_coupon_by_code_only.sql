-- Adds a code-only variant of the recommendation-coupon check so checkout
-- can apply a personalised NAME20 code without prompting the customer for
-- their email (bad UX — the prompt from migration 0006 is being removed
-- from the client).
--
-- Trade-off (explicit, signed off by site owner): anyone who obtains a
-- customer's exact issued code (screenshot, forwarded email, etc.) can also
-- redeem it — same acceptance the site briefly shipped before migration
-- 0006 tightened it to email+code. Accepted in exchange for a friction-free
-- checkout. Codes are still opaque/high-entropy (see lib/recommendationQueue.js
-- createCouponToken) so they cannot be guessed from a customer's name alone,
-- and each is single-use per the existing status check below.
--
-- Run this once in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION validate_recommendation_coupon_code(p_code TEXT)
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
        WHERE upper(coupon_code) = upper(trim(p_code))
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
GRANT EXECUTE ON FUNCTION validate_recommendation_coupon_code(TEXT) TO anon, authenticated;
