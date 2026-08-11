-- PROJETO ZAP V5 — WHATSAPP OFICIAL
-- Execute UMA ÚNICA VEZ no mesmo Supabase.

alter table public.campaign_recipients
  add column if not exists meta_message_id text,
  add column if not exists whatsapp_status text,
  add column if not exists whatsapp_error text;

create index if not exists campaign_recipients_meta_message_idx
  on public.campaign_recipients(meta_message_id);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  recipient_id uuid references public.campaign_recipients(id) on delete set null,
  meta_message_id text unique,
  direction text not null check (direction in ('IN','OUT')),
  message_type text not null default 'text',
  body text,
  status text,
  phone text,
  error_text text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_contact_idx
  on public.whatsapp_messages(contact_id,created_at desc);
create index if not exists whatsapp_messages_meta_idx
  on public.whatsapp_messages(meta_message_id);

alter table public.whatsapp_messages enable row level security;

drop policy if exists whatsapp_messages_all_own on public.whatsapp_messages;
create policy whatsapp_messages_all_own
on public.whatsapp_messages
for all to authenticated
using ((select auth.uid())=owner_id)
with check ((select auth.uid())=owner_id);
