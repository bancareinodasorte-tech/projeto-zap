-- PROJETO ZAP V5.7 — RETORNOS + BOT DE PEDIDOS
-- Execute TODO este arquivo UMA VEZ no SQL Editor do Supabase.
-- É incremental: não apaga campanhas, contatos, sessão do WhatsApp nem histórico.

create extension if not exists pgcrypto;

alter table public.pz_campaigns add column if not exists unit_price numeric(12,2) not null default 0;
alter table public.pz_campaigns add column if not exists auto_bot_enabled boolean not null default true;

create table if not exists public.pz_settings (
  id text primary key default 'main',
  bot_enabled boolean not null default true,
  pix_key text not null default '',
  pix_name text not null default 'REINO DA SORTE',
  trigger_keywords jsonb not null default '["quero","comprar","compra","bilhete","bilhetes","pedido","reservar","garantir"]'::jsonb,
  order_prompt text not null default E'Para fazer seu pedido, responda preenchendo:\nNome:\nQuantidade:\nContato:',
  thank_you_message text not null default '🍀 A Reino da Sorte agradece a sua compra. Boa sorte! 🍀',
  updated_at timestamptz not null default now()
);
insert into public.pz_settings(id) values ('main') on conflict (id) do nothing;

create table if not exists public.pz_jid_map (
  phone text primary key,
  lid_jid text unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.pz_orders (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.pz_recipients(id) on delete cascade,
  campaign_id uuid references public.pz_campaigns(id) on delete set null,
  contact_id uuid references public.pz_contacts(id) on delete set null,
  phone text not null,
  name text not null default '',
  quantity integer not null default 0,
  unit_price numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  contact_phone text not null default '',
  status text not null default 'COLETANDO_DADOS',
  operator_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pz_orders_recipient_idx on public.pz_orders(recipient_id,created_at desc);
create index if not exists pz_orders_status_idx on public.pz_orders(status,created_at desc);

-- Evita processar o mesmo evento do WhatsApp duas vezes.
create unique index if not exists pz_messages_meta_unique
on public.pz_messages(meta_message_id)
where meta_message_id is not null;

-- Limpa somente contatos artificiais criados pelo bug antigo de @lid.
delete from public.pz_contacts
where name like 'Cliente %'
  and group_name = 'NOVOS'
  and phone !~ '^55[0-9]{10,11}$';

select 'V5.7 pronta — retornos e bot de pedidos habilitados' as resultado;
