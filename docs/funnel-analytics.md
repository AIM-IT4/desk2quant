# Desk2Quant conversion analytics

## Purpose

This funnel is designed to answer one business question without touching transaction execution: **which role/diagnostic outcomes lead to product interest, checkout, and paid-success states?**

The browser sends privacy-minimized events to the `log-funnel-event` Supabase Edge Function. That function validates and rate-limits events before inserting into the RLS-sealed `public.funnel_events` table.

No analytics event contains a customer name, email, phone number, Razorpay payment ID, card/UPI data, exact diagnostic readiness score, or the five individual diagnostic answers.

## Funnel events

| Event | Meaning |
| --- | --- |
| `role_path_selected` | Homepage role path selected |
| `goal_path_selected` | Homepage goal-based starting point selected |
| `diagnostic_started` | First interaction with the diagnostic form |
| `diagnostic_completed` | Valid diagnostic result generated |
| `diagnostic_recommendation_clicked` | A recommended resource/bundle was selected |
| `product_view_from_diagnostic` | The recommended product page was reached in the same browser session |
| `sample_opened` | A real product sample PDF was opened |
| `purchase_cta_clicked` | A trusted user click on a purchase CTA |
| `checkout_opened` | Razorpay checkout UI appeared after a recent purchase CTA |
| `purchase_success` | Existing paid-success UI was reached after a recent Razorpay checkout-open context |

`purchase_success` is intentionally derived outside the transaction handlers. Analytics does not decide whether a payment is valid and never changes fulfilment. For accounting/revenue truth, use the existing verified purchase/Razorpay data; use this table for funnel attribution.

## Diagnostic attribution fields

A random `diagnostic_id` connects the diagnostic run to later same-session events. The coarse fields carried forward are:

- `role`
- `experience`
- `timeline`
- `readiness_band`
- `top_gap`
- `material_gap_count`
- `bundle_suggested`
- recommended `product_id` / `recommendation_domain`

A random `session_id` is scoped to browser `sessionStorage`, not an account identity.

## Core reporting queries

### Overall funnel for a date range

```sql
select event_name,
       count(*) as events,
       count(distinct session_id) as sessions
from public.funnel_events
where created_at >= now() - interval '30 days'
group by event_name
order by case event_name
  when 'diagnostic_started' then 1
  when 'diagnostic_completed' then 2
  when 'diagnostic_recommendation_clicked' then 3
  when 'product_view_from_diagnostic' then 4
  when 'sample_opened' then 5
  when 'purchase_cta_clicked' then 6
  when 'checkout_opened' then 7
  when 'purchase_success' then 8
  else 20 end;
```

### Diagnostic outcomes that reach paid-success

```sql
select role,
       top_gap,
       readiness_band,
       count(distinct diagnostic_id) filter (where event_name = 'diagnostic_completed') as completed,
       count(distinct diagnostic_id) filter (where event_name = 'diagnostic_recommendation_clicked') as recommendation_clicks,
       count(distinct diagnostic_id) filter (where event_name = 'checkout_opened') as checkout_opens,
       count(distinct diagnostic_id) filter (where event_name = 'purchase_success') as paid_successes
from public.funnel_events
where diagnostic_id is not null
  and created_at >= now() - interval '30 days'
group by role, top_gap, readiness_band
order by paid_successes desc, completed desc;
```

### Recommended products that convert

```sql
select product_id,
       count(distinct diagnostic_id) filter (where event_name = 'diagnostic_recommendation_clicked') as recommendation_clicks,
       count(distinct diagnostic_id) filter (where event_name = 'product_view_from_diagnostic') as product_views,
       count(distinct diagnostic_id) filter (where event_name = 'purchase_cta_clicked') as purchase_cta_clicks,
       count(distinct diagnostic_id) filter (where event_name = 'checkout_opened') as checkout_opens,
       count(distinct diagnostic_id) filter (where event_name = 'purchase_success') as paid_successes
from public.funnel_events
where diagnostic_id is not null
  and product_id is not null
  and created_at >= now() - interval '30 days'
group by product_id
order by paid_successes desc, recommendation_clicks desc;
```

### CTA performance

```sql
select cta_source,
       count(*) filter (where event_name = 'purchase_cta_clicked') as clicks,
       count(*) filter (where event_name = 'checkout_opened') as checkout_opens,
       count(*) filter (where event_name = 'purchase_success') as paid_successes
from public.funnel_events
where created_at >= now() - interval '30 days'
  and cta_source is not null
group by cta_source
order by paid_successes desc, clicks desc;
```

## Interpretation rules

- Prefer `count(distinct session_id)` or `count(distinct diagnostic_id)` for conversion rates; raw event counts can include revisits/reloads.
- Treat `purchase_success` as funnel attribution, not revenue accounting truth.
- Use the existing purchases/Razorpay records for financial reconciliation.
- Do not add PII to this table to make attribution easier. If cross-device identity attribution is ever required, design it separately with explicit privacy review.
