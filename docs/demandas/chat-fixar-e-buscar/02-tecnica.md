# Fixar e buscar mensagens: especificação técnica

> Demanda: `chat-fixar-e-buscar` · Base: funcional v1 · 21/11/2026 · Situação: **aprovada em 21/11/2026**

## 1. Visão da solução
Tudo fica no SQLite do servidor e nos padrões que o chat já usa (rotas `/api/canais|dms/:id/...`, eventos com ack, zustand por chave `c:<id>`/`d:<id>`).
- **Fixar:** tabela `mensagens_fixadas` (uma linha por mensagem fixada). Fixar e desafixar são eventos do socket com ack, conferidos como o `mensagem:apagar`. Fixar grava também uma **linha de sistema** em `mensagens` (`tipo = 'fixou'`), que o chat mostra como "fulano fixou uma mensagem".
- **Buscar:** índice FTS5 sem conteúdo (`busca_mensagens`, rowid = id da mensagem) com o texto e os nomes dos anexos, mantido por gatilhos. A rota `POST /api/busca` monta o MATCH a partir de termos tratados (nunca o texto cru) e limita o escopo em SQL pelo servidor do pedido e pelas DMs da pessoa.
- **Ir até a mensagem:** o histórico passa a abrir uma **janela em volta de um id** (antes e depois), para fixadas e resultados antigos (o "ir até" de hoje só alcança 1000 mensagens).

```text
FIXAR   menu da mensagem → socket 'mensagem:fixar' {id} (ack)
          → buscarMensagem → doServidor / participantesDa → temPermissao('fixar_mensagens') (canal)
          → transação imediata: conta < 50 → INSERT mensagens_fixadas → linha 'fixou' em mensagens (anti-spam)
          → auditoria (canal) → emitir 'fixadas:mudou' + 'mensagem:nova' (linha) para a conversa
LISTAR  botão "Fixadas" → GET /api/canais/:id/fixadas | /api/dms/:id/fixadas → painel na coluna direita
BUSCAR  campo "Buscar" → POST /api/busca {q, onde, canalId|dmId, autorId, comAnexo, comGif, antes}
          → termos → MATCH em busca_mensagens JOIN mensagens (escopo em SQL) → 25 + "mais"
          → destaques calculados no servidor → painel de resultados
IR ATÉ  clique → loja.irAte {chave, id} → abre o canal/DM → GET .../mensagens?em=<id> (janela) → rola e destaca
```

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| shared | node | Permissão `fixar_mensagens` (também em `PERMISSOES_SEM_CASTIGO`); DTOs de fixada e busca; `MensagemDto.fixou?`; eventos; `OlaPayload.recursos?`; tipos de auditoria | `shared/src/protocolo.ts:66,84,117,407,463,624,659,718`, `shared/src/auditoria.ts:2,47`, `shared/src/limites.ts:34` |
| server: banco | node | Migração 022 (fixadas, `tipo`/`ref_mensagem_id`, FTS5, gatilhos, reconstrução) | `server/src/db/migracoes.ts` (padrão 019/020) |
| server: domínio | node | `dominio/fixadas.ts` (novo), `dominio/busca.ts` (novo); `listarMensagens` com janela `em`/`depois`; `contarNaoLidas` ignora linhas de sistema | `server/src/dominio/mensagens.ts:100,142,149,154`, `server/src/dominio/leituras.ts:30` |
| server: rotas e socket | node | GET fixadas (canal e DM), `POST /api/busca`, `mensagem:fixar`/`desafixar`; editar, responder, reagir e fixar recusam linha de sistema; `recursos` no `ola` | `server/src/routes/mensagens.ts:12,35`, `server/src/realtime/mensagens.ts:53,122,178,207,240,276`, `server/src/realtime/tempo-real.ts:390` |
| client: estado e serviços | front | Fixadas por chave, `irAte` pendente, histórico com janela (`noFim`), API nova | `client/src/renderer/estado/loja.ts:275,288`, `client/src/renderer/servicos/api.ts`, `client/src/renderer/servicos/tempo-real.ts:154` |
| client: UI | front | "Fixar/Desafixar" no menu; "Fixadas" e "Buscar" no topo; painel de fixadas e de busca na coluna direita; linha "fixou"; "Ir para as mais recentes" | `ItemMensagem.tsx:149`, `CanalAberto.tsx:100`, `DmAberta.tsx:59`, `MensagensCanal.tsx:295,312`, `TelaPrincipal.tsx:1061,1163,2179` |

