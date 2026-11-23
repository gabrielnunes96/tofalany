# ToFalany no celular (Android) — especificação técnica

> Demanda: `celular` · Base: funcional v2 · 23/11/2026 · Situação: **aprovada em 23/11/2026**

## 1. Visão da solução
Um novo projeto `mobile/` no monorepo empacota **a mesma interface React** do app de computador (`client/src/renderer`) num app Android com **Capacitor 8**. O renderer já fala com o "mundo de fora" só por uma ponte (`window.tofalando`, contrato em `client/src/preload/api.ts`): no celular, essa ponte é implementada por um adaptador em TypeScript que usa plugins do Capacitor e um plugin nativo próprio (Kotlin), sem tocar na lógica de chat, voz e loja. As telas ganham um layout de celular (gavetas no lugar das três colunas, toques longos no lugar do clique direito). O servidor ganha três coisas que valem para todos: registro de aparelho para push sem conteúdo, "chamar para a voz" e "aparelhos conectados".

```text
mobile/ (Capacitor 8, minSdk 29)
  web: client/src/renderer (mesmo código) + ponte-celular.ts (adaptador da window.tofalando)
  android/ (Kotlin, plugin "Tofalany"):
    ChamadaService (serviço em primeiro plano microphone|mediaPlayback|camera, notificação fixa com mudo/sair)
    RotaAudio (AudioManager.setCommunicationDevice: fone, Bluetooth, alto-falante)
    AvisoService (FirebaseMessagingService: aviso data-only {v,k} → busca no servidor → notificação local)
    Cofre (chave AES-GCM no Android Keystore; sessão cifrada no armazenamento privado)
    Atualizador (API de releases → baixa APK → confere pacote, certificado e versão → PackageInstaller)
servidor:
  push: tabela push_aparelhos (por sessão, CASCADE) + fila agrupada → FCM HTTP v1 (data-only, sem conteúdo)
  GET /api/push/:id (resumo amarrado à sessão, uso único) · preferências de aviso no servidor
  voz:chamar (socket) → aviso ao app aberto + push · GET/DELETE /api/sessoes (aparelhos conectados)
  /.well-known/assetlinks.json (App Link do convite)
CI: job android (JDK 21 + SDK) → APK assinado (Environment com revisor) → release
```

## 2. Componentes afetados
| Projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| mobile (novo) | front + Kotlin | Capacitor 8 (`@capacitor/core`, `android`, `app`, `local-notifications`, `@capacitor-firebase/messaging` ou `@capacitor/push-notifications` só para o token), plugin próprio em `mobile/android/app/src/main/java/.../tofalany/`, `ponte-celular.ts`, Vite apontando para `client/src/renderer` | — |
| client: renderer | front | Layout responsivo (abaixo de 720 px: gavetas para servidores/canais e membros; menus por toque longo; sem hover essencial); grupos da ponte opcionais tratados (`captura`, `atalhos`, `atividade` ausentes no celular); "Chamar para a voz" no menu da pessoa e na DM; tela "Aparelhos conectados"; preferências de aviso enviadas ao servidor | `estilos/base.css:324` (3 colunas), `telas/TelaPrincipal.tsx` (40 usos da ponte; `:919,:1729` `captura.pararSom` sem `?.`), `componentes/BarraLateral.tsx`, `MenuPessoa.tsx`, `estado/notificar.ts`, `servicos/ponte.ts:10` |
| client: preload/main | node | Contrato `api.ts` com `captura`, `atalhos`, `atividade`, `janelaPropria` opcionais e um campo `plataforma: 'desktop' \| 'android'` | `preload/api.ts:10-107`, `preload/index.ts` |
| shared | node | Eventos `voz:chamar`/`voz:chamado`; DTOs de push, sessões e preferências de aviso; `RN-11` limites | `protocolo.ts`, `limites.ts` |
| server | node | Migração 025 (`push_aparelhos`, `push_pendentes`, `preferencias_aviso`), `dominio/push.ts` (decisão + fila + envio FCM v1 com conta de serviço), rotas `/api/push/*`, `/api/sessoes`, `/api/conta/preferencias-aviso`, `voz:chamar`, ganchos em `mensagens.ts:208,105` e `voz.ts`, `assetlinks.json`, link do APK na página do convite | `realtime/mensagens.ts:142-232`, `routes/convites-pessoa.ts:84`, `realtime/voz.ts`, `dominio/sessoes.ts`, `routes/auth.ts:98,109`, `routes/admin.ts:113`, `routes/convite.ts:13-19`, `config.ts` |
| CI | — | Job `android` em `release.yml`, entra em `publicar.needs`; Environment `android-assinatura` | `.github/workflows/release.yml` |

