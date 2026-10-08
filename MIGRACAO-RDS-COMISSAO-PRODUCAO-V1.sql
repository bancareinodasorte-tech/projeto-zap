-- RDS10: comissão e produção por venda
alter table public.rds10_companies
  add column if not exists seller_commission_pct numeric(5,2) not null default 30.00,
  add column if not exists company_revenue_pct numeric(5,2) not null default 70.00;

alter table public.rds10_companies
  drop constraint if exists rds10_companies_commission_split_ck;

alter table public.rds10_companies
  add constraint rds10_companies_commission_split_ck
  check (seller_commission_pct >= 0 and company_revenue_pct >= 0 and seller_commission_pct + company_revenue_pct = 100);

alter table public.rds10_orders
  add column if not exists commission_rate_pct numeric(5,2),
  add column if not exists commission_seller_amount numeric(12,2),
  add column if not exists commission_company_amount numeric(12,2),
  add column if not exists commission_calculated_at timestamptz;

create index if not exists idx_rds10_orders_commission on public.rds10_orders (seller_id, company_id, status, completed_at);
