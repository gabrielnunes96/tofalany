# Áudios na loja, com raridade — especificação técnica

> Demanda: `audios-na-loja` · Base: funcional v1 (aprovada em 22/11/2026) · 22/11/2026 · Situação: **rascunho**

## 1. Visão da solução
Os áudios da loja são um item novo da loja da instalação (como os temas), com tabela própria e posse por conta. O soundboard ganha um segundo tipo de toque, conferido pelo servidor (posse, cargo do servidor do canal, AFK, castigo, intervalo), e um evento próprio que leva o áudio inteiro para quem ouve.

```text
CADASTRO  vista "Áudios da loja" (admin da instalação, apiPrincipal)
            → POST /api/admin/loja/audios (multipart: arquivo, nome, raridade)
            → exigirSessao + exigirAdmin + exigirPrincipal → validarNomeSom → conferirAudio → armazem.gravar
            → transação: COUNT < 200, INSERT loja_audios, auditoria loja_audio_cadastrado → avisar o admin ('loja:audios')
COMPRA    TelaLoja "Comprar" → POST /api/loja/comprar {tipo:'audio', audioId}
            → comprar(): transação { áudio existe e não retirado; raridade → preço da config; ainda não tem;
              débito condicional; INSERT loja_audios_compras; extrato item 'audio:<id>' } → loja:estado + loja:audios
TOQUE     "Meus sons" → socket 'som:tocar' {audioId}
            → soundboard.ts: presença; canal é deste servidor; tocar_sons no cargo daqui; não AFK; sem castigo;
              posse (ou admin da instalação); intervalo de 3 s comum aos dois tipos
            → emite 'audio:tocado' {audio:{id,nome,url,duracaoMs,raridade}, porUsuarioId, canalVozId} (dados do banco)
            → apps da sala tocam pela url (mesma origem), cortado em 10 s; aviso "<quem> tocou <nome>"
```

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| shared | node | `RaridadeAudio` (`comum`/`raro`/`epico`/`lendario`), `AudioLojaDto`, `ItemLoja` + `{tipo:'audio', audioId}`, `chaveItem` `audio:<id>`, `lerItemLoja`, `PrecosLoja.audios?`, `CatalogoLojaDto.audios?`, `LojaEstadoDto.audiosIds?`, `AUDIOS_LOJA_MAX = 200`, eventos `loja:audios` e `audio:tocado`, `som:tocar` com `audioId`, 3 tipos de auditoria; `validarNomeSom` passa a recusar caracteres de direção (bidi) | `shared/src/loja.ts:23-64`, `limites.ts:70-79`, `protocolo.ts:741,751,776`, `auditoria.ts:2-97`, `validacao.ts:83` |
| server | node | Migração 024; `dominio/audios-loja.ts` (listar, cadastrar, renomear, trocar raridade, retirar, posse); `comprar` com áudio (preço lido dentro da transação); rotas de admin; catálogo com áudios; `som:tocar` com `audioId` e conferências novas (servidor do canal, AFK, castigo) valendo também para os sons do servidor; `ola.audiosLoja`; 4 preços na config | `db/migracoes.ts` (fim), `dominio/loja.ts:33,74,80,108`, `routes/loja.ts:12-45`, `routes/sons.ts:16-31` (`lerFormulario` vira comum), `realtime/soundboard.ts:20-35`, `realtime/tempo-real.ts:371-396,494`, `config.ts:129-135` |
| client: renderer | front | Seção "Áudios" na TelaLoja (raridade, prévia, comprar); "Meus sons" no PainelSoundboard; `aoAudioTocado`; vista de admin "Áudios da loja"; descrição do extrato | `telas/TelaLoja.tsx:40,50,122,240-310`, `componentes/PainelSoundboard.tsx:41,61`, `telas/TelaPrincipal.tsx:166,1096,1306,1661,2184,2351`, `servicos/soundboard.ts:56`, `servicos/tempo-real.ts:65,204,213`, `estado/loja.ts`, `servicos/api.ts:269` |
| docs/deploy | — | `PRECO_AUDIO_*` no exemplo de configuração e no README | `deploy/exemplo.env:52-56`, `README.md:223` |

