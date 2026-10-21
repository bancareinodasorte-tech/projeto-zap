-- Livro auditável de repasses e estornos de comissão.
-- Migração aditiva: preserva todos os repasses existentes e não registra operações financeiras.
begin;

create table if not exists public.rds10_commission_payout_reversals (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.rds10_commission_payouts(id) on delete restrict,
  company_id uuid not null references public.rds10_companies(id) on delete restrict,
  seller_id uuid not null references public.rds10_sellers(id) on delete restrict,
  period_month date not null,
  amount numeric(12,2) not null check (amount > 0),
  reversed_at timestamptz not null default now(),
  reason text not null check (length(trim(reason)) > 0),
  reference text,
  receipt_url text,
  idempotency_key text not null unique,
  reversed_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists rds10_commission_reversals_payout_idx
  on public.rds10_commission_payout_reversals(payout_id, reversed_at desc);
create index if not exists rds10_commission_reversals_seller_month_idx
  on public.rds10_commission_payout_reversals(seller_id, company_id, period_month, reversed_at desc);
create unique index if not exists rds10_commission_reversals_reference_unique_idx
  on public.rds10_commission_payout_reversals(company_id, reference)
  where reference is not null;

alter table public.rds10_commission_payout_reversals enable row level security;
revoke all on public.rds10_commission_payout_reversals from public, anon, authenticated;
grant all on public.rds10_commission_payout_reversals to service_role;

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
set search_path to 'public'
as $function$
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

  select coalesce(sum(p.amount - coalesce(r.reversed_amount,0)),0)
    into v_paid
  from public.rds10_commission_payouts p
  left join (
    select payout_id, sum(amount) as reversed_amount
    from public.rds10_commission_payout_reversals
    group by payout_id
  ) r on r.payout_id=p.id
  where p.seller_id=p_seller_id and p.company_id=p_company_id and p.period_month=v_month;

  if round(v_paid + p_amount,2) > round(v_due,2) then
    raise exception 'Repasse excede o saldo de comissão disponível. Disponível: %; já repassado líquido: %.', round(v_due-v_paid,2), round(v_paid,2);
  end if;

  insert into public.rds10_commission_payouts
    (company_id,seller_id,period_month,amount,payment_method,reference,receipt_url,notes,idempotency_key,created_by)
  values
    (p_company_id,p_seller_id,v_month,round(p_amount,2),p_payment_method,nullif(trim(p_reference),''),nullif(trim(p_receipt_url),''),nullif(trim(p_notes),''),p_idempotency_key,p_created_by)
  returning id into v_new_id;

  return jsonb_build_object('success',true,'id',v_new_id,'amount',round(p_amount,2),'paid_total',round(v_paid+p_amount,2),'available_after',round(v_due-v_paid-p_amount,2));
end;
$function$;

create or replace function public.rds10_reverse_commission_payout(
  p_payout_id uuid,
  p_amount numeric,
  p_reason text,
  p_reference text,
  p_receipt_url text,
  p_idempotency_key text,
  p_reversed_by uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payout public.rds10_commission_payouts%rowtype;
  v_reversed numeric(12,2);
  v_new_id uuid;
begin
  if p_payout_id is null then raise exception 'Repasse não informado.'; end if;
  if p_amount is null or p_amount <= 0 or round(p_amount,2) <> p_amount then raise exception 'Informe um valor de estorno positivo com até duas casas decimais.'; end if;
  if coalesce(length(trim(p_reason)),0) < 5 then raise exception 'Informe o motivo do estorno (mínimo de 5 caracteres).'; end if;
  if coalesce(length(trim(p_idempotency_key)),0) < 16 then raise exception 'Chave de operação inválida.'; end if;
  if p_receipt_url is not null and p_receipt_url !~* '^https://[^[:space:]]+$' then raise exception 'O comprovante deve ser um link HTTPS válido.'; end if;

  select * into v_payout from public.rds10_commission_payouts where id=p_payout_id for update;
  if not found then raise exception 'Repasse não encontrado.'; end if;
  if exists(select 1 from public.rds10_commission_payout_reversals where idempotency_key=p_idempotency_key) then
    raise exception 'Este estorno já foi registrado; não duplique a operação.';
  end if;
  if nullif(trim(p_reference),'') is not null and exists(
    select 1 from public.rds10_commission_payout_reversals
    where company_id=v_payout.company_id and reference=trim(p_reference)
  ) then raise exception 'Esta referência de estorno já foi registrada.'; end if;

  select coalesce(sum(amount),0) into v_reversed
  from public.rds10_commission_payout_reversals where payout_id=p_payout_id;

  if round(v_reversed+p_amount,2)>round(v_payout.amount,2) then
    raise exception 'O estorno excede o saldo ainda não estornado deste repasse.';
  end if;

  insert into public.rds10_commission_payout_reversals
    (payout_id,company_id,seller_id,period_month,amount,reason,reference,receipt_url,idempotency_key,reversed_by)
  values
    (v_payout.id,v_payout.company_id,v_payout.seller_id,v_payout.period_month,round(p_amount,2),trim(p_reason),nullif(trim(p_reference),''),nullif(trim(p_receipt_url),''),p_idempotency_key,p_reversed_by)
  returning id into v_new_id;

  return jsonb_build_object(
    'success',true,
    'id',v_new_id,
    'payout_id',v_payout.id,
    'reversed_amount',round(p_amount,2),
    'reversed_total',round(v_reversed+p_amount,2),
    'payout_remaining',round(v_payout.amount-v_reversed-p_amount,2)
  );
end;
$function$;

revoke all on function public.rds10_register_commission_payout(uuid,uuid,date,numeric,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.rds10_register_commission_payout(uuid,uuid,date,numeric,text,text,text,text,text,uuid) to service_role;
revoke all on function public.rds10_reverse_commission_payout(uuid,numeric,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.rds10_reverse_commission_payout(uuid,numeric,text,text,text,text,uuid) to service_role;

commit;
