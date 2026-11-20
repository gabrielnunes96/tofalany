# Reações e respostas — Especificação técnica

> Demanda: `reacoes-e-respostas` · Base: funcional v1 (aprovada em 16/11/2026) · 16/11/2026 · Situação: **aprovada em 16/11/2026**

## 1. Visão da solução

As reações ficam numa tabela própria (`reacoes`), com uma linha por mensagem, emoji e pessoa. A resposta é uma mensagem comum com duas colunas a mais em `mensagens`: `resposta_a` e `resposta_avisa`.

Tudo o que é ação passa pelo socket, como hoje acontece com enviar, editar e apagar:
- `reacao:alternar` põe ou tira a reação da pessoa;
- o servidor confere permissão, emoji e limite numa transação e manda a lista inteira de reações daquela mensagem (`mensagem:reacoes`) para quem vê a conversa.

O histórico já chega com reações e trecho da original, montados em lote como os anexos (`comAnexos`). O aviso de resposta entra em `mencoes`. Com isso, o destaque e a notificação de hoje funcionam sem regra nova, inclusive nos apps 0.15.x.

```text
ItemMensagem ─(👍)─> socket 'reacao:alternar' {mensagemId, emoji}
                        │ realtime/mensagens.ts: lerMensagemVisivel → permissão/castigo → validarEmoji
                        ▼
              dominio/reacoes.ts alternarReacao() [transação: existe? DELETE : (≤20 emojis? INSERT)]
                        │
     emitir() ──> 'mensagem:reacoes' {id, canalId, dmId, reacoes[]}  (sala do servidor | conexões da DM)
                        ▼
                 loja.ts aplicarReacoes() ──> ItemMensagem re-renderiza

Compositor (faixa "Respondendo a") ─> 'mensagem:enviar' {destino, texto, anexos, respostaA, avisar}
                        │ confere: original existe e é do mesmo canal/DM
                        │ mencoes ∪= {autor da original} se avisar e autor ≠ eu
                        ▼
              inserirMensagem(... resposta_a, resposta_avisa) ──> 'mensagem:nova' (DTO com resposta)

Clique no trecho ─> já carregada? rola : GET histórico ?antes=<primeiro>&ate=<id> ─> rola e destaca
```

## 2. Componentes afetados

| Projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| shared | TS | DTOs de reação e resposta, eventos novos, campos novos em `mensagem:enviar`, limites, validação de emoji, novidades 0.16.0 | `shared/src/protocolo.ts:426-440,582-634,637-645`; `shared/src/validacao.ts:172-177`; `shared/src/limites.ts:26,35`; `shared/src/novidades.ts` |
| server | Node/Fastify/SQLite/socket.io | Migração 019, `dominio/reacoes.ts` (novo), reações e trecho em lote no histórico, resposta no envio, evento `reacao:alternar`, parâmetro `ate` no histórico | `server/src/db/migracoes.ts:251-268`; `server/src/dominio/mensagens.ts:33-93`; `server/src/realtime/mensagens.ts:28-67,86-153,155-216`; `server/src/routes/mensagens.ts:12-54`; `server/src/dominio/anexos.ts:135-147` (modelo) |
| client | Electron/React/zustand | Ações Reagir e Responder, 👍 😂 ❤️, faixa de reações, seletor de emoji (novo), trecho da original, faixa "Respondendo a" no compositor, carregar até a original, store, notificação | `client/src/renderer/componentes/ItemMensagem.tsx:36,78-130`; `client/src/renderer/componentes/MensagensCanal.tsx:30-50,190-243,273-304,330-370,418-462`; `client/src/renderer/componentes/CanalAberto.tsx:135-149`; `client/src/renderer/componentes/DmAberta.tsx:61-79`; `client/src/renderer/telas/TelaPrincipal.tsx:742-764,1047-1085`; `client/src/renderer/estado/loja.ts:255-295`; `client/src/renderer/estado/notificar.ts:37-41`; `client/src/renderer/servicos/tempo-real.ts:19-21,149-151`; `client/src/renderer/servicos/api.ts:205-206`; `client/src/renderer/estilos/base.css:396-397` |

