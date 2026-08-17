-- Projeto Zap V5.8 — migração corrigida, única e idempotente
-- Compatível com bancos vindos das versões V5.5/V5.6/V5.7.

create extension if not exists pgcrypto;

-- =========================================================
-- 1) TABELAS BASE
-- =========================================================
create table if not exists public.zap_auth (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.pz_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  name text,
  phone text,
  group_name text default 'NOVOS',
  status text default 'ATIVO',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.pz_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  name text,
  unit_price numeric(12,2) default 3.00,
  start_at timestamptz,
  target_mode text default 'all',
  target_group text,
  selected_contact_ids jsonb default '[]'::jsonb,
  status text default 'RASCUNHO',
  activated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.pz_campaign_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  campaign_id uuid,
  step_index integer,
  delay_minutes integer default 0,
  message text,
  image_data_url text,
  image_name text,
  created_at timestamptz default now()
);

create table if not exists public.pz_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  campaign_id uuid,
  contact_id uuid,
  phone text,
  recipient_status text default 'ATIVO',
  last_step_index integer default 0,
  last_sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.pz_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  campaign_id uuid,
  recipient_id uuid,
  contact_id uuid,
  step_id uuid,
  step_index integer,
  scheduled_at timestamptz,
  status text default 'AGENDADA',
  sent_at timestamptz,
  wa_message_id text,
  error_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.pz_campaign_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  recipient_id uuid,
  campaign_id uuid,
  contact_id uuid,
  event_type text,
  event_source text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.pz_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  contact_id uuid,
  campaign_id uuid,
  recipient_id uuid,
  wa_message_id text,
  direction text,
  message_type text default 'text',
  body text,
  mime_type text,
  file_name text,
  status text,
  phone text,
  raw_payload jsonb,
  created_at timestamptz default now()
);

create table if not exists public.pz_settings (
  owner_id uuid primary key,
  bot_enabled boolean default false,
  pix_key text,
  pix_name text,
  trigger_words text default 'quero,comprar,compra,bilhete',
  order_prompt text default E'Para fazer seu pedido, responda preenchendo:\nNome:\nQuantidade:\nContato:',
  final_message text default '🍀 A Reino da Sorte agradece a sua compra. Boa sorte! 🍀',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.pz_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  campaign_id uuid,
  recipient_id uuid,
  contact_id uuid,
  phone text,
  customer_name text,
  contact_phone text,
  quantity integer,
  unit_price numeric(12,2),
  total_amount numeric(12,2),
  status text default 'COLETA_PEDIDO',
  proof_type text,
  proof_received_at timestamptz,
  payment_confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =========================================================
-- 2) COMPATIBILIDADE COM VERSÕES ANTERIORES
-- CREATE TABLE IF NOT EXISTS não acrescenta colunas ausentes.
-- Por isso TODAS as colunas usadas por índices/backend são garantidas aqui
-- ANTES da criação de qualquer índice.
-- =========================================================

-- pz_contacts
alter table public.pz_contacts add column if not exists owner_id uuid;
alter table public.pz_contacts add column if not exists name text;
alter table public.pz_contacts add column if not exists phone text;
alter table public.pz_contacts add column if not exists group_name text default 'NOVOS';
alter table public.pz_contacts add column if not exists status text default 'ATIVO';
alter table public.pz_contacts add column if not exists notes text;
alter table public.pz_contacts add column if not exists created_at timestamptz default now();
alter table public.pz_contacts add column if not exists updated_at timestamptz default now();

-- pz_campaigns
alter table public.pz_campaigns add column if not exists owner_id uuid;
alter table public.pz_campaigns add column if not exists name text;
alter table public.pz_campaigns add column if not exists unit_price numeric(12,2) default 3.00;
alter table public.pz_campaigns add column if not exists start_at timestamptz;
alter table public.pz_campaigns add column if not exists target_mode text default 'all';
alter table public.pz_campaigns add column if not exists target_group text;
alter table public.pz_campaigns add column if not exists selected_contact_ids jsonb default '[]'::jsonb;
alter table public.pz_campaigns add column if not exists status text default 'RASCUNHO';
alter table public.pz_campaigns add column if not exists activated_at timestamptz;
alter table public.pz_campaigns add column if not exists created_at timestamptz default now();
alter table public.pz_campaigns add column if not exists updated_at timestamptz default now();

