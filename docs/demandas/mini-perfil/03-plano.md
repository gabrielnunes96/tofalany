# Mini perfil — Plano de desenvolvimento

> Demanda: `mini-perfil` · Base: técnica v1 (aprovada em 17/11/2026) · 17/11/2026 · Situação: **aprovado em 17/11/2026**
> As tarefas valem pelo `tarefas.json`. Este arquivo traz a tabela gerada por `plano.py tabela` e explica a ordem.

## Ordem e paralelismo
- **T1 vem primeiro:** traz a migração 021 e os contratos.
- **Depois dela, T2 (envio do fundo) e T3 (em comum) podem correr juntas:** são arquivos diferentes no servidor.
- **T4 (cartão) precisa de T1 e T3.**
- **Depois de T4, T5, T6 e T7 tocam arquivos diferentes do app.** T6 e T7 também precisam de T2.
- **T8 (E2E) vem quando T5, T6 e T7 estiverem prontas, e T9 (novidades) fica por último.**
- **Numa sessão só, a fila é T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9.**

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Perfil no servidor: migração 021, sobre mim, cores do fundo e membro desde | node | — | feito | — | dea3b21 |
| T2 | Envio do fundo: processarFundo, PUT e DELETE /api/eu/fundo | node | T1 | feito | — | 15758c7 |
| T3 | Perfil de outra pessoa: em comum e regra de quem conhece | node | T1 | feito | — | e2973a7 |
| T4 | Cartão da pessoa e onde ele abre | front | T1, T3 | feito | — | c7152a5 |
| T5 | Perfil completo | front | T4 | feito | — | c7152a5 |
| T6 | Editar o fundo e o sobre mim em Minha conta | front | T2, T4 | feito | — | ba35a7e |
| T7 | Fundo suave na lista de membros | front | T2, T4 | feito | — | ba35a7e |
| T8 | E2E do mini perfil com dois apps | front | T5, T6, T7 | feito | — | ef126e1 |
| T9 | Novidades da 0.17.0 | front | T8 | feito | — | 57608bb |

| ID | Critérios de aceite |
| --- | --- |
| T1 | CA-3, CA-9, CA-11, CA-13 |
| T2 | CA-6, CA-7, CA-8 |
| T3 | CA-10, CA-11 |
| T4 | CA-1, CA-2, CA-3, CA-4, CA-5, CA-11, CA-12 |
| T5 | CA-10 |
| T6 | CA-6, CA-9 |
| T7 | CA-14 |
| T8 | CA-1, CA-2, CA-4, CA-6, CA-8, CA-10, CA-14 |
| T9 | RF-6 |

Os 14 critérios têm pelo menos uma tarefa. As ameaças da seção 6 da técnica estão nas validações de T1, T2 e T3.

## Riscos do plano
- **T4 é a maior tarefa:** cria o cartão e mexe em 5 lugares do app. Se crescer demais, os gatilhos viram uma tarefa à parte.
- **A restrição do pedido de amizade (T3) muda um comportamento que já existe:** os testes de amizade atuais precisam continuar passando.
