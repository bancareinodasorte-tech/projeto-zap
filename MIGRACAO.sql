-- CANAL DE VENDAS RDS V6.0
-- Estrutura NOVA e independente das tabelas pz_* antigas.
-- Não apaga dados anteriores. Pode ser executada novamente com segurança.
create extension if not exists pgcrypto;

create table if not exists public.zap_auth (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.rds_settings (
  id text primary key default 'main',
  bot_enabled boolean not null default true,
  pix_key text not null default '',
  pix_name text not null default 'REINO DA SORTE',
  office_whatsapp text not null default '',
  ticket_price numeric(12,2) not null default 3.00,
  order_prompt text not null default E'🍀 Vamos montar seu pedido.\n\nPreencha abaixo 👇\nNome:\nQuantidade:\nContato:',
  final_message text not null default '🍀 A Reino da Sorte agradece a sua compra. Boa sorte! 🍀',
  unknown_reply text not null default E'Olá! Este é o CANAL DE VENDAS RDS.\n\n🛒 Para comprar, responda: QUERO COMPRAR\n🏢 Para falar com o escritório, use o link abaixo.',
  proof_received_message text not null default '✅ Comprovante recebido. Seu pagamento está aguardando conferência do operador.',
  updated_at timestamptz not null default now()
);
insert into public.rds_settings(id) values('main') on conflict(id) do nothing;

create table if not exists public.rds_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  group_name text not null default 'NOVOS',
  status text not null default 'ATIVO',
  notes text not null default '',
  source text not null default 'MANUAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rds_contacts_group_idx on public.rds_contacts(group_name,status);

create table if not exists public.rds_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit_price numeric(12,2) not null default 3.00,
  start_at timestamptz not null,
  target_mode text not null default 'all',
  target_group text,
  status text not null default 'RASCUNHO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rds_campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.rds_campaigns(id) on delete cascade,
  step_index integer not null,
  delay_minutes integer not null default 0,
  message text not null,
  image_data_url text,
  image_name text,
  cta_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(campaign_id,step_index)
);

create table if not exists public.rds_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.rds_campaigns(id) on delete cascade,
  contact_id uuid references public.rds_contacts(id) on delete set null,
  phone text not null,
  recipient_status text not null default 'ATIVO',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,phone)
);

create table if not exists public.rds_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.rds_campaigns(id) on delete cascade,
  recipient_id uuid not null references public.rds_campaign_recipients(id) on delete cascade,
  contact_id uuid references public.rds_contacts(id) on delete set null,
  phone text not null,
  step_id uuid not null references public.rds_campaign_steps(id) on delete cascade,
  step_index integer not null,
  scheduled_at timestamptz not null,
  status text not null default 'AGENDADA',
  sent_at timestamptz,
  wa_message_id text,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(recipient_id,step_index)
);
create index if not exists rds_deliveries_due_idx on public.rds_deliveries(status,scheduled_at);

create table if not exists public.rds_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.rds_contacts(id) on delete set null,
  campaign_id uuid references public.rds_campaigns(id) on delete set null,
  recipient_id uuid references public.rds_campaign_recipients(id) on delete set null,
  order_id uuid,
  phone text not null,
  wa_message_id text,
  direction text not null,
  message_type text not null default 'text',
  body text,
  mime_type text,
  file_name text,
  created_at timestamptz not null default now()
);
create unique index if not exists rds_messages_wa_unique on public.rds_messages(wa_message_id) where wa_message_id is not null;

create table if not exists public.rds_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  campaign_id uuid references public.rds_campaigns(id) on delete set null,
  recipient_id uuid references public.rds_campaign_recipients(id) on delete set null,
  contact_id uuid references public.rds_contacts(id) on delete set null,
  phone text not null,
  customer_name text,
  contact_phone text,
  quantity integer,
  unit_price numeric(12,2) not null default 3.00,
  total_amount numeric(12,2),
  status text not null default 'COLETANDO_DADOS',
  proof_type text,
  proof_received_at timestamptz,
  payment_confirmed_at timestamptz,
  tickets_sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rds_orders_status_idx on public.rds_orders(status,updated_at desc);

create table if not exists public.rds_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  phone text,
  campaign_id uuid,
  order_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

select 'CANAL DE VENDAS RDS V6.0 - MIGRACAO APLICADA COM SUCESSO' as resultado;
