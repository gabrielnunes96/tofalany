# Pontos e loja — Especificação técnica

> Demanda: `pontos-e-loja` · Base: funcional v1 (aprovada em 12/11/2026) · 12/11/2026 · Situação: **aprovada em 12/11/2026**

## 1. Visão da solução

O servidor já sabe, em memória, quem está em qual canal de voz e se está surdo (`server/src/realtime/voz.ts`, mapa `presentes` por `usuarioId`). Um contador novo (`realtime/pontos.ts`) acompanha, por conta, o início do trecho válido (em voz, sem surdo, com outra pessoa no canal, fora da carência de queda). A cada mudança de voz e a cada tique, ele credita os minutos completos no banco e avisa as conexões da pessoa. A loja é uma rota da conta (`/api/loja`), com a compra numa transação só. A qualidade permitida passa a ser a do cargo somada à dos vales ativos, conferida no `tela:pedir` e na faixa publicada, como hoje.

```text
app (voz:estado) ──> voz.ts presentes ──avisar()──> pontos.ts (trechos em memória)
                                                     │  tique (15 s) ou mudança
                                                     ▼
                                       dominio/loja.ts creditar() ──> SQLite (017)
                                                     │
                       io.to('usuario:<id>') <── 'loja:estado' (saldo, temas, vales)

app (TelaLoja) ── POST /api/loja/comprar ──> dominio/loja.ts comprar() [transação]
                                              ├─> pontos_movimentos + loja_temas / loja_vales
                                              ├─> auditoria 'loja_compra'
                                              └─> 'loja:estado' para a conta

app (tela:pedir 1080p60) ──> tela.ts papel() + valesAtivos() ──> qualidadesPermitidas(cargo, perms, vales)
```

## 2. Componentes afetados

| Projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| shared | TS | Qualidades novas, temas de loja, catálogo, DTOs, evento e códigos de erro | `shared/src/protocolo.ts:68,75,168-190,247,279,335-336,464-479,506-536,539-632`; `shared/src/validacao.ts:252-259`; `shared/src/auditoria.ts:2-75`; `shared/src/novidades.ts` |
| server | Node/Fastify/SQLite | Migração 017, domínio da loja, contador de minutos, rotas, evento, conferência de qualidade com vales, config | `server/src/db/migracoes.ts` (fim); `server/src/realtime/voz.ts:35-68,112,157-168`; `server/src/realtime/tempo-real.ts:91,216-226,271,396-413`; `server/src/realtime/tela.ts:39-43,77-85,135-155`; `server/src/config.ts:51-90`; `server/src/app.ts:131-152`; `server/src/auth/sessao-http.ts:32-41`; `server/src/dominio/comunidades.ts:61` |
| client | Electron/React | Tela Loja, saldo no painel, temas com cadeado e prévia, seletor de qualidade com vales, CSS dos 3 temas | `client/src/renderer/telas/TelaPrincipal.tsx:81,313-320,785,951,1444-1530,1627-1676,1661,1723`; `client/src/renderer/telas/TelaConfiguracoes.tsx:313-328,369,376`; `client/src/renderer/componentes/SeletorTela.tsx:15,35,73,117,124`; `client/src/renderer/servicos/voz.ts:33-36`; `client/src/renderer/servicos/tempo-real.ts:159`; `client/src/main/configuracoes.ts:65`; `client/src/renderer/estilos/base.css` |
| deploy | Docker | Variáveis de preço documentadas | `deploy/exemplo.env` |

O nome "loja" já é usado no client pela store zustand (`client/src/renderer/estado/loja.ts`, `useLoja`). No client, o estado novo se chama **pontos** (`estado/pontos.ts`, `usePontos`); a tela é `TelaLoja.tsx`.

## 3. Contratos

| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `QualidadeTela` / `QUALIDADES_TELA` (protocolo.ts:464) | `'720p30' \| '1080p60' \| '1440p60'` | `'720p30' \| '720p60' \| '1080p30' \| '1080p60' \| '1440p60'`, nessa ordem; `DIMENSOES_TELA` ganha as duas | App antigo não oferece as novas e o `mesclarTela` dele volta a 720p30 se ler uma. O servidor novo aceita as antigas. **O servidor sobe antes dos apps** (o antigo recusa "Qualidade inválida"). |
| `qualidadesPermitidas(cargo, permissoes)` (protocolo.ts:476) | cargo e permissões | `qualidadesPermitidas(cargo, permissoes, vales?: readonly QualidadeTela[])`: admin, todas; `transmitir_1080p` libera 720p60, 1080p30 e 1080p60; `transmitir_1440p`, 1440p60; soma os vales | Parâmetro opcional: quem chama sem vales mantém o comportamento. |
| `PERMISSOES.transmitir_1080p.descricao` (protocolo.ts:75) | "transmitir a tela em 1080p60" | "transmitir a tela em 720p60, 1080p30 e 1080p60" | Só texto. |
| `Tema` / `TEMAS` (protocolo.ts:335) | `neon \| breu \| aurora` | + `cinzas \| arcano \| gibi`; `TEMAS_GRATIS` e `TEMAS_LOJA` | App antigo descarta o tema desconhecido na leitura (`main/configuracoes.ts:65`) e volta ao neon. |
| `shared/src/loja.ts` (novo) | — | `ITENS_TEMA` (id, nome, descrição), `QUALIDADES_VALE = ['720p60','1080p30','1080p60']`, `VALE_DIAS = 7`, `qualidadesDosVales(vales, agora)` (RN-9: 1080p60 inclui 720p60 e 1080p30), `type ItemLoja = { tipo: 'tema'; tema: TemaLoja } \| { tipo: 'vale'; qualidade: QualidadeVale }` | Novo. |
| `LojaEstadoDto` (novo) | — | `{ saldo: number; temas: TemaLoja[]; vales: { qualidade: QualidadeVale; expiraEm: number }[]; tudoLiberado: boolean }` | Novo. |
| `OlaPayload.loja?` (protocolo.ts:506) | — | `loja?: LojaEstadoDto` | Opcional: servidor antigo não manda e o app novo esconde a loja. |
| Evento `loja:estado` (EventosServidor) | — | `(estado: LojaEstadoDto) => void`, para `salaUsuario(id)` em cada crédito ou compra | App antigo ignora. |
| `GET /api/loja` (daConta) | — | `{ precos: { tema: number; vales: Record<QualidadeVale, number> }; pontosPorMinuto: number; estado: LojaEstadoDto }` | Nova. |
| `POST /api/loja/comprar` (daConta) | — | corpo `ItemLoja` (JSON schema com `additionalProperties: false`) → `LojaEstadoDto`; erros `saldo_insuficiente` (409), `item_invalido` (400), `item_ja_comprado` (409, só tema), `tudo_liberado` (409, admin) | Nova. |
| `GET /api/loja/extrato?antes=<id>&limite=<1..100>` (daConta) | — | `{ movimentos: MovimentoDto[] }`, `MovimentoDto = { id; tipo: 'ganho' \| 'compra'; item: string \| null; valor: number; em: number }`, do mais novo para o mais antigo | Nova. |
| `CodigoErro` (protocolo.ts:168) | — | + `saldo_insuficiente`, `item_invalido`, `item_ja_comprado`, `tudo_liberado` | App antigo não chama a loja. |
| `TIPOS_AUDITORIA` / `ROTULOS_AUDITORIA` (auditoria.ts) | — | + `loja_compra`: "comprou na loja" (detalhes: item e valor) | App antigo mostra o tipo sem rótulo nessa linha da auditoria (ver R-7). |

## 4. Dados

Migração **017** no fim de `MIGRACOES` (`server/src/db/migracoes.ts`), no padrão das 012 e 015:

```sql
-- 017 — pontos e loja (saldo por conta, extrato, temas comprados e vales)
CREATE TABLE pontos_saldos (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  saldo INTEGER NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  atualizado_em INTEGER NOT NULL
);
CREATE TABLE pontos_movimentos (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ganho', 'compra')),
  item TEXT,                 -- 'tema:cinzas', 'vale:1080p60'; null no ganho
  valor INTEGER NOT NULL,    -- ganho > 0; compra < 0
  criado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL
);
CREATE INDEX pontos_movimentos_usuario ON pontos_movimentos (usuario_id, id DESC);
CREATE TABLE loja_temas (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tema TEXT NOT NULL,
  comprado_em INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, tema)
);
CREATE TABLE loja_vales (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  qualidade TEXT NOT NULL CHECK (qualidade IN ('720p60', '1080p30', '1080p60')),
  expira_em INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, qualidade)
);
```

