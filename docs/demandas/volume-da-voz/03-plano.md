# Volume da voz: plano de desenvolvimento

> Demanda: `volume-da-voz` · Base: técnica v1 (aprovada em 21/11/2026) · 21/11/2026 · Situação: **rascunho**
> Fonte da verdade das tarefas: `tarefas.json`.

## Ordem e paralelismo
- T1 (preferências) primeiro: todas as outras usam os campos novos.
- T2 (nós do nivelamento) antes de T3, T4 e T6.
- T5 depois de T3 (o volume da chamada já aplicado na sala).
- T7 é manual, com a build da atualização grande.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Preferências: nivelar, ganho do microfone e volume da chamada | node | — | a_fazer | — | — |
| T2 | Nivelamento no microfone: compressor, cruzamento, ganho e limitador depois do portão | front | T1 | a_fazer | — | — |
| T3 | Chamada: nivelamento e ganho ao vivo; volume da chamada para quem ouve | front | T2 | a_fazer | — | — |
| T4 | Configurações → Voz: nivelar, ganho, volume da chamada e teste de som ao vivo | front | T1, T2 | a_fazer | — | — |
| T5 | Painel de voz: botão 'Volume da chamada' | front | T1, T3 | a_fazer | — | — |
| T6 | E2E: níveis do nivelamento medidos no Chromium | front | T2 | a_fazer | — | — |
| T7 | Validação manual: voz nivelada entre duas pessoas | front | T1, T2, T3, T4, T5, T6 | a_fazer | — | — |

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste.
2. Suíte verde (`npm test`), `npm run lint` e a checagem de tipos.
3. Revisão (fluxo:revisor) sem achado grave pendente; correções em commit com o mesmo id.
4. Validação registrada, ou o motivo de não validar.
5. Commit único da tarefa, `{mensagem} (Tn)`, sem coautoria.
6. `tarefas.json` atualizado.

## Riscos de execução
- O E2E de nível (T6) pode mostrar que o compressor do Chromium desvia do esperado: ajustar os parâmetros em `parametrosNivel` e registrar.
- O E2E de voz é lento e tem o intermitente conhecido da auditoria: rodar em segundo plano e repetir uma vez.
