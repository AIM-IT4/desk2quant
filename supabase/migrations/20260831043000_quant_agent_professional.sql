create table if not exists public.quant_agent_profiles (
    user_key text primary key
        check (user_key ~ '^[a-f0-9]{64}$'),
    total_sessions bigint not null default 0 check (total_sessions >= 0),
    command_counts jsonb not null default '{}'::jsonb,
    topic_counts jsonb not null default '{}'::jsonb,
    last_command text null check (last_command is null or last_command in ('learn','solve','practice','interview','project')),
    last_topic text null check (last_topic is null or length(last_topic) <= 80),
    updated_at timestamptz not null default now()
);

create table if not exists public.quant_agent_usage_events (
    id bigint generated always as identity primary key,
    user_key text not null
        check (user_key ~ '^[a-f0-9]{64}$'),
    command text not null
        check (command in ('learn','solve','practice','interview','project')),
    topic text not null check (length(topic) between 1 and 80),
    model text not null check (length(model) between 1 and 120),
    input_tokens integer not null default 0 check (input_tokens >= 0),
    output_tokens integer not null default 0 check (output_tokens >= 0),
    created_at timestamptz not null default now()
);

alter table public.quant_agent_profiles enable row level security;
alter table public.quant_agent_usage_events enable row level security;

revoke all on table public.quant_agent_profiles from anon, authenticated;
revoke all on table public.quant_agent_usage_events from anon, authenticated;
grant select, insert, update on table public.quant_agent_profiles to service_role;
grant select, insert on table public.quant_agent_usage_events to service_role;
grant usage, select on sequence public.quant_agent_usage_events_id_seq to service_role;

create index if not exists quant_agent_usage_user_created_idx
    on public.quant_agent_usage_events (user_key, created_at desc);
create index if not exists quant_agent_usage_command_created_idx
    on public.quant_agent_usage_events (command, created_at desc);

comment on table public.quant_agent_profiles is
'Privacy-minimized Quant Agent learner activity profile. user_key is an HMAC pseudonym; raw email is not stored.';
comment on table public.quant_agent_usage_events is
'Quant Agent usage/cost telemetry. Stores pseudonymous user key and token counts, never prompt or response content.';