## 3. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `Permissao` | 15 permissões | + `fixar_mensagens` (não básica; sai no castigo) | App antigo mostra a caixa sem nome; servidor antigo recusa salvar cargo com ela (o app novo só mostra com `recursos.fixar`) |
| `GET /api/canais/:id/fixadas`, `GET /api/dms/:id/fixadas` | — | `{ fixadas: { mensagem: MensagemDto; fixadaPor: number \| null; fixadaEm: number }[] }` (mais nova primeiro, até 50) | Novas |
| `POST /api/busca` | — | corpo `{ q?: string(≤100); onde: 'conversa' \| 'servidor' \| 'dms'; canalId?; dmId?; autorId?; comAnexo?; comGif?; antes? }` (`additionalProperties: false`) → `{ resultados: { mensagem: MensagemDto; destaques: [inicio, fim][] }[]; mais: boolean }` | Nova. POST para o termo não ir para o log na URL (A15) |
| `GET .../mensagens` | `antes`, `limite`, `ate` | + `em=<id>` (janela: 25 antes, a mensagem, 25 depois; `fimAntes`/`fimDepois`) e `depois=<id>` (páginas para baixo) | Parâmetros opcionais; `ate` fica |
| Socket `mensagem:fixar` / `mensagem:desafixar` | — | `{ id }` → ack `{ ok }` | Novos |
| Evento `fixadas:mudou` | — | `{ canalId?; dmId?; mensagemId; fixada: boolean; por: number }` | App antigo ignora |
| `MensagemDto` | — | + `fixou?: { mensagemId: number; apagada: boolean }` (linha de sistema) | App antigo mostra a linha como mensagem comum "fixou uma mensagem." do autor (R-1) |
| `OlaPayload` | — | + `recursos?: { fixar: true; busca: true }` | App novo com servidor antigo esconde os recursos |
| Auditoria | — | + `mensagem_fixada`, `mensagem_desafixada` (só canal) | App antigo mostra o rótulo vazio (cosmético) |

## 4. Dados
**Migração 022** (transação, backup automático antes, como todas):
- `ALTER TABLE mensagens ADD COLUMN tipo TEXT NOT NULL DEFAULT 'normal'` (`'normal' | 'fixou'`) e `ADD COLUMN ref_mensagem_id INTEGER` (sem FK, como `resposta_a`: a linha fica e mostra "mensagem apagada").
- `mensagens_fixadas(mensagem_id INTEGER PRIMARY KEY REFERENCES mensagens(id) ON DELETE CASCADE, fixada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, fixada_em INTEGER NOT NULL)`. A conversa vem da própria mensagem (JOIN), nunca de uma coluna à parte (A3). Contagem por conversa pelo índice `mensagens_canal`/`mensagens_dm`.
- `CREATE VIRTUAL TABLE busca_mensagens USING fts5(texto, anexos, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2', prefix='2 3')`. Sem conteúdo: o texto não fica duplicado no banco nem sobra no índice depois de apagado (A8, A13).
- Gatilhos (só `tipo = 'normal'`): `mensagens` AFTER INSERT / AFTER UPDATE OF texto / AFTER DELETE (o DELETE em cascata de canal, servidor e DM dispara o gatilho, conferido); `anexos` AFTER UPDATE OF mensagem_id / AFTER DELETE reindexam a mensagem dona (o vínculo do anexo é um UPDATE depois do INSERT). GIF fica fora (está em `gif`, não em `texto`, RN-10).
- Reconstrução (RF-8, CA-14): `INSERT INTO busca_mensagens(rowid, texto, anexos) SELECT ...` de todas as mensagens normais, na mesma migração (~230 ms para 100 mil no benchmark).
- Índice novo: nenhum (o `mensagens_dm(dm_id, id)` e o `anexos_mensagem` já existem).
- **Rollback:** a migração não tem volta automática (padrão do projeto); a volta é a versão anterior com o backup `VACUUM INTO` que o `migrar` grava antes. As colunas e tabelas novas não atrapalham o servidor antigo se o banco for mantido (ele não lê `tipo`, e as linhas "fixou" aparecem como mensagens comuns).

## 5. Integrações externas
Não se aplica: tudo é SQLite local (better-sqlite3 13.0.3 com SQLite 3.53.4, FTS5 e `contentless_delete` disponíveis, conferido).