## 3. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `POST /api/admin/loja/audios` (multipart: `arquivo`, `nome`, `raridade`) | — | cria; 201 `AudioLojaDto` | Nova |
| `PATCH /api/admin/loja/audios/:id` `{nome?, raridade?}` | — | renomeia / troca raridade | Nova |
| `DELETE /api/admin/loja/audios/:id` | — | tira da loja (apaga só sem compradores) | Nova |
| `GET /api/admin/loja/audios` | — | lista com `compradores` (contagem) e `retirado` | Nova (só admin da instalação) |
| `GET /api/loja` (catálogo) | temas, vales, preços | + `audios` à venda (sem dados de quem comprou) + `precos.audios` | Campo opcional; app antigo ignora |
| `POST /api/loja/comprar` | `{tipo:'tema'\|'vale', …}` | + `{tipo:'audio', audioId}` | Schema estendido |
| `LojaEstadoDto` (`ola.loja`, `loja:estado`) | saldo, temas, vales, tudoLiberado | + `audiosIds?: number[]` (só ids, leve: vai a cada minuto em voz) | Opcional |
| `ola.audiosLoja?` / evento `loja:audios` | — | `AudioLojaDto[]` da conta (admin: todos que existem) para o "Meus sons" | Novos; app antigo ignora |
| Socket `som:tocar` | `{somId}` | `{somId}` ou `{audioId}` (um dos dois) | O app antigo só manda `somId` |
| Evento `audio:tocado` | — | `{audio: AudioLojaDto, porUsuarioId, canalVozId}` | App antigo ignora (não ouve áudio comprado; aceitável pela funcional seção 9) |
| `som:tocar` com `somId` | confere cargo do servidor do socket | + canal da presença tem de ser deste servidor; recusa na AFK e de castigo | Mais restritivo (correção A1/A2) |
| Extrato (`MovimentoDto.item`) | `tema:…`, `vale:…` | + `audio:<id>`; o nome vem do áudio atual (JOIN) | App antigo mostra "Compra" |
| Configuração | — | `PRECO_AUDIO_COMUM` 100, `_RARO` 300, `_EPICO` 800, `_LENDARIO` 2000 (`inteiro`, 1 a 100 000) | Padrões; nada a mudar na VM |
| Auditoria | — | `loja_audio_cadastrado`, `loja_audio_alterado` (`de`/`para`), `loja_audio_retirado` | App antigo mostra rótulo vazio (só admin vê) |

## 4. Dados
Migração 024:
```sql
CREATE TABLE loja_audios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  arquivo TEXT NOT NULL,
  duracao_ms INTEGER NOT NULL,
  raridade TEXT NOT NULL CHECK (raridade IN ('comum','raro','epico','lendario')),
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em INTEGER NOT NULL,
  retirado_em INTEGER
);
CREATE TABLE loja_audios_compras (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  audio_id INTEGER NOT NULL REFERENCES loja_audios(id),
  comprado_em INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, audio_id)
);
CREATE INDEX loja_audios_compras_audio ON loja_audios_compras(audio_id);
```
- Volume: até 200 linhas em `loja_audios`; compras ≤ 200 × pessoas (dezenas). Arquivos: até 400 MB no pior caso (200 × 2 MB).
- Sem dados existentes a migrar. Rollback: backup automático antes da migração; o servidor antigo ignora as tabelas novas.
- Retirar: `retirado_em = agora`. Com 0 compras, apaga a linha na mesma transação e o arquivo depois do commit (padrão de `routes/sons.ts:98-105`). Com compras, o arquivo fica para sempre (contas removidas são só marcadas, então a compra continua). O `DELETE` da linha confere `NOT EXISTS` compra na mesma transação da compra (better-sqlite3 serializa).
- O arquivo de um áudio da loja não é trocado depois do cadastro (só nome e raridade), para nunca apagar o que alguém comprou.

## 5. Integrações externas
Nenhuma nova. `music-metadata` (já usado) mede a duração; `/files/:id` (já existe) serve o áudio com `nosniff` e tipo pela extensão.

## 6. Segurança
Modelagem STRIDE de 22/11 (A1 a A18):
- **A1, A2 (vale também para os sons do servidor):** no `som:tocar`, `comunidadeDoCanal(presença.canalVozId)` precisa ser o servidor do socket; `tocar_sons` conferido ali; recusa na AFK (`ehSalaAfk`) e com castigo ativo.
- **A3, A7:** posse conferida no servidor (compra ou admin da instalação); id inexistente e sem posse dão o mesmo 404; comprar áudio retirado ou inexistente → 404.
- **A4, A9:** `audio:tocado` montado só com dados do banco; o app só toca URL relativa à instalação (`/files/…`) e corta em 10 s; upload reaproveita `conferirAudio` (assinatura + duração pelo conteúdo).
- **A5, A6:** compra numa transação só, com raridade e preço lidos dentro dela, chave `(usuario_id, audio_id)` e débito condicional; corpo fechado (`additionalProperties: false`) — preço e raridade do pedido nunca valem.
- **A8:** rotas de admin com `exigirSessao + exigirAdmin + exigirPrincipal` (como o ToOuvini); o app chama pela `apiPrincipal`.
- **A10, A11:** `lerFormulario` com 2 MB, 1 arquivo, 3 campos; limite de 200 conferido antes e dentro da transação; arquivo gravado só pelo `armazem` (nome aleatório), apagado se a transação falhar.
- **A12:** retirada nunca apaga arquivo com comprador.
- **A13 (risco aceito):** `/files/<id>` é público pelo id aleatório (128 bits). Quem ouve um toque recebe a URL e pode baixar o arquivo; a posse vale para **tocar no soundboard**, não para o arquivo (a prévia já é livre, RN-12). O catálogo não expõe quem comprou.
- **A14, A15:** intervalo de 3 s por pessoa comum aos dois tipos (mesmo mapa, marcado antes de emitir); limitador de compras por pessoa (10 por minuto).
- **A16:** `validarNomeSom` no cadastro e no renomear, agora recusando também caracteres de direção (U+202A–202E, U+2066–2069); nomes só como texto no React.
- **A17, A18:** auditoria das três ações de admin e da compra; preços com `inteiro(…, 1, 100_000)`.

