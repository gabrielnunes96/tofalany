# Mover membros e sala de AFK — plano de desenvolvimento

> Demanda: `mover-e-afk` · Base: técnica v1 (aprovada em 21/11/2026) · 21/11/2026 · Situação: **aprovado em 22/11/2026**
> Fonte da verdade das tarefas: `tarefas.json`.

## Ordem e paralelismo
- Servidor: T1 (base) → T2 (mover) e T3 (AFK, token e webhook).
- App: T4 (troca de sala e mudo da AFK) depois de T2 e T3; T5 (menu, arrastar, ícone, Editar servidor) e T6 (inatividade) depois de T4.
- T7 fecha com E2E e validação completa; T8 é a validação manual do Gabriel.
- Ordem: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Base: permissão mover_membros, migração 023, configuração da AFK e pontos sem a AFK | node | — | a_fazer | — | — |
| T2 | Servidor: mover e desconectar da chamada | node | T1 | a_fazer | — | — |
| T3 | Servidor: AFK (motivo, mudo e token) e participant_joined | node | T1 | a_fazer | — | — |
| T4 | App: trocar de sala quando movido, desconectar e mudo da AFK | front | T2, T3 | a_fazer | — | — |
| T5 | App: 'Mover para…', 'Desconectar', arrastar, ícone e AFK em Editar servidor | front | T1, T4 | a_fazer | — | — |
| T6 | App: ida para a AFK por inatividade | front | T4 | a_fazer | — | — |
| T7 | E2E e validação completa | front | T5, T6 | a_fazer | — | — |
| T8 | Validação manual com o grupo | front | T7 | a_fazer | — | — |

## Riscos do plano
- **T4 mexe na entrada e saída da voz** (TelaPrincipal): os E2E de voz existentes precisam continuar verdes.
- **Remoção forçada (T2, T3)** depende do LiveKit: testada com o `removerDaMidia` falso; ponta a ponta no E2E com o LiveKit em contêiner.
- **Ociosidade no Linux com Wayland** pode não ser informada pelo sistema (mesma limitação do "ausente").

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste (ou pela validação manual, na T8).
2. Suíte verde (`npm test`), `npm run lint` e a checagem de tipos.
3. Revisão (fluxo:revisor) sem achado grave pendente; correções em commit com o mesmo id.
4. Commit só depois de os testes passarem (código de saída do vitest).
5. Commit único da tarefa, `{mensagem} (Tn)`, sem coautoria.
