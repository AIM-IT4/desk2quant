create table public.funnel_events (
    id bigint generated always as identity primary key,
    event_id text not null unique
        check (event_id ~ '^[A-Za-z0-9_-]{8,80}$'),
    session_id text not null
        check (session_id ~ '^[A-Za-z0-9_-]{8,80}$'),
    diagnostic_id text null
        check (diagnostic_id is null or diagnostic_id ~ '^[A-Za-z0-9_-]{8,80}$'),
    event_name text not null
        check (event_name in (
            'role_path_selected',
            'goal_path_selected',
            'diagnostic_started',
            'diagnostic_completed',
            'diagnostic_recommendation_clicked',
            'product_view_from_diagnostic',
            'sample_opened',
            'purchase_cta_clicked',
            'checkout_opened',
            'purchase_success'
        )),
    page_path text not null
        check (length(page_path) between 1 and 180 and left(page_path, 1) = '/'),
    product_id uuid null,
    source text null check (source is null or length(source) <= 48),
    role text null check (role is null or role in ('pricing','xva','validation','quantdev','general')),
    experience text null check (experience is null or experience in ('transition','early','experienced')),
    timeline text null check (timeline is null or timeline in ('urgent','near','runway')),
    readiness_band text null check (readiness_band is null or readiness_band in ('90_plus','75_89','55_74','below_55')),
    top_gap text null check (top_gap is null or top_gap in ('foundations','pricing','risk','implementation','interview','none')),
    recommendation_domain text null check (recommendation_domain is null or recommendation_domain in ('foundations','pricing','risk','implementation','interview','integration','bundle')),
    material_gap_count smallint null check (material_gap_count is null or material_gap_count between 0 and 5),
    bundle_suggested boolean null,
    amount numeric(12,2) null check (amount is null or (amount >= 0 and amount <= 1000000)),
    currency text null check (currency is null or currency ~ '^[A-Z]{3}$'),
    cta_source text null check (cta_source is null or length(cta_source) <= 48),
    utm_source text null check (utm_source is null or length(utm_source) <= 100),
    utm_medium text null check (utm_medium is null or length(utm_medium) <= 100),
    utm_campaign text null check (utm_campaign is null or length(utm_campaign) <= 120),
    referrer_host text null check (referrer_host is null or length(referrer_host) <= 180),
    created_at timestamptz not null default now()
);

alter table public.funnel_events enable row level security;

revoke all on table public.funnel_events from anon, authenticated;
grant select, insert on table public.funnel_events to service_role;
grant usage, select on sequence public.funnel_events_id_seq to service_role;

create index funnel_events_created_at_idx on public.funnel_events (created_at desc);
create index funnel_events_event_created_idx on public.funnel_events (event_name, created_at desc);
create index funnel_events_session_created_idx on public.funnel_events (session_id, created_at);
create index funnel_events_diagnostic_created_idx on public.funnel_events (diagnostic_id, created_at) where diagnostic_id is not null;
create index funnel_events_product_created_idx on public.funnel_events (product_id, created_at) where product_id is not null;

comment on table public.funnel_events is
'Privacy-minimized conversion funnel telemetry. No names, emails, payment IDs, IP addresses, or raw diagnostic answer vectors are stored.';
