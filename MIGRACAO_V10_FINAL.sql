-- CANAL DE VENDAS RDS — V10 FINAL 10.2.2
-- MIGRAÇÃO CORRIGIDA / IDEMPOTENTE
-- Objetivo: compatibilidade com estruturas antigas sem apagar dados.

create extension if not exists pgcrypto;

-- =========================================================
-- AUTENTICAÇÃO / SESSÃO
-- =========================================================
create table if not exists public.zap_auth(
  id text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.zap_auth add column if not exists value jsonb not null default '{}'::jsonb;
alter table public.zap_auth add column if not exists updated_at timestamptz not null default now();

-- =========================================================
-- GRUPOS
-- =========================================================
create table if not exists public.rds10_groups(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.rds10_groups add column if not exists name text;
alter table public.rds10_groups add column if not exists created_at timestamptz not null default now();

-- Compatibilidade com versões legadas que possuem normalized_name NOT NULL.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rds10_groups' and column_name='normalized_name'
  ) then
    execute 'update public.rds10_groups set normalized_name = upper(trim(coalesce(name,''SEM NOME''))) where normalized_name is null or trim(normalized_name) = ''''';
  end if;
end $$;

-- Cria índice único seguro por nome normalizado sem depender de constraints antigas.
create unique index if not exists rds10_groups_name_uq
on public.rds10_groups ((upper(trim(name))))
where name is not null;

-- Insere grupos padrão sem deixar uma trigger legada quebrar toda a migração.
do $$
declare
  g text;
  has_norm boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rds10_groups' and column_name='normalized_name'
  ) into has_norm;

  foreach g in array array['NOVOS','IMPORTADOS','INTERESSADOS','CLIENTES','COMPRA REALIZADA','VIP','INATIVOS','ENTRADA WHATSAPP']
  loop
    if not exists (select 1 from public.rds10_groups where upper(trim(name)) = upper(trim(g))) then
      begin
        if has_norm then
          execute 'insert into public.rds10_groups(name, normalized_name) values ($1,$2)'
          using g, upper(trim(g));
        else
          insert into public.rds10_groups(name) values (g);
        end if;
      exception
        when undefined_column then
          -- Há trigger/função legada apontando para coluna removida (ex.: "tampa").
          -- Ignora somente o seed do grupo para não interromper toda a migração.
          null;
        when unique_violation then
          null;
      end;
    end if;
  end loop;
end $$;

-- =========================================================
-- CONTATOS
-- =========================================================
create table if not exists public.rds10_contacts(
  id uuid primary key default gen_random_uuid(),
  name text not null default 'SEM NOME',
  phone text,
  lid text,
  group_name text not null default 'NOVOS',
  city text,
  tags text,
  status text not null default 'ATIVO',
  origin text not null default 'MANUAL',
  validated boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rds10_contacts add column if not exists name text not null default 'SEM NOME';
alter table public.rds10_contacts add column if not exists phone text;
alter table public.rds10_contacts add column if not exists lid text;
alter table public.rds10_contacts add column if not exists group_name text not null default 'NOVOS';
alter table public.rds10_contacts add column if not exists city text;
alter table public.rds10_contacts add column if not exists tags text;
alter table public.rds10_contacts add column if not exists status text not null default 'ATIVO';
alter table public.rds10_contacts add column if not exists origin text not null default 'MANUAL';
alter table public.rds10_contacts add column if not exists validated boolean not null default false;
alter table public.rds10_contacts add column if not exists last_seen_at timestamptz;
alter table public.rds10_contacts add column if not exists created_at timestamptz not null default now();
alter table public.rds10_contacts add column if not exists updated_at timestamptz not null default now();
create unique index if not exists rds10_contacts_phone_uq on public.rds10_contacts(phone) where phone is not null;
create index if not exists rds10_contacts_group_idx on public.rds10_contacts(group_name,status);
create index if not exists rds10_contacts_lid_idx on public.rds10_contacts(lid);

-- =========================================================
-- CAMPANHAS
-- =========================================================
create table if not exists public.rds10_campaigns(
  id uuid primary key default gen_random_uuid(),
  code text,
  name text,
  unit_price numeric(12,2) not null default 3.00,
  start_at timestamptz,
  target_mode text not null default 'all',
  target_group text,
  selected_contact_ids jsonb not null default '[]'::jsonb,
  cta_enabled boolean not null default true,
  status text not null default 'RASCUNHO',
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rds10_campaigns add column if not exists code text;
alter table public.rds10_campaigns add column if not exists name text;
alter table public.rds10_campaigns add column if not exists unit_price numeric(12,2) not null default 3.00;
alter table public.rds10_campaigns add column if not exists start_at timestamptz;
alter table public.rds10_campaigns add column if not exists target_mode text not null default 'all';
alter table public.rds10_campaigns add column if not exists target_group text;
alter table public.rds10_campaigns add column if not exists selected_contact_ids jsonb not null default '[]'::jsonb;
alter table public.rds10_campaigns add column if not exists cta_enabled boolean not null default true;
alter table public.rds10_campaigns add column if not exists status text not null default 'RASCUNHO';
alter table public.rds10_campaigns add column if not exists activated_at timestamptz;
alter table public.rds10_campaigns add column if not exists created_at timestamptz not null default now();
alter table public.rds10_campaigns add column if not exists updated_at timestamptz not null default now();
create unique index if not exists rds10_campaigns_code_uq on public.rds10_campaigns(code) where code is not null;

-- =========================================================
-- ETAPAS DA CAMPANHA
-- =========================================================
create table if not exists public.rds10_campaign_steps(
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  step_index integer,
  delay_minutes integer not null default 0,
  message text,
  created_at timestamptz not null default now()
);
alter table public.rds10_campaign_steps add column if not exists campaign_id uuid;
alter table public.rds10_campaign_steps add column if not exists step_index integer;
alter table public.rds10_campaign_steps add column if not exists delay_minutes integer not null default 0;
alter table public.rds10_campaign_steps add column if not exists message text;
alter table public.rds10_campaign_steps add column if not exists created_at timestamptz not null default now();
create unique index if not exists rds10_campaign_steps_uq on public.rds10_campaign_steps(campaign_id,step_index)
where campaign_id is not null and step_index is not null;

-- =========================================================
-- FILA / ENTREGAS
-- =========================================================
create table if not exists public.rds10_deliveries(
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  campaign_code text,
  step_id uuid,
  step_index integer,
  contact_id uuid,
  phone text,
  scheduled_at timestamptz,
  status text not null default 'AGENDADA',
  sent_at timestamptz,
  wa_message_id text,
  error_text text,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rds10_deliveries add column if not exists campaign_id uuid;
alter table public.rds10_deliveries add column if not exists campaign_code text;
alter table public.rds10_deliveries add column if not exists step_id uuid;
alter table public.rds10_deliveries add column if not exists step_index integer;
alter table public.rds10_deliveries add column if not exists contact_id uuid;
alter table public.rds10_deliveries add column if not exists phone text;
alter table public.rds10_deliveries add column if not exists scheduled_at timestamptz;
alter table public.rds10_deliveries add column if not exists status text not null default 'AGENDADA';
alter table public.rds10_deliveries add column if not exists sent_at timestamptz;
alter table public.rds10_deliveries add column if not exists wa_message_id text;
alter table public.rds10_deliveries add column if not exists error_text text;
alter table public.rds10_deliveries add column if not exists cancel_reason text;
alter table public.rds10_deliveries add column if not exists created_at timestamptz not null default now();
alter table public.rds10_deliveries add column if not exists updated_at timestamptz not null default now();
create index if not exists rds10_deliveries_due_idx on public.rds10_deliveries(status,scheduled_at);
create index if not exists rds10_deliveries_phone_idx on public.rds10_deliveries(phone,status);

-- =========================================================
-- MENSAGENS
-- =========================================================
create table if not exists public.rds10_messages(
  id uuid primary key default gen_random_uuid(),
  phone text,
  lid text,
  direction text,
  message_type text not null default 'text',
  body text,
  wa_message_id text,
  status text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.rds10_messages add column if not exists phone text;
alter table public.rds10_messages add column if not exists lid text;
alter table public.rds10_messages add column if not exists direction text;
alter table public.rds10_messages add column if not exists message_type text not null default 'text';
alter table public.rds10_messages add column if not exists body text;
alter table public.rds10_messages add column if not exists wa_message_id text;
alter table public.rds10_messages add column if not exists status text;
alter table public.rds10_messages add column if not exists raw_payload jsonb not null default '{}'::jsonb;
alter table public.rds10_messages add column if not exists created_at timestamptz not null default now();
create unique index if not exists rds10_messages_wa_unique on public.rds10_messages(wa_message_id) where wa_message_id is not null;
create index if not exists rds10_messages_phone_idx on public.rds10_messages(phone,created_at desc);

-- =========================================================
-- CONFIGURAÇÕES
-- =========================================================
create table if not exists public.rds10_settings(
  id integer primary key,
  bot_enabled boolean not null default true,
  router_enabled boolean not null default true,
  office_whatsapp text not null default '5588994943632',
  unit_price numeric(12,2) not null default 3.00,
  pix_key text not null default '',
  pix_name text not null default 'REINO DA SORTE',
  final_message text not null default '✅ COMPRA CONCLUÍDA\nSeus bilhetes foram enviados. 🍀\nA Reino da Sorte agradece sua compra.\nBoa sorte! 🍀',
  updated_at timestamptz not null default now()
);
alter table public.rds10_settings add column if not exists bot_enabled boolean not null default true;
alter table public.rds10_settings add column if not exists router_enabled boolean not null default true;
alter table public.rds10_settings add column if not exists office_whatsapp text not null default '5588994943632';
alter table public.rds10_settings add column if not exists unit_price numeric(12,2) not null default 3.00;
alter table public.rds10_settings add column if not exists pix_key text not null default '';
alter table public.rds10_settings add column if not exists pix_name text not null default 'REINO DA SORTE';
alter table public.rds10_settings add column if not exists final_message text not null default '✅ COMPRA CONCLUÍDA\nSeus bilhetes foram enviados. 🍀\nA Reino da Sorte agradece sua compra.\nBoa sorte! 🍀';
alter table public.rds10_settings add column if not exists updated_at timestamptz not null default now();
insert into public.rds10_settings(id)
select 1 where not exists (select 1 from public.rds10_settings where id=1);

-- =========================================================
-- PEDIDOS
-- =========================================================
create table if not exists public.rds10_orders(
  id uuid primary key default gen_random_uuid(),
  code text,
  phone text,
  campaign_code text,
  customer_name text,
  contact_phone text,
  quantity integer,
  unit_price numeric(12,2) not null default 3.00,
  total_amount numeric(12,2),
  status text not null default 'COLETANDO_DADOS',
  proof_type text,
  proof_received_at timestamptz,
  payment_confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rds10_orders add column if not exists code text;
alter table public.rds10_orders add column if not exists phone text;
alter table public.rds10_orders add column if not exists campaign_code text;
alter table public.rds10_orders add column if not exists customer_name text;
alter table public.rds10_orders add column if not exists contact_phone text;
alter table public.rds10_orders add column if not exists quantity integer;
alter table public.rds10_orders add column if not exists unit_price numeric(12,2) not null default 3.00;
alter table public.rds10_orders add column if not exists total_amount numeric(12,2);
alter table public.rds10_orders add column if not exists status text not null default 'COLETANDO_DADOS';
alter table public.rds10_orders add column if not exists proof_type text;
alter table public.rds10_orders add column if not exists proof_received_at timestamptz;
alter table public.rds10_orders add column if not exists payment_confirmed_at timestamptz;
alter table public.rds10_orders add column if not exists completed_at timestamptz;
alter table public.rds10_orders add column if not exists created_at timestamptz not null default now();
alter table public.rds10_orders add column if not exists updated_at timestamptz not null default now();
create unique index if not exists rds10_orders_code_uq on public.rds10_orders(code) where code is not null;
create index if not exists rds10_orders_phone_idx on public.rds10_orders(phone,status,updated_at desc);

-- =========================================================
-- ALERTAS
-- =========================================================
create table if not exists public.rds10_alerts(
  id uuid primary key default gen_random_uuid(),
  kind text,
  title text,
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.rds10_alerts add column if not exists kind text;
alter table public.rds10_alerts add column if not exists title text;
alter table public.rds10_alerts add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.rds10_alerts add column if not exists is_read boolean not null default false;
alter table public.rds10_alerts add column if not exists created_at timestamptz not null default now();

-- =========================================================
-- EVENTOS
-- =========================================================
create table if not exists public.rds10_events(
  id uuid primary key default gen_random_uuid(),
  kind text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.rds10_events add column if not exists kind text;
alter table public.rds10_events add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.rds10_events add column if not exists created_at timestamptz not null default now();

select 'CANAL DE VENDAS RDS V10 FINAL 10.2.2 - MIGRACAO OK' as resultado;
