# Demanda: chat-fixar-e-buscar

Itens do backlog (docs/demandas/to-falando-v2/00-backlog.md), pedidos de 17/11:

- **26. Fixar mensagem:** Fixar uma mensagem num canal ou DM; um botão no topo lista as fixadas, e clicar leva até ela. Quem pode fixar: no canal, quem gerencia mensagens (cargo); na DM, os dois. Limite de fixadas por conversa (ex.: 50). Avisar no chat "fulano fixou uma mensagem". Pequeno a médio.
- **25. Busca no chat:** Campo "Buscar" no topo da conversa (canal ou DM) para achar mensagens por texto, com filtros simples (de quem, em qual canal, com anexo ou GIF). Clicar num resultado leva até a mensagem, como o "ir até a original" das respostas (já carrega o histórico até um id). Precisa de índice de texto no SQLite (FTS5) e de respeitar quem pode ver o quê (canais e DMs da pessoa). Médio.

Respostas do Gabriel em 21/11:
- Quem fixa no canal: permissão nova "Fixar mensagens" no cargo (administrador já tem).
- Alcance da busca: começa na conversa aberta; um filtro troca para todos os canais que a pessoa vê no servidor. Na DM, só as próprias DMs.
- Aviso ao fixar: linha discreta no chat, clicável, sem notificar.
- Limite: 50 fixadas por conversa.
