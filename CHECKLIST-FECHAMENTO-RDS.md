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
- [x] Revisar em teste final a experiência do menu no WhatsApp, sem duplicar funções.
- [x] Validar navegação entre menu principal, opções do pedido e retorno ao menu.

## BLOCO 3 — Mercado Pago / PIX
- [x] Integração automática com API de Orders.
- [x] PIX QR Code.
- [x] PIX Copia e Cola.
- [x] Expiração do PIX.
- [x] Idempotência para evitar cobranças duplicadas.
- [x] Webhook de notificação.
- [x] Validação da notificação.
- [x] Reconciliação automática como fallback.
- [x] Teste sandbox com aprovação automática concluído.
- [x] Pagamento confirmado automaticamente e refletido no painel.
- [ ] Repetir somente o teste PIX real após disponibilidade de produção do provedor.

## BLOCO 4 — Operação pós-pagamento
- [x] Pedido pago fica protegido contra alteração/cancelamento.
- [x] Estado `PAGO_AGUARDANDO_BILHETES`.
- [x] Operador consegue concluir o envio dos bilhetes.
- [x] Estado `CONCLUIDO`.
- [x] Texto de confirmação pós-pagamento revisado e validado em teste.
- [x] Fluxo de envio/fechamento dos bilhetes revisado e validado em teste.
- [x] Alertas visuais para pagamento confirmado aguardando emissão.
- [x] Rota operacional `Emitir bilhetes` adicionada às áreas de Pagamentos e Compras.
- [ ] Vincular o destino real do sistema externo de emissão de bilhetes.
- [ ] Validar emissão real e entrega do bilhete após o vínculo do emissor.

## BLOCO 5 — Painel / layout
- [x] Remoção do módulo PIX manual antigo.
- [x] Interface financeira alinhada ao PIX automático.
- [x] Menu de pedidos reorganizado.
- [x] Consulta e ações do pedido organizadas.
- [x] Refinamento visual operacional do painel.
- [x] Revisão de textos, títulos e estados principais.
- [x] Relógio com data e hora no painel.
- [x] Indicadores de pendência nas áreas específicas.
- [x] Alertas contextuais de espera/mudança de fluxo.
- [x] Navegação de alerta direcionada à área responsável, sem criar módulos duplicados.
- [x] Ajustes/WhatsApp sem botão de desconexão destrutivo na tela normal.
- [x] Correção da retração instantânea das abas expansíveis.
- [x] Cabeçalho oficial reduzido para `CANAL DE VENDAS`.
- [x] Indicador de WhatsApp compactado para estado visual conectado/desconectado.
- [x] Refinamento responsivo para navegador celular/PC e camada PWA.
- [x] Aba `Sobre` criada com identidade, funcionamento e funcionalidades.
- [x] Revisão final de textos e microinterações adicionais.
- [ ] Revisão mobile com uso real em aparelho.
- [ ] Revisão final da tela de Pagamentos após homologação.

## BLOCO 6 — APK
- [x] Workflow Android existente.
- [x] WebView configurada para o Canal de Vendas RDS.
- [x] Build final V11.1 validado pelo GitHub Actions.
- [x] APK final V11.1 gerado e estrutura validada.
- [x] WebView reforçada para Android 15 e navegação segura.
- [ ] Instalar APK V11.1 em aparelho.
- [ ] Testar abertura e navegação.
- [ ] Testar comunicação com Render.
- [ ] Fechar versão final para distribuição após teste no aparelho.

## REGRA DE FECHAMENTO
Não repetir testes antigos já validados. Enquanto a produção do provedor de pagamento não estiver disponível, avançar somente nos itens que não dependem dessa autorização. O teste PIX real volta apenas quando a produção estiver disponível.

## REGRA DE NÃO DUPLICAÇÃO
Cada função operacional deve ter uma área principal responsável. O WhatsApp orienta o cliente; o painel concentra a operação. Indicadores e atalhos apenas encaminham para a área responsável, sem criar uma segunda função equivalente.
