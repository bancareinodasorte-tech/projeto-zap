-- RDS MULTI-EMPRESA V1
-- Aplicada no projeto Supabase iaruldsetmsmqgzuqvqf
-- Estrutura não destrutiva: cria a empresa padrão e adiciona company_id sem remover dados.

create table if not exists public.rds10_companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  legal_name text,
  slug text not null unique,
  active boolean not null default true,
  timezone text not null default 'America/Fortaleza',
  default_unit_price numeric(12,2) not null default 3.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rds10_company_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.rds10_companies(id) on delete cascade,
  connection_type text not null,
  provider text not null,
  status text not null default 'PENDENTE',
  external_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, connection_type, provider)
);

create table if not exists public.rds10_seller_companies (
  seller_id uuid not null references public.rds10_sellers(id) on delete cascade,
  company_id uuid not null references public.rds10_companies(id) on delete cascade,
  role text not null default 'VENDEDOR',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(seller_id, company_id)
);

insert into public.rds10_companies(code,name,legal_name,slug,active,timezone,default_unit_price)
values ('RDS','REINO DA SORTE','REINO DA SORTE','reino-da-sorte',true,'America/Fortaleza',3.00)
on conflict (code) do update set name=excluded.name, updated_at=now();

alter table public.rds10_settings add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_seller_settings add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_orders add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_contacts add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_campaigns add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_campaign_steps add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_deliveries add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_messages add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_events add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_alerts add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_groups add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_whatsapp_chat_state add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_ticket_documents add column if not exists company_id uuid references public.rds10_companies(id);
alter table public.rds10_official_sales_auth add column if not exists company_id uuid references public.rds10_companies(id);

update public.rds10_settings set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_seller_settings set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_orders set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_contacts set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_campaigns set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_campaign_steps set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_deliveries set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_messages set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_events set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_alerts set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_groups set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_whatsapp_chat_state set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_ticket_documents set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;
update public.rds10_official_sales_auth set company_id=(select id from public.rds10_companies where code='RDS') where company_id is null;

insert into public.rds10_seller_companies(seller_id,company_id,role,active)
select s.id,c.id,coalesce(s.role,'VENDEDOR'),true
from public.rds10_sellers s
cross join (select id from public.rds10_companies where code='RDS') c
on conflict (seller_id,company_id) do nothing;

create index if not exists idx_rds10_company_connections_company on public.rds10_company_connections(company_id);
create index if not exists idx_rds10_seller_companies_company on public.rds10_seller_companies(company_id);
create index if not exists idx_rds10_orders_company on public.rds10_orders(company_id);
create index if not exists idx_rds10_contacts_company on public.rds10_contacts(company_id);
create index if not exists idx_rds10_campaigns_company on public.rds10_campaigns(company_id);
create index if not exists idx_rds10_ticket_documents_company on public.rds10_ticket_documents(company_id);

insert into public.rds10_company_connections(company_id,connection_type,provider,status,metadata)
select c.id,'PAGAMENTO','MERCADO_PAGO','DISPONIVEL','{"environment":"production"}'::jsonb
from public.rds10_companies c where c.code='RDS'
on conflict (company_id,connection_type,provider) do update set status='DISPONIVEL',metadata=excluded.metadata,updated_at=now();

insert into public.rds10_company_connections(company_id,connection_type,provider,status,metadata)
select c.id,'SISTEMA_OFICIAL','REINO_DA_SORTE','CONFIGURADO','{"role":"emissor_oficial"}'::jsonb
from public.rds10_companies c where c.code='RDS'
on conflict (company_id,connection_type,provider) do update set status='CONFIGURADO',metadata=excluded.metadata,updated_at=now();