## 6. Segurança
Modelagem STRIDE de 21/11 (A1 a A18). Mitigações:
- **Escopo sempre no servidor (A1–A4, A9):**
  - canal só se `comunidadeDoCanal(id) === req.comunidadeId` e for de texto (senão 404);
  - "todos os canais" = `canais WHERE comunidade_id = req.comunidadeId AND tipo = 'texto'`;
  - DM só com `exigirParticipante` (admin também recebe 403); "todas as minhas DMs" = as DMs da pessoa que aparecem neste servidor (o mesmo filtro do `ola`: o outro é membro daqui ou amigo), montadas no servidor;
  - nenhuma lista de ids vinda do app; fixar parte da mensagem (`buscarMensagem` → `doServidor` → `participantesDa`).
- **Entrada da busca (A6, A7):** NFKC, até 8 termos de 2 a 32 caracteres, cada um vira `"termo"*` com aspas dobradas; filtros de autor, anexo e GIF em SQL com parâmetros, fora do MATCH. Paginação por `rowid < antes`, 25 por vez, sem OFFSET. Limite de 10 buscas por 10 s por pessoa (429, `criarLimitador`).
- **Castigo (A5):** `fixar_mensagens` em `PERMISSOES_SEM_CASTIGO`.
- **Limite de 50 e duplicata (A10):** contar e inserir em `banco.transaction(...).immediate()`; PK em `mensagem_id`.
- **Spam e falsificação da linha (A11, A12):** até 5 fixar/desafixar por 30 s por pessoa; nova linha "fixou" só se a mesma pessoa não fixou a mesma mensagem nos últimos 10 min; a linha é gerada pelo servidor e não aceita editar, responder, reagir nem fixar; fica fora do índice e das não lidas.
- **Nada de trecho guardado (A13):** fixada e linha guardam só o id; o texto sai da mensagem na leitura (como `trechosDasOriginais`).
- **Auditoria (A14):** `mensagem_fixada`/`mensagem_desafixada` com ator, canal, autor da mensagem e `{ mensagem: id }`, sem o texto; DM não vai para a auditoria (RN-21).
- **Destaque sem HTML (A16):** o servidor devolve intervalos `[início, fim]`; o React monta `<mark>` como texto, sem `dangerouslySetInnerHTML`.
- **DM com conta removida (A17):** só leitura, como hoje: lista fixadas, não fixa.
- **Corpo (A18):** schema com `additionalProperties: false`, ids inteiros ≥ 1; `fixada_por` é sempre quem chamou.

