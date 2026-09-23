# Guest mentor sessions

Adds an admin-managed guest mentor catalog at `/mentors.html`, with mentor profiles, one-to-one offerings, dated availability, Razorpay checkout, booking confirmation and reminders. Existing Amit sessions retain their own availability.

## Launch order

1. Apply `supabase/migrations/20260923024654_guest_mentor_sessions.sql` to the linked Supabase project before deploying this code. The new booking columns are also used by existing booking endpoints after deployment.
2. Deploy the GitHub branch to a preview with the existing Supabase service role, Razorpay key ID/secret/webhook secret, Brevo key and booking-token configuration. Do not put private keys in browser configuration.
3. Complete browser testing and an end-to-end payment in Razorpay test mode with isolated test configuration before production rollout. Confirm webhook retries, receipt emails, mentor emails and reminders. Local API tests use mocks and do not prove external delivery.
4. Deploy the application, then create the first real profiles in **Admin → Guest Mentors**. No demo profiles or real invitations are seeded automatically.

## Onboarding a mentor

Agree the session scope and revenue share with the mentor first. Create a draft profile using their approved biography/photo, private contact email, specialties and timezone. The default share is 75%; edit it to match the agreement. Add a session with its INR price, duration, prerequisites and learning outcomes. Add explicit dates/times, checking the timezone displayed in the admin form. Publish the profile when it is ready. Sessions without available times display a coming-soon message.

Learners browse profiles, choose a session and time, enter their details and pay through Razorpay. Checkout holds last ten minutes. Prices and earnings shares are snapshotted server-side. An overlapping booking or late payment that cannot be safely fulfilled is recorded for manual review without a meeting link.

The mentor receives a confirmation with the meeting link and preparation notes. This release uses admin-created profiles; it does not send onboarding invitations or provide mentor accounts. Coordinate cancellations and reschedules with the mentor manually using the existing admin booking workflow. Check any booking marked pending before confirming a replacement time or processing a refund.

After a session finishes, mark it completed. Transfer the agreed payout using your normal process, then record the reference. Recording a reference does not transfer money. Earnings account for recorded refunds; reconcile refunds that occur after a payout manually.

## Access and implementation

The four new tables and scheduling RPCs are service-role only. Public catalog responses explicitly select public profile fields. A restrictive bookings policy prevents existing permissive authenticated policies from exposing guest booking rows. A per-mentor row lock and booking trigger serialize reservations and reject overlapping bookings, including admin reschedules. Payment verification uses Razorpay signatures and captured payment data, with server-created order/reservation bindings and idempotent fulfillment.

Existing serverless endpoints are extended to stay within the current function budget. Admin operations use the existing password gate; the new panel calls server endpoints. Optional client events are dispatched for analytics, but no Statsig experiment or SDK is configured by this change.

## Validation

Run:

```sh
node --test test/guest-mentors.test.mjs test/webhook-email-idempotency.test.mjs
```

Run `supabase/tests/guest_mentor_sessions.sql` inside `BEGIN` / `ROLLBACK` after the migration in a test environment. It checks hold retries, overlapping holds/bookings, payment retries, late capture, underpayment, refund-adjusted shares, payout restrictions and customer access restrictions. Synthetic data must never be committed.

At preparation time, all 13 Node tests and the transactional SQL assertions passed against the linked project's schema. The schema validation was rolled back; the migration has not been applied to production. Syntax checks passed for modified JavaScript and admin/customer inline scripts. Browser testing remains outstanding because the available browser could not access the local preview. No real payment or email was sent.
