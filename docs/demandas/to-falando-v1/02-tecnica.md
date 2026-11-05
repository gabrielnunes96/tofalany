# ToFalany v1 — Especificação técnica

> Demanda: `to-falando-v1` · Base: funcional v4 · 05/11/2026 · Situação: **aprovada em 05/11/2026**

## 1. Visão da solução
Monorepo npm (workspaces) com três pacotes de código e uma pasta de implantação. O app Electron fala com o servidor Node por HTTP (autenticação, envios de arquivo, histórico, administração) e por Socket.IO (tudo que é tempo real: mensagens, canais, digitando, presença em voz, trava de transmissão, soundboard). Voz, vídeo e tela vão direto do app para o LiveKit (SFU), com token emitido pelo servidor Node, que também recebe os webhooks do LiveKit para conferir presença e aplicar as regras de transmissão.

```text
App Electron (main + renderer React)
  ├─ HTTPS /api, /files, /convite ───────────┐
  ├─ Socket.IO /socket.io (tempo real) ──────┤──> server (Node/Fastify + Socket.IO + SQLite)
  └─ WebRTC (wss /rtc + UDP 7882) ─┐         │        │  emite token LiveKit (POST /api/livekit/token)
                                   v         │        │  recebe webhook  <── LiveKit
                                LiveKit SFU <┘        │  RoomService (silenciar faixa fora da regra) ──> LiveKit
VPS: Caddy :443 ──> /rtc*, /twirp* -> livekit:7880 ; resto -> server:3000
Tailscale: app -> http://<ip-tailnet>:3000 e ws://<ip-tailnet>:7880 (sem Caddy)
```

## 2. Componentes afetados
Projeto novo: todos os arquivos são criados. Estrutura prevista:

| Pasta | Stack | Papel | Arquivos-chave (a criar) |
| --- | --- | --- | --- |
| `/` | npm workspaces | Scripts raiz: `build`, `test`, `test:e2e`, `lint`, `dist:win`, `dist:linux`, `dev:server`, `dev:client` | `package.json`, `tsconfig.base.json`, `eslint.config.js`, `README.md` |
| `shared/` | TypeScript | Tipos e constantes comuns: DTOs, eventos do Socket.IO, presets de qualidade, limites (20 contas, 5 sons, 10 s, 3 s, 8 MB), validações de nome/senha | `shared/src/protocolo.ts`, `shared/src/limites.ts`, `shared/src/qualidade.ts`, `shared/src/validacao.ts` |
| `server/` | Node 24 + TypeScript, Fastify, Socket.IO, better-sqlite3 | Contas, sessões, cargos, canais, mensagens, DMs, anexos, soundboard, página de convite, token e webhook do LiveKit, CLI de senha | `server/src/app.ts`, `server/src/db/migrate.ts`, `server/src/db/migrations/001_inicial.sql`, `server/src/auth/*`, `server/src/routes/*`, `server/src/realtime/*`, `server/src/livekit/*`, `server/src/media/*`, `server/src/cli/redefinir-senha.ts`, `server/Dockerfile` |
| `client/` | Electron 45 + React 19 + TypeScript, electron-vite, electron-builder | App desktop: telas, voz, vídeo, tela, atalhos globais, link de convite, configurações locais | `client/src/main/{index,ipc,captura,atalhos,configuracoes,deeplink}.ts`, `client/src/preload/index.ts`, `client/src/renderer/{app,telas,componentes,estado,servicos}/…`, `client/src/renderer/servicos/voz/{sala,pipeline-audio,portao-voz.worklet}.ts`, `client/electron-builder.yml` |
| `deploy/` | Docker Compose | server + LiveKit (+ Caddy no perfil `vps`), configuração do LiveKit, exemplo de variáveis | `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/livekit.yaml`, `deploy/.env.example` |

O pacote `shared` é um acréscimo às três pastas pedidas: evita duplicar os contratos entre app e servidor.

**Bibliotecas** (só estas, salvo decisão nova): servidor — `fastify`, `@fastify/multipart`, `@fastify/static`, `socket.io`, `better-sqlite3`, `sharp` (avatar 256×256), `music-metadata` (duração dos sons), `livekit-server-sdk`, `zod`; senha com `scrypt` do `node:crypto` (sem dependência nativa extra). App — `react`, `zustand` (estado), `socket.io-client`, `livekit-client`, `@sapphi-red/web-noise-suppressor` (RNNoise em WASM), `uiohook-napi` (atalho global com tecla solta, para o push-to-talk). Testes — `vitest`, `@testing-library/react`, `@playwright/test` (Electron). Sem biblioteca de componentes visuais (CSS próprio com variáveis) para manter a memória baixa.

