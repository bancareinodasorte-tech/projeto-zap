PROJETO ZAP V5.7.2 CORRIGIDA

Correções principais:
- Corrigido o problema “Aguardando mensagem. Essa ação pode levar alguns instantes” com getMessage + cache de retry do Baileys.
- Mensagens enviadas ficam disponíveis para recriptografia/reenvio quando o WhatsApp solicitar retry.
- Envio 1:1 agora prefere LID quando houver mapeamento PN→LID e mantém PN como referência.
- Bot mostra estado ATIVO/DESATIVADO após salvar.
- Nomes internos continuam fixos para substituir arquivos anteriores no GitHub.

INSTALAÇÃO
1. Envie todos os arquivos desta pasta para a raiz do repositório, substituindo os existentes.
2. Não há nova migração obrigatória de banco em relação à V5.7.1.
3. Aguarde o Render concluir o deploy.
4. Feche e reabra o app/site para atualizar o cache.
5. Faça primeiro o Teste rápido.

IMPORTANTE SOBRE O BOT
Salvar o bot apenas ativa/configura o atendimento. Ele responde quando um cliente que pertence a uma campanha responde à mensagem recebida.