-- pz_campaign_steps
alter table public.pz_campaign_steps add column if not exists owner_id uuid;
alter table public.pz_campaign_steps add column if not exists campaign_id uuid;
alter table public.pz_campaign_steps add column if not exists step_index integer;
alter table public.pz_campaign_steps add column if not exists delay_minutes integer default 0;
alter table public.pz_campaign_steps add column if not exists message text;
alter table public.pz_campaign_steps add column if not exists image_data_url text;
alter table public.pz_campaign_steps add column if not exists image_name text;
alter table public.pz_campaign_steps add column if not exists created_at timestamptz default now();

-- pz_campaign_recipients
alter table public.pz_campaign_recipients add column if not exists owner_id uuid;
alter table public.pz_campaign_recipients add column if not exists campaign_id uuid;
alter table public.pz_campaign_recipients add column if not exists contact_id uuid;
alter table public.pz_campaign_recipients add column if not exists phone text;
alter table public.pz_campaign_recipients add column if not exists recipient_status text default 'ATIVO';
alter table public.pz_campaign_recipients add column if not exists last_step_index integer default 0;
alter table public.pz_campaign_recipients add column if not exists last_sent_at timestamptz;
alter table public.pz_campaign_recipients add column if not exists responded_at timestamptz;
alter table public.pz_campaign_recipients add column if not exists created_at timestamptz default now();
alter table public.pz_campaign_recipients add column if not exists updated_at timestamptz default now();

-- pz_campaign_deliveries
alter table public.pz_campaign_deliveries add column if not exists owner_id uuid;
alter table public.pz_campaign_deliveries add column if not exists campaign_id uuid;
alter table public.pz_campaign_deliveries add column if not exists recipient_id uuid;
alter table public.pz_campaign_deliveries add column if not exists contact_id uuid;
alter table public.pz_campaign_deliveries add column if not exists step_id uuid;
alter table public.pz_campaign_deliveries add column if not exists step_index integer;
alter table public.pz_campaign_deliveries add column if not exists scheduled_at timestamptz;
alter table public.pz_campaign_deliveries add column if not exists status text default 'AGENDADA';
alter table public.pz_campaign_deliveries add column if not exists sent_at timestamptz;
alter table public.pz_campaign_deliveries add column if not exists wa_message_id text;
alter table public.pz_campaign_deliveries add column if not exists error_text text;
alter table public.pz_campaign_deliveries add column if not exists created_at timestamptz default now();
alter table public.pz_campaign_deliveries add column if not exists updated_at timestamptz default now();

-- pz_campaign_events
alter table public.pz_campaign_events add column if not exists owner_id uuid;
alter table public.pz_campaign_events add column if not exists recipient_id uuid;
alter table public.pz_campaign_events add column if not exists campaign_id uuid;
alter table public.pz_campaign_events add column if not exists contact_id uuid;
alter table public.pz_campaign_events add column if not exists event_type text;
alter table public.pz_campaign_events add column if not exists event_source text;
alter table public.pz_campaign_events add column if not exists payload jsonb default '{}'::jsonb;
alter table public.pz_campaign_events add column if not exists created_at timestamptz default now();

-- pz_whatsapp_messages
alter table public.pz_whatsapp_messages add column if not exists owner_id uuid;
alter table public.pz_whatsapp_messages add column if not exists contact_id uuid;
alter table public.pz_whatsapp_messages add column if not exists campaign_id uuid;
alter table public.pz_whatsapp_messages add column if not exists recipient_id uuid;
alter table public.pz_whatsapp_messages add column if not exists wa_message_id text;
alter table public.pz_whatsapp_messages add column if not exists direction text;
alter table public.pz_whatsapp_messages add column if not exists message_type text default 'text';
alter table public.pz_whatsapp_messages add column if not exists body text;
alter table public.pz_whatsapp_messages add column if not exists mime_type text;
alter table public.pz_whatsapp_messages add column if not exists file_name text;
alter table public.pz_whatsapp_messages add column if not exists status text;
alter table public.pz_whatsapp_messages add column if not exists phone text;
alter table public.pz_whatsapp_messages add column if not exists raw_payload jsonb;
alter table public.pz_whatsapp_messages add column if not exists created_at timestamptz default now();