- **Saldo** é uma coluna, não a soma do extrato: a compra confere e desconta numa só instrução (`UPDATE pontos_saldos SET saldo = saldo - ? WHERE usuario_id = ? AND saldo >= ?`; `changes = 0` vira `saldo_insuficiente`). A soma do extrato tem que bater com o saldo (CA-22): um teste confere.
- **Extrato do ganho** tem uma linha por sessão de voz válida, atualizada a cada minuto creditado (`valor = valor + n`), como a RF-9 permite. Volume: um grupo de ~20 pessoas gera dezenas de linhas por dia.
- **Vale:** uma linha por qualidade; comprar faz `expira_em = max(agora, expira_em) + 7 dias` (RN-8), com upsert.
- **Sem retroativo (RN-17):** as tabelas nascem vazias, sem seed.
- **Retenção:** permanente, apagado junto com a conta (CASCADE).
- **Rollback:** `migrar()` já faz `VACUUM INTO data/backup/` antes de migrar. Uma imagem anterior (16 migrações) sobe sem erro num banco versão 17, porque `migrar()` só avança; as tabelas novas ficam paradas. Desfazer de vez é `DROP TABLE` das 4 e `PRAGMA user_version = 16`, ou restaurar o backup.

## 5. Integrações externas

- **LiveKit** (`livekit-server-sdk` 2.19.2): nada novo. Continua o webhook `track_published` → `conferirFaixaTela` (`routes/livekit.ts:96-107`). O `TrackInfo` traz largura, altura e camadas, mas **não traz quadros por segundo** (ver R-1).
- Nenhuma API de terceiros. Nada de pagamento: pontos não se compram com dinheiro.

## 6. Segurança

- **Autenticação:** as três rotas usam `exigirSessao(banco, { daConta: true })`, porque saldo e itens são da conta e valem em qualquer servidor.
- **A contagem é só no servidor:** o app não informa pontos nem preço. O preço vem da config e a compra é atômica. O corpo da compra é validado por JSON schema, e um item fora do catálogo vira `item_invalido`.
- **"Tudo liberado"** é só para o administrador da instalação (`ehAdminDaInstalacao`, `dominio/comunidades.ts:61`), por decisão do usuário. Ele não compra (`tudo_liberado`), escolhe qualquer tema, e `qualidadesPermitidas` recebe todos os vales. A qualidade nos outros servidores continua seguindo o cargo de cada um, como hoje.
- **Confiança no estado de voz:** surdo e canal vêm do app, como hoje (ver R-3).
- **Sem dados sensíveis:** o extrato só tem pontos, item e data. A CLI do banco (`server/src/cli/banco.ts`) lê as tabelas novas sem mascarar nada, e não há o que mascarar.

## 7. Observabilidade

- Log `info` por compra (usuário, item, valor, saldo final) e `warn` quando a compra é recusada por saldo. O ganho não gera log por minuto, para não poluir.
- A auditoria `loja_compra` aparece no servidor principal (decisão do usuário), com item e valor.
- Para diagnosticar em produção: `./vm.sh consulta "select * from pontos_movimentos where usuario_id = X order by id desc limit 20"`.

## 8. Estratégia de testes

O servidor usa `appTeste(env)` com socket.io-client real (`server/test/apoio.ts`, modelo em `server/test/tela.test.ts` e `voz.test.ts`). O minuto e o tique ficam curtos por variável de ambiente (`PONTOS_MINUTO_MS=200`, `PONTOS_TIQUE_MS=50`) e o relógio é injetável (`agora()`). O client usa vitest + Testing Library; o E2E usa Playwright (`client/e2e`).