## 3. Contratos
Todos novos. Autenticação por `Authorization: Bearer <token>` no HTTP e `auth.token` no handshake do Socket.IO. Erros HTTP: `{ "erro": "<codigo>", "mensagem": "<texto pt-BR>" }`.

**HTTP (Fastify)**
| Contrato | Request | Response / erros |
| --- | --- | --- |
| `GET /api/servidor` | — (público) | `{ app: "tofalando", nome, versao, contas, limiteContas }` — teste de conexão do RF-1; `app` identifica um servidor ToFalany (o app recusa outro serviço); `contas` entra na T2 |
| `POST /api/auth/cadastro` | `{ convite, usuario, senha }` | `201 { token, usuario }` · `400 dados_invalidos` · `403 convite_invalido` · `409 usuario_em_uso` · `409 limite_contas` |
| `POST /api/auth/login` | `{ usuario, senha }` | `{ token, usuario }` · `401 credenciais_invalidas` |
| `POST /api/auth/sair` | — | `204` (revoga a sessão) |
| `GET /api/eu` · `PATCH /api/eu` | `{ nomeExibicao?, cor? }` | `UsuarioDto` |
| `PUT /api/eu/avatar` | multipart `arquivo` | `{ avatarUrl }` · `413 arquivo_grande` · `415 formato_invalido` |
| `POST /api/anexos` | multipart `arquivo` (JPEG, PNG, GIF, WebP, PDF, ZIP; até 25 MB) | `{ id, url, tipo: "imagem"\|"documento", nome, bytes, largura?, altura? }` (vinculado à mensagem no envio) · `413 arquivo_grande` · `415 formato_invalido` |
| `GET /api/canais/:id/mensagens?antes=<id>&limite=50` | — | `{ mensagens: MensagemDto[], fim: boolean }` |
| `GET /api/dms/:id/mensagens?antes=<id>&limite=50` | — | idem; `403` se não for participante (inclusive administrador) |
| `POST /api/livekit/token` | `{ canalVozId }` | `{ url, token }` — sala `voz-<id>`, identidade = id do usuário, metadado com o cargo |
| `POST /api/livekit/webhook` | corpo do LiveKit (assinatura verificada) | `200` |
| `PATCH /api/admin/usuarios/:id/cargo` | `{ cargo: "admin" \| "membro" }` | `UsuarioDto` · `409 ultimo_admin` |
| `DELETE /api/admin/usuarios/:id` | — | `204` · `409 ultimo_admin` |
| `PUT /api/admin/convite` | `{ codigo }` | `{ codigo, link }` |
| `GET /api/admin/convite` | — | `{ codigo, link }` (membro também lê o link pelo `ola`) |
| `GET /api/sons` | — | `SomDto[]` |
| `POST /api/admin/sons` · `PUT /api/admin/sons/:id` | multipart `nome`, `arquivo` (MP3/OGG/WAV) | `SomDto` · `409 limite_sons` · `422 som_longo` |
| `DELETE /api/admin/sons/:id` | — | `204` |
| `GET /files/:id` | — | arquivo (id aleatório de 128 bits; avatar, anexo, som) |
| `GET /convite/:codigo` | — | página HTML: downloads, botão `tofalany://convite?servidor=<url>&codigo=<c>`, instrução manual |
| `GET /downloads/:arquivo` | — | instaladores colocados pelo host na pasta `downloads/` |
| `GET /api/admin/auditoria?pessoa=<id>&tipo=<tipo>&canal=<id>&de=<ms>&ate=<ms>&antes=<id>&limite=100` | — | `{ registros: RegistroAuditoriaDto[], fim }` (mais recente primeiro; `403 sem_permissao` para membro) |
| `GET /api/saude` | — | `{ ok, sqlite, livekit }` |

Toda rota `/api/admin/*` confere o cargo no servidor; `403 sem_permissao` para membro.