## 7. Observabilidade
- Auditoria do servidor para fixar e desafixar em canal.
- Log: a rota de busca é POST (o termo não aparece na URL do log); erro interno continua "Erro interno" ao app e detalhe só no log.
- Diagnóstico do índice: `INSERT INTO busca_mensagens(busca_mensagens) VALUES('integrity-check')` (usado nos testes; dá para rodar com `./vm.sh consulta`).

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | `permissoesDe` sem `fixar_mensagens` (sem cargo e de castigo); `ItemMensagem` sem "Fixar" | socket `mensagem:fixar` sem permissão → erro; de castigo → erro | E2E: membro comum não vê "Fixar" |
| CA-2 | `GerenciarCargos` mostra "Fixar mensagens" desmarcada | cargo com a permissão fixa; GET fixadas lista | E2E: dar a permissão e fixar |
| CA-3 | — | DM: os dois fixam e desafixam; terceiro e admin → 403 | — |
| CA-4 | — | 50 fixadas → a 51ª recusada com o texto; corrida (duas no mesmo tique) | — |
| CA-5 | loja aplica `fixadas:mudou`; linha "fixou" não conta como não lida nem notifica (`decidirMensagemNova`) | segundo socket recebe `fixadas:mudou` e a linha; `contarNaoLidas` não conta a linha | E2E com dois apps |
| CA-6 | `irAte` + janela na loja; `noFim` e "Ir para as mais recentes" | `GET ...?em=<id>` com 3000 mensagens depois: janela certa, `fimAntes`/`fimDepois` | E2E: clicar numa fixada antiga |
| CA-7 | painel reage a `mensagem:apagada`/`editada` | apagar → some das fixadas; editar → texto novo; linha "fixou" vira "mensagem apagada" | — |
| CA-8 | montador de termos ("voce jog" → `"voce"* "jog"*`); destaques de "Você" e "jogar" | busca devolve a mensagem com os dois intervalos | E2E: busca simples |
| CA-9 | — | canal de outro servidor (com e sem prefixo) → 404 e 0 resultados; DM alheia → 403; "minhas DMs" sem as dos outros; expulso → 403 | — |
| CA-10 | — | "servidor" traz #geral e outros com o canal; "conversa" só #geral | E2E: trocar o filtro |
| CA-11 | — | só "com anexo"; "planilha" acha pelo nome do anexo; "com GIF"; anexo vinculado depois indexa | — |
| CA-12 | — | `autorId` filtra | — |
| CA-13 | troca de canal + `irAte` | — | E2E: resultado de outro canal abre e destaca |
| CA-14 | — | migração de um banco na versão 21 com mensagens → busca acha as antigas; `integrity-check` | — |
| CA-15 | painel recusa 1 letra sem filtro | servidor recusa termo de 1 letra (400) | — |
| CA-16 | — | 100 mil mensagens em 5 servidores e 50 DMs: termo comum, 2 letras, 8 termos e "com anexo" sem texto, cada um < 500 ms | — |
| Segurança | montador com `"`, `texto:`, `NEAR(`, `OR`, `-x`, `^`, `*`, `(`; destaque com `<img onerror>` vira texto | sem 500 com essas entradas; 11ª busca em 10 s → 429; spam de fixar → limite; editar linha de sistema → recusa; termo fora do log | — |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Linha "fulano fixou" | (a) linha em `mensagens` com `tipo`; (b) evento próprio e linha montada no app | (a): entra na ordem e na paginação do histórico sem lógica nova, e aparece para quem abrir a conversa depois. Custo: um app antigo a mostra como mensagem comum ("fixou uma mensagem.") e pode contar como não lida. Aceito porque a mega update chega a todos pela atualização automática. |
| R-2 | "Ir até" mensagem antiga (CA-6, CA-13) | (a) subir o limite de 1000; (b) janela em volta do id | (b): o limite de 1000 não alcança "3 meses atrás" num grupo ativo, e subir carrega milhares de mensagens. A janela muda o histórico para "não está no fim": mensagem nova não entra na tela, aparece "Ir para as mais recentes". |
| R-3 | Índice com conteúdo (externo) ou sem conteúdo | externo em `mensagens` com `snippet()`; sem conteúdo com destaque calculado no servidor | Sem conteúdo: o índice junta texto e nomes de anexo (de tabelas diferentes) e não guarda cópia do texto. O destaque é calculado em TypeScript com a mesma normalização (minúsculas, sem acento, prefixo). |
| R-4 | Escopo por JOIN ou por coluna de escopo no índice (A7) | JOIN com filtro em SQL; tokens `c<canal>`/`d<dm>` no índice | JOIN: 0,2 a 9 ms em 100 mil no benchmark; o CA-16 mede com vários servidores. Se não couber, a coluna de escopo entra sem mudar o contrato. |
| R-5 | "Todas as minhas DMs" | todas da conta; só as que aparecem neste servidor | Só as que aparecem neste servidor: um resultado de DM fora da lista não abriria. |
| R-6 | Fixar em DM com conta removida | permitir; só leitura | Só leitura (a DM já é só leitura). |
| R-7 | Bug pré-existente: quem tem "Apagar mensagens" sem ser administrador não vê "Apagar" (`TelaPrincipal.tsx:2087` passa `ehAdmin`) | corrigir aqui; deixar | Fora do escopo; a permissão de fixar não copia esse padrão (vem de `permissoes.has`). Registrado para o backlog. |
| R-8 | App novo com servidor antigo | quebrar; detectar | `ola.recursos`: sem ele, o app esconde "Fixar", "Fixadas", "Buscar" e a permissão nova. |

## 10. Implantação e rollback
- Ordem: servidor primeiro (migração 022 e rotas), depois o app (pela release, junto da mega update). App antigo continua funcionando (R-1).
- Sem flag: o recurso aparece quando os dois lados são novos (`recursos`).
- Rollback: voltar a imagem anterior com o backup do `VACUUM INTO` (padrão do `migrar`). Sem restaurar, o servidor antigo funciona com o banco novo (linhas "fixou" viram mensagens comuns; índice e tabela ficam sem uso).

## 11. CI/CD
Sem mudança: CI e release de sempre (build, testes, lint, E2E). A migração roda na subida do servidor.
