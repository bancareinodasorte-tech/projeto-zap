# CHECKLIST DE FECHAMENTO — CANAL DE VENDAS RDS

> **Atualização de 21/10/2026:** os itens de versão V11.1 abaixo foram substituídos pelo fechamento V11.4.5. O código multiusuário e o filtro de arquivamento operacional passaram por validação automática de sintaxe e o backend foi publicado. A versão V11.4.5 foi gerada e a estrutura do APK foi validada; faltam validação final sem cobrança/emissão real e teste físico do APK. Não criar novos pedidos nem pagamentos para homologação. Os pedidos históricos RDS-559D8F, RDS-CDE9C0 e RDS-E7FE06 devem permanecer preservados.

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
- [x] Builds anteriores V11.4.4 validados pelo GitHub Actions.
- [x] WebView reforçada para Android 15 e navegação segura.
- [x] Build final V11.4.5 concluído no GitHub Actions; estrutura do APK validada.
- [ ] Instalar APK V11.4.5 em aparelho.
- [ ] Testar abertura, navegação, login e comunicação com Render.
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
- [x] Confirmar deploy final de todas as mudanças e revisar logs de inicialização (deploy mais recente LIVE; consulta de erros/fatais sem ocorrências no intervalo verificado).
- [x] Conferir valores de comissão com dados reais já existentes, sem criar pedido nem pagamento: 4 pedidos concluídos, R$ 12,00 em vendas, R$ 3,60 de comissão dos vendedores e R$ 8,40 de receita da empresa; todos os 4 pedidos têm vendedor, empresa e valores de comissão registrados.
- [ ] Validar cadastro/edição de empresa e vínculo de vendedor com uma operação controlada que não altere a empresa padrão.
- [ ] Validar acesso administrativo, bloqueio/desbloqueio, revogação de dispositivo e limite de dois dispositivos.
- [ ] Validar isolamento multiempresa em pedidos, pagamentos, clientes, campanhas e emissão oficial.
- [ ] Definir e implementar, se aprovado no fechamento financeiro, registro auditável de comissões pagas, estornos e comprovantes de repasse. A tela atual mostra comissão calculada e não presume pagamento.

## BLOCO 8 — CONTA, PAGAMENTOS E CONEXÕES

- [x] Conta comercial simplificada para identidade e dispositivos autorizados.
- [x] Área própria de Conexões adicionada à navegação comercial e mobile.
- [x] Mercado Pago mantido por autorização OAuth, sem inserir credenciais secretas em formulários.
- [x] Estado do WhatsApp consultado sem iniciar conexão automaticamente ao abrir a tela.
- [x] Botão explícito para solicitar conexão do WhatsApp e mostrar QR somente após ação do vendedor.
- [x] Vínculo de empresa/banca exibido separadamente da identidade e dos dados de recebimento.
- [ ] Confirmar publicação e validar visualmente Conta, Pagamentos e Conexões em aparelho.
- [ ] Revisar permissões e isolamento multiempresa em operação controlada, sem alterar dados de produção.
- [x] Corrigido o botão de configuração do Mercado Pago em Pagamentos para abrir Conexões, onde a integração operacional é gerenciada.
- [x] Corrigido Atualizar para preservar os parâmetros atuais da URL, incluindo `audience=seller`, evitando perder o contexto comercial após a atualização.
- [ ] Aguardar deploy dessas correções e revisar logs; validar navegação no navegador/aparelho sem acionar conexão, cobrança ou emissão.

## BLOCO 10 — RECUPERAÇÃO DE SENHA POR E-MAIL (OBRIGATÓRIO ANTES DO FECHAMENTO)

**Não fechar o aplicativo nem aprovar o APK final enquanto este bloco não estiver concluído e validado para vendedor e administrador.**

