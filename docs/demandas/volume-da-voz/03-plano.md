# Volume da voz: plano de desenvolvimento

> Demanda: `volume-da-voz` · Base: técnica v1 (aprovada em 21/11/2026) · 21/11/2026 · Situação: **aprovado em 21/11/2026**
> Fonte da verdade das tarefas: `tarefas.json`.

## Ordem e paralelismo
- T1 (preferências) primeiro: todas as outras usam os campos novos.
- T2 (nós do nivelamento) antes de T3, T4 e T6.
- T5 depois de T3 (o volume da chamada já aplicado na sala).
- T7 é manual, com a build da atualização grande.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Preferências: nivelar, ganho do microfone e volume da chamada | node | — | a_fazer | — | — |
| T2 | Nivelamento no microfone: compressor, cruzamento, ganho e limitador depois do portão | front | T1 | a_fazer | — | — |
| T3 | Chamada: nivelamento e ganho ao vivo; volume da chamada para quem ouve | front | T2 | a_fazer | — | — |
| T4 | Configurações → Voz: nivelar, ganho, volume da chamada e teste de som ao vivo | front | T1, T2 | a_fazer | — | — |
| T5 | Painel de voz: botão 'Volume da chamada' | front | T1, T3 | a_fazer | — | — |
| T6 | E2E: níveis do nivelamento medidos no Chromium | front | T2 | a_fazer | — | — |
| T7 | Validação manual: voz nivelada entre duas pessoas | front | T1, T2, T3, T4, T5, T6 | a_fazer | — | — |

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste.
2. Suíte verde (`npm test`), `npm run lint` e a checagem de tipos.
3. Revisão (fluxo:revisor) sem achado grave pendente; correções em commit com o mesmo id.
4. Validação registrada, ou o motivo de não validar.
5. Commit único da tarefa, `{mensagem} (Tn)`, sem coautoria.
6. `tarefas.json` atualizado.

## Riscos de execução
- O E2E de nível (T6) pode mostrar que o compressor do Chromium desvia do esperado: ajustar os parâmetros em `parametrosNivel` e registrar.
- O E2E de voz é lento e tem o intermitente conhecido da auditoria: rodar em segundo plano e repetir uma vez.

## Execução (21/11/2026)
- T1 a T6 feitas e commitadas no main local (sem push), cada uma revisada; as correções entraram em commits com o mesmo id (b95395a e 6ca0969 T1; 2a638cc T2; cc77aea e 6dfb5cc T3; 1617f0d T4/T5; 8458f03 T6, que também ajusta o limitador).
- **Medido no Chromium do app (E2E `client/e2e/nivel-voz.spec.ts`):**
  - nivelado: −40 e −6 dBFS saem a −24,2 e −15,4 dB (diferença de 34 dB caiu para 8,8 dB, CA-2), e a fala de −20 dBFS sai a −19,0 dB;
  - sem nivelar: a voz sai igual à de hoje (±0,2 dB, CA-3);
  - ganho de 200%: +6,02 dB (CA-4);
  - ganho de 300% sem nivelar, entrada a 0 dBFS: pico em −1,53 dBFS.
- Ajustes da execução: compressor em −45 dB, 4:1 (os −30 dB da técnica não passariam no CA-2); correção da compensação automática do compressor e do limitador (revisão da T2); limitador em −2,5 dBFS (com −2, o pico ficava em −1,06 dBFS). Registrado na T-2 da técnica.
- **Efeito conhecido:** enquanto o portão está aberto, o ruído abaixo de −45 dBFS sobe com a voz (de −55 para −37 dB); o portão fecha 300 ms depois da fala. Conferir na validação manual se incomoda.
- Validação do perfil: build ok; 816 testes; lint ok; E2E 50 ok e 4 pulados (inclui o CA-21, sentinela da RN-6). Um teste do `App.test.tsx` estourou o tempo uma vez sob a carga da suíte e passou três vezes sozinho (intermitente).
- **Falta a T7** (manual, na build da atualização grande): voz nivelada entre duas pessoas; botão "Volume da chamada" no painel de voz com a voz conectada (conferir se o painelzinho não é cortado pela coluna); teste de som com o ganho. A ligação do botão do painel com a gravação não tem teste automatizado (a tela principal inteira não é montada nos testes).
