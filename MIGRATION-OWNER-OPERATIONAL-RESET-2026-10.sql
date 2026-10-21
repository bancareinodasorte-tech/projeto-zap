-- Migration additive para zerar a operação visível da conta proprietária
-- sem excluir pedidos, comprovantes, clientes ou mensagens históricos.
-- A aplicação só esconde linhas com operational_archived_at preenchido.
ALTER TABLE public.rds10_orders
  ADD COLUMN IF NOT EXISTS operational_archived_at timestamptz;

ALTER TABLE public.rds10_contacts
  ADD COLUMN IF NOT EXISTS operational_archived_at timestamptz;

ALTER TABLE public.rds10_messages
  ADD COLUMN IF NOT EXISTS operational_archived_at timestamptz;

ALTER TABLE public.rds10_ticket_documents
  ADD COLUMN IF NOT EXISTS operational_archived_at timestamptz;

COMMENT ON COLUMN public.rds10_orders.operational_archived_at IS
  'Data em que o pedido saiu da operação corrente; o registro financeiro original é preservado.';

COMMENT ON COLUMN public.rds10_contacts.operational_archived_at IS
  'Data em que o contato saiu da operação corrente; o registro original é preservado.';

COMMENT ON COLUMN public.rds10_messages.operational_archived_at IS
  'Data em que a mensagem saiu da operação corrente; o histórico original é preservado.';

COMMENT ON COLUMN public.rds10_ticket_documents.operational_archived_at IS
  'Data em que o comprovante saiu da operação corrente; o PDF original é preservado.';
