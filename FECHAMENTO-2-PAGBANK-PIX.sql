-- CANAL DE VENDAS RDS — FECHAMENTO 2 / PAGBANK PIX
-- Migração idempotente. Não apaga nem altera dados existentes.

alter table public.rds10_orders add column if not exists customer_tax_id text;
alter table public.rds10_orders add column if not exists pagbank_order_id text;
alter table public.rds10_orders add column if not exists pagbank_charge_id text;
alter table public.rds10_orders add column if not exists pagbank_status text;
alter table public.rds10_orders add column if not exists pix_copy_paste text;
alter table public.rds10_orders add column if not exists pix_qr_code_url text;
alter table public.rds10_orders add column if not exists pix_expires_at timestamptz;
alter table public.rds10_orders add column if not exists payment_method text;
alter table public.rds10_orders add column if not exists payment_created_at timestamptz;
alter table public.rds10_orders add column if not exists payment_updated_at timestamptz;
alter table public.rds10_orders add column if not exists payment_last_error text;

create index if not exists rds10_orders_pagbank_order_idx on public.rds10_orders(pagbank_order_id) where pagbank_order_id is not null;
create index if not exists rds10_orders_pagbank_charge_idx on public.rds10_orders(pagbank_charge_id) where pagbank_charge_id is not null;
create index if not exists rds10_orders_pagbank_status_idx on public.rds10_orders(pagbank_status) where pagbank_status is not null;