- [x] Tornar o e-mail obrigatório no formulário e na API de novos cadastros de vendedor, mesmo quando o telefone for usado como identificador de login; validar formato, normalizar minúsculas e exigir senha mínima de 8 caracteres.
- [x] Validar formato e normalizar e-mail (remover espaços e padronizar minúsculas); impedir cadastro sem e-mail e rejeitar duplicidade.
- [ ] Confirmar o e-mail cadastrado como destino de recuperação; não permitir que o usuário informe um endereço arbitrário para redefinir senha.
- [x] Integrada a solicitação de recuperação do vendedor à tela de login unificado e ao formulário de redefinição atual; formulário de cadastro exige e-mail.
- [x] Tela administrativa atual já oferece “Esqueci a senha”; redefinição usa a rota administrativa e retorna ao login administrativo. **Pendente validar que o e-mail configurado corresponde à conta administrativa de produção.**
- [ ] Ativar e validar envio de e-mail no provedor de e-mail do servidor, sem expor chaves/API secrets.
- [x] Rotas existentes usam token aleatório com hash armazenado, validade de 30 minutos, resposta genérica e invalidam sessões de vendedor/administrador após redefinição; nova solicitação do vendedor invalida links anteriores. A validação de ponta a ponta ainda está pendente.
- [ ] Garantir política de senha segura e que a redefinição invalide sessões antigas conforme o fluxo de autenticação.
- [x] Confirmado o mecanismo de boot: `prepare-pagbank-no-email.mjs` importa as rotas de recuperação do vendedor e o login administrativo atual já declara as rotas administrativas. Ajustes feitos para cadastro obrigatório e atualização do formulário atual.
- [ ] Testar recuperação de vendedor e administrador usando contas/e-mails controlados, cobrindo e-mail válido, e-mail não cadastrado, token expirado, token já utilizado e senha inválida; não criar pedidos nem pagamentos para esses testes.
- [ ] Confirmar a recuperação por e-mail em navegador e APK antes de autorizar a distribuição final.

## BLOCO 9 — LOGIN OBRIGATÓRIO E FECHAMENTO DO APK

- [x] Módulo de autenticação global incluído no painel principal, com login unificado de vendedor/administrador.
- [ ] Validar entrada com vendedor ativo e dispositivo autorizado.
- [ ] Validar rejeição de usuário inativo/bloqueado e dispositivo revogado.
- [ ] Validar cadastro de novo dispositivo pendente e autorização no painel administrativo.
- [ ] Validar sessão persistente, sair e entrar novamente, no navegador e no APK.
- [ ] Revisão visual completa em celular e PC.
- [ ] Validar Mercado Pago → pagamento aprovado → emissão oficial → PDF arquivado → envio WhatsApp, sem novo pagamento; preservar RDS-559D8F.
- [ ] Somente após as etapas anteriores, instalar e aprovar o APK V11.4.5 final de distribuição.


## BLOCO 11 — ISOLAMENTO MULTIUSUÁRIO E RESET OPERACIONAL SEGURO (21/10/2026)

- [x] Bloqueio de APIs legadas sem autenticação e restrição das funções proprietárias à conta proprietária.
- [x] Sessões de vendas reutilizam o validador central, incluindo autorização do dispositivo.
- [x] Cadastro de novos usuários cria empresa própria e conexões pendentes; não herda a integração da conta proprietária.
- [x] Integração oficial, Mercado Pago e WhatsApp encaminhados por vendedor/empresa conforme o contexto autenticado.
- [x] Envio de PIX pelo WhatsApp usa a conexão do vendedor dono do pedido.
- [x] Lembretes PIX e eventos de sistema protegidos contra envios/atribuições globais indevidos.
- [x] Coluna operacional de arquivamento criada de forma aditiva para pedidos, contatos, mensagens e PDFs.
- [x] Registros antigos da conta proprietária arquivados da operação visível sem apagar o histórico financeiro.
- [x] Preservados os pedidos históricos RDS-559D8F, RDS-CDE9C0 e RDS-E7FE06.
- [x] Verificação automática de sintaxe do pipeline Render e do filtro de arquivamento aprovada.
- [x] Deploy do filtro de arquivamento concluído no Render.
- [ ] Confirmar visualmente no navegador/aparelho que os registros arquivados não aparecem nas áreas operacionais.
- [ ] Homologar recuperação de senha por e-mail para vendedor e administrador.
- [ ] Homologar isolamento de duas contas de teste, incluindo conexões independentes, sem criar pagamento nem emissão real.
- [ ] Homologar fluxo real do pedido já existente RDS-559D8F sem novo pagamento ou emissão duplicada.
