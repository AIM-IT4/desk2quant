# Desk2Quant — Architecture & Dynamic Flows

## System Overview

```mermaid
graph TB
    subgraph Client["Browser (static site on Vercel)"]
        IDX[index.html / product.html / resources.html]
        SJS[script.js<br/>checkout + UI logic]
        ADM[admin.html<br/>admin panel]
    end

    subgraph Vercel["Vercel Serverless (api/)"]
        CO[create-order]
        WH[razorpay-webhook]
        GA[grant-access]
        SE[send-email]
        AA[admin-auth]
        PR[products]
        RM[reminders]
        INT[interview / tts]
        PROMO[send-latest-products /<br/>send-promo-latest /<br/>send-single-buyer-offers]
    end

    subgraph External["External Services"]
        RZP[Razorpay<br/>payments]
        SB[(Supabase<br/>products · purchases · bookings)]
        DRV[Google Drive API<br/>service account]
        BRV[Brevo<br/>transactional email]
        CRON[cron-job.org]
    end

    IDX --> SJS
    SJS --> CO --> RZP
    SJS --> GA
    SJS --> SB
    RZP -- webhook payment.captured --> WH
    WH --> RZP
    WH --> SB
    WH --> DRV
    WH --> BRV
    GA --> RZP
    GA --> SB
    GA --> DRV
    SJS --> SE --> BRV
    ADM --> AA
    ADM --> SB
    CRON --> RM --> BRV
    PR --> SB
```

## Purchase Flow (dynamic, current — post-fix)

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant FE as script.js (browser)
    participant CO as /api/create-order
    participant RZ as Razorpay
    participant WH as /api/razorpay-webhook
    participant GA as /api/grant-access
    participant SB as Supabase
    participant GD as Google Drive
    participant BR as Brevo

    C->>FE: Click Buy (product, price)
    FE->>CO: POST amount, currency, notes(product_name, download_link, customer)
    CO->>RZ: Create order (instant capture)
    RZ-->>FE: order_id
    FE->>RZ: Open checkout modal
    C->>RZ: Pay
    RZ-->>FE: success handler (payment_id)

    par Frontend fallback path
        FE->>GA: POST payment_id + email
        GA->>RZ: Verify payment captured (server-side)
        GA->>SB: Resolve file_url if missing from notes
        GA->>GD: Grant reader permission to customer email
        GA-->>FE: download_link + granted flag
        FE->>SB: Insert purchase (source: frontend)
        FE->>C: Success modal + link
    and Webhook path (authoritative)
        RZ->>WH: payment.captured (HMAC signed)
        WH->>WH: Verify signature
        WH->>RZ: Fetch order notes fallback
        WH->>SB: Dedup check (payment_id) then insert (source: webhook)
        WH->>GD: Grant reader permission
        WH->>BR: Customer email (download link)
        WH->>BR: Admin email (sale alert)
        WH->>BR: Schedule +1h recommendation email (NAME20 coupon)
    end

    Note over FE,WH: Emails sent ONLY by webhook (dup fix ce010f6).<br/>Drive grant attempted by BOTH paths — idempotent, Drive dedups.
```

## Session Booking Flow

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant FE as script.js
    participant RZ as Razorpay
    participant WH as /api/razorpay-webhook
    participant SB as Supabase
    participant BR as Brevo

    C->>FE: Book session (date/time form)
    FE->>RZ: Checkout (notes.type = session)
    RZ->>WH: payment.captured
    WH->>SB: Dedup check, insert booking (meet link, status upcoming)
    WH->>BR: Customer confirmation (private session link)
    WH->>BR: Admin alert
    Note over SB: cron-job.org hits /api/reminders every 5 min<br/>to email upcoming-session reminders
```

## Drive Access Model

```
Product file (Google Drive, restricted)
  owner:  amitjha20250305@gmail.com
  writer: drive-sharing-service@desk2quant.iam.gserviceaccount.com  ← service account (Editor)
  reader: <each customer email, granted per purchase>

Grant paths (both idempotent):
  1. Webhook  → grantDrivePermission()      — authoritative
  2. Frontend → POST /api/grant-access      — fallback if webhook dead
     (verifies payment with Razorpay first — cannot be spoofed)
```

## Data Stores (Supabase)

| Table | Written by | Key fields |
|---|---|---|
| products | admin panel | name, price, file_url, coupon_code |
| purchases | webhook + frontend (dedup on payment_id + source) | payment_id, source, download_link, customer_email |
| bookings | webhook | payment_id, booking_date, meet_link, status |

## Env Vars (Vercel)

`RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `BREVO_API_KEY`, `SUPABASE_URL/KEY`, `ADMIN_EMAIL`, `SENDER_EMAIL/NAME`

## Constraints

- Vercel Hobby: max 12 serverless functions (currently exactly 12; archive/ holds retired ones)
- Cheatcode product: dead Drive file ID in Supabase — pending new link
```
