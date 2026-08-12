-- PROJETO ZAP V5.6 — CONSOLIDAÇÃO ESTÁVEL
-- Execute TODO este arquivo no SQL Editor do Supabase.
-- Não apaga as tabelas antigas. A V5.6 passa a usar tabelas pz_* isoladas.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.zap_auth (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.pz_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text not null unique,
  city text not null default '',
  group_name text not null default 'GERAL',
  status text not null default 'ATIVO',
  opt_in boolean not null default true,
  opt_out boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pz_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  messages jsonb not null default '[]'::jsonb,
  image_url text,
  image_name text,
  interval_min integer not null default 6,
  interval_max integer not null default 12,
  schedule_at timestamptz,
  retry_enabled boolean not null default false,
  retry_hours integer not null default 24,
  max_attempts integer not null default 1,
  status text not null default 'RASCUNHO',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pz_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.pz_campaigns(id) on delete cascade,
  contact_id uuid references public.pz_contacts(id) on delete set null,
  phone text not null,
  name text not null default '',
  status text not null default 'PENDENTE',
  selected_message integer not null default 0,
  attempt_count integer not null default 0,
  max_attempts integer not null default 1,
  next_action_at timestamptz,
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

create table if not exists public.pz_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  contact_id uuid references public.pz_contacts(id) on delete set null,
  campaign_id uuid references public.pz_campaigns(id) on delete set null,
  recipient_id uuid references public.pz_recipients(id) on delete set null,
  meta_message_id text,
  direction text not null,
  message_type text not null default 'text',
  body text,
  status text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pz_purchases (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.pz_contacts(id) on delete set null,
  campaign_id uuid references public.pz_campaigns(id) on delete set null,
  recipient_id uuid references public.pz_recipients(id) on delete set null,
  phone text not null,
  name text not null default '',
  source text not null default 'MANUAL',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists pz_contacts_phone_idx on public.pz_contacts(phone);
create index if not exists pz_contacts_group_idx on public.pz_contacts(group_name);
create index if not exists pz_campaigns_status_idx on public.pz_campaigns(status,schedule_at);
create index if not exists pz_recipients_due_idx on public.pz_recipients(status,next_action_at);
create index if not exists pz_recipients_campaign_idx on public.pz_recipients(campaign_id);
create index if not exists pz_recipients_phone_idx on public.pz_recipients(phone);
create index if not exists pz_messages_phone_idx on public.pz_messages(phone,created_at desc);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('projeto-zap-campanhas','projeto-zap-campanhas',true,6291456,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=6291456,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

-- Importa contatos antigos uma única vez quando houver uma tabela public.contacts.
do $$
begin
  if to_regclass('public.contacts') is not null then
    execute $q$
      insert into public.pz_contacts(name,phone,city,group_name,status,opt_in,opt_out,notes,created_at)
      select
        coalesce(nullif(name,''),'Contato'),
        regexp_replace(coalesce(phone,''),'\D','','g'),
        coalesce(city,''),
        coalesce(nullif(group_name,''),'GERAL'),
        coalesce(nullif(status,''),'ATIVO'),
        coalesce(opt_in,true),
        false,
        coalesce(notes,''),
        coalesce(created_at,now())
      from public.contacts
      where regexp_replace(coalesce(phone,''),'\D','','g') <> ''
      on conflict (phone) do nothing
    $q$;
  end if;
exception when others then
  raise notice 'Importação de contatos antigos ignorada: %', sqlerrm;
end $$;

-- Cron: chama o Render a cada minuto. Isso acorda o serviço e processa campanhas agendadas.
do $$
begin
  perform cron.unschedule('projeto-zap-v56-runner');
exception when others then null;
end $$;

select cron.schedule(
  'projeto-zap-v56-runner',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://projeto-zap-4tyg.onrender.com/api/cron/process',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"source":"supabase-cron"}'::jsonb,
      timeout_milliseconds := 10000
    );
  $$
);

select 'V5.6 pronta' as resultado;
