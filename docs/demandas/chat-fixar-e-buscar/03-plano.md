# Fixar e buscar mensagens: plano de desenvolvimento

> Demanda: `chat-fixar-e-buscar` · Base: técnica v1 (aprovada em 21/11/2026) · 21/11/2026 · Situação: **rascunho**
> Fonte da verdade das tarefas: `tarefas.json`.

## Ordem e paralelismo
- Servidor primeiro: T1 (base) → T2 (fixar) e T3 (busca); T4 (janela do histórico) não depende de nada.
- App: T5 (ir até qualquer mensagem) depende da T4; T6 (fixadas) da T2 e T5; T7 (busca) da T3 e T5.
- T8 (item 51, "Apagar" para quem tem a permissão) é independente e pequena.
- T9 (E2E) fecha o fluxo nos dois apps; T10 é a validação manual do Gabriel, depois da atualização grande.
- Ordem de execução: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Base: permissão fixar_mensagens, migração 022 (fixadas, linha de sistema, índice de busca) e recursos no ola | node | — | a_fazer | — | — |
| T2 | Servidor: fixar e desafixar, lista de fixadas e linha 'fixou' | node | T1 | a_fazer | — | — |
| T3 | Servidor: busca (POST /api/busca) | node | T1 | a_fazer | — | — |
| T4 | Servidor: histórico em janela (em=<id>, depois=<id>) | node | — | a_fazer | — | — |
| T5 | App: ir até qualquer mensagem (janela, irAte e 'Ir para as mais recentes') | front | T4 | a_fazer | — | — |
| T6 | App: fixar no menu, linha 'fixou' e painel 'Fixadas' | front | T2, T5 | a_fazer | — | — |
| T7 | App: campo 'Buscar' e painel de resultados | front | T3, T5 | a_fazer | — | — |
| T8 | App: 'Apagar' para quem tem a permissão (item 51) | front | — | a_fazer | — | — |
| T9 | E2E: fixar, buscar e ir até a mensagem | front | T6, T7 | a_fazer | — | — |
| T10 | Validação manual com o grupo (depois da atualização grande) | front | T9 | a_fazer | — | — |

## Cobertura dos critérios
| Critério | Tarefas |
| --- | --- |
| CA-1 | T1, T2, T6, T9 |
| CA-2 | T2, T6, T9 |
| CA-3 | T2, T6, T10 |
| CA-4 | T2 |
| CA-5 | T2, T6, T9 |
| CA-6 | T4, T5, T6, T9, T10 |
| CA-7 | T2, T6 |
| CA-8 | T3, T7, T9, T10 |
| CA-9 | T3 |
| CA-10 | T3, T7, T9 |
| CA-11 | T3, T7 |
| CA-12 | T3, T7 |
| CA-13 | T4, T5, T7, T9 |
| CA-14 | T1 |
| CA-15 | T3, T7 |
| CA-16 | T3, T10 |

## Riscos do plano
- **T1 é a base de tudo:** a migração não tem volta automática (backup antes, como sempre). Teste com banco na versão 21 antes de seguir.
- **T5 mexe no histórico da conversa** (hoje sempre contíguo até o fim): é a tarefa mais arriscada do app; os testes de MensagensCanal existentes precisam continuar verdes.
- **Desempenho (CA-16):** medido na T3 com 100 mil mensagens; na VM Ampere, conferido na T10.

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste.
2. Suíte verde (`npm test`), `npm run lint` e a checagem de tipos.
3. Revisão (fluxo:revisor) sem achado grave pendente; correções em commit com o mesmo id.
4. Commit só depois de os testes passarem na mesma cadeia de comandos.
5. Commit único da tarefa, `{mensagem} (Tn)`, sem coautoria.
