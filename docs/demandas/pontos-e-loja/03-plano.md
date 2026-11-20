# Pontos e loja — Plano de desenvolvimento

> Demanda: `pontos-e-loja` · Base: técnica v1 (aprovada em 12/11/2026) · 12/11/2026 · Situação: **aprovado em 12/11/2026**
> Fonte da verdade das tarefas: `tarefas.json` (este arquivo traz a tabela gerada por `plano.py tabela` e a narrativa).

## Ordem e paralelismo
- **Começam juntas:** T1 (qualidades novas) e T2 (banco e domínio). Não dependem de nada e mexem em arquivos diferentes.
- **Servidor:** T2 → T3 (rotas e evento) → T4 (contador). O contador credita pelo domínio e avisa pelo mesmo evento da compra. T5 (conferência de qualidade com vales) precisa de T1 e T2 e pode correr junto de T3 e T4.
- **App:** T6 (CSS dos temas) precisa só dos ids de tema de T2 e pode correr junto do servidor. T7 (tela Loja) precisa das rotas (T3) e dos temas (T6). T8 (Aparência e qualidade com vales no app) vem depois de T1 e T7.
- **Fecha:** T9 (novidades e E2E) por último, com tudo pronto.
- **Ordem sugerida numa fila só:** T1, T2, T3, T5, T4, T6, T7, T8, T9.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Qualidades 720p60 e 1080p30 e o cargo de 1080p | front | — | a_fazer | — | — |
| T2 | Migração 017 e domínio da loja | node | — | a_fazer | — | — |
| T3 | Rotas /api/loja, evento loja:estado e auditoria da compra | node | T2 | a_fazer | — | — |
| T4 | Contador de minutos em voz | node | T3 | a_fazer | — | — |
| T5 | Servidor confere a qualidade com os vales | node | T1, T2 | a_fazer | — | — |
| T6 | Temas de loja no CSS: Cinzas do Trono, Arcano Dourado e Gibi | front | T2 | a_fazer | — | — |
| T7 | Tela Loja e saldo no painel | front | T3, T6 | a_fazer | — | — |
| T8 | Aparência com cadeado e qualidade liberada pelos vales no app | front | T1, T7 | a_fazer | — | — |
| T9 | Novidades da loja e E2E de ponta a ponta | front | T4, T5, T7, T8 | a_fazer | — | — |

Todos os 26 critérios de aceite têm tarefa. Os CA-9 e CA-19 aparecem também no E2E (T9).

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste.
2. Suíte de testes verde (`npm test`), lint e build.
3. Revisão sem achado grave pendente.
4. Validação registrada (`validacao` da tarefa) ou o motivo de não validar.
5. Commit único da tarefa, terminando com a linha de coautoria.
6. `tarefas.json` atualizado (estado e commit).

## Riscos de execução
- **E2E de voz com LiveKit exige Docker.** A contagem (T4) é coberta no servidor com socket.io-client e minuto curto, sem mídia. O E2E da loja (T9) não precisa de voz.
- **Fontes OFL novas (T6):** dependem de pacotes `@fontsource`. Sem eles, os títulos caem numa fonte serifada do sistema, e o tema continua funcionando.
- **Publicação:** o servidor precisa subir antes dos apps (técnica, seção 10). A nota de novidades (T9) depende de qual versão vai levar a loja: se a 0.15.0 sair antes, a loja vai na 0.16.0.
- **Validação com pessoas reais** (duas máquinas em voz, transmissão em 1080p de outro PC): fica para o uso com o grupo, depois de publicar.
