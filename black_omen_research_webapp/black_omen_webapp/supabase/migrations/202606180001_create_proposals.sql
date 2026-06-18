create extension if not exists pgcrypto;

create table if not exists public.word_proposals (
  id uuid primary key default gen_random_uuid(),
  english_term text not null check (char_length(english_term) between 1 and 80),
  normalized_term text not null check (char_length(normalized_term) between 1 and 80),
  proposed_translation text not null check (char_length(proposed_translation) between 1 and 120),
  pronunciation text not null default '' check (char_length(pronunciation) <= 160),
  research_notes text not null check (char_length(research_notes) between 4 and 2000),
  source_name text not null default '' check (char_length(source_name) <= 160),
  source_url text not null default '' check (char_length(source_url) <= 500),
  confidence text not null check (confidence in ('Low', 'Medium', 'High')),
  research_status text not null check (research_status in ('ASK', 'THINK', 'HAVE')),
  visibility text not null default 'visible' check (visibility in ('visible', 'hidden')),
  owner_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists word_proposals_public_term_idx on public.word_proposals (visibility, normalized_term, created_at desc);

create table if not exists public.proposal_rate_limits (
  client_hash text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);

alter table public.word_proposals enable row level security;
alter table public.proposal_rate_limits enable row level security;
revoke all on public.word_proposals from anon, authenticated;
revoke all on public.proposal_rate_limits from anon, authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists word_proposals_set_updated_at on public.word_proposals;
create trigger word_proposals_set_updated_at before update on public.word_proposals
for each row execute function public.set_updated_at();
