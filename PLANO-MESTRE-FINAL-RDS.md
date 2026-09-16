# PLANO MESTRE — FECHAMENTO DEFINITIVO CANAL DE VENDAS RDS

## 1. Arquitetura que deve ser preservada

O projeto possui três camadas que não devem ser misturadas de forma destrutiva:

1. **CANAL DE VENDAS RDS** — painel operacional principal.
2. **Autenticação multi-vendedor** — cadastro, login, sessão, dispositivos e separação de vendas por vendedor.
3. **Integração oficial REINO DA SORTE** — autenticação do dispositivo oficial do servidor, consulta do sorteio e emissão oficial.

A regra é evoluir o painel por integração limpa, não substituir a base estável por uma camada experimental.

## 2. Estado recuperado

- Navegação principal estabilizada: Central, Clientes, Campanhas, Automação, Retornos, Pagamentos, Compras e Ajustes.
- Base estável restaurada no `main`.
- Integração oficial V4 preservada em Ajustes.
- Autenticação oficial do servidor permanece no backend, com credenciais protegidas no Render e sessão persistida no Supabase.
- Autenticação de vendedores/operadores V2 já existe no backend e deve ser usada pelo painel principal.
- Página de cadastro/acesso de operador existe em `/operador`.
- Gestão administrativa de vendedores existe em `/admin-vendedores`.
- Ponte de vendas multi-vendedor existe para contexto, pedidos e estado financeiro por vendedor.
- WhatsApp deve permanecer isolado: não desconectar, não forçar QR e não substituir a sessão existente para acelerar o fechamento.

## 3. Autenticação multi-vendedor já existente

Backend: `runtime-rds-operator-auth-v2.mjs`.

Funções existentes:
- cadastro `/api/operator/register`;
- login `/api/operator/login`;
- logout `/api/operator/logout`;
- sessão `/api/operator/me`;
- saúde `/api/operator/health`;
- administração `/api/operator/admin/sellers`;
- aprovação `/api/operator/admin/approve`;
- bloqueio `/api/operator/admin/block`;
- desbloqueio `/api/operator/admin/unblock`;
- configurações individuais `/api/operator/settings`.

Sessões usam token com hash no banco e cookie HttpOnly; dispositivos são registrados separadamente.

## 4. Integração oficial REINO DA SORTE

Backend: `runtime-rds-official-sales-auth-v3.mjs`.

O servidor mantém um dispositivo oficial próprio e sessão protegida. O painel usa a interface V4 em Ajustes para:
- consultar bootstrap/status;
- mostrar dispositivo oficial;
- informar autorização;
- autorizar o dispositivo quando necessário;
- consultar o sorteio oficial;
- emitir vendas pela rota oficial.

Essa integração NÃO deve ser reescrita para implementar autenticação de vendedor.

## 5. Ponte multi-vendedor

Backend: `runtime-rds-tenant-sales-v1.mjs`.

Já existem endpoints para:
- contexto do vendedor;
- pedidos filtrados por `seller_id`;
- criação de pedido por vendedor;
- consulta individual de pedido;
- estado financeiro individual.

Objetivo operacional: `vendedor → pedido → PIX/pagamento → confirmação → PAGO_AGUARDANDO_BILHETES → emissão oficial → bilhetes/PDF → entrega → CONCLUIDO`.

## 6. Painel administrativo

Página: `/admin-vendedores`.

Funções previstas e já implementadas:
- carregar vendedores;
- visualizar PENDENTE/ATIVO/BLOQUEADO;
- aprovar/autenticar;
- bloquear;
- desbloquear.

O painel administrativo não deve ser transformado em uma coleção de cartões decorativos. Cada controle deve executar uma operação real.

## 7. Regra de interface

- Não criar botões que simplesmente levam para outra aba já disponível na navegação.
- Não criar cartões sem função operacional.
- Não duplicar uma função existente em duas telas.
- Ajustes deve conter somente configurações e integrações que realmente precisam ser configuradas.
- Indicadores podem apontar para uma área responsável quando houver uma pendência real, mas não devem virar atalhos decorativos.
- Preservar a navegação estável e responsividade móvel/PC.

## 8. Fluxos que não podem ser perdidos

### WhatsApp
- sessão persistida;
- painel funciona mesmo quando WhatsApp estiver offline;
- não forçar desconexão/reconexão;
- somente validar o fluxo real final quando a conexão estiver disponível.

### Pagamento
- Mercado Pago Orders/Pix no backend;
- credenciais de produção somente no Render;
- webhook e reconciliação automática;
- idempotência;
- proteção de pedidos pagos;
- estados operacionais já existentes;
- emissão somente depois da confirmação do pagamento.

### CRM
- clientes normalizados por número;
- importação VCF/CSV;
- grupos;
- histórico comercial;
- evitar duplicidade.

### Campanhas/Automação
- planejamento separado da execução;
- fila, envio, falhas, retornos e reengajamento;
- WhatsApp é transporte/orientação do cliente; o painel concentra operação.

## 9. Pendências reais para o fechamento

1. Integrar autenticação de vendedor ao acesso inicial do painel principal — camada criada em `ui-rds-panel-auth-v1.js`.
2. Consolidar o uso das rotas multi-vendedor nas telas de Compras/Pagamentos sem quebrar as áreas já estáveis.
3. Garantir que a emissão oficial use o vendedor/contexto correto sem alterar a sessão oficial do servidor.
4. Fechar o painel administrativo com operação real e sem elementos redundantes.
5. Revisar mobile/PC de forma global depois da consolidação.
6. Vincular o destino real de PDF/bilhetes e validar emissão/entrega real.
7. Homologar produção do provedor de pagamento quando as credenciais de produção estiverem disponíveis.
8. Instalar/testar APK final somente após a homologação web.

## 10. Regra de trabalho daqui em diante

Não voltar para camadas antigas que já causaram regressão. Não substituir a base estável por um pacote experimental. Não repetir testes já concluídos. Cada alteração deve preservar as funções existentes e acrescentar somente a função necessária.

O objetivo final é um único aplicativo operacional robusto, com acesso individual de vendedor, administração de vendedores, pagamentos, pedidos, CRM, automação, retornos e integração oficial REINO DA SORTE, mantendo o WhatsApp como dependência isolada.
