# Correções da atividade e do som da transmissão: plano de desenvolvimento

> Demanda: `correcoes-atividade` · Base: técnica v1 (aprovada em 20/11/2026) · 20/11/2026 · Situação: **aprovado em 20/11/2026**
> Fonte da verdade das tarefas: `tarefas.json` (este arquivo traz a tabela gerada por `plano.py tabela` e a narrativa).

## Ordem e paralelismo
- **Sem dependência entre si:** T1 (servidor), T2 (aba Amigos), T3 (log), T4 (`pendente`) e T8 (seletor no Windows). A ordem de execução é T1 → T2 → T3 → T4 → T8, uma por commit.
- **T3 antes das leituras:** T5, T6 e T7 gravam as falhas pelo `registro.ts`.
- **T5 antes da T7:** o Windows usa o parser da Steam (`steam.ts`).
- **T9 por último:** validação manual entre máquinas, com a build da atualização grande (ou uma build de teste do Windows pelo CI). Precisa do Gabriel e de um amigo no Windows.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Servidor: atividade só para quem pode ver e reenvio ao mudar a amizade | node | — | a_fazer | — | — |
| T2 | Atividade dos amigos na aba Amigos | front | — | a_fazer | — | — |
| T3 | Log em arquivo do processo principal (registro.ts) | node | — | a_fazer | — | — |
| T4 | Leitura pedida durante outra não se perde (pendente) e só ao mudar a atividade | node | — | a_fazer | — | — |
| T5 | Steam: nome oficial pelo appmanifest, ferramentas fora e várias pastas na linha | node | T3 | a_fazer | — | — |
| T6 | Linux: música do Spotify pelo navegador (MPRIS) | node | T3 | a_fazer | — | — |
| T7 | Windows: leitura em partes, RunningAppID da Steam e música pelas sessões de mídia | node | T3, T5 | a_fazer | — | — |
| T8 | Windows: som do sistema desmarcado na transmissão, com aviso | front | — | a_fazer | — | — |
| T9 | Validação entre máquinas com os amigos em chamada (Windows e Linux) | front | T1, T2, T4, T5, T6, T7, T8 | a_fazer | — | — |

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste.
2. Suíte de testes verde (`npm test`), mais `npm run lint` e a checagem de tipos.
3. Revisão (fluxo:revisor) sem achado grave pendente.
4. Validação registrada (`validacao` da tarefa), ou o motivo de não validar.
5. Commit único da tarefa, no formato `{mensagem} (Tn)`, sem coautoria.
6. `tarefas.json` atualizado (estado e commit).

## Riscos de execução
- **T7 sem Windows aqui:** o script do PowerShell (registro, WinRT) só é testado de verdade na T9. Os testes cobrem a interpretação da saída. Plano B: se o WinRT ou o `RunningAppID` falharem no Windows do amigo, o fallback mantém a leitura de hoje, e o log mostra o motivo.
- **Chrome no Linux sem `xesam:url`:** a música pelo Chrome não aparece (R-2 da técnica). Registrar se acontecer na T9.
- **E2E lento ou intermitente** (anexos.spec, rolagem da auditoria): rodar em segundo plano e repetir uma vez antes de investigar.

## Execução (20/11/2026)
- T1 a T8 feitas e commitadas no main local (sem push). Cada uma passou pelo revisor; as correções das revisões e da passada de segurança (fluxo:seguranca) entraram em commits com o mesmo id (44a2d4c T1, d221ee5 T3, 5336b6b T4, 9316a01 e 334fcc9 T7, ed3832b T8).
- Segurança: sem achado crítico ou alto. Corrigidos: título forjado na saída do PowerShell (valores limpos, só o primeiro `A:`/`D:`, caminho de rede recusado, motivos de erro por lista fixa); conexão que chega invisível apaga a atividade; leitura só das bibliotecas da Steam conhecidas e de arquivos pequenos; limite de uma mudança de atividade a cada 500 ms no servidor.
- Validação do perfil (`npm run build && npm test && npm run lint && npm run test:e2e`): build ok; 758 testes ok (o intermitente conhecido `TelaAuditoria.test.tsx` falhou uma vez e passou ao repetir); lint ok; E2E 47 ok e 4 pulados, rodado de novo sobre o código final.
- Conferido com dados reais no Linux: os `appmanifest` da Steam do Gabriel (ex.: "Baldurs Gate 3" → "Baldur's Gate 3"; runtimes, Proton e Lossless Scaling fora).
- **Falta a T9** (manual, entre máquinas): vai com a build da atualização grande. Pontos a conferir no Windows de um amigo: o script do PowerShell de verdade (código de saída, BOM, tempo da primeira carga do WinRT), o `RunningAppID`, a aba do Spotify no navegador e o aviso do som do sistema; no Linux, o Gabriel tocando no open.spotify.com pelo Firefox. O `tofalany.log` fica em `%APPDATA%\ToFalany\logs\` (Windows) e `~/.config/ToFalany/logs/` (Linux).
