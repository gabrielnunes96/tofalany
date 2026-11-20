# Reações e respostas — Plano de desenvolvimento

> Demanda: `reacoes-e-respostas` · Base: técnica v1 (aprovada em 16/11/2026) · 16/11/2026 · Situação: **aprovado em 16/11/2026**
> Fonte da verdade das tarefas: `tarefas.json` (este arquivo traz a tabela gerada por `plano.py tabela` e a narrativa).

## Ordem e paralelismo
- **T1 vem antes de tudo.** Ela traz a migração 019 inteira e os contratos de reação. Todas as outras dependem do banco e do protocolo dela.
- **Depois da T1, a T2 e a T3 podem correr em paralelo.** A T2 mexe no servidor (respostas) e a T3 no app (reações), em arquivos diferentes.
- **A T4 depende da T3**, porque liga o seletor aos botões que a T3 cria.
- **A T5 depende da T2 e da T3**: precisa do contrato de resposta e mexe no mesmo `ItemMensagem.tsx`. A T4 e a T5 tocam arquivos diferentes, mas ficam em sequência para não misturar commits no mesmo componente.
- **A T6 depende da T5**, porque usa o trecho clicável.
- **A T7 (E2E com dois apps) depende da T4 e da T6**, porque precisa de tudo pronto.
- **A T8 (novidades) fica por último.**
- Na prática, a fila em uma sessão é T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Migração 019 e reações no servidor | node | — | a_fazer | — | — |
| T2 | Respostas no servidor e histórico até um id | node | T1 | a_fazer | — | — |
| T3 | Reações no app: faixa, atalhos e tempo real | front | T1 | a_fazer | — | — |
| T4 | Seletor de emoji | front | T3 | a_fazer | — | — |
| T5 | Responder no app: faixa no compositor e trecho na mensagem | front | T2, T3 | a_fazer | — | — |
| T6 | Ir até a mensagem original | front | T5 | a_fazer | — | — |
| T7 | E2E de reações e respostas com dois apps | front | T4, T6 | a_fazer | — | — |
| T8 | Novidades da 0.16.0 | front | T7 | a_fazer | — | — |

| ID | Critérios de aceite |
| --- | --- |
| T1 | CA-2, CA-5, CA-6, CA-7, CA-8, CA-9, CA-18, CA-20 |
| T2 | CA-10, CA-11, CA-12, CA-13, CA-14, CA-15, CA-16, CA-18 |
| T3 | CA-1, CA-2, CA-3, CA-4, CA-7, CA-19 |
| T4 | CA-1, CA-19 |
| T5 | CA-10, CA-12, CA-13, CA-14, CA-15, CA-17 |
| T6 | CA-11 |
| T7 | CA-1, CA-3, CA-4, CA-9, CA-10, CA-11, CA-12, CA-14, CA-15, CA-17, CA-18 |
| T8 | CA-20 (texto das novidades) |

Os 20 critérios têm pelo menos uma tarefa.

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste.
2. Suíte de testes verde (`npm test`), além de lint e build.
3. Revisão sem achado grave pendente.
4. Validação registrada pelo comando do perfil.
5. Commit único da tarefa.
6. `tarefas.json` atualizado com o commit e o estado.

## Riscos de execução
- **Comandos longos** (`npm test`, build e E2E) saem com código 137 em primeiro plano. Rodar em segundo plano.
- **Rolagem até a original (T6):** pode brigar com a compensação de rolagem do histórico. O plano B é rolar só depois de a página nova renderizar (`requestAnimationFrame` duplo), com teste dedicado.
- **Seletor de emoji (T4):** o JSON do emojibase pode ficar grande no bundle. O `import()` dinâmico o mantém fora do chunk principal, e o build confere isso.
- **Testes instáveis já conhecidos** (`TelaAuditoria`, `anexos.spec`): se falharem sem relação com a tarefa, roda-se de novo antes de investigar.
- **Release:** commit e tag ficam prontos aqui. O push é sempre do usuário.