Componentes novos no client:
- `componentes/SeletorEmoji.tsx` (o componente é leve; o que vem sob demanda são os dados de emoji, por `import()` dinâmico);
- `componentes/Reacoes.tsx`, a faixa debaixo da mensagem;
- `servicos/emojis.ts`, que carrega os dados e guarda os recentes.

## 3. Contratos

| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `MensagemDto` (protocolo.ts:426) | sem reação nem resposta | + `reacoes?: ReacaoDto[]` (só quando há), `ReacaoDto = { emoji: string; usuarios: number[] }`, na ordem do primeiro uso. + `resposta?: RespostaDto`, `RespostaDto = { id: number; apagada: true } \| { id: number; apagada?: false; autorId: number; trecho: string; soAnexo?: true }` | Campos opcionais. O app 0.15.x ignora os dois e mostra a mensagem comum (CA-20). |
| `'mensagem:enviar'` (protocolo.ts:645) | `{ destino, texto, anexos? }` | + `respostaA?: number`, `avisar?: boolean` (padrão `true`) | O servidor antigo ignora as chaves novas, e a mensagem sai sem vínculo. O servidor sobe antes dos apps. |
| `'reacao:alternar'` (EventosCliente, novo) | — | `(dados: { mensagemId: number; emoji: string }, ack: Ack<ReacaoDto[]>)`. Erros no texto do ack: "Emoji inválido.", "Esta mensagem já tem 20 reações diferentes.", "Você não pode reagir aqui.", "Mensagem não encontrada." | Novo. Com o servidor antigo o ack expira em 10 s e o app avisa a falha. Não acontece se o servidor subir antes. |
| `'mensagem:reacoes'` (EventosServidor, novo) | — | `(dados: { id: number; canalId: number \| null; dmId: number \| null; reacoes: ReacaoDto[] })`, sempre com a lista inteira, o que torna o evento idempotente entre abas e conexões | O app antigo ignora o evento. |
| Histórico de canal e de DM (`routes/mensagens.ts:12,35`) | `?antes=&limite=` | + `?ate=<id>`: com `ate`, devolve todas as mensagens com `ate ≤ id < antes`, até `HISTORICO_ATE_MAX = 1000`, e `limite` é ignorado. Mais que isso devolve só a página normal e `fim: false` | Querystring opcional. O app antigo não manda. |
| Limites (`shared/src/limites.ts`) | — | `REACOES_POR_MENSAGEM = 20`, `TRECHO_RESPOSTA = 100`, `HISTORICO_ATE_MAX = 1000`, `REACOES_RAJADA = { eventos: 20, janelaMs: 10_000 }` | Novos. |
| `validarEmojiReacao(s)` (`shared/src/validacao.ts`) | — | `new RegExp('^\\p{RGI_Emoji}$', 'v').test(s)`. Usa `new RegExp` porque o `target ES2023` não aceita a flag `v` em literal | Nova. |
| `novidades.ts` | 0.15.4 | + 0.16.0, só texto (o teste `protocolo.test.ts:25` proíbe emoji nas notas) | — |

Sem `CodigoErro` novo: o ack de socket devolve só o texto (`realtime/acoes.ts:8-20`).

## 4. Dados

Migração **019** no fim de `MIGRACOES`:

```sql
-- 019 — reações e respostas
CREATE TABLE reacoes (
  mensagem_id INTEGER NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
  emoji       TEXT    NOT NULL,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  criada_em   INTEGER NOT NULL,
  primeira_em INTEGER NOT NULL,  -- quando o emoji apareceu na mensagem (copiado das linhas existentes)
  PRIMARY KEY (mensagem_id, emoji, usuario_id)
);
ALTER TABLE mensagens ADD COLUMN resposta_a INTEGER;
ALTER TABLE mensagens ADD COLUMN resposta_avisa INTEGER NOT NULL DEFAULT 0;  -- id de quem foi avisado (0 = ninguém)
```

**Integridade:**
- A chave primária impede reação dupla (RN-2, "sem duplicar").
- O `ON DELETE CASCADE` apaga as reações junto com a mensagem, inclusive quando se remove um canal, um servidor ou uma DM (RN-6).
- `resposta_a` fica **sem FK** de propósito (R-2). Quando a original é apagada, o `LEFT JOIN` não a encontra e o DTO sai com `{ id, apagada: true }` (RN-10).

