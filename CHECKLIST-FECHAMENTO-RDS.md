# CHECKLIST DE FECHAMENTO — CANAL DE VENDAS RDS

## BLOCO 1 — Base e estabilidade
- [x] Render inicia sem SyntaxError.
- [x] Serviço `projeto-zap` Live.
- [x] WhatsApp conectado e sessão persistida.
- [x] Supabase operacional.
- [x] Pedidos ativos limpos para teste.

## BLOCO 2 — Pedido pelo WhatsApp
- [x] Identificação automática do número do WhatsApp.
- [x] Formulário sem e-mail: Quantidade + Nome + CPF.
- [x] CPF obrigatório para o pedido.
- [x] Cálculo automático do total.
- [x] Pedido fica registrado mesmo quando o PagBank recusa a criação do PIX.
- [x] Menu principal refinado.
- [x] COMPRAR com link/mensagem pré-preenchida.
- [x] Consultar pedido.
- [x] Alterar pedido.
- [x] Cancelar pedido.
- [x] Atendimento do escritório.
- [x] Proteção de pedidos com pagamento confirmado.

## BLOCO 3 — PagBank / PIX
- [x] Integração automática com API Order.
- [x] PIX QR Code.
- [x] PIX Copia e Cola.
- [x] Expiração do PIX.
- [x] Idempotência para evitar cobranças duplicadas.
- [x] Webhook de notificação.
- [x] Validação da notificação.
- [x] Reconciliação automática como fallback.
- [x] Teste real em Produção executado.
- [ ] **Liberar whitelist/homologação da API Orders em Produção — aguardando retorno do PagBank.**
- [ ] Repetir somente o teste PIX real após a liberação.

## BLOCO 4 — Operação pós-pagamento
- [x] Pedido pago fica protegido contra alteração/cancelamento.
- [x] Estado `PAGO_AGUARDANDO_BILHETES`.
- [x] Operador consegue concluir o envio dos bilhetes.
- [x] Estado `CONCLUIDO`.
- [ ] Revisão final do texto de confirmação pós-pagamento.
- [ ] Revisão final do fluxo de envio dos bilhetes.

## BLOCO 5 — Painel / layout
- [x] Remoção do módulo PIX manual antigo.
- [x] Interface financeira alinhada ao PIX automático.
- [x] Menu de pedidos reorganizado.
- [x] Consulta e ações do pedido organizadas.
- [ ] Refinamento visual final do painel.
- [ ] Revisão de textos, títulos e estados.
- [ ] Revisão mobile.
- [ ] Revisão de Ajustes/WhatsApp sem ações destrutivas desnecessárias.
- [ ] Revisão final da tela de Pagamentos após homologação.

## BLOCO 6 — APK
- [x] Workflow Android existente.
- [x] WebView configurada para o Canal de Vendas RDS.
- [ ] Validar build final do APK.
- [ ] Instalar APK em aparelho.
- [ ] Testar abertura e navegação.
- [ ] Testar comunicação com Render.
- [ ] Fechar versão final para distribuição.

## REGRA DE FECHAMENTO
Não repetir testes antigos já validados. Enquanto o PagBank estiver em homologação, avançar somente nos itens que não dependem da autorização de Produção. O teste PIX real volta apenas após o e-mail/liberação do PagBank.
