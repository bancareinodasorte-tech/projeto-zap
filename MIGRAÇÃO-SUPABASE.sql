-- PROJETO ZAP V4 — EXECUÇÃO E LOTES
-- Execute este arquivo inteiro UMA ÚNICA VEZ no SQL Editor do mesmo Supabase.

alter table public.campaigns
  add column if not exists batch_size integer not null default 25,
  add column if not exists batch_interval_minutes integer not null default 10;

alter table public.campaign_recipients
  add column if not exists batch_no integer not null default 1,
  add column if not exists send_order integer,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists last_attempt_at timestamptz;

create index if not exists campaign_recipients_due_idx
  on public.campaign_recipients(owner_id,status,next_action_at);

create index if not exists campaign_recipients_batch_idx
  on public.campaign_recipients(owner_id,campaign_id,batch_no,send_order);