**Leitura em lote** (`dominio/mensagens.ts`, junto de `comAnexos`):
- `reacoesDasMensagens(ids)`: `SELECT mensagem_id, emoji, usuario_id, rowid FROM reacoes WHERE mensagem_id IN (...) ORDER BY mensagem_id, rowid`. A ordem por emoji segue `primeira_em` e, no empate, o menor `rowid` de cada um (RN-5). Assim o emoji não perde o lugar quando quem o usou primeiro tira a reação, e só vai para o fim se todos tirarem.
- `trechosDasOriginais(ids)`: `SELECT id, autor_id, texto, (SELECT COUNT(*) FROM anexos WHERE mensagem_id = m.id) FROM mensagens m WHERE id IN (...)`. O trecho é a primeira linha do texto cortada em 100 caracteres (RN-9). Texto vazio com anexo vira `soAnexo`.
- `listarMensagens` passa a usar `ate`. São três consultas por página, como hoje com os anexos.

**Escrita** (`dominio/reacoes.ts`): `alternarReacao(banco, mensagemId, usuarioId, emoji)` numa transação.
1. Se a reação existe, apaga.
2. Senão, se o emoji já está na mensagem ou ela tem menos de 20 emojis distintos, insere.
3. Senão, recusa.

A transação síncrona do better-sqlite3 evita corrida no limite.

**Volume:** no máximo 20 emojis × até 20 contas por mensagem (`LIMITE_CONTAS_PADRAO`). Não precisa de índice extra, porque a PK começa por `mensagem_id`.

**Rollback:**
- A migração só acrescenta.
- O servidor 0.15.4 abre um banco na versão 19 sem erro (`banco.ts:28` só aplica as que faltam) e ignora a tabela e as colunas novas. Voltar a imagem basta.
- O backup `VACUUM INTO data/backup` antes da migração continua valendo.

## 5. Integrações externas

Nenhum serviço externo. Entra um pacote de dados:
- `emojibase-data` **18.0.0** (MIT, publicado em 16/10/2026), que tem locale `pt` com nome, palavras-chave, grupo e tons de pele.
- Só `emojibase-data/pt/compact.json` entra no bundle, por `import()` dinâmico ao abrir o seletor pela primeira vez. Assim não pesa na abertura do app.
- O campo `unicode` vem na forma completa, com FE0F (❤️), que é a que o servidor aceita.
- Na carga, um filtro tira os emojis que `validarEmojiReacao` recusaria, para o seletor nunca oferecer um emoji que o servidor rejeita.

A exibição usa a fonte de emoji do sistema: Noto Color Emoji no Linux, Segoe UI Emoji no Windows. Ela entra em `--fonte-texto` como fallback (`base.css:8`). Ver R-6.

## 6. Segurança

- **Autorização** de `reacao:alternar` e da resposta, no servidor, pelo mesmo caminho do envio (`lerDestino`, `realtime/mensagens.ts:51-67`):
  - canal: a mensagem tem de ser de um canal do servidor desta conexão, e a pessoa precisa de `enviar_mensagens`. O castigo tira essa permissão (RN-1, CA-7);
  - DM: a pessoa tem de ser participante e o outro não pode estar removido. **Na DM o castigo não vale**, como já acontece com enviar mensagens (o castigo é por servidor).
- **Resposta:**
  - `respostaA` tem de existir e ser do **mesmo** `canal_id`/`dm_id` do destino (CA-16);
  - se não for, a mensagem é recusada com "Mensagem respondida não encontrada.";
  - o servidor não aceita `resposta_avisa` sem `resposta_a`.
- **Emoji:** só passa o que casa com `\p{RGI_Emoji}` inteiro, com no máximo 32 bytes (CA-6). Nada de texto livre no banco.
- **Rajada:** limite por socket de 20 `reacao:alternar` a cada 10 s. Passou disso, o ack recusa com "Calma, muitas reações seguidas." Isso evita que um app alterado faça broadcast sem parar para o servidor inteiro.
- **Dados pessoais:** o que é novo são os ids de quem reagiu, já visíveis a quem vê a conversa. Nada sai do servidor.

