# ToFalany no celular — plano de desenvolvimento

> Demanda: `celular` · Base: técnica v1 (aprovada em 23/11/2026) · Situação: **aprovado em 23/11/2026**
> Fonte da verdade: `tarefas.json`.

## Ordem
Servidor (T1→T2→T3) → app de computador (T4) → interface comum (T5) → Android (T6→T7→T8) → convite e CI (T9) → validação (T10) → manual (T11). A voz em segundo plano (T7) vem antes do push para descobrir cedo se o WebView aguenta (técnica R-2).

## Tarefas
| ID | Tarefa | Stack | Depende de | Estado | WI | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Servidor: aparelhos conectados (listar e desconectar sessões) e nome do aparelho no login | node | — | a_fazer | — | — |
| T2 | Servidor: push sem conteúdo e preferências de aviso | node | T1 | a_fazer | — | — |
| T3 | Servidor: chamar para a voz | node | T2 | a_fazer | — | — |
| T4 | App: aparelhos conectados, chamar para a voz e preferências de aviso no servidor | front | T3 | a_fazer | — | — |
| T5 | Interface: ponte com plataforma e grupos opcionais; layout de celular | front | T4 | a_fazer | — | — |
| T6 | Android: projeto Capacitor e a ponte do celular | front | T5 | a_fazer | — | — |
| T7 | Android nativo: voz em segundo plano e saída de áudio | kotlin | T6 | a_fazer | — | — |
| T8 | Android nativo: push, cofre e atualizador | kotlin | T7 | a_fazer | — | — |
| T9 | Servidor e CI: App Link, APK no convite e job Android | node | T8 | a_fazer | — | — |
| T10 | Validação completa e revisão | front | T9 | a_fazer | — | — |
| T11 | Validação manual com dois celulares | front | T10 | a_fazer | — | — |
