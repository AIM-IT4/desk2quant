# Desk2Quant Project Guide

This document gives a practical, end-to-end map of the codebase so new contributors can onboard quickly.

## 1) What this project is

Desk2Quant is a static-first website that combines:
- Mentorship session discovery + booking
- Digital product purchases
- Product advisor chat on the homepage
- Admin dashboard for operations

The frontend is mostly HTML/CSS/vanilla JS, while backend behavior is handled by Supabase and Vercel serverless APIs.

## 2) Core runtime architecture

### Frontend (browser)
- Main logic lives in `script.js` and is reused by multiple pages.
- UI pages are standalone HTML documents (`index.html`, `admin.html`, `my-bookings.html`, etc.).
- Razorpay checkout is triggered client-side for products and sessions.
- Supabase JS client is used directly in browser for many read/write flows.

### Backend (serverless)
- `/api/interview` is the main customer API (the name is historical): booking self-service (my-bookings, reschedule, cancel), My Access login and library, session rooms, lead capture and the homepage product advisor chat.
- `/api/reminders` runs scheduled reminder processing for upcoming sessions.
- `/api/razorpay-webhook` verifies payment webhook signatures and performs reliable fulfillment/logging.

### Data layer
- PostgreSQL tables in Supabase hold products, sessions, bookings, purchases, testimonials, and blog posts.
- Several SQL files in repo are migration/setup scripts for schema evolution.

## 3) Key user journeys

### A) Product purchase flow
1. Products are loaded from Supabase into the storefront.
2. User opens product modal and starts Razorpay payment.
3. On success, purchase is logged and email delivery is attempted.
4. Webhook endpoint acts as authoritative fallback for fulfillment + de-duplication.

Primary code: `script.js`, `api/razorpay-webhook.js`.

### B) Mentorship booking flow
1. Sessions and availability are loaded from Supabase.
2. User selects slot, pays via Razorpay, and booking is created.
3. Confirmation email + admin notification are sent.
4. Cron endpoint sends reminder emails at different lead times.

Primary code: `script.js`, `my-bookings.html`, `api/reminders.js`.

## 4) Important files and responsibilities

- `index.html`: main landing page and conversion funnel.
- `script.js`: shared app logic (products, sessions, booking, payments, emails, blogs, testimonials).
- `admin.html`: admin dashboard, analytics, product/session/blog management.
- `my-bookings.html`: customer booking lookup + reschedule/cancellation flows.
- `api/*.js`: serverless business logic and integrations.
- `generate-config.js`: build-time config.js generation from env vars.
- `vercel.json`: Vercel build/output config.
- `setup_*.sql` and `update_schema*.sql`: DB bootstrap and migrations.

## 5) Configuration and secrets model

- Build step creates `config.js` from env vars for selected frontend config values.
- Server-side secrets are read via `process.env` in API endpoints.
- Supabase URL/key fallback values appear in multiple places (frontend and APIs).

## 6) Risks and technical debt to address first

1. **Sensitive keys in client code**
   - `script.js` contains fallback Brevo key parts and publishable Supabase values hardcoded.
2. **Open RLS policies**
   - Setup SQL includes very permissive policies (`USING true` / `WITH CHECK true`) for critical tables.
3. **Frontend-heavy trust boundary**
   - Significant data writes occur directly from browser, reducing enforcement opportunities.
4. **Large monolithic script**
   - `script.js` mixes many domains; maintainability and testability are limited.
5. **Schema script drift**
   - Multiple SQL scripts define overlapping tables/policies; easy to misapply in new environments.

## 7) Suggested onboarding order (for a new developer)

1. Read `README.md` for product intent and quick setup.
2. Read `index.html` and `script.js` to understand the default customer flow.
3. Read `admin.html` and `my-bookings.html` for operational workflow.
4. Read `api/interview.js` (bookings, My Access, advisor), `api/reminders.js`, `api/razorpay-webhook.js` for backend behavior.
5. Review SQL files to map tables and policy model.
6. Run locally with a static server and verify: landing page, product modal, booking flow, My Access login and admin login.

## 8) Recommended next refactors

- Split `script.js` into modules by domain: products, bookings, payments, content, utilities.
- Move all privileged operations behind serverless endpoints.
- Tighten Supabase RLS with authenticated roles and scoped policies.
- Centralize schema migrations and remove duplicated SQL setup files.
- Add smoke tests for critical serverless flows (webhook verification + reminders).
