# Infraestrutura e atualização: plano de desenvolvimento

> Demanda: `infra-e-atualizacao` · Base: técnica v1 (aprovada em 21/11/2026) · 21/11/2026 · Situação: **aprovado em 21/11/2026**
> Fonte da verdade das tarefas: `tarefas.json`.

## Ordem e paralelismo
- Código sem tocar a VM: T1, T2, T3 e T5 não dependem entre si. Ordem: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9.
- T4 depende da rota da T1; T6 da T1 (PEDIDOS, TRUST_PROXY) e da T5 (vm.sh); T7 da T2 (MUSICA_POT_URL); T8 da T7 (Dockerfile); T9 da T5 e T6.
- T10 é a implantação na VM, só com o OK do Gabriel a cada passo, junto da atualização grande.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Servidor: rota do pedido de atualização, voz pelo host e trustProxy restrito | node | — | a_fazer | — | — |
| T2 | Cookies do ToOuvini: cópia por execução, promoção atômica, máscara e ambiente mínimo | node | — | a_fazer | — | — |
| T3 | App: troca do endereço antigo pelo fixo | front | — | a_fazer | — | — |
| T4 | App: 'Atualizar o servidor agora' no menu do administrador da instalação | front | T1 | a_fazer | — | — |
| T5 | vm.sh: trava única e comando dominio (DuckDNS) | node | — | a_fazer | — | — |
| T6 | VM: pasta de pedidos, vigia do systemd, bgutil, redes e dois nomes | node | T1, T5 | a_fazer | — | — |
| T7 | Imagem: yt-dlp com checksum e plugin do gerador de token | node | T2 | a_fazer | — | — |
| T8 | CI: imagem amd64 + arm64 com runners nativos e permissões por job | node | T7 | a_fazer | — | — |
| T9 | Migração: DuckDNS apontado só depois da restauração | node | T5, T6 | a_fazer | — | — |
| T10 | Implantação e validação na VM (com OK do Gabriel a cada passo) | node | T1, T2, T3, T4, T5, T6, T7, T8, T9 | a_fazer | — | — |

## Definição de pronto (vale para toda tarefa)
1. Critérios de aceite da tarefa cobertos por teste (ou pela validação descrita, nos scripts de shell e no CI).
2. Suíte verde (`npm test`), `npm run lint` e a checagem de tipos; `bash -n` e `shellcheck` nos scripts.
3. Revisão (fluxo:revisor) sem achado grave pendente; correções em commit com o mesmo id.
4. Commit só depois de os testes passarem na mesma cadeia de comandos.
5. Commit único da tarefa, `{mensagem} (Tn)`, sem coautoria.
6. `tarefas.json` atualizado.

## Riscos de execução
- O CI multi-arquitetura (T8) só se valida de verdade com um push de tag de teste (o push é do Gabriel).
- O digest e a versão do bgutil precisam ser lidos do registro na hora da T6/T7.
- Nada roda na VM de produção antes da T10.