## 3. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `POST /api/push/aparelho` `{ fcmToken, k }` | — | registra o aparelho na sessão (upsert por `fcm_token` único); 204 sempre | Nova |
| `DELETE /api/push/aparelho` | — | apaga o da sessão | Nova |
| `GET /api/push/pendentes?k=` | — | resumos ainda não lidos da sessão (autor, começo do texto, canal/DM, chamado), uso único, expiram em 10 min | Nova |
| `GET/PUT /api/conta/preferencias-aviso` | — | `{ mensagens, chamados, silenciadas: string[] }` | Nova; o app de computador passa a gravar aqui também |
| `GET /api/sessoes`, `DELETE /api/sessoes/:id` | — | aparelhos da conta (id opaco, nome do aparelho, criado, visto); desconectar revoga e derruba | Nova |
| Socket `voz:chamar` `{ usuarioId }` (ack) → `voz:chamado` `{ porId, porNome, canalVozId, canalNome }` | — | quem está na voz chama alguém do servidor | Novos; app antigo ignora |
| Login `POST /api/auth/entrar` | — | + `aparelho?: string` (nome para "aparelhos conectados") | Opcional |
| Aviso FCM | — | data-only `{ v: 1, k }`, sem `notification`, TTL 10 min (chamado: 60 s), `collapse_key` por aparelho | — |
| Ponte (`api.ts`) | Electron | + `plataforma`; `captura`, `atalhos`, `atividade` opcionais | O renderer trata ausência |

## 4. Dados
Migração 025:
- `push_aparelhos(sessao_hash TEXT PRIMARY KEY REFERENCES sessoes(token_hash) ON DELETE CASCADE, fcm_token TEXT UNIQUE NOT NULL, k TEXT NOT NULL, criado_em, visto_em)` — todo caminho que apaga a sessão (sair, redefinir, remover conta, CLI, aparelhos conectados) apaga o registro (RN-5, A3).
- `push_pendentes(id TEXT PRIMARY KEY, sessao_hash ... ON DELETE CASCADE, tipo, ref, resumo_json, criado_em)` — resumos para o app buscar; apagados ao ler ou em 10 min.
- `preferencias_aviso(usuario_id PRIMARY KEY ... CASCADE, mensagens INTEGER, chamados INTEGER, silenciadas TEXT)`.
- `sessoes` + coluna `aparelho TEXT` (nome informado no login).
Volume: dezenas de linhas. Rollback: backup automático da migração; servidor antigo ignora.

## 5. Integrações externas
- **Firebase Cloud Messaging (HTTP v1)**: o servidor obtém um token OAuth com a conta de serviço (só o papel de envio do FCM) e envia data-only. Timeout 10 s; falha de rede → tenta de novo 2 vezes com espera (o envio é idempotente pela `collapse_key`); resposta `UNREGISTERED`/`INVALID_ARGUMENT` apaga o aparelho. Fora do ar: o aviso se perde, a mensagem continua no servidor (aparece ao abrir o app). A credencial fica num arquivo na VM (0400), montado só no contêiner do servidor; **mudança na VM só com o seu OK**.
- **API de releases do GitHub**: o atualizador consulta a última release do repositório fixo e baixa o APK por HTTPS.
- **Verificação de desenvolvedor do Google** (RN-13): conta no Android Developer Console verificada por você; o certificado de assinatura do APK registrado lá.