## 7. Observabilidade

- Reação não vai para a auditoria (fora de escopo). Recusas de emoji, de limite e de rajada voltam só no ack, como as demais recusas de negócio do socket (`comAck` loga apenas erros inesperados).
- Em produção, `./vm.sh consulta "SELECT COUNT(*) FROM reacoes"` e `... WHERE resposta_a IS NOT NULL` mostram o uso.

## 8. Estratégia de testes

| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | `Reacoes.test.tsx`: "👍 1" com a classe `minha` | `server/test/reacoes.test.ts`: alternar → `mensagem:reacoes` com `[ {👍,[ana]} ]` | E2E `reacoes.spec.ts` |
| CA-2 | `Reacoes.test.tsx`: clique chama `aoAlternar` | `reacoes.test.ts`: segunda chamada remove, terceira põe de novo | E2E |
| CA-3 | — | `reacoes.test.ts`: o socket do beto recebe pôr e tirar | E2E com dois apps (modelo `chat.spec.ts:56`) |
| CA-4 | `Reacoes.test.tsx`: dica "ana e beto"; com 12, "e mais 2" | — | — |
| CA-5 | `dominio/reacoes` 21º emoji recusado e soma num existente aceita | `reacoes.test.ts` | — |
| CA-6 | `validacao.test.ts`: aceita 👍 👍🏽 🇧🇷 ❤️ 👨‍👩‍👧; recusa "abc", "❤", "👍👍", " 👍", 40 bytes | `reacoes.test.ts`: ack de erro e nada gravado | — |
| CA-7 | `ItemMensagem.test.tsx`: `somenteLeitura` esconde Reagir e Responder | `reacoes.test.ts`: castigo recusa reagir e responder (modelo `moderacao.test.ts:44`) | — |
| CA-8 | — | `reacoes.test.ts`: apagar a mensagem esvazia `reacoes`; editar mantém | — |
| CA-9 | `notificar.test.ts`: `mensagem:reacoes` não passa por `decidirMensagemNova` | `reacoes.test.ts`: nenhum `mensagem:nova`; `leituras` não muda | E2E `naolidas` (contador igual) |
| CA-10 | `MensagensCanal.test.tsx`: Responder → faixa → `aoEnviar` com `respostaA` | `respostas.test.ts`: DTO com `resposta.trecho` | E2E `respostas.spec.ts` |
| CA-11 | `MensagensCanal.test.tsx`: clique numa original fora da lista chama a API com `ate` e rola | `respostas.test.ts`: 250 mensagens, `ate` devolve todas até a original | E2E com 300 mensagens (modelo `chat.spec.ts:75`) |
| CA-12 | `loja.test.ts`: `removerMensagem` marca as respostas como `apagada` | `respostas.test.ts`: histórico depois de apagar → `{ apagada: true }` | E2E |
| CA-13 | `loja.test.ts`: `atualizarMensagem` da original atualiza o trecho das respostas | `respostas.test.ts`: só anexo → `soAnexo`; editada → texto novo | — |
| CA-14 | `notificar.test.ts`: resposta com aviso conta como menção | `respostas.test.ts`: `mencoes` inclui o autor da original | E2E dois apps (modelo `naolidas.spec.ts:76`) |
| CA-15 | `notificar.test.ts` | `respostas.test.ts`: `avisar:false` e resposta a si mesmo sem `mencoes`; editar o texto mantém o aviso quando `resposta_avisa = 1` | — |
| CA-16 | — | `respostas.test.ts`: original de outro canal ou DM → recusa | — |
| CA-17 | `MensagensCanal.test.tsx`: Esc e X limpam a faixa; o próximo envio vai sem `respostaA` | — | — |
| CA-18 | — | `reacoes.test.ts` e `respostas.test.ts` repetidos em DM; terceiro recusado | E2E em DM |
| CA-19 | `ItemMensagem.test.tsx`: as ações recebem foco; `aria-label` "👍, 2 reações, inclusive você" | — | — |
| CA-20 | — | `reacoes.test.ts`: um cliente que manda só `{destino, texto}` continua funcionando; o DTO a mais não quebra o `mensagem:nova` | Manual: app 0.15.4 contra o servidor novo antes do deploy |

