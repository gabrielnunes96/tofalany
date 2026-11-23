# Som do sistema sem eco da chamada — plano de desenvolvimento

> Demanda: `som-sistema-windows` · Base: técnica v1 (aprovada em 22/11/2026) · Situação: **aprovado em 22/11/2026**
> Fonte da verdade: `tarefas.json`.

## Ordem
T1 → T2 e T3 → T4 → T5 → T6 (manual no Windows 11).

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Main: módulo de captura do Windows, disponibilidade e porta para a janela | node | — | a_fazer | — | — |
| T2 | App: som pela porta (worklet) publicado como áudio da tela; seletor e avisos | front | T1 | a_fazer | — | — |
| T3 | Notificações sem som durante a captura | node | T1 | a_fazer | — | — |
| T4 | Linux: conferência do eco (E2E no desktop) e README | front | T2 | a_fazer | — | — |
| T5 | Validação completa e revisão | front | T2, T3, T4 | a_fazer | — | — |
| T6 | Validação manual no Windows 11 com o amigo | front | T5 | a_fazer | — | — |