**Socket.IO** (cliente → servidor com ack `{ ok: true, ... } | { ok: false, erro }`)
| Evento | Payload | Regra |
| --- | --- | --- |
| `canal:criar` · `canal:renomear` | `{ tipo: "texto"\|"voz", nome }` · `{ id, nome }` | qualquer membro (RN-7) |
| `canal:remover` | `{ id }` | só admin (RN-7); apaga mensagens e anexos (RN-8) |
| `mensagem:enviar` | `{ destino: { canalId } \| { dmId }, texto, anexos: string[] }` | DM só entre participantes |
| `mensagem:editar` · `mensagem:apagar` | `{ id, texto }` · `{ id }` | autor; admin apaga em canal, nunca em DM (RN-9, RN-18) |
| `digitando` | `{ destino }` | repassado aos outros; expira em 5 s no cliente |
| `dm:abrir` | `{ usuarioId }` | `{ dmId }` (cria se não existir) |
| `lido:marcar` | `{ destino, ultimaMensagemId }` | contador de não lidas |
| `voz:estado` | `{ canalVozId \| null, mudo, surdo, camera }` | presença mostrada a todos |
| `tela:pedir` | `{ canalVozId, qualidade }` | `ok` · `ocupado { porUsuarioId }` (RN-10) · `qualidade_nao_permitida` (RN-17) |
| `tela:parar` | `{ canalVozId }` | libera a trava |
| `som:tocar` | `{ somId }` | `ok` · `fora_da_voz` (RN-12) · `aguarde { ms }` (RN-13) |

Servidor → cliente: `ola` (retrato completo ao conectar: eu, usuários, canais, DMs, não lidas, presença em voz, transmissões, sons, link de convite), `usuario:atualizado`, `usuario:removido`, `canal:criado|renomeado|removido`, `mensagem:nova|editada|apagada`, `digitando`, `voz:estados`, `tela:iniciada|parada`, `som:tocado { somId, porUsuarioId, canalVozId }` (só para a sala), `sons:atualizados`, `sessao:revogada`.

**Electron (main ↔ renderer, via preload, sem `nodeIntegration`)**: `captura:fontes` → miniaturas de `desktopCapturer.getSources`; `captura:escolher { fonteId, audioSistema }` → usado por `setDisplayMediaRequestHandler`; `atalhos:definir|eventos`; `config:ler|gravar`; `sessao:ler|gravar` (token cifrado com `safeStorage`); `deeplink:convite` (evento); `notificar`.

## 4. Dados
SQLite em `server/data/tofalando.db` (volume Docker), WAL ligado. Arquivos numa pasta só, `arquivos/` ao lado do banco (ou `ARQUIVOS`), com nome aleatório de 128 bits e extensão do tipo conferido.

| Tabela | Colunas principais | Observação |
| --- | --- | --- |
| `usuarios` | `id`, `usuario`, `usuario_norm` UNIQUE (nulo quando removido), `senha_hash`, `nome_exibicao`, `cor`, `avatar_arquivo`, `cargo`, `criado_em`, `removido_em` | limite conta só `removido_em IS NULL`; removido mantém a linha para autoria "conta removida" |
| `sessoes` | `token_hash` PK (SHA-256), `usuario_id`, `criado_em`, `visto_em` | remover conta apaga as sessões → `sessao:revogada` |
| `configuracoes` | `chave` PK, `valor` | `codigo_convite` (inicial vem de `CODIGO_CONVITE` no ambiente) |
| `canais` | `id`, `tipo`, `nome`, `posicao`, `criado_por`, `criado_em` | |
| `dms` | `id`, `usuario_a`, `usuario_b`, UNIQUE(a,b) com a<b | |
| `mensagens` | `id` INTEGER autoincremento, `canal_id` ou `dm_id`, `autor_id`, `texto`, `criada_em`, `editada_em` | índice `(canal_id, id)` e `(dm_id, id)`; paginação por `id < antes` |
| `anexos` | `id` (aleatório), `mensagem_id`, `autor_id`, `tipo`, `mime`, `nome_original`, `largura`, `altura`, `bytes`, `caminho` | órfão >1 h sem mensagem é apagado |
| `leituras` | `usuario_id`, `destino`, `ultima_mensagem_id` | |
| `auditoria` | `id` INTEGER autoincremento, `quando`, `tipo`, `ator_id` (nulo = host, via comando), `alvo_usuario_id`, `canal_id`, `detalhes` (JSON curto: nomes no momento do evento, cargo novo, qualidade…) | índices `(quando)`, `(ator_id, id)`, `(tipo, id)`, `(canal_id, id)`; nunca guarda texto de mensagem nem nada de DM; migration 002 |
| `sons` | `id`, `nome`, `arquivo`, `duracao_ms`, `criado_por`, `criado_em` | no máximo 5 (verificado na transação) |