## 9. Riscos e decisões

| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Como avisar quem foi respondido | (a) pôr o autor da original em `mencoes` (b) campo próprio só no app novo | **(a)**, com a coluna `resposta_avisa`. O destaque, a notificação e o tratamento de "não incomodar" de hoje passam a valer sem regra nova, e os apps 0.15.x também avisam (com o título "mencionou você"). Ao editar, `resolverMencoes` refaz as menções pelo texto e soma de volta quem está em `resposta_avisa` (o id de quem foi avisado), se ainda alcança a conversa. |
| R-2 | Vínculo com a original apagada | FK `ON DELETE SET NULL`, ou coluna sem FK com `LEFT JOIN` | **Sem FK**. Com o SET NULL, a resposta perderia a informação de que era resposta e não daria para mostrar "Mensagem original apagada". |
| R-3 | Ir até uma original antiga (CA-11) | (a) repetir páginas no cliente até achar (b) `?ate=` no servidor | **(b)**. É uma chamada só e não briga com a compensação de rolagem (`MensagensCanal.tsx:228-243`). Até 1000 mensagens acima. Além disso, o app avisa "Mensagem antiga demais para abrir aqui". Com o volume do grupo isso não acontece na prática. |
| R-4 | O que vai no evento de reação | delta (pôs/tirou) ou a lista inteira | **Lista inteira** da mensagem. Ela é pequena e idempotente, e duas abas ou um evento perdido não deixam contagem errada. |
| R-5 | Respostas e silêncio | respeitar a conversa silenciada ou valer como menção | **Como menção**: passa por cima de silenciada e de notificações desligadas, e só "não incomodar" bloqueia (`notificar.ts:37-41`). É o que diz RN-12. |
| R-6 | Aparência do emoji | fonte do sistema, ou embutir a Noto Color Emoji (cerca de 10 MB, OFL), ou imagens | **Fonte do sistema**, que é o que todos os sistemas do grupo têm. Se algum Linux mostrar quadradinhos, embutir a Noto vira item do backlog. |
| R-7 | Dados do seletor | `emojibase-data`, ou tabela própria | **`emojibase-data` 18.0.0** em `pt`, por `import()` dinâmico. Já traz nomes e palavras-chave em português, e escrever uma tabela própria de cerca de 1900 emojis não compensa. |
| R-8 | Castigo na DM | bloquear reagir e responder em DM também, ou seguir o envio de hoje | **Seguir o envio**: a DM continua livre. RN-1 diz "como já acontece", e o castigo é por servidor. CA-7 vale para canal. |
| R-9 | Rajada de reações | sem limite, ou limite por socket | **20 a cada 10 s** por socket, em memória. Simples e suficiente contra um app alterado. |
| R-10 | Ordem depois de todos tirarem | guardar a ordem à parte, ou usar `rowid` | **`rowid`**. Se todo mundo tira um emoji e alguém põe de novo, ele vai para o fim, o que é aceitável. |

## 10. Implantação e rollback

**Ordem:**
1. Servidor 0.16.0: a migração 019 roda sozinha ao subir, com o backup automático antes.
2. Release do app 0.16.0 no GitHub, com a atualização automática.

Os apps 0.15.x continuam funcionando no meio-tempo.

Sem feature flag: o recurso aparece quando o app novo fala com o servidor novo. Um app novo ligado a um servidor antigo não recebe `reacoes` nem `resposta`. A reação fica sem resposta até o timeout e mostra a falha, o que não acontece se a ordem acima for seguida.

**Rollback:** voltar a imagem do servidor para 0.15.4. O banco v19 é aceito (R-2 e seção 4), e as reações e os vínculos ficam guardados para quando voltar.

## 11. CI/CD

Nada muda na pipeline. Cobertura dos testes:
- `npm test`: testes novos em `server/test/reacoes.test.ts`, `server/test/respostas.test.ts` e nos `.test.tsx` do client;
- `npm run test:e2e`: `client/e2e/reacoes.spec.ts` e `client/e2e/respostas.spec.ts`, por `sh e2e/isolado.sh`.

O release segue o fluxo de sempre: commit, tag local e o push feito pelo usuário.
