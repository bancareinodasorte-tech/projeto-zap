-- RDS Commission Payout Ledger V1
-- Apply manually in Supabase SQL Editor before enabling the matching runtime.
create table if not exists public.rds10_commission_payouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  seller_id uuid not null,
  period_month date not null check (extract(day from period_month) = 1),
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  payment_method text not null check (payment_method in ('PIX','DINHEIRO','TRANSFERENCIA','OUTRO')),
  reference text,
  receipt_url text,
  notes text,
  idempotency_key text not null unique,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists rds10_commission_payouts_reference_unique_idx
  on public.rds10_commission_payouts (company_id, reference) where reference is not null;
create index if not exists rds10_commission_payouts_seller_month_idx
  on public.rds10_commission_payouts (seller_id, period_month, paid_at desc);
create index if not exists rds10_commission_payouts_company_month_idx
  on public.rds10_commission_payouts (company_id, period_month, paid_at desc);
alter table public.rds10_commission_payouts enable row level security;
revoke all on public.rds10_commission_payouts from anon, authenticated;
grant all on public.rds10_commission_payouts to service_role;

create or replace function public.rds10_register_commission_payout(
  p_company_id uuid,
  p_seller_id uuid,
  p_period_month date,
  p_amount numeric,
  p_payment_method text,
  p_reference text,
  p_receipt_url text,
  p_notes text,
  p_idempotency_key text,
  p_created_by uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_period_month)::date;
  v_due numeric(12,2);
  v_paid numeric(12,2);
  v_new_id uuid;
begin
  if p_company_id is null or p_seller_id is null or p_period_month is null then
    raise exception 'Empresa, vendedor e mês são obrigatórios.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'O valor do repasse deve ser maior que zero.'; end if;
  if p_payment_method not in ('PIX','DINHEIRO','TRANSFERENCIA','OUTRO') then raise exception 'Forma de pagamento inválida.'; end if;
  if coalesce(length(trim(p_idempotency_key)),0) < 16 then raise exception 'Chave de operação inválida.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_seller_id::text || ':' || v_month::text, 0));

  if exists(select 1 from public.rds10_commission_payouts where idempotency_key=p_idempotency_key) then
    raise exception 'Este repasse já foi registrado; não duplique a operação.';
  end if;
  if nullif(trim(p_reference),'') is not null and exists(select 1 from public.rds10_commission_payouts where company_id=p_company_id and reference=trim(p_reference)) then
    raise exception 'Esta referência de transação já foi registrada.';
  end if;

  select coalesce(sum(coalesce(commission_seller_amount,
      round(coalesce(total_amount,0) * coalesce(commission_rate_pct,30) / 100, 2))),0)
    into v_due
  from public.rds10_orders
  where status='CONCLUIDO'
    and seller_id=p_seller_id
    and company_id=p_company_id
    and completed_at >= v_month::timestamptz
    and completed_at < (v_month + interval '1 month')::timestamptz;

  select coalesce(sum(amount),0) into v_paid
  from public.rds10_commission_payouts
  where seller_id=p_seller_id and company_id=p_company_id and period_month=v_month;

  if round(v_paid + p_amount,2) > round(v_due,2) then
    raise exception 'Repasse excede o saldo de comissão disponível. Disponível: %; já repassado: %.', round(v_due-v_paid,2), round(v_paid,2);
  end if;

  insert into public.rds10_commission_payouts
    (company_id,seller_id,period_month,amount,payment_method,reference,receipt_url,notes,idempotency_key,created_by)
  values
    (p_company_id,p_seller_id,v_month,round(p_amount,2),p_payment_method,nullif(trim(p_reference),''),nullif(trim(p_receipt_url),''),nullif(trim(p_notes),''),p_idempotency_key,p_created_by)
  returning id into v_new_id;

  return jsonb_build_object('success',true,'id',v_new_id,'amount',round(p_amount,2),'paid_total',round(v_paid+p_amount,2),'available_after',round(v_due-v_paid-p_amount,2));
end;
$$;
revoke all on function public.rds10_register_commission_payout(uuid,uuid,date,numeric,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.rds10_register_commission_payout(uuid,uuid,date,numeric,text,text,text,text,text,uuid) to service_role;