## 7. Observabilidade
Auditoria (cadastro, alteração com de/para, retirada, compra com valor). Log do servidor quando a retirada apaga um arquivo.

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | — | rotas de admin: membro, admin de outro servidor e quem tem `gerenciar_sons` → 403; admin da instalação → 201/200 | — |
| CA-2 | `conferirAudio` (já coberto) | upload não-áudio com `.mp3`, > 10 s, > 2 MB → 415/422/413 | — |
| CA-3 | TelaLoja: cor/texto/preço da raridade | catálogo traz o áudio e o preço da raridade | E2E `loja.spec.ts`: seção Áudios |
| CA-4 | TelaLoja: "Ouvir" toca só local (sem socket) | — | Manual (duas pessoas) |
| CA-5 | TelaLoja: confirmação e "Comprado" | compra: saldo 350 → 50, extrato "Áudio: <nome>" −300 | E2E `loja.spec.ts` |
| CA-6 | — | duas compras em `Promise.all` → um 200, um 409, débito uma vez | — |
| CA-7 | — | saldo 200 × épico 800 → 409, saldo intacto | — |
| CA-8 | PainelSoundboard: "Meus sons" | toque de outro servidor da instalação: posse vale; `audio:tocado` com dados do banco para a sala | E2E (`sons.spec.ts`, dois apps) + manual |
| CA-9 | PainelSoundboard sem compra | `som:tocar {audioId}` sem posse → 404, ninguém recebe | — |
| CA-10 | — | sem `tocar_sons`, de castigo, na AFK, fora da voz, canal de outro servidor → recusa; intervalo comum aos dois tipos → 429 | — |
| CA-11 | — | trocar raridade: quem comprou mantém; preço novo para os outros | — |
| CA-12 | — | retirar: some do catálogo, posse continua tocando, compra → 404; sem compradores → linha e arquivo apagados | — |
| CA-13 | TelaLoja/Painel com `tudoLiberado` | admin toca sem compra; `ola.audiosLoja` traz todos | — |
| CA-14 | — | `appTeste({PRECO_AUDIO_RARO:'250'})` cobra 250; `0` → erro na config | — |
| CA-15 | — | auditoria com ator, nome, raridade (de/para) | — |
| Segurança | `validarNomeSom` com bidi | A4 (campos extras no `som:tocar` ignorados), A6 (preço/raridade no corpo da compra), A11 (`filename` com `../`), A16 (nome com HTML aparece como texto) | — |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Como avisar a sala do toque de um áudio comprado | (a) `som:tocado` com campo novo; (b) evento novo `audio:tocado` | (b): o app antigo procura o `somId` na lista do servidor e poderia tocar o som errado com (a); com (b) ele só ignora. |
| R-2 | Onde viaja a lista do "Meus sons" | (a) dentro do `LojaEstadoDto` (vai a cada minuto em voz); (b) `ola.audiosLoja` + evento `loja:audios` quando muda | (b): o estado leva só os ids; a lista inteira (até 200 para o admin) só no `ola` e quando muda. |
| R-3 | Baixar os áudios do "Meus sons" | pré-baixar ao entrar na voz; sob demanda | Sob demanda (primeiro toque, ou ao ouvir um `audio:tocado`), com o cache por URL do tocador; o admin poderia ter 400 MB. |
| R-4 | Nome no extrato depois de renomear | gravar o nome na compra; JOIN com o nome atual | JOIN com o nome atual: o extrato mostra o áudio como ele se chama hoje (mais simples; sem coluna nova). |
| R-5 | Admin e áudio retirado | admin vê só os à venda; admin vê todos que existem | Todos que existem (à venda e retirados com comprador), coerente com "tem todos". |
| R-6 | Toque pelo socket de outro servidor (A1) | conferir o cargo no servidor do canal; exigir canal = servidor do socket | Exigir canal = servidor do socket (o app já manda o toque pela conexão do servidor da sala). Vale para os sons do servidor também. |
| R-7 | Tela de admin | Configurações da pessoa; menu Administração | Menu Administração → "Áudios da loja", como o ToOuvini (só admin da instalação, `apiPrincipal`). |

## 10. Implantação e rollback
Servidor primeiro (migração 024, com backup automático), depois o app, junto da atualização grande. Rollback: versão anterior com o backup.

## 11. CI/CD
Sem mudança.
