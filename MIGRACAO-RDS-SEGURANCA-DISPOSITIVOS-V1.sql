-- RDS SEGURANCA / DISPOSITIVOS V1
-- Estrutura nao destrutiva para controle administrativo de dispositivos,
-- auditoria e limite de 2 dispositivos ativos por vendedor.

create table if not exists public.rds10_security_audit (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null,
  actor_id uuid,
  company_id uuid references public.rds10_companies(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  device_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_rds10_security_audit_created on public.rds10_security_audit(created_at desc);
create index if not exists idx_rds10_security_audit_actor on public.rds10_security_audit(actor_type, actor_id, created_at desc);
create index if not exists idx_rds10_security_audit_target on public.rds10_security_audit(target_type, target_id, created_at desc);
create unique index if not exists idx_rds10_seller_devices_seller_device on public.rds10_seller_devices(seller_id, device_id);
create index if not exists idx_rds10_seller_devices_active on public.rds10_seller_devices(seller_id, status, last_seen_at desc);
create index if not exists idx_rds10_seller_sessions_active_device on public.rds10_seller_sessions(seller_id, device_id, revoked_at, expires_at);

create or replace function public.rds10_enforce_two_active_devices()
returns trigger
language plpgsql
as $$
declare active_count integer;
begin
  if NEW.status = 'ATIVO' then
    perform pg_advisory_xact_lock(hashtext(NEW.seller_id::text));
    select count(*) into active_count
      from public.rds10_seller_devices d
     where d.seller_id = NEW.seller_id
       and d.status = 'ATIVO'
       and d.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    if active_count >= 2 then
      raise exception 'LIMITE_DISPOSITIVOS_ATINGIDO: este usuario ja possui 2 dispositivos ativos.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_rds10_two_active_devices on public.rds10_seller_devices;
create trigger trg_rds10_two_active_devices
before insert or update of seller_id, status
on public.rds10_seller_devices
for each row execute function public.rds10_enforce_two_active_devices();

update public.rds10_seller_devices set status='PENDENTE' where status is null or trim(status)='';
update public.rds10_seller_companies sc
set active=true, updated_at=now()
where sc.company_id=(select id from public.rds10_companies where code='RDS')
  and sc.active is distinct from true;
