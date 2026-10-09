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


## BLOCO 7 — FINANCEIRO, MULTIEMPRESA E ACESSO UNIFICADO

- [x] Aba **Comissões e resultados** criada no painel principal, com filtro por período, resumo por sorteio e detalhamento de compras concluídas.
- [x] Endpoint financeiro dedicado exige sessão unificada; vendedor consulta apenas as próprias vendas e administrador consulta o consolidado.
- [x] Painel administrativo recebeu navegação para Comissões e para o painel comercial.
- [x] Gestão administrativa de bancas/empresas adicionada ao painel: cadastro/edição, preço padrão, fuso horário, divisão de comissão e vínculo/desvínculo de vendedores.
- [x] Login unificado ajustado para não reativar automaticamente dispositivos bloqueados/revogados e para exigir autorização administrativa de novos dispositivos.
- [x] Login unificado ajustado para impedir acesso de contas inativas.
- [ ] Confirmar deploy final de todas as mudanças e revisar logs de inicialização.
- [ ] Conferir no painel os valores de comissão usando dados reais já existentes, sem criar pedido nem pagamento.
- [ ] Validar cadastro/edição de empresa e vínculo de vendedor com uma operação controlada que não altere a empresa padrão.
- [ ] Validar acesso administrativo, bloqueio/desbloqueio, revogação de dispositivo e limite de dois dispositivos.
- [ ] Validar isolamento multiempresa em pedidos, pagamentos, clientes, campanhas e emissão oficial.
- [ ] Definir e implementar, se aprovado no fechamento financeiro, registro auditável de comissões pagas, estornos e comprovantes de repasse. A tela atual mostra comissão calculada e não presume pagamento.

## BLOCO 8 — LOGIN OBRIGATÓRIO E FECHAMENTO DO APK

- [x] Módulo de autenticação global incluído no painel principal, com login unificado de vendedor/administrador.
- [ ] Validar entrada com vendedor ativo e dispositivo autorizado.
- [ ] Validar rejeição de usuário inativo/bloqueado e dispositivo revogado.
- [ ] Validar cadastro de novo dispositivo pendente e autorização no painel administrativo.
- [ ] Validar sessão persistente, sair e entrar novamente, no navegador e no APK.
- [ ] Revisão visual completa em celular e PC.
- [ ] Validar Mercado Pago → pagamento aprovado → emissão oficial → PDF arquivado → envio WhatsApp, sem novo pagamento; preservar RDS-559D8F.
- [ ] Somente após as etapas anteriores, gerar/instalar e aprovar o APK final de distribuição.
