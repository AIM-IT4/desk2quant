revoke all on table public.funnel_events from service_role;
grant select, insert on table public.funnel_events to service_role;

revoke all on sequence public.funnel_events_id_seq from service_role;
grant usage, select on sequence public.funnel_events_id_seq to service_role;
