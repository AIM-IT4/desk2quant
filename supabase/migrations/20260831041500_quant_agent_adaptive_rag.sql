-- Desk2Quant Quant Agent: adaptive assessment + private entitlement-aware RAG.
-- Private knowledge content is intentionally NOT stored in this public repo.

create table if not exists public.quant_agent_skills (
    user_key text not null check (user_key ~ '^[a-f0-9]{64}$'),
    skill_key text not null check (skill_key ~ '^[a-z0-9_]{2,40}$'),
    theta double precision not null default 0 check (theta between -4 and 4),
    information double precision not null default 0 check (information >= 0),
    attempts integer not null default 0 check (attempts >= 0),
    mean_score double precision not null default 0 check (mean_score between 0 and 1),
    last_score double precision null check (last_score is null or last_score between 0 and 1),
    updated_at timestamptz not null default now(),
    primary key (user_key, skill_key)
);

create table if not exists public.quant_agent_assessments (
    id uuid primary key default gen_random_uuid(),
    user_key text not null check (user_key ~ '^[a-f0-9]{64}$'),
    skill_key text not null check (skill_key ~ '^[a-z0-9_]{2,40}$'),
    difficulty double precision not null check (difficulty between -3 and 3),
    discrimination double precision not null default 1 check (discrimination between 0.4 and 2.5),
    question text not null check (length(question) between 10 and 6000),
    rubric text not null check (length(rubric) between 5 and 8000),
    reference_answer text not null check (length(reference_answer) between 5 and 12000),
    status text not null default 'open' check (status in ('open','graded','expired')),
    score double precision null check (score is null or score between 0 and 1),
    feedback text null check (feedback is null or length(feedback) <= 6000),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '2 hours'),
    graded_at timestamptz null
);

create table if not exists public.quant_agent_knowledge_chunks (
    id bigint generated always as identity primary key,
    document_key text not null check (document_key ~ '^[a-z0-9_]{2,50}$'),
    document_title text not null check (length(document_title) between 3 and 240),
    section text not null check (length(section) between 1 and 180),
    content text not null check (length(content) between 100 and 5000),
    source_modified_at timestamptz null,
    search_vector tsvector generated always as (
        to_tsvector('english', coalesce(document_title,'') || ' ' || coalesce(section,'') || ' ' || coalesce(content,''))
    ) stored,
    unique(document_key, section, content)
);

alter table public.quant_agent_skills enable row level security;
alter table public.quant_agent_assessments enable row level security;
alter table public.quant_agent_knowledge_chunks enable row level security;

revoke all on table public.quant_agent_skills from anon, authenticated;
revoke all on table public.quant_agent_assessments from anon, authenticated;
revoke all on table public.quant_agent_knowledge_chunks from anon, authenticated;
grant select, insert, update on table public.quant_agent_skills to service_role;
grant select, insert, update on table public.quant_agent_assessments to service_role;
grant select, insert, update, delete on table public.quant_agent_knowledge_chunks to service_role;
grant usage, select on sequence public.quant_agent_knowledge_chunks_id_seq to service_role;

create index if not exists quant_agent_skills_user_idx on public.quant_agent_skills (user_key, updated_at desc);
create index if not exists quant_agent_assessments_user_status_idx on public.quant_agent_assessments (user_key, status, created_at desc);
create index if not exists quant_agent_knowledge_search_idx on public.quant_agent_knowledge_chunks using gin (search_vector);
create index if not exists quant_agent_knowledge_doc_idx on public.quant_agent_knowledge_chunks (document_key);

create or replace function public.search_quant_agent_knowledge(
    query_text text,
    allowed_document_keys text[],
    result_limit integer default 6
)
returns table (
    chunk_id bigint,
    document_key text,
    document_title text,
    section text,
    snippet text,
    rank real
)
language sql
security definer
set search_path = public
stable
as $$
    with q as (
      select websearch_to_tsquery(
        'english',
        regexp_replace(trim(query_text), '[[:space:]]+', ' OR ', 'g')
      ) as tsq
    )
    select
        k.id,
        k.document_key,
        k.document_title,
        k.section,
        ts_headline('english', k.content, q.tsq,
            'MaxWords=95, MinWords=35, ShortWord=3, HighlightAll=false') as snippet,
        ts_rank_cd(k.search_vector, q.tsq)::real as rank
    from public.quant_agent_knowledge_chunks k
    cross join q
    where coalesce(array_length(allowed_document_keys, 1), 0) > 0
      and k.document_key = any(allowed_document_keys)
      and k.search_vector @@ q.tsq
    order by ts_rank_cd(k.search_vector, q.tsq) desc, k.id
    limit greatest(1, least(coalesce(result_limit, 6), 10));
$$;

revoke all on function public.search_quant_agent_knowledge(text,text[],integer) from public, anon, authenticated;
grant execute on function public.search_quant_agent_knowledge(text,text[],integer) to service_role;

comment on table public.quant_agent_skills is
'Adaptive Quant Agent skill state using a bounded IRT/Elo-style latent theta; pseudonymous user key only.';
comment on table public.quant_agent_assessments is
'Short-lived server-side assessment items and grading rubrics. Candidate answers are not persisted.';
comment on table public.quant_agent_knowledge_chunks is
'Private Desk2Quant RAG chunks. Service-role only; never browser-queryable.';