| Critério | Teste unitário | Teste de integração (servidor / componente) | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | `pontos.ts` trechoValido | `server/test/pontos.test.ts`: dois sockets no mesmo canal, 5 minutos curtos → +5 cada | E2E `loja.spec.ts`: saldo sobe no painel |
| CA-2 | idem | sozinho no canal → 0 | — |
| CA-3 | — (o bot nunca entra em `presentes`) | bot `bot-musica` no LiveKit + uma pessoa → 0 | — |
| CA-4 | trechoValido com surdo | Ana surda, Beto não → Ana 0, Beto 5 | — |
| CA-5 | trechoValido com mudo | mudo sem surdo → +5 | — |
| CA-6 | — | segundo aparelho tira o primeiro (`voz:tirado`) → +5, não 10 | — |
| CA-7 | — | servidor 1 com Beto, servidor `/c/2` com Caio → saldo único +10 | — |
| CA-8 | — | evento `loja:estado` chega em todas as conexões da conta no crédito e na compra | E2E: saldo do painel muda sem reabrir |
| CA-9 | `dominio/loja.test.ts` comprar tema | `POST /api/loja/comprar` com 700 → 100, tema na lista, linha no extrato | E2E: compra pela TelaLoja |
| CA-10 | — | com 500, compra de 600 → 409 `saldo_insuficiente`, saldo 500; `TelaLoja.test.tsx`: botão desligado "faltam 100 pontos" | — |
| CA-11 | — | duas compras de 600 em paralelo (`Promise.all`) com 600 → uma 200 e uma 409, saldo 0 | — |
| CA-12 | `comprarVale` com relógio fixo: dia 1 → dia 8; dia 3 → dia 15 | — | — |
| CA-13 | vencido no dia 8, compra no dia 10 → dia 17 | — | — |
| CA-14 | `qualidadesPermitidas('membro', ∅, ['1080p60'])` = 720p30, 720p60, 1080p30, 1080p60 | `SeletorTela` com vale → 1440p60 bloqueada | — |
| CA-15 | `qualidadesPermitidas('membro', ∅, [])` = 720p30 | `SeletorTela`: as outras com "Libere na loja" | — |
| CA-16 | `faixaForaDaRegra` 1920×1080 sem vale | `tela.test.ts`: `tela:pedir` 1080p60 sem vale → recusa | — |
| CA-17 | — | `tela.test.ts`: vale vence durante a transmissão → não chama `pararTransmissao`; novo `tela:pedir` 1080p60 → recusa | — |
| CA-18 | `qualidadesPermitidas('membro', {transmitir_1080p})` inclui 720p60, 1080p30, 1080p60 | — | — |
| CA-19 | — | `TelaConfiguracoes.test.tsx`: tema de loja com cadeado, clique chama `aoAbrirLoja`; comprado, escolhível | E2E `aparencia.spec.ts` |
| CA-20 | — | `TelaLoja.test.tsx`: prévia troca `data-tema` sem gravar; "Sair da prévia" volta ao anterior | — |
| CA-21 | `estadoLoja` do admin da instalação: `tudoLiberado` | rota: admin com 0 pontos compra → 409 `tudo_liberado`; `tela:pedir` 1440p60 → aceita | — |
| CA-22 | — | extrato em ordem decrescente; soma dos `valor` = saldo | — |
| CA-23 | — | `appTeste({ PRECO_TEMA: '800' })` → `GET /api/loja` mostra 800 e a compra cobra 800 | Validação manual: mudar no `.env` da VM e reiniciar |
| CA-24 | — | Revisão do CSS e dos nomes (sem marca, arte ou fonte oficial; fontes OFL) | Revisão humana no PR |
| CA-25 | `novidades.test.ts`: a versão da loja tem a nota | `JanelaNovidades.test.tsx` | — |
| CA-26 | — | `banco.test.ts`: depois de migrar, `pontos_saldos` vazia | — |

## 9. Riscos e decisões

| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | O servidor não sabe se a tela sai a 30 ou a 60 quadros: o `TrackInfo` do LiveKit não traz quadros por segundo. Um vale de 1080p30 não impede publicar a 60 por um app alterado. A trava de 720p30 já tem essa brecha hoje. | (a) Aceitar e conferir só a resolução, como hoje. (b) Estimar pela taxa de bits declarada, que também é forjável. | **(a).** O app oficial respeita a qualidade, e a conferência por resolução já pega o caso grave (1080p sem direito, CA-16). |
| R-2 | Qual administrador tem tudo liberado | admin da instalação ou admin de qualquer servidor | **Admin da instalação** (decisão do usuário, 12/11). |
| R-3 | Surdo e canal vêm do app. Um app alterado pode ficar em voz sem mídia e dizer `surdo: false`. | (a) Aceitar. (b) Conferir com `participant_joined` ou `listParticipants` do LiveKit. | **(a)** nesta entrega, como a funcional pede ("a partir do estado de voz que já conhece"). Fica anotado como melhoria se aparecer abuso. |
| R-4 | Carência de queda: o socket caído fica presente por 30 s | contar ou não | **Não conta:** a presença com `pendente` (voz.ts:41) está fora do trecho válido. Quem volta dentro da carência retoma a contagem do zero. |
| R-5 | Castigo é por servidor | não ganhar em lugar nenhum, ou só não ganhar onde está de castigo | **Só onde está de castigo** (decisão do usuário): o castigo já tira a voz naquele servidor. |
| R-6 | Preços configuráveis | variáveis de ambiente, ou tela de admin | **Variáveis de ambiente** (decisão do usuário): `PONTOS_POR_MINUTO`, `PRECO_TEMA`, `PRECO_VALE_720P60`, `PRECO_VALE_1080P30`, `PRECO_VALE_1080P60` em `config.ts` com `inteiro(...)` (1..100000) e documentadas em `deploy/exemplo.env`. Mudar = editar e reiniciar o contêiner. |
| R-7 | Compras na auditoria | só no extrato, ou extrato e auditoria | **As duas** (decisão do usuário). A auditoria apaga em 30 dias; o extrato é permanente. Apps antigos mostram a linha sem rótulo até atualizar. |
| R-8 | Tema de loja salvo localmente, mas a conta aberta não o comprou (outra conta, outra instalação) | manter, ou voltar ao neon | **Voltar ao neon** assim que chega o `ola` sem o tema, gravando a escolha. Antes do `ola` o tema salvo aparece (sem piscar na abertura normal). |
| R-9 | Vale vence no meio da transmissão (RN-15) | parar ou deixar | Nenhum timer de vencimento: a transmissão segue. Se o LiveKit republicar a faixa (reconexão) depois do vencimento, `faixaForaDaRegra` a silencia. É raro e fica aceito. |
| R-10 | Prévia de tema dentro do cartão da loja | aplicar no `:root` ou num elemento | Os seletores de tema em `base.css` passam de `:root[data-tema='x']` para `[data-tema='x']`, e assim o cartão da loja mostra a amostra com o próprio `data-tema`. A prévia completa troca o `data-tema` do `<html>` sem gravar. |
| R-11 | Desempenho na VM Oracle | tique por pessoa no banco, ou mapa em memória | **Mapa em memória** e tique a cada 15 s. Só grava quando completa um minuto: no máximo ~20 escritas por minuto em SQLite WAL, desprezível. |
| R-12 | Reinício do servidor | — | O trecho em andamento está em memória e se perde (até 1 minuto por pessoa), como a funcional aceita. A sessão de extrato recomeça numa linha nova. |
| R-13 | Nome "loja" já usado no client (`estado/loja.ts`, store zustand) | renomear a store, ou nome novo | **Nome novo:** `estado/pontos.ts` / `usePontos`. Renomear a store mexeria em dezenas de arquivos. |

## 10. Implantação e rollback

1. **Servidor primeiro** (imagem nova pela tag). Ao subir, a migração 017 roda sozinha, com backup antes. O timer `tofalany-atualizar` da VM já faz isso.
2. **Apps depois:** a mesma release gera os instaladores, e a atualização automática entrega. Até atualizar, o app antigo segue funcionando sem loja (R-7 e as qualidades antigas).
3. **Configuração:** os preços padrão vêm no código (600, 200, 300 e 600; 1 ponto por minuto). A VM não precisa de nada novo. Para mudar, edita o `.env` e reinicia.
4. **Desfazer:** voltar a imagem da tag anterior. Ela ignora as tabelas novas (`migrar()` não desce). Os apps novos com servidor antigo não recebem `ola.loja` e escondem a loja, mas o `tela:pedir` de 720p60 ou 1080p30 é recusado ("Qualidade inválida") até voltar o servidor novo.

Sem feature flag: a loja aparece quando o servidor manda `ola.loja`.

## 11. CI/CD

Nada muda no workflow de release: a tag gera os instaladores e a imagem `ghcr.io/gabrielnunes96/tofalany-server:<tag>`. Os testes novos entram no `npm test` (vitest) e no E2E (`client/e2e/loja.spec.ts`, sem LiveKit: o saldo pode ser preparado direto no banco em memória do servidor de teste). O E2E de voz com LiveKit em Docker não muda.

> Portão: o plano só começa com esta especificação aprovada (registrada no topo).
