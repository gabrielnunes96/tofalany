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