## 6. Segurança
Modelagem STRIDE de 23/11 (A1 a A21). Bloqueiam o lançamento:
- **A1** `allowBackup=false`, `dataExtractionRules` e `fullBackupContent` excluindo tudo (teste do manifesto mesclado).
- **A2/RN-12** aparelhos conectados com revogação; **A3** registro de push com `ON DELETE CASCADE` da sessão; no sair, o app também apaga o token do FCM.
- **A8** atualizador: só hosts do GitHub fixos no código; antes de instalar confere `packageName`, SHA-256 do certificado fixo no app e `versionCode` maior; instala por `PackageInstaller`; o JS só pede "atualizar".
- **A9** chave de assinatura em Environment `android-assinatura` com revisor, só tags `v*`; `apksigner verify --print-certs` no CI contra o SHA-256 esperado; cópia offline cifrada da chave (sem ela não há mais atualização).
- **A10** WebView: origem `https://localhost`, `allowNavigation` vazio, links externos só `http(s)` pelo navegador (sem `intent:`/`file:`/`content:`), sem acesso a arquivos, depuração desligada no release, plugins mínimos.
- **A11/RN-2** CSP gerada no carregamento com `connect-src`/`img-src`/`media-src` só para o servidor salvo, o host do GIF e o player do YouTube já liberado no computador; CapacitorHttp desligado; o nativo só fala com o servidor salvo, o GitHub (atualização) e o FCM.
- **A12** `network_security_config` sem texto claro na base; exceção só para endereços do Tailscale (`*.ts.net`); `http://` fora disso é recusado no login com aviso.
Com o push: **A4** `fcm_token` único com upsert, resposta sempre 204, token nunca em log; **A5** resumo com id aleatório de uso único amarrado à sessão, permissão conferida de novo na busca; **A6** carga de tamanho fixo `{v,k}`, agrupamento de 1 aviso a cada 30 s por aparelho, só `firebase-messaging` (sem Analytics, coleta automática desligada); **A7** conta de serviço só com o papel do FCM, avisos fora do formato ignorados; **A15** serviço do FCM não exportado, `k` gerado pelo app e mapeado localmente ao servidor; **A19** limite de chamados (RN-11) e agrupamento.
Antes da validação: **A13** App Link verificado para o convite (`assetlinks.json`) e confirmação com o host em destaque; **A14** sessão cifrada pelo Keystore (sem exigir desbloqueio, o push lê com a tela bloqueada), nada de token em `localStorage`; **A16** notificações `VISIBILITY_PRIVATE` com versão pública, miniatura dos recentes desligada, `FLAG_SECURE` no login e nos 2 fatores; **A17** lista fechada de permissões conferida no CI (`aapt2 dump permissions`); **A18** o serviço em primeiro plano termina ao sair da voz e o mudo desliga a faixa; **A20** a página do convite aponta o APK da release com o SHA-256; **A21** auditoria de aparelho registrado e removido.
Risco aceito: aparelho com root lê os dados do app.

## 7. Observabilidade
Log do servidor: envios ao FCM (contagem, falhas, aparelhos removidos), sem tokens. Auditoria: aparelho registrado/removido, sessão desconectada pelos aparelhos conectados, chamado para a voz. No app: log local de falhas da chamada em segundo plano (para a validação manual).

