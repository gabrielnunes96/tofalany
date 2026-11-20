# Busca de GIF — Plano de desenvolvimento

> Demanda: `busca-de-gif` · Base: técnica v1 (aprovada em 17/11/2026) · 17/11/2026 · Situação: **aprovado em 17/11/2026**
> As tarefas valem pelo `tarefas.json`. Este arquivo traz a tabela gerada por `plano.py tabela` e explica a ordem.

## Ordem e paralelismo
- **T1 vem primeiro.** Traz os contratos em shared, a migração 020 e a rota de configuração. Todas as outras dependem dela.
- **Depois da T1, a T2 e a T3 podem correr em paralelo.**
  - A T2 mexe no processo principal (rede e IPC).
  - A T3 cria arquivos novos no renderer: o serviço e o painel.
- **T4 depende de T2 e T3**, porque liga o painel ao compositor e mostra o GIF na mensagem.
- **T5 (E2E) depende de T4**, porque precisa de tudo pronto.
- **T6 (novidades) fica por último.**
- Numa sessão só, a fila é T1 → T2 → T3 → T4 → T5 → T6.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | GIF no servidor: configuração, migração 020 e envio | node | — | feito | — | 6988753 |
| T2 | Liberar a Klipy no filtro de rede do app | front | T1 | feito | — | 9de4013 |
| T3 | Serviço da Klipy e painel de busca | front | T1 | feito | — | 9daae77 |
| T4 | Enviar e mostrar o GIF no chat | front | T2, T3 | feito | — | e0c1cf2 |
| T5 | E2E da busca de GIF com Klipy falsa e dois apps | front | T4 | feito | — | a6f59e1 |
| T6 | Novidades da 0.16.0 com a busca de GIF | front | T5 | feito | — | 5b4db4e |

| ID | Critérios de aceite |
| --- | --- |
| T1 | CA-2, CA-7, CA-8, CA-12 |
| T2 | CA-1, CA-6 |
| T3 | CA-3, CA-9, CA-10, CA-11 |
| T4 | CA-1, CA-2, CA-4, CA-5, CA-10, CA-12 |
| T5 | CA-1, CA-3, CA-4, CA-5, CA-6, CA-10 |
| T6 | RF-7 |

Todos os 12 critérios estão cobertos por pelo menos uma tarefa.

## Riscos do plano
- **Chave de teste com 100 chamadas por hora.** O teste manual com a chave real fica para depois da T5, numa sessão curta. Os testes automáticos usam a Klipy falsa e não gastam chamadas.
- **Mudança na API da Klipy.** O formato da resposta foi lido na documentação, não numa chamada real. A primeira busca real confirma o formato, e a conversão fica isolada em `servicos/gif.ts`.
