# Tô Falando v1 — Plano de desenvolvimento

> Demanda: `to-falando-v1` · Base: técnica com auditoria (funcional v4) · 05/11/2026 · Situação: **aprovado em 05/11/2026**
> Fonte da verdade das tarefas: `tarefas.json` (este arquivo traz a tabela gerada por `plano.py tabela` e a narrativa).

## Ordem e paralelismo
Segue a ordem da demanda: servidor e texto → voz → soundboard → webcam → transmissão → empacotamento e implantação. 27 tarefas, 63 critérios de aceite, todos cobertos. A T27 (auditoria, pedida em 05/11) entra logo depois da T4: ela cria o registro, e as tarefas que geram eventos (T6, T8, T10, T14, T18, T21) passam a depender dela e gravam os próprios eventos.

| Fase | Tarefas | Sequência obrigatória | Pode correr em paralelo |
| --- | --- | --- | --- |
| 1. Base | T1 → T2 → T4 | esqueleto antes de tudo; sessão antes do socket | T3 (logo após T2) |
| 2. Auditoria, contas e texto | T27; T5, T6, T7, T8 → T9 → T10, T11 → T12 → T13 | auditoria antes das ações que ela registra; canais antes do chat; DM reaproveita edição e anexos | T27, T5 e T7 entre si; depois T6 e T8; T10 e T11 entre si |
| 3. Voz | T14 → T15 → T16; T17 | LiveKit e token antes de qualquer mídia; pipeline antes do portão de voz | T17 com T15/T16 |
| 4. Soundboard | T18 → T19 | cadastro antes de tocar; tocar exige voz (T14) | T18 já na fase 2 (só depende de T6) |
| 5. Vídeo e tela | T20; T21 → T22 | trava antes da regra de qualidade | T20 com T21 |
| 6. Fechamento | T23 → T24; T25 → T26 | medições de RAM/rede com tudo pronto; README por último | T25 logo após T14 |

Validação por fase: ao fim de cada fase eu paro e você testa o que depende de duas pessoas ou de hardware real (voz, PTT, webcam, 1440p60, Windows), como a demanda pede ("validar cada etapa funcionando antes de avançar").

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Esqueleto do monorepo e primeira execução | front | — | feito | — | a26d78d |
| T2 | Cadastro, login e sessão | node | T1 | feito | — | 4c7f728 |
| T3 | CLI de redefinição de senha | node | T2 | feito | — | 5b1211b |
| T4 | Conexão em tempo real | front | T2 | feito | — | 8e930ac |
| T27 | Auditoria: registro, retenção e tela do administrador | front | T4 | a_fazer | — | — |
| T5 | Perfil: avatar, cor e nome de exibição | front | T4 | a_fazer | — | — |
| T6 | Cargos e administração | front | T4, T27 | a_fazer | — | — |
| T7 | Link de convite | front | T4 | a_fazer | — | — |
| T8 | Canais de texto e de voz | front | T4, T27 | a_fazer | — | — |
| T9 | Chat de texto com histórico | front | T8 | a_fazer | — | — |
| T10 | Editar, apagar e digitando | front | T9, T27 | a_fazer | — | — |
| T11 | Anexos: imagens e documentos | front | T9 | a_fazer | — | — |
| T12 | Mensagens diretas | front | T10, T11 | a_fazer | — | — |
| T13 | Não lidas e notificações | front | T12 | a_fazer | — | — |
| T14 | Entrar em canal de voz (LiveKit) | front | T8, T27 | a_fazer | — | — |
| T15 | Áudio: dispositivos, tratamento e teste de microfone | front | T14 | a_fazer | — | — |
| T16 | Detecção de voz, push-to-talk, mute, deafen e atalhos | front | T15 | a_fazer | — | — |
| T17 | Volume por pessoa e sons de voz | front | T14 | a_fazer | — | — |
| T18 | Soundboard: cadastro pelo administrador | front | T6, T27 | a_fazer | — | — |
| T19 | Soundboard: tocar no canal de voz | front | T18, T14 | a_fazer | — | — |
| T20 | Webcam | front | T14 | a_fazer | — | — |
| T21 | Transmissão de tela com trava por canal | front | T14, T27 | a_fazer | — | — |
| T22 | Qualidade por cargo, codec e áudio do sistema | front | T21 | a_fazer | — | — |
| T23 | Reconexão da sala, memória e privacidade de rede | front | T16, T17, T19, T20, T22 | a_fazer | — | — |
| T24 | Instaladores Windows e Linux | front | T7, T23 | a_fazer | — | — |
| T25 | Implantação com docker-compose | node | T14 | a_fazer | — | — |
| T26 | README de uso e implantação | outra | T24, T25 | a_fazer | — | — |

Critérios por tarefa: T1 CA-1 · T2 CA-2..6 · T3 CA-7 · T4 CA-42 (texto) · T27 CA-48, 52, 53, 54, 55 · T5 CA-8 · T6 CA-9..11b, CA-50 · T7 CA-1a · T8 CA-12, 13, CA-50 · T9 CA-14, 15 · T10 CA-17, 18, CA-50, 51 · T11 CA-16, 16a, 16b · T12 CA-19a, 19b · T13 CA-19 · T14 CA-20, CA-49 · T15 CA-25, 26, 28, 30 · T16 CA-21..24 · T17 CA-27, 29 · T18 CA-31, CA-50 · T19 CA-32..35 · T20 CA-36 · T21 CA-37, 38, 41, CA-49 · T22 CA-39, 39a, 40 · T23 CA-42 (voz), 45, 46 · T24 CA-43 · T25 CA-44 · T26 CA-47.

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste.
2. Suíte de testes verde (`npm test`), além de `npm run lint` e `npm run build`.
3. Revisão (agente revisor) sem achado grave pendente.
4. Validação registrada: automática (`npm run build && npm test`, E2E quando houver) e, quando depender de duas pessoas ou hardware real, o resultado do seu teste — ou o motivo de não validar.
5. Commit único da tarefa no formato do perfil (`{mensagem} (Tn)`), só depois do seu "pode commitar".
6. `tarefas.json` e `cards/Tn.html` atualizados com implementação, testes e validação.

## Riscos de execução
| Risco | Plano B |
| --- | --- |
| Docker não instalado quando chegar a T14 | Instalar antes da fase 3 (comandos já passados); sem ele, T14 em diante para. |
| Testes com mídia falsa não provam qualidade real de áudio/vídeo | Validação manual por fase, registrada no card; tarefa fica "não validado: motivo" até o teste. |
| `uiohook-napi` ou `sharp` sem binário para a versão do Electron/Node | Recompilar com `electron-rebuild`; se falhar, PTT só com o app em foco (registrado como pendência). |
| RAM acima de 300 MB na T23 | Carregamento sob demanda das telas; se não bastar, volto à técnica com o número medido. |
| `.exe` pelo wine falhar | Gerar no Windows (você) com o mesmo `npm run dist:win`. |
| Tarefas grandes (T11, T15, T16, T21) não caberem numa sessão | Quebrar na hora em Tn-a/Tn-b no `tarefas.json`, com aviso. |
