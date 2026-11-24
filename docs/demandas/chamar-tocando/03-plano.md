# Chamar para a voz como um telefone — plano de desenvolvimento

> Demanda: `chamar-tocando` · Base: técnica (aprovada em 23/11/2026) · Situação: **rascunho**
> Fonte da verdade: `tarefas.json`.

## Ordem
T1 → T2 → T3; T4 depois de T1 (em paralelo com T2/T3).

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Contratos do chamado no shared | node | — | a_fazer | — | — |
| T2 | Servidor: chamado aberto, encerrar e regras de quem pode ser chamado | node | T1 | a_fazer | — | — |
| T3 | Servidor: push do chamado com 15 s | node | T2 | a_fazer | — | — |
| T4 | App: toque, tela de chamado, Chamando…, avisos de 6 s e presença no menu | front | T1 | a_fazer | — | — |

## Riscos
Os da técnica (seção 9). Validações com duas pessoas reais ficam para o usuário depois da versão.
