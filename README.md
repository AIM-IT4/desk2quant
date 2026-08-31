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
- Desk2Quant Quant Agent CLI for verified customers

## Quant Agent CLI

The customer CLI provides five quant-learning modes:

```bash
d2q learn "Ito's lemma"
d2q solve "derive E[S_T^2] under GBM"
d2q practice probability
d2q interview "quant research"
d2q project "Heston calibration"
```

Authentication uses the customer's existing Desk2Quant purchase identity:

```bash
d2q login buyer@example.com
d2q whoami
d2q progress
d2q logout
```

The CLI never receives the Groq API key, Supabase service-role key, Razorpay secret, or any other Desk2Quant server credential. A customer signs in through a Desk2Quant magic link; the server verifies a captured Razorpay purchase and issues a signed agent session.

Learner telemetry stores a pseudonymous HMAC user key, command/topic counts and model token counts. Raw prompts and model responses are not persisted by the Quant Agent telemetry tables. Activity counts are intentionally not presented as inferred ability scores.

## Technology

- Frontend: HTML5, CSS3 and vanilla JavaScript
- Database and storage: Supabase/PostgreSQL
- Payments: Razorpay
- Transactional email: Brevo
- Hosting: Vercel
- Quant Agent: Node CLI + server-side Groq inference

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
├── cli/
├── api/
├── lib/
├── assets/
├── scripts/
├── supabase/migrations/
├── ARCHITECTURE.md
└── PROJECT_GUIDE.md
```

The exact structure evolves with the application. See [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) for implementation details.

## Local setup

```bash
git clone https://github.com/AIM-IT4/desk2quant.git
cd desk2quant
npm install
npm link
```

Then the CLI is available locally as `d2q`. For the static site you can also run:

```bash
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

### Quant Agent

Set a long random `QUANT_AGENT_SECRET` for independent agent-session signing. The server can fall back to an existing protected session/payment secret during rollout, but a dedicated value is preferred for independent rotation. `GROQ_API_KEY`, Supabase service-role credentials and Razorpay credentials stay server-side.

## Security notes

- The Supabase anonymous key may be used client-side only with appropriate Row Level Security policies.
- Administrative access should use Supabase Auth or another server-verified authentication mechanism.
- Payment and email secrets must never be committed to the repository or embedded in client-side code.
- Production deployments should validate payment webhooks and authorization on every privileged operation.
- Quant Agent access must be entitlement-verified server-side; a local CLI session by itself is not proof of purchase.

## Project status

Desk2Quant is an actively developed product repository rather than a general-purpose open-source library. The source is publicly visible for transparency and portfolio demonstration; reuse rights are governed by the repository's applicable copyright and licence notices.
