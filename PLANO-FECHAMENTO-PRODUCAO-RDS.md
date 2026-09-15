# PLANO DE FECHAMENTO — PRODUÇÃO RDS

## Objetivo
Deixar o CANAL DE VENDAS RDS pronto para produção, mantendo o WhatsApp como dependência isolada para o teste real final.

## Fase 1 — Painel
- Estabilizar Central, cabeçalho e navegação.
- Fechar Clientes, grupos, seleção e exclusão administrativa segura.
- Fechar Retornos, Campanhas, Automação, Pagamentos, Compras e Ajustes.
- Manter a integração oficial REINO DA SORTE sem duplicar funções.
- Validar responsividade em celular e PC.

## Fase 2 — Pagamento
- Mercado Pago Orders/Pix permanece no backend.
- Ambiente de execução preparado para produção.
- Access Token de produção deve permanecer somente no Render.
- Webhook e reconciliação automática permanecem ativos.
- Antes do primeiro pagamento real, validar as credenciais de produção e os requisitos da conta Mercado Pago.
- Pix via Orders exige `payer.email`; portanto, o fluxo final de produção deve obter um e-mail válido do comprador ou definir uma estratégia compatível antes da homologação real.

## Fase 3 — REINO DA SORTE
- Manter autenticação/dispositivo persistidos no servidor.
- Consultar sorteio oficial.
- Emitir bilhetes pela rota oficial.
- Registrar venda e estado operacional.
- Vincular o destino real do PDF/entrega quando necessário.

## Fase 4 — Fluxo comercial completo
`cliente → pedido → PIX → confirmação → PAGO_AGUARDANDO_BILHETES → emissão oficial → bilhetes/PDF → entrega → CONCLUIDO`

## Fase 5 — WhatsApp
- Não forçar QR, reconexão ou alteração da sessão existente enquanto a conexão não estiver disponível.
- O painel deve permanecer operacional independentemente do transporte WhatsApp.
- Quando houver conexão funcional, executar somente os testes reais finais do fluxo WhatsApp.

## Fase 6 — APK
- Instalar APK em aparelho real.
- Validar abertura, navegação e comunicação com Render.
- Validar fluxo operacional real.
- Gerar versão final de produção somente depois da homologação web.

## Regra
Não repetir testes já concluídos. Não alterar a sessão do WhatsApp para acelerar o fechamento. Não colocar credenciais de produção no frontend ou no GitHub.
