-- CANAL DE VENDAS RDS V10 FINAL
-- Banco independente das tabelas V5/V6 para eliminar conflitos de schema antigos.
-- Pode ser executado mais de uma vez.
create extension if not exists pgcrypto;

create table if not exists public.zap_auth(
  id text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.rds10_groups(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
insert into public.rds10_groups(name,normalized_name,is_system) values
('NOVOS','NOVOS',true),('INTERESSADOS','INTERESSADOS',true),('CLIENTES','CLIENTES',true),
('VIP','VIP',true),('COMPRA REALIZADA','COMPRA REALIZADA',true),('INATIVOS','INATIVOS',true),
('ENTRADA WHATSAPP','ENTRADA WHATSAPP',true),('NÃO QUER RECEBER','NÃO QUER RECEBER',true)
on conflict(normalized_name) do nothing;

create table if not exists public.rds10_contacts(
  id uuid primary key default gen_random_uuid(),
  name text not null default 'SEM NOME',
  phone text not null unique,
  group_name text not null default 'NOVOS',
  city text,
  tags text,
  status text not null default 'ATIVO',
  origin text not null default 'MANUAL',
  notes text not null default '',
  whatsapp_validated boolean not null default false,
  opted_out boolean not null default false,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rds10_contacts_group_idx on public.rds10_contacts(group_name,status);
create index if not exists rds10_contacts_last_idx on public.rds10_contacts(last_interaction_at desc);

create table if not exists public.rds10_campaigns(
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,
  name text not null,
  unit_price numeric(12,2) not null default 3.00,
  start_at timestamptz not null,
  target_mode text not null default 'all',
  target_group text,
  selected_contact_ids jsonb not null default '[]'::jsonb,
  status text not null default 'RASCUNHO',
  stop_on_reply boolean not null default true,
  stop_on_order boolean not null default true,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists rds10_campaigns_status_idx on public.rds10_campaigns(status,start_at);

create table if not exists public.rds10_campaign_steps(
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.rds10_campaigns(id) on delete cascade,
  step_index integer not null,
  delay_minutes integer not null default 0,
  message text not null,
  image_data_url text,
  image_name text,
  cta_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(campaign_id,step_index)
);

create table if not exists public.rds10_deliveries(
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.rds10_campaigns(id) on delete cascade,
  contact_id uuid not null references public.rds10_contacts(id) on delete cascade,
  step_id uuid not null references public.rds10_campaign_steps(id) on delete cascade,
  step_index integer not null,
  phone text not null,
  scheduled_at timestamptz not null,
  status text not null default 'AGENDADA',
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  wa_message_id text,
  error_text text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,contact_id,step_index)
);
create index if not exists rds10_deliveries_due_idx on public.rds10_deliveries(status,scheduled_at);
create index if not exists rds10_deliveries_wa_idx on public.rds10_deliveries(wa_message_id);

create table if not exists public.rds10_messages(
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  direction text not null,
  message_type text not null default 'text',
  body text,
  wa_message_id text,
  status text,
  campaign_id uuid references public.rds10_campaigns(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists rds10_messages_wa_unique on public.rds10_messages(wa_message_id) where wa_message_id is not null;
create index if not exists rds10_messages_phone_idx on public.rds10_messages(phone,created_at desc);

create table if not exists public.rds10_settings(
  id smallint primary key default 1 check(id=1),
  bot_enabled boolean not null default true,
  pix_key text not null default '',
  pix_name text not null default '',
  office_whatsapp text not null default '',
  default_unit_price numeric(12,2) not null default 3.00,
  trigger_words text not null default 'quero comprar,quero,comprar,compra,bilhete,bilhetes,preço,valor,premiação,premio,reservar,me dê,me de,quero 1,quero 2,quero 3',
  handoff_words text not null default 'atendente,escritório,escritorio,falar com alguém,falar com alguem,humano',
  optout_words text not null default 'sair,parar,cancelar mensagens,não quero receber,nao quero receber,remover meu número,remover meu numero',
  order_prompt text not null default E'🍀 *Vamos montar seu pedido!*

Responda com a quantidade desejada. Exemplo: *QUERO 3* 🎟️',
  payment_message text not null default E'✅ Pedido confirmado.

💳 Faça o PIX e envie o comprovante aqui nesta conversa.',
  proof_received_message text not null default E'✅ *Comprovante recebido!*
Seu pagamento entrou na fila de conferência. Assim que o operador confirmar, você receberá seus bilhetes por aqui.',
  final_message text not null default '🍀 A Reino da Sorte agradece a sua compra. Boa sorte! 🍀',
  fallback_message text not null default E'Olá! 👋 Este é o *CANAL DE VENDAS RDS*.

🛒 Para comprar, responda *QUERO COMPRAR*.
🏢 Para falar com o escritório, responda *ATENDENTE*.',
  fallback_cooldown_minutes integer not null default 3,
  timezone text not null default 'America/Fortaleza',
  saved_at timestamptz not null default now()
);
insert into public.rds10_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.rds10_orders(
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  contact_id uuid references public.rds10_contacts(id) on delete set null,
  campaign_id uuid references public.rds10_campaigns(id) on delete set null,
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
create index if not exists rds10_orders_phone_idx on public.rds10_orders(phone,status,updated_at desc);

create table if not exists public.rds10_alerts(
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text not null,
  phone text,
  order_id uuid references public.rds10_orders(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists rds10_alerts_unread_idx on public.rds10_alerts(is_read,created_at desc);

create table if not exists public.rds10_events(
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  campaign_id uuid references public.rds10_campaigns(id) on delete set null,
  contact_id uuid references public.rds10_contacts(id) on delete set null,
  order_id uuid references public.rds10_orders(id) on delete set null,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rds10_events_type_idx on public.rds10_events(event_type,created_at desc);

-- Importação segura de contatos legados: usa apenas NAME e PHONE, presentes nas versões anteriores.
do $$
begin
  if to_regclass('public.pz_contacts') is not null then
    begin
      execute $q$
        insert into public.rds10_contacts(name,phone,group_name,origin,notes)
        select
          coalesce(nullif(trim(name),''),'SEM NOME'),
          regexp_replace(phone,'\D','','g'),
          'NOVOS',
          'LEGADO V6',
          'Importado automaticamente pela migração V10'
        from public.pz_contacts
        where phone is not null and regexp_replace(phone,'\D','','g') <> ''
        on conflict(phone) do update set
          name = case when public.rds10_contacts.name='SEM NOME' then excluded.name else public.rds10_contacts.name end,
          updated_at=now()
      $q$;
    exception when others then
      raise notice 'Contatos legados não importados automaticamente: %', SQLERRM;
    end;
  end if;
end $$;

select 'CANAL DE VENDAS RDS V10 FINAL - BANCO INSTALADO COM SUCESSO' as resultado;
