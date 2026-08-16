PROJETO ZAP V5.7.1 - CORRIGIDA

INSTALAÇÃO
1. GitHub: apague os arquivos antigos versionados (LEIA-ME-V5.x e MIGRACAO-V5.x) apenas uma vez.
2. Envie TODOS os arquivos desta pasta para a RAIZ do repositório. Os nomes são fixos e, nas próximas versões, serão substituídos em vez de acumulados.
3. Supabase > SQL Editor: abra MIGRACAO.sql, cole tudo e execute uma única vez.
4. Render: mantenha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Não precisa PHONE ID nem token Meta.
5. Aguarde o deploy e abra o sistema.

TESTE CURTO
- Ajustes > confira WhatsApp conectado.
- Envie um Teste rápido para outro número.
- Confirme que a mensagem chega normal (não como “Aguardando mensagem”).
- Salve o Bot de pedidos.
- Crie campanha com valor unitário, mensagem e contatos.
- Responda “Quero comprar 1 bilhete”. O retorno deve aparecer no sistema e o bot deve pedir Nome / Quantidade / Contato.

IMPORTANTE
O backend V5.7.1 envia diretamente ao JID do número do WhatsApp (PN) e NÃO força LID no envio. Isso corrige o comportamento observado de mensagens que apareciam no destinatário como “Aguardando mensagem”.
