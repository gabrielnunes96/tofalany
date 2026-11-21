# Vídeo: modo teatro, câmeras e sons — plano de desenvolvimento

> Demanda: `video-teatro-cameras-e-sons` · Base: técnica v1 (aprovada em 21/11/2026) · 21/11/2026 · Situação: **rascunho**
> Fonte da verdade das tarefas: `tarefas.json`.

## Ordem e paralelismo
- T1 primeiro: é o protótipo da janela própria (R-1). Se o vídeo não aparecer na janela filha, paro e volto com as opções antes de T3 e T5.
- Independentes: T2 (câmeras flutuantes), T4 (barra e modo teatro), T6 (sons) e T7 (contador).
- T3 depende de T1 e T2; T5 de T1 e T4; T8 fecha tudo; T9 é a validação manual do Gabriel.
- Ordem de execução: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Janela própria: base no main e protótipo do vídeo na janela filha | front | — | a_fazer | — | — |
| T2 | Câmeras flutuantes desenhadas sobre a janela e "Voltar as câmeras ao lugar" | front | — | a_fazer | — | — |
| T3 | Câmeras em janela própria | front | T1, T2 | a_fazer | — | — |
| T4 | Barra de controles, modo teatro e prévia ampliada inteira | front | — | a_fazer | — | — |
| T5 | Transmissão assistida em janela própria | front | T1, T4 | a_fazer | — | — |
| T6 | Sons da transmissão | front | — | a_fazer | — | — |
| T7 | Contador de espectadores flutuante com cores | front | — | a_fazer | — | — |
| T8 | E2E e validação completa | front | T3, T5, T6, T7 | a_fazer | — | — |
| T9 | Validação manual com o grupo (outro monitor e três pessoas) | front | T8 | a_fazer | — | — |

## Riscos do plano
- **T1 (protótipo):** a janela filha no mesmo processo com `sandbox` e a página em `file://` não foi confirmada no Electron 45.
- **T4 mexe no PainelTransmissao**, que tem testes com os rótulos atuais ("Tela cheia", "Fechar", "Volume da transmissão"): os nomes acessíveis continuam os mesmos.
- **Testes de transmissão no E2E** dependem do LiveKit em contêiner (pulados no modo isolado); vários monitores e sons entre três pessoas ficam para a T9.

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste (ou pela validação manual, na T9).
2. Suíte verde (`npm test`), `npm run lint` e a checagem de tipos.
3. Revisão (fluxo:revisor) sem achado grave pendente; correções em commit com o mesmo id.
4. Commit só depois de os testes passarem (código de saída do vitest, não o texto da saída).
5. Commit único da tarefa, `{mensagem} (Tn)`, sem coautoria.
