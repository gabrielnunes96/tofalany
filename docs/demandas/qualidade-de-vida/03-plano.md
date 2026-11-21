# Qualidade de vida: plano de desenvolvimento

> Demanda: `qualidade-de-vida` · Base: técnica v1 (aprovada em 20/11/2026) · 20/11/2026 · Situação: **aprovado em 20/11/2026**
> Fonte da verdade das tarefas: `tarefas.json`.

## Ordem e paralelismo
- Sem dependência entre si: T1, T2, T4, T5 e T6. Ordem de execução: T1 → T2 → T3 → T4 → T5 → T6 → T7.
- T3 depende da T2 (rotas de convite). T7 depende da T6 (IPC).
- T8 é manual, com a build da atualização grande.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Servidor: status só para quem pode ver e reemissão ao mudar quem vê quem | node | — | a_fazer | — | — |
| T2 | Servidor: rotas de convite pela DM | node | — | a_fazer | — | — |
| T3 | Convidar para servidor no cartão e no menu da pessoa | front | T2 | a_fazer | — | — |
| T4 | Link de convite clicável dentro do app, com confirmação | front | — | a_fazer | — | — |
| T5 | ToOuvini de qualquer servidor para o administrador da instalação | front | — | a_fazer | — | — |
| T6 | Atualizar agora no processo principal: pedido e progresso | node | — | a_fazer | — | — |
| T7 | Botão 'Atualizar o app' no menu do usuário, com progresso e reinício | front | T6 | a_fazer | — | — |
| T8 | Validação manual: atualização real e convite entre dois apps | front | T1, T2, T3, T4, T5, T6, T7 | a_fazer | — | — |

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste.
2. Suíte verde (`npm test`), `npm run lint` e a checagem de tipos.
3. Revisão (fluxo:revisor) sem achado grave pendente; correções em commit com o mesmo id.
4. Validação registrada, ou o motivo de não validar.
5. Commit único da tarefa, `{mensagem} (Tn)`, sem coautoria.
6. `tarefas.json` atualizado.

## Riscos de execução
- A atualização real (download, instalação e reinício) só se testa na T8, com a build publicada.
- Passada do `fluxo:seguranca` no fim (convite e link clicável).

## Execução (20 e 21/11/2026)
- T1 a T7 feitas e commitadas no main local (sem push). Cada tarefa passou pelo revisor; as correções entraram em commits com o mesmo id (031b573 T1; e8aed7c e 75bedf3 T2; f0f34ca T3; 73d99d5 T4; ffee955 T5; 6b800e1 e 5d7ea3c T6; 6e88980 T7, que leva também a confirmação do convite com o nome do servidor).
- Decisões tomadas na execução: servidor excluído não reemite status (todas as conexões dele caem; T-9); a entrega da DM do convite virou método do `TempoReal` (T-3).
- Segurança (fluxo:seguranca): sem achado crítico ou alto. Corrigidos: confirmação do convite clicado com o nome do servidor e o aviso de que os membros vão ver o status e a atividade; banido e sem código com a mesma resposta (`409 nao_convidavel`) e limite contando as recusas; auditoria do convite na transação; canais de atualização só da janela principal; a marca de pedido da atualização vale só para a versão entregue. **Aceito e registrado:** sem `URL_PUBLICA` no servidor, o link do convite usa o endereço que o pedido informa (o clique no app compara o endereço e manda outro host para o navegador); conferir que a VM tem `URL_PUBLICA` definida.
- Validação do perfil (`npm run build && npm test && npm run lint && npm run test:e2e`): build ok; 801 testes (o intermitente conhecido `TelaAuditoria.test.tsx` falhou uma vez e passou ao repetir); lint ok; E2E 47 ok e 4 pulados, sobre o código final.
- **Falta a T8** (manual, na build da atualização grande): "Atualizar o app" de verdade no Windows, AppImage e .deb (fora e dentro de chamada); convite pelo cartão entre duas contas, com o clique no link; ToOuvini aberto de um servidor que não é o principal. A ligação do menu com o ToOuvini e com a API da base não tem teste automatizado (a tela principal inteira não é montada nos testes): conferir na T8.
