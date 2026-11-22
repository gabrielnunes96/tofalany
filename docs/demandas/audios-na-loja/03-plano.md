# Áudios na loja, com raridade — plano de desenvolvimento

> Demanda: `audios-na-loja` · Base: técnica v1 (aprovada em 22/11/2026) · 22/11/2026 · Situação: **aprovado em 22/11/2026** ("mete bronca em tudo")
> Fonte da verdade das tarefas: `tarefas.json`.

## Ordem e paralelismo
- Servidor: T1 → T2 → T3 → T4. App: T5 (loja e soundboard) e T6 (administração). T7 fecha com E2E e validação completa; T8 é manual.

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Base: migração 024, contratos da loja de áudios, preços e nome sem bidi | node | — | a_fazer | — | — |
| T2 | Servidor: cadastro, alteração e retirada dos áudios da loja (admin da instalação) | node | T1 | a_fazer | — | — |
| T3 | Servidor: compra de áudio e catálogo | node | T2 | a_fazer | — | — |
| T4 | Servidor: tocar áudio comprado e conferências do soundboard | node | T3 | a_fazer | — | — |
| T5 | App: seção Áudios na loja e Meus sons no soundboard | front | T4 | a_fazer | — | — |
| T6 | App: tela Áudios da loja no menu Administração | front | T5 | a_fazer | — | — |
| T7 | E2E e validação completa | front | T5, T6 | a_fazer | — | — |
| T8 | Validação manual com o grupo | front | T7 | a_fazer | — | — |

## Riscos
- Mudança no toque dos sons do servidor (servidor do canal, AFK, castigo): mais restritivo, coberto por teste.
- 400 MB no pior caso em disco (200 áudios).