## 8. Estratégia de testes
| Critério | Unitário | Contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1, CA-2 | `ponte-celular` (sessão, servidores, convite) | — | Manual no celular (você + alguém do grupo) |
| CA-3, CA-7, CA-12 | renderer com a ponte do celular (jsdom), layout estreito | — | Manual |
| CA-4, CA-5, CA-6, CA-13 | `ChamadaService` e `RotaAudio` (Robolectric/JUnit no `mobile/android`) | voz: uma voz por conta (já testada) | **Manual**: 1 h de voz com tela apagada em dois aparelhos; Bluetooth e alto-falante |
| CA-8, CA-9, CA-16 | decisão do push (menção, DM, silenciadas, preferências, foco do app) | rotas de push com FCM falso: corpo só `{v,k}`, tamanho fixo, agrupamento, `UNREGISTERED` apaga; resumo amarrado à sessão (A5) | Manual com o app fechado |
| CA-10 | gerador da CSP (casos do `rede.test.ts`) | — | Captura de tráfego no celular (PCAPdroid) |
| CA-11 | atualizador: pacote, certificado e versão (JUnit com APKs de teste) | — | Manual com uma release de teste |
| CA-14 | `voz:chamar` (permissão, mesmo servidor, limite, não incomodar) | socket + push | Manual |
| CA-15 | — | `/api/sessoes`: listar só as próprias, desconectar derruba e apaga o push, 404 para a de outra pessoa | Manual |
| Segurança | manifesto mesclado (backup, serviços não exportados, permissões) | assetlinks, link do APK no convite | — |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Como montar | Capacitor + interface atual; React Native com telas novas | **Capacitor 8**: reaproveita quase todo o renderer (chat, voz, loja, estado); o que o WebView não faz (voz em segundo plano, saída de áudio, push com app fechado, atualização) vai para um plugin Kotlin pequeno. React Native exigiria reescrever todas as telas. |
| R-2 | Voz com a tela apagada no WebView | serviço em primeiro plano; SDK nativo do LiveKit só na chamada | Serviço em primeiro plano iniciado ao entrar na voz (com o app visível). Sem prova de conceito (usuário, 23/11): se a validação mostrar queda, a chamada passa para o SDK nativo `io.livekit:livekit-android` dentro do plugin, mantendo as telas. A tarefa da voz vem cedo no plano para descobrir isso antes. |
| R-3 | Troca de saída de áudio | `setSinkId` (não existe no WebView do Android); nativo | `AudioManager.setCommunicationDevice` no plugin. |
| R-4 | Push com o app fechado | plugin pronto; serviço próprio | `FirebaseMessagingService` próprio (os plugins não acordam o app fechado); o plugin pronto só obtém o token. |
| R-5 | Preferências | sincronizar tudo; só as de aviso | Só as de aviso no servidor (usuário, 23/11). |
| R-6 | Android mínimo | 7 (padrão do Capacitor); 10 | **Android 10 (minSdk 29)**: o WebView do sistema só recebe atualização do Android 10 em diante. |
| R-7 | Sessões sem expiração | expirar; listar e revogar | "Aparelhos conectados" (RN-12) nesta demanda; expiração por falta de uso fica para depois. |
| R-8 | Presença no celular | — | App em segundo plano por 10 min = ausente; a ida para a AFK por inatividade não se aplica ao celular. |
| R-9 | Node no CI | 24; 26 | Seguir com o Node do projeto; troca de versão é tarefa à parte. |

## 10. Implantação e rollback
1. Você: conta de desenvolvedor verificada no Google (RN-13); projeto Firebase com conta de serviço só de envio; chave de assinatura gerada e guardada (offline + segredo do GitHub no Environment).
2. Servidor primeiro (migração 025, rotas novas); credencial do FCM na VM **só com o seu OK**.
3. App de computador com "chamar para a voz", "aparelhos conectados" e preferências de aviso no servidor.
4. APK na release (CI), página do convite com o link.
Rollback: servidor anterior (backup da migração); o APK antigo continua funcionando com o servidor novo.

## 11. CI/CD
Job `android` em `release.yml` (ubuntu, JDK 21, Android SDK, Gradle), `npm run build -w shared` e do renderer, `npx cap sync android`, `./gradlew assembleRelease` assinado com a chave do Environment, `apksigner verify --print-certs` contra o SHA-256 esperado, `aapt2 dump permissions` contra a lista permitida, artefato `instaladores-android` (entra no `publicar.needs`). Ações fixadas por SHA, como hoje.
