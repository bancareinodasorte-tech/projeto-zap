create table if not exists public.zap_auth (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.zap_auth enable row level security;
