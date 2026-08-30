# Desk2Quant

Desk2Quant is a quantitative-finance learning and mentorship platform with interactive resources, booking workflows and digital-product delivery.

## Features

- Mentorship booking with dynamic time slots and conflict detection
- Digital-resource catalogue and purchase flow
- Free quantitative-finance learning resources
- Razorpay payment integration
- Brevo transactional-email integration
- Supabase-backed bookings, products and session data
- Administrative workflows for bookings, rescheduling and analytics
- Responsive browser-based interface

## Technology

- Frontend: HTML5, CSS3 and vanilla JavaScript
- Database and storage: Supabase/PostgreSQL
- Payments: Razorpay
- Transactional email: Brevo
- Hosting: Vercel

## Repository structure

The application is served from the repository root. Key files include:

```text
.
├── index.html
├── admin.html
├── my-bookings.html
├── resources.html
├── styles.css
├── script.js
├── api/
├── assets/
├── scripts/
├── ARCHITECTURE.md
└── PROJECT_GUIDE.md
```

The exact structure evolves with the application. See [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) for implementation details.

## Local setup

```bash
git clone https://github.com/AIM-IT4/desk2quant.git
cd desk2quant
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Build and SEO product pages

Vercel runs the repository build command during deployment. `npm run build` regenerates the static, crawlable product pages under `products/` from the current Supabase `products` table and refreshes the product hub and sitemap. After a product is added directly in Supabase, a deployment/build is therefore required before its canonical `/products/<slug>.html` URL exists in production. Product metadata changes that affect static SEO output—such as name, price or description updates—should also be followed by a deployment so canonical pages stay synchronized with the live catalog.

## Configuration

### Supabase

1. Create a Supabase project.
2. Apply the repository's SQL migrations or setup scripts.
3. Configure the Supabase project URL and public client key using the project's supported configuration mechanism.
4. Keep service-role keys and other privileged credentials on the server side only.

### Razorpay

1. Create Razorpay API credentials.
2. Store secret values in server-side or deployment environment variables.
3. Configure the payment webhook for the required payment events.
4. Verify webhook signatures before updating bookings or fulfilling digital products.

### Brevo

Configure transactional-email credentials through server-side environment variables or protected serverless functions. Do not expose private API keys in browser JavaScript.

## Security notes

- The Supabase anonymous key may be used client-side only with appropriate Row Level Security policies.
- Administrative access should use Supabase Auth or another server-verified authentication mechanism.
- Payment and email secrets must never be committed to the repository or embedded in client-side code.
- Production deployments should validate payment webhooks and authorization on every privileged operation.

## Project status

Desk2Quant is an actively developed product repository rather than a general-purpose open-source library. The source is publicly visible for transparency and portfolio demonstration; reuse rights are governed by the repository's applicable copyright and licence notices.