Migrations: arquivos SQL numerados aplicados na subida pelo `PRAGMA user_version`; antes de migrar, cópia do banco para `data/backup/tofalando-<versao>-<data>.db`. Rollback = parar o servidor e restaurar a cópia. Volume esperado: dezenas de milhares de mensagens — sem retenção automática.

### Auditoria (RN-20 a RN-24)
- Módulo `server/src/dominio/auditoria.ts`: `registrarAuditoria(banco, { tipo, atorId, alvoUsuarioId?, canal?: { id, nome }, detalhes? })` (o nome do canal vai junto para ficar guardado), chamado no mesmo ponto (e na mesma transação, quando houver) da ação registrada. Tipos em `shared/src/auditoria.ts` (`conta_criada`, `login`, `saiu`, `online`, `offline`, `voz_entrou`, `voz_saiu`, `tela_iniciou`, `tela_parou`, `cargo_alterado`, `conta_removida`, `convite_trocado`, `som_cadastrado`, `som_trocado`, `som_removido`, `canal_criado`, `canal_renomeado`, `canal_removido`, `mensagem_apagada_admin`, `mensagem_editada`, `mensagem_apagada`, `senha_redefinida`).
- `detalhes` guarda os nomes do momento (ex.: nome do canal), para o registro continuar legível depois de renomear/remover.
- Online/offline: `online` quando o primeiro socket do usuário conecta; `offline` só se o último cair e ninguém voltar em 30 s (temporizador por usuário, cancelado na reconexão). Ao subir o servidor, quem estava online no registro sem `offline` recebe um `offline` com `detalhes.motivo = "servidor_reiniciado"`.
- Voz e tela: registrados pelo servidor a partir de `voz:estado`/`tela:pedir`/`tela:parar` e conferidos pelos webhooks do LiveKit (T14, T21).
- Limpeza: ao subir e a cada 6 h, `DELETE FROM auditoria WHERE quando < agora - AUDITORIA_DIAS` (padrão 30).
- Tela `client/src/renderer/telas/TelaAuditoria.tsx`, só para admin, filtros e rolagem com `antes=<id>`.

## 5. Integrações externas
- **LiveKit Server** (imagem `livekit/livekit-server`, arm64/amd64). Config: `rtc.udp_port: 7882` (uma porta UDP só, firewall simples), `rtc.tcp_port: 7881` (fallback), `webhook` apontando para `http://server:3000/api/livekit/webhook`, chaves em variáveis de ambiente. Tailscale: `rtc.node_ip` = IP do tailnet do host. Token com `canPublishSources` (microfone, câmera, tela, áudio da tela) e `roomJoin` só na sala pedida, validade 6 h.
- **livekit-client** no app: `Room({ adaptiveStream: true, dynacast: true, webAudioMix: true })` para volume por pessoa acima de 100% e saída escolhida via `AudioContext.setSinkId`. Webcam com simulcast; transmissão com `simulcast: false`, `contentHint: "motion"`.
- **Desenvolvimento**: LiveKit em modo `--dev` (chaves fixas `devkey/secret`). Depende da decisão U-1.
- Nenhum serviço de terceiros em tempo de uso. O corretor ortográfico do Chromium fica desligado (ele baixa dicionários de servidores do Google).