-- pz_settings (tabela antiga pode existir com apenas algumas colunas)
alter table public.pz_settings add column if not exists bot_enabled boolean default false;
alter table public.pz_settings add column if not exists pix_key text;
alter table public.pz_settings add column if not exists pix_name text;
alter table public.pz_settings add column if not exists trigger_words text default 'quero,comprar,compra,bilhete';
alter table public.pz_settings add column if not exists order_prompt text default E'Para fazer seu pedido, responda preenchendo:\nNome:\nQuantidade:\nContato:';
alter table public.pz_settings add column if not exists final_message text default '🍀 A Reino da Sorte agradece a sua compra. Boa sorte! 🍀';
alter table public.pz_settings add column if not exists created_at timestamptz default now();
alter table public.pz_settings add column if not exists updated_at timestamptz default now();

-- pz_orders
alter table public.pz_orders add column if not exists owner_id uuid;
alter table public.pz_orders add column if not exists campaign_id uuid;
alter table public.pz_orders add column if not exists recipient_id uuid;
alter table public.pz_orders add column if not exists contact_id uuid;
alter table public.pz_orders add column if not exists phone text;
alter table public.pz_orders add column if not exists customer_name text;
alter table public.pz_orders add column if not exists contact_phone text;
alter table public.pz_orders add column if not exists quantity integer;
alter table public.pz_orders add column if not exists unit_price numeric(12,2);
alter table public.pz_orders add column if not exists total_amount numeric(12,2);
alter table public.pz_orders add column if not exists status text default 'COLETA_PEDIDO';
alter table public.pz_orders add column if not exists proof_type text;
alter table public.pz_orders add column if not exists proof_received_at timestamptz;
alter table public.pz_orders add column if not exists payment_confirmed_at timestamptz;
alter table public.pz_orders add column if not exists completed_at timestamptz;
alter table public.pz_orders add column if not exists created_at timestamptz default now();
alter table public.pz_orders add column if not exists updated_at timestamptz default now();

-- =========================================================
-- 3) ÍNDICES — somente depois das colunas de compatibilidade
-- =========================================================
create index if not exists pz_contacts_owner_idx
  on public.pz_contacts(owner_id, group_name, status);

create index if not exists pz_campaigns_owner_idx
  on public.pz_campaigns(owner_id, status, start_at);

create index if not exists pz_recipients_owner_idx
  on public.pz_campaign_recipients(owner_id, recipient_status, updated_at desc);

create index if not exists pz_deliveries_due_idx
  on public.pz_campaign_deliveries(status, scheduled_at);

create unique index if not exists pz_whatsapp_messages_wa_unique
  on public.pz_whatsapp_messages(wa_message_id)
  where wa_message_id is not null;

create index if not exists pz_orders_owner_idx
  on public.pz_orders(owner_id, status, created_at desc);

-- Índices únicos funcionais sem forçar NOT NULL em dados antigos.
create unique index if not exists pz_contacts_owner_phone_unique
  on public.pz_contacts(owner_id, phone)
  where owner_id is not null and phone is not null;

create unique index if not exists pz_campaign_steps_campaign_step_unique
  on public.pz_campaign_steps(campaign_id, step_index)
  where campaign_id is not null and step_index is not null;

create unique index if not exists pz_campaign_recipients_campaign_contact_unique
  on public.pz_campaign_recipients(campaign_id, contact_id)
  where campaign_id is not null and contact_id is not null;

create unique index if not exists pz_campaign_deliveries_recipient_step_unique
  on public.pz_campaign_deliveries(recipient_id, step_index)
  where recipient_id is not null and step_index is not null;

-- =========================================================
-- 4) RLS
-- =========================================================
alter table public.pz_contacts enable row level security;
alter table public.pz_campaigns enable row level security;
alter table public.pz_campaign_steps enable row level security;
alter table public.pz_campaign_recipients enable row level security;
alter table public.pz_campaign_deliveries enable row level security;
alter table public.pz_campaign_events enable row level security;
alter table public.pz_whatsapp_messages enable row level security;
alter table public.pz_settings enable row level security;
alter table public.pz_orders enable row level security;
alter table public.zap_auth enable row level security;

select 'PROJETO ZAP V5.8 - MIGRACAO CORRIGIDA APLICADA COM SUCESSO' as resultado;
