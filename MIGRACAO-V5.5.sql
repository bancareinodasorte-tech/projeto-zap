-- PROJETO ZAP V5.5
-- Execute uma única vez no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.zap_auth (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text not null unique,
  status text not null default 'NOVO',
  consent boolean not null default true,
  opt_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.contacts add column if not exists consent boolean not null default true;
alter table public.contacts add column if not exists opt_out boolean not null default false;
alter table public.contacts add column if not exists status text not null default 'NOVO';
alter table public.contacts add column if not exists updated_at timestamptz not null default now();

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  messages jsonb not null default '[]'::jsonb,
  image_url text,
  image_name text,
  interval_min integer not null default 6,
  interval_max integer not null default 12,
  schedule_at timestamptz,
  status text not null default 'PRONTA',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.campaigns add column if not exists messages jsonb not null default '[]'::jsonb;
alter table public.campaigns add column if not exists image_url text;
alter table public.campaigns add column if not exists image_name text;
alter table public.campaigns add column if not exists interval_min integer not null default 6;
alter table public.campaigns add column if not exists interval_max integer not null default 12;
alter table public.campaigns add column if not exists schedule_at timestamptz;
alter table public.campaigns add column if not exists status text not null default 'PRONTA';
alter table public.campaigns add column if not exists started_at timestamptz;
alter table public.campaigns add column if not exists finished_at timestamptz;
alter table public.campaigns add column if not exists updated_at timestamptz not null default now();

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  phone text not null,
  name text,
  status text not null default 'PENDENTE',
  selected_message integer not null default 0,
  meta_message_id text,
  sent_at timestamptz,
  responded_at timestamptz,
  possible_payment_at timestamptz,
  purchase_at timestamptz,
  last_inbound_preview text,
  last_inbound_type text,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.campaign_recipients add column if not exists selected_message integer not null default 0;
alter table public.campaign_recipients add column if not exists meta_message_id text;
alter table public.campaign_recipients add column if not exists sent_at timestamptz;
alter table public.campaign_recipients add column if not exists responded_at timestamptz;
alter table public.campaign_recipients add column if not exists possible_payment_at timestamptz;
alter table public.campaign_recipients add column if not exists purchase_at timestamptz;
alter table public.campaign_recipients add column if not exists last_inbound_preview text;
alter table public.campaign_recipients add column if not exists last_inbound_type text;
alter table public.campaign_recipients add column if not exists error_text text;
alter table public.campaign_recipients add column if not exists updated_at timestamptz not null default now();

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  recipient_id uuid references public.campaign_recipients(id) on delete set null,
  meta_message_id text,
  direction text not null,
  message_type text not null default 'text',
  body text,
  status text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_phone on public.contacts(phone);
create index if not exists idx_recipient_phone on public.campaign_recipients(phone);
create index if not exists idx_recipient_status on public.campaign_recipients(status);
create index if not exists idx_recipient_campaign on public.campaign_recipients(campaign_id);
create index if not exists idx_messages_phone on public.whatsapp_messages(phone);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('campaign-media','campaign-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
