-- Extends the existing `recommendation_emails` table (created by
-- supabase/create_recommendation_emails.sql) into a proper send queue with
-- observability + retry tracking, so post-purchase/post-booking recommendation
-- emails are reliably queued, sent, retried on transient failure, and fully
-- auditable instead of being a fire-and-forget call inside the webhook.
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE recommendation_emails
    ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'product_purchase',
    ADD COLUMN IF NOT EXISTS coupon_code TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
        -- pending | sent | failed
    ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_error TEXT,
    ADD COLUMN IF NOT EXISTS brevo_message_id TEXT;

-- Backfill status for any pre-existing rows using the old `sent` boolean
UPDATE recommendation_emails SET status = 'sent' WHERE sent = TRUE AND status = 'pending';

-- Index for the queue-processing query: pending rows whose send_at has arrived,
-- ordered oldest first, capped attempts so we don't retry forever.
CREATE INDEX IF NOT EXISTS idx_recommendation_queue
    ON recommendation_emails (status, send_at)
    WHERE status = 'pending';