## 6. Segurança
- Senha: `scrypt` (N=2^15, r=8, p=1, salt 16 bytes), comparação em tempo constante. Login com limite de 10 tentativas por minuto por IP.
- Sessão: token aleatório de 256 bits; só o hash fica no banco; no app, cifrado com `safeStorage`. Sem expiração (RF-3); revogado ao sair, ao remover a conta ou ao redefinir a senha.
- Autorização sempre no servidor: cargo para `/api/admin/*`, `canal:remover`, apagar mensagem alheia, qualidade acima de 720p30; participação para DMs (nem admin lê). Token do LiveKit leva o cargo no metadado; o webhook `track_published` confere as dimensões declaradas da faixa de tela e silencia (`RoomService.mutePublishedTrack`) faixa de membro acima de 1280×720 ou segunda tela no mesmo canal.
- Arquivos: ids aleatórios de 128 bits; sem listagem; mime conferido pelo conteúdo (`sharp` para imagem, assinatura `%PDF-` e `PK\x03\x04` para documento, `music-metadata` para som), não pela extensão; documentos servidos com `Content-Disposition: attachment` e nunca abertos dentro do app (o app salva com diálogo e oferece abrir pelo programa do sistema via `shell.openPath`); nome original saneado; imagens regravadas pelo `sharp` (remove metadados EXIF, inclusive localização).
- Segredos (`CODIGO_CONVITE`, `LIVEKIT_API_KEY/SECRET`) só no `.env` do servidor (fora do git; o guard do fluxo bloqueia a leitura). Electron: `contextIsolation`, `sandbox`, sem `nodeIntegration`, CSP restrita ao servidor configurado.
- HTTPS: na VPS via Caddy (Let's Encrypt). No Tailscale o tráfego já vai cifrado pelo WireGuard, então HTTP no tailnet é aceitável.

## 7. Observabilidade
- Logs JSON do Fastify (pino) em stdout, sem senha, token nem conteúdo de mensagem. `docker compose logs`.
- `GET /api/saude` (SQLite e LiveKit) usado no healthcheck do compose.
- App: log local rotativo em `userData/logs` (conexão, reconexão, erros de mídia) e tela "Sobre" com versão e estado da conexão. Sem telemetria.

## 8. Estratégia de testes
Ferramentas: **Vitest** (unidade, nos três pacotes); **integração do servidor** com `fastify.inject` + `socket.io-client` contra SQLite em memória; **E2E** com Playwright `_electron`, abrindo até três instâncias do app com mídia falsa do Chromium (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`) contra servidor e LiveKit locais. O que depende de ouvido, câmera, rede real ou outra máquina fica com o usuário (regra `pare_e_pergunte` do perfil), registrado no card.

| CA | Unidade | Integração / E2E | Validação manual (usuário) |
| --- | --- | --- | --- |
| CA-1 | validação de URL | E2E: primeira execução, URL inválida mostra erro | — |
| CA-1a | montagem do link e parse do deeplink | integração `GET /convite/:c`; E2E abre app com `tofalany://` | clicar no link em Windows e no .deb |
| CA-2, CA-3, CA-4, CA-5 | `validacao.ts` | integração `POST /api/auth/cadastro` (convite errado, 20 contas, nome repetido sem caixa, 1ª conta admin) | — |
| CA-6 | — | E2E: reabrir app entra direto | — |
| CA-7 | — | integração: CLI `redefinir-senha` + login | — |
| CA-8 | — | integração: avatar 1000×800 → 256×256; 9 MB → 413; PDF → 415; evento `usuario:atualizado` | — |
| CA-9, CA-10 | — | integração: promover, rebaixar último admin → 409 | — |
| CA-11, CA-11a, CA-11b | — | integração: membro em `/api/admin/*` → 403; remover conta revoga socket e libera vaga; troca de convite invalida o antigo | — |
| CA-12, CA-13 | — | integração com 2 sockets: criar/renomear em < 2 s; membro não remove; admin remove e mensagens somem | — |
| CA-14, CA-15 | — | integração: 500 mensagens paginadas até `fim`; persistência após reabrir o banco | — |
| CA-16 | — | integração: envio de PNG 2 MB; E2E: imagem no chat e ampliada | — |
| CA-16a | — | integração: PDF 5 MB e ZIP 20 MB baixados com o mesmo hash; E2E: cartão e salvar | abrir o PDF no programa do sistema |
| CA-16b | detecção de formato | integração: 30 MB → 413; .exe renomeado → 415 | — |
| CA-17 | expiração do digitando | integração: repasse do evento | — |
| CA-18 | — | integração: editar marca `editadaEm`; outro membro recusado; admin apaga em canal | — |
| CA-19, CA-19a, CA-19b | contador de não lidas | integração: DM só para B; C e admin recebem 403/erro; E2E: notificação com app sem foco | ver a notificação do sistema |
| CA-20 | — | E2E 2 apps (áudio falso): B assina a faixa de A e o indicador de fala acende | ouvir em duas máquinas |
| CA-21 | `portao-voz` (limiar, retenção) | — | testar sensibilidade falando |
| CA-22 | estado do push-to-talk | E2E: evento de atalho abre o portão | segurar a tecla com o app em segundo plano |
| CA-23 | conflito de atalhos, persistência | E2E: trocar atalho e reiniciar | — |
| CA-24 | — | E2E: surdo zera volumes e muta microfone | — |
| CA-25 | — | E2E: troca de dispositivo falso sem sair da sala | trocar fone/microfone real |
| CA-26 | pipeline liga/desliga RNNoise | — | ventilador perto do microfone |
| CA-27 | — | E2E: volume 50% aplicado só no B | ouvir |
| CA-28 | — | E2E: medidor se mexe com áudio falso | — |
| CA-29 | — | E2E: som de entrada/saída disparado | ouvir |
| CA-30 | `configuracoes` | E2E: reiniciar mantém escolhas | — |
| CA-31 | — | integração: som 8 s aceito, 15 s → 422, 6º → 409 | — |
| CA-32, CA-33, CA-34 | cooldown | integração: `som:tocado` só para a sala; fora da voz → erro; < 3 s → `aguarde`; E2E: botões desabilitados fora da voz | ouvir o som no outro computador |
| CA-35 | volume do soundboard | E2E: volume 0 não toca | — |
| CA-36 | — | E2E: câmera falsa publicada e assinada | webcam real |
| CA-37 | — | E2E: seletor lista fontes (miniaturas) | escolher janela real |
| CA-38 | — | integração: trava `tela:pedir` (ocupado/libera); E2E com 2 apps | — |
| CA-39, CA-39a | `qualidade.ts` (presets por cargo) | integração: membro pedindo 1440p60 → `qualidade_nao_permitida`; webhook silencia faixa > 1280×720 de membro | medir 1440p60 real entre máquinas |
| CA-40 | — | — | Windows: áudio do sistema; Linux: opção desabilitada |
| CA-41 | — | E2E: abrir transmissão grande e tela cheia | — |
| CA-42 | — | E2E: derrubar e voltar servidor/LiveKit → reconecta com aviso | tirar o cabo de rede |
| CA-43 | — | build: `dist:linux` gera .AppImage e .deb; `dist:win` gera .exe (wine) | instalar o .exe no Windows |
| CA-44 | — | `docker compose up` local (amd64) | arm64 na VPS |
| CA-45 | — | E2E: soma de `app.getAppMetrics()` após 5 min ocioso < 300 MB | — |
| CA-46 | — | E2E: registro de requisições do `session.webRequest` só com o servidor configurado | — |
| CA-48 | — | integração: cadastro, login, saída, online/offline gravados | E2E: admin vê os eventos na tela |
| CA-49 | — | integração (T14/T21): voz e tela gravados com canal | — |
| CA-50 | — | integração: cada ação de admin (T6, T8, T10, T18) e o comando de senha (T3) gravam com ator e alvo | — |
| CA-51 | — | integração: edição/exclusão em canal gravadas sem texto; em DM, nada | — |
| CA-52 | — | integração: membro → 403; E2E: membro não vê a opção | — |
| CA-53 | limpeza com relógio injetado | integração: 31 dias some, 29 fica | — |
| CA-54 | montagem do filtro | integração: filtros combinados e paginação por `antes` | — |
| CA-55 | temporizador de offline (relógio falso) | integração: queda de 10 s não grava; 1 min grava | — |
| CA-47 | — | — | seguir o README do zero |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Push-to-talk precisa da tecla solta; `globalShortcut` do Electron só avisa o aperto | `globalShortcut`; `uiohook-napi` | `uiohook-napi` para PTT (aperto e soltura, Windows e X11). Mute/deafen também por ele, para usar a mesma tela de atalhos. No Wayland puro não funciona com o app em segundo plano: README documenta; sua máquina usa X11. |
| R-2 | Limite de qualidade de membro (RN-17) | só na tela; token; webhook + RoomService | Tela + `tela:pedir` + webhook conferindo dimensões e silenciando a faixa. O LiveKit não limita resolução pelo token, e as dimensões vêm de quem publica: um app adulterado poderia mentir. Aceitável para um grupo de amigos; registrado. |
| R-3 | Codec da transmissão | VP9; H.264; automático | H.264 por padrão (codificação por hardware comum no Windows, menos CPU em 1440p60), VP9 como opção nas configurações. Sem simulcast na tela. No Linux o Chromium quase sempre codifica por software: 1440p60 pode pesar na CPU. |
| R-4 | Soundboard: como chega o som | misturar no microfone; faixa extra no LiveKit; cada app toca localmente | Cada app toca localmente ao receber `som:tocado` (arquivos baixados e guardados em cache ao conectar). Latência baixa, respeita volume local e deafen, sem mexer no áudio do microfone. O servidor valida presença e intervalo. |
| R-5 | Captura de tela no Linux Wayland usa o seletor do sistema (PipeWire), não miniaturas próprias | — | X11: seletor próprio. Wayland: habilitar `WebRTCPipeWireCapturer` e aceitar o seletor do sistema; README documenta. Áudio do sistema no Linux: indisponível (RF-29). |
| R-6 | Link `tofalany://` no AppImage não se registra sozinho | só .deb/.exe; registrar ao abrir | .exe e .deb registram na instalação; o AppImage registra o próprio `.desktop` na primeira execução. A página do convite sempre mostra servidor e código para digitar à mão. |
| R-7 | RAM < 300 MB | — | Sem biblioteca visual, React leve, corretor desligado, nada carregado antes de usar (voz/RNNoise só ao entrar no canal). Medido no E2E (CA-45). Se estourar, primeiro corte: lazy load de telas. |
| R-8 | Instalador Windows sem assinatura de código | assinar (certificado pago); sem assinatura | Sem assinatura (sem custo, RNF). O Windows mostra aviso do SmartScreen na primeira instalação; README explica. |
| R-9 | `.exe` gerado no Linux | wine local; CI no Windows | wine 9 já está instalado: `dist:win` roda aqui. |
| R-10 | Rede da transmissão para até 19 espectadores | — | É limite de banda do servidor (≈ 10 Mbps × espectadores em 1440p60). README traz a tabela; por isso só admin vai acima de 720p30. |
| R-11 | Volume da auditoria (online/offline a cada queda) | gravar tudo; carência para offline | Carência de 30 s para offline (RN-24) e retenção de 30 dias; com 20 contas o volume fica em milhares de linhas por mês. |
| U-1 | **Docker não está instalado nesta máquina.** Ele é necessário para validar o `docker-compose` (CA-44) e é o jeito mais simples de rodar o LiveKit em desenvolvimento. | (a) instalar Docker Engine; (b) baixar só o binário oficial do LiveKit (GitHub) para desenvolvimento e você valida o compose na VPS | (a) Instalar Docker Engine pelo apt (`docker.io`, `docker-compose-v2`, `docker-buildx`): decidido pelo usuário em 04/11; instalação feita por ele. |
| U-2 | Domínio para HTTPS na VPS | domínio próprio; DNS grátis (DuckDNS, sslip.io) | Não bloqueia: README cobre os dois. |

## 10. Implantação e rollback
Ordem da demanda, cada etapa validada antes da próxima:
1. Servidor + contas + perfil + cargos + convite + canais + texto + DMs (e o app até o chat).
2. Voz: sala LiveKit, dispositivos, tratamento de áudio, detecção de voz, PTT e atalhos, volumes, sons de voz.
3. Soundboard (depende da voz).
4. Webcam.
5. Transmissão de tela com trava por canal e limite por cargo.
6. Empacotamento (`dist:win`, `dist:linux`), docker-compose, Caddy, README com Tailscale, VPS e tabela de banda.

Implantação: `docker compose --profile tailscale up -d` (PC do host) ou `--profile vps up -d` (com Caddy). Atualizar = `git pull` + `docker compose up -d --build`; a migration roda na subida com backup automático. Rollback = voltar a versão da imagem e restaurar o backup do banco. App: instalar a versão anterior por cima.

## 11. CI/CD
Repositório local, sem remoto: nenhuma pipeline nesta demanda. Build e testes rodam pelos scripts do perfil (`npm run build`, `npm test`, `npm run lint`). Se depois houver remoto, uma pipeline pode rodar os mesmos comandos e gerar os instaladores (skill `azure-pipelines`).

> Portão: o plano só começa com esta especificação aprovada (registrada no topo).
