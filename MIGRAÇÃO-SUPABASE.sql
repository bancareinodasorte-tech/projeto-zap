-- PROJETO ZAP V3 — MIGRAÇÃO DO MOTOR DE CAMPANHAS
-- Execute este arquivo UMA VEZ no SQL Editor do mesmo projeto Supabase usado pela V2.1.
create table if not exists public.campaign_variants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  variant_no integer not null check (variant_no between 1 and 5),
  message_text text not null,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(owner_id,campaign_id,variant_no)
);
create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  variant_no integer not null default 1 check (variant_no between 1 and 5),
  status text not null default 'PENDENTE',
  attempt_count integer not null default 0,
  max_attempts integer not null default 1,
  next_action_at timestamptz,
  last_action_at timestamptz,
  responded_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,campaign_id,contact_id)
);
create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient_id uuid references public.campaign_recipients(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  event_type text not null,
  event_source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists campaign_variants_owner_campaign_idx on public.campaign_variants(owner_id,campaign_id);
create index if not exists campaign_recipients_owner_campaign_idx on public.campaign_recipients(owner_id,campaign_id);
create index if not exists campaign_recipients_status_idx on public.campaign_recipients(owner_id,status,next_action_at);
create index if not exists campaign_events_owner_idx on public.campaign_events(owner_id,created_at desc);
alter table public.campaign_variants enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_events enable row level security;
drop policy if exists campaign_variants_all_own on public.campaign_variants;
create policy campaign_variants_all_own on public.campaign_variants for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
drop policy if exists campaign_recipients_all_own on public.campaign_recipients;
create policy campaign_recipients_all_own on public.campaign_recipients for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
drop policy if exists campaign_events_all_own on public.campaign_events;
create policy campaign_events_all_own on public.campaign_events for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
