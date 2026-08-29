-- Professional FX workbook lead capture.
-- Add campaign attribution and make one normalized row authoritative per email + lead magnet.

alter table public.lead_captures
    add column if not exists utm_source text,
    add column if not exists utm_medium text,
    add column if not exists utm_campaign text,
    add column if not exists referrer_host text;

update public.lead_captures
set email = lower(btrim(email))
where email is distinct from lower(btrim(email));

create unique index if not exists lead_captures_email_lead_magnet_uidx
    on public.lead_captures (email, lead_magnet);

comment on column public.lead_captures.utm_source is 'Privacy-minimized campaign attribution, e.g. linkedin.';
comment on column public.lead_captures.utm_medium is 'Privacy-minimized campaign medium, e.g. organic.';
comment on column public.lead_captures.utm_campaign is 'Privacy-minimized campaign name.';
comment on column public.lead_captures.referrer_host is 'Referrer hostname only; full referrer URLs are not stored.';
