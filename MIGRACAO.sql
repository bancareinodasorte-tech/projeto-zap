-- CANAL DE VENDAS RDS V6.2.1
-- CORREÇÃO DE COMPATIBILIDADE COM BANCO JÁ EXISTENTE.
-- Esta versão NÃO presume que pz_settings.id seja TEXT.
-- Pode ser executada sobre V5.x / V6.0 / V6.1 / tentativa da V6.2.

create extension if not exists pgcrypto;

create table if not exists public.zap_auth (
  id text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pz_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique(normalized_name)
);

insert into public.pz_groups(name,normalized_name,is_system) values
('NOVOS','NOVOS',true),
('INTERESSADOS','INTERESSADOS',true),
('CLIENTES','CLIENTES',true),
('COMPRA REALIZADA','COMPRA REALIZADA',true),
('VIP','VIP',true),
('INATIVOS','INATIVOS',true),
('ENTRADA WHATSAPP','ENTRADA WHATSAPP',true)
on conflict(normalized_name) do nothing;

create table if not exists public.pz_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'SEM NOME',
  phone text not null,
  group_name text not null default 'NOVOS',
  city text,
  tags text,
  status text not null default 'ATIVO',
  origin text not null default 'MANUAL',
  notes text not null default '',
  whatsapp_validated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pz_contacts add column if not exists city text;
alter table public.pz_contacts add column if not exists tags text;
alter table public.pz_contacts add column if not exists origin text default 'MANUAL';
alter table public.pz_contacts add column if not exists whatsapp_validated boolean default false;
alter table public.pz_contacts alter column notes set default '';
update public.pz_contacts set notes='' where notes is null;
create unique index if not exists pz_contacts_phone_unique on public.pz_contacts(phone);
create index if not exists pz_contacts_group_idx on public.pz_contacts(group_name,status);

create table if not exists public.pz_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit_price numeric(12,2) not null default 3.00,
  start_at timestamptz not null,
  target_mode text not null default 'all',
  target_group text,
  selected_contact_ids jsonb not null default '[]'::jsonb,
  status text not null default 'RASCUNHO',
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.pz_campaigns add column if not exists selected_contact_ids jsonb default '[]'::jsonb;
alter table public.pz_campaigns add column if not exists finished_at timestamptz;
create index if not exists pz_campaigns_status_idx on public.pz_campaigns(status,start_at);

create table if not exists public.pz_campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.pz_campaigns(id) on delete cascade,
  step_index integer not null,
  delay_minutes integer not null default 0,
  message text not null,
  image_data_url text,
  image_name text,
  cta_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(campaign_id,step_index)
);
alter table public.pz_campaign_steps add column if not exists cta_enabled boolean default true;

create table if not exists public.pz_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.pz_campaigns(id) on delete cascade,
  contact_id uuid not null references public.pz_contacts(id) on delete cascade,
  step_id uuid not null references public.pz_campaign_steps(id) on delete cascade,
  step_index integer not null,
  phone text not null,
  scheduled_at timestamptz not null,
  status text not null default 'AGENDADA',
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  wa_message_id text,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,contact_id,step_index)
);
alter table public.pz_campaign_deliveries add column if not exists delivered_at timestamptz;
alter table public.pz_campaign_deliveries add column if not exists read_at timestamptz;
create index if not exists pz_deliveries_due_idx on public.pz_campaign_deliveries(status,scheduled_at);

create table if not exists public.pz_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  direction text not null,
  message_type text not null default 'text',
  body text,
  wa_message_id text,
  status text,
  raw_payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists pz_whatsapp_message_id_unique on public.pz_whatsapp_messages(wa_message_id) where wa_message_id is not null;
create index if not exists pz_whatsapp_messages_phone_idx on public.pz_whatsapp_messages(phone,created_at desc);

-- Compatibilidade: em instalações antigas, id pode ser bigint.
create table if not exists public.pz_settings (
  id bigserial primary key,
  bot_enabled boolean not null default true,
  pix_key text not null default '',
  pix_name text not null default '',
  trigger_keywords jsonb not null default '["quero","comprar","compra","bilhete","bilhetes","pedido","reservar","garantir"]'::jsonb,
  order_prompt text not null default E'Para fazer seu pedido, responda preenchendo:\nNome:\nQuantidade:\nContato:',
  thank_you_message text not null default '🍀 A Reino da Sorte agradece a sua compra. Boa sorte! 🍀',
  updated_at timestamptz not null default now()
);

alter table public.pz_settings add column if not exists setting_key text;
alter table public.pz_settings add column if not exists office_whatsapp text default '';
alter table public.pz_settings add column if not exists default_unit_price numeric(12,2) default 3.00;
alter table public.pz_settings add column if not exists trigger_words text default 'quero comprar,quero,comprar,compra,bilhete,bilhetes,preço,valor,premiação,premio,reservar';
alter table public.pz_settings add column if not exists final_message text default '🍀 A Reino da Sorte agradece a sua compra. Boa sorte! 🍀';
alter table public.pz_settings add column if not exists fallback_message text default E'Olá! CANAL EXCLUSIVO DE VENDAS RDS.\n\n🛒 Para comprar, responda: QUERO COMPRAR\n🏢 Para falar com o escritório, use o link abaixo.';
alter table public.pz_settings add column if not exists saved_at timestamptz default now();
alter table public.pz_settings add column if not exists bot_enabled boolean default true;
alter table public.pz_settings add column if not exists pix_key text default '';
alter table public.pz_settings add column if not exists pix_name text default '';
alter table public.pz_settings add column if not exists order_prompt text default E'🍀 Vamos montar seu pedido.\n\nPreencha abaixo 👇\nNome:\nQuantidade:\nContato:';

-- Marca a primeira configuração existente como "main" sem tocar no tipo da coluna id.
update public.pz_settings
set setting_key='main'
where id=(select id from public.pz_settings order by id limit 1)
  and (setting_key is null or setting_key='');

-- Se a tabela estiver vazia, cria a linha principal sem inserir texto na coluna id.
insert into public.pz_settings(setting_key)
select 'main'
where not exists (select 1 from public.pz_settings where setting_key='main');

create unique index if not exists pz_settings_setting_key_unique on public.pz_settings(setting_key) where setting_key is not null;

-- Copia valores legados para os novos campos quando existirem.
do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='pz_settings' and column_name='thank_you_message') then
    execute 'update public.pz_settings set final_message=coalesce(nullif(final_message,'''') , thank_you_message) where setting_key=''main''';
  end if;
end $$;

create table if not exists public.pz_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  contact_id uuid references public.pz_contacts(id) on delete set null,
  campaign_id uuid references public.pz_campaigns(id) on delete set null,
  phone text not null,
  customer_name text,
  contact_phone text,
  quantity integer,
  unit_price numeric(12,2),
  total_amount numeric(12,2),
  status text not null default 'COLETANDO_DADOS',
  proof_type text,
  proof_received_at timestamptz,
  payment_confirmed_at timestamptz,
  completed_at timestamptz,
  last_inbound_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pz_orders add column if not exists code text;
alter table public.pz_orders add column if not exists last_inbound_text text;
create unique index if not exists pz_orders_code_unique on public.pz_orders(code) where code is not null;
create index if not exists pz_orders_phone_idx on public.pz_orders(phone,status,updated_at desc);

create table if not exists public.pz_alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text not null,
  phone text,
  order_id uuid references public.pz_orders(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pz_alerts_unread_idx on public.pz_alerts(is_read,created_at desc);

select 'CANAL DE VENDAS RDS V6.2.1 - MIGRAÇÃO CORRIGIDA APLICADA COM SUCESSO' as resultado;
