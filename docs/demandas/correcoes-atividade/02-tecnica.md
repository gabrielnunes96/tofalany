# Correções da atividade e do som da transmissão: especificação técnica

> Demanda: `correcoes-atividade` · Base: funcional v2 (aprovada em 20/11/2026) · 20/11/2026 · Situação: **aprovada em 20/11/2026**
> Base: análise de impacto (fluxo:analista) de 20/11.

## 1. Visão da solução
- **Servidor:** a atividade passa a ir só a quem pode vê-la. É a mesma regra que o `ola` já usa: a própria pessoa, um membro da comunidade da conexão ou um amigo. Quando uma amizade é aceita ou desfeita, os dois recebem a atividade atual do outro (ou `null`).
- **App, tela:**
  - a aba Amigos mostra a atividade;
  - no Windows, o seletor de tela abre com o som do sistema desmarcado, com aviso, e não guarda a escolha.
- **App, leitura (processo principal):**
  - jogo e música são lidos e falham separados;
  - o nome do jogo vem do `appmanifest` da Steam;
  - no Windows, o jogo vem primeiro do `RunningAppID` da Steam;
  - a música do navegador é reconhecida (MPRIS no Linux, sessões de mídia do sistema no Windows);
  - falhas vão para um log em arquivo.

```text
[main] criarAtividade ──20 s / ao mudar config (com "pendente")──> lerAtividadeDoSistema
   Linux:   jogo  = /proc/*/cmdline → todas as pastas steamapps/common → appmanifest (nome)
            música = ListNames → org.mpris.MediaPlayer2.* tocando → spotify OU xesam:url em open.spotify.com
   Windows: 1 PowerShell, blocos com try/catch e marcas por parte:
            jogo  = HKCU\Software\Valve\Steam\RunningAppID → appmanifest_<id>.acf  (senão: caminhos dos processos)
            música = SMTC (sessões de mídia) → Spotify.exe, ou navegador cujo título de janela casa "Título • Artista"
                     (senão: título da janela do Spotify, como hoje)
   falha de uma parte ─> registro.ts (arquivo de log) e a outra parte segue
      │ IPC atividade:mudou
[renderer] presenca:atividade ─> [server] definirAtividade ─> emitirAtividade(id): só conexões que podem ver
                                          amizade aceita/desfeita ─> reenviar atividade / null aos dois
[renderer] loja.atividades ─> lista de membros, cartão, perfil e AGORA a aba Amigos
```

## 2. Decisões tomadas aqui (para a aprovação)
| # | Decisão | Por quê |
| --- | --- | --- |
| T-1 | **O filtro do RF-2 é por conexão, com a regra do `ola`:** `s.data.usuarioId === id \|\| membroDe(banco, s.data.comunidadeId, id) \|\| saoAmigos(banco, s.data.usuarioId, id)`. Fica num helper `emitirAtividade` que substitui os dois `io.emit` (`tempo-real.ts:172` e `:354`). | Copia `conexoesDaConversa` (`realtime/mensagens.ts:91-98`). Mantém a lista de membros e o `ola` coerentes. Custo desprezível com até 4 pessoas. |
| T-2 | **Quando a relação muda:** ao aceitar uma amizade, cada um recebe a atividade atual do outro. Ao desfazer, recebe `null`. Entrar num servidor novo já reabre a conexão daquela comunidade e recebe o `ola`, então não precisa de nada. | Sem isso, o amigo novo só veria na próxima mudança. `registrarEventosAmizades` ganha um callback `aoMudarAmizade(a, b)`. |
| T-3 | **Log em arquivo novo e mínimo:** `client/src/main/registro.ts` grava linhas com data em `app.getPath('logs')/tofalany.log`. Ao passar de 1 MB, vira `tofalany.old.log` (guarda um só). Uso: `registrar('atividade', 'jogo: tempo esgotado')`. Sem dependência nova. | CA-11 precisa de um log, e no Windows empacotado o `console` se perde. Desenho mínimo: uma função com rotação simples. Fica disponível para outros módulos, mas nada mais muda agora. |
| T-4 | **Windows, jogo:** primeiro o `RunningAppID` (`HKCU\Software\Valve\Steam`). Se for diferente de 0, o app lê `SteamPath`, as bibliotecas de `steamapps\libraryfolders.vdf` e o `appmanifest_<id>.acf` (pelo `name`). Se for 0 ou não houver, a leitura dos caminhos dos processos continua como fallback, agora com o nome pelo `appmanifest`. | Resolve o jogo com anticheat ou rodando como administrador (backlog 37a) e é muito mais rápido que listar o `Path` de todos os processos. Não foi verificado num Windows real: CA-15 valida, e o fallback garante o comportamento de hoje. |
| T-5 | **Windows, música:** no mesmo PowerShell, as sessões de mídia do sistema (`Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager`, WinRT pelo PowerShell 5.1). Valem duas sessões tocando:<br>• a do `Spotify.exe`;<br>• a de um navegador (`chrome`, `msedge`, `firefox`, `brave`, `opera`), quando o título de alguma janela daquele navegador começa com `"<título> • <artista>"`. Esse é o título que a aba do open.spotify.com tem enquanto toca.<br>Se o WinRT falhar, fica a leitura de hoje pelo título da janela do Spotify. | A sessão não traz o endereço da página. Cruzar com o título da janela evita o falso positivo com YouTube (que usa outro formato). **Limite:** a aba do Spotify precisa ser a aba visível na janela dela. Vai no texto de ajuda e na nota. |
| T-6 | **Linux, música:** `ListNames` → nomes `org.mpris.MediaPlayer2.*` → para cada um, `PlaybackStatus` e `Metadata`. Vale o primeiro que estiver `Playing` e for `org.mpris.MediaPlayer2.spotify` ou tiver `xesam:url` começando com `https://open.spotify.com/`. `musicaDoMpris` passa a devolver também a `url`. | Confirmado em 19/11: o Firefox (Flatpak) do Gabriel manda o `xesam:url` do open.spotify.com. O Chrome não foi confirmado (R-2). |
| T-7 | **Steam, nome e ferramentas:** um parser pequeno de KeyValues (`steam.ts`, funções puras) para `appmanifest_*.acf` e `libraryfolders.vdf`, com cache por pasta (nome por `installdir`). A raiz da biblioteca sai do próprio caminho do processo (tudo antes de `steamapps/common`). No Linux, `Z:\…` do Proton vira `/…`. `NAO_JOGOS` ganha `wallpaper_engine`, `Lossless Scaling` e outras, mais uma lista de AppIDs de ferramentas (431960 Wallpaper Engine, 993090 Lossless Scaling, 250820 SteamVR, 228980 Steamworks Common). | RN-5 e RN-6. A lista é curta e testada; um appid novo de ferramenta é uma linha. |
| T-8 | **Linha de comando com várias pastas da Steam (RF-6):** `matchAll` em vez de `exec`, e vale a primeira que não for ferramenta. | O `reaper` e o Proton vêm antes do jogo na linha. |
| T-9 | **RF-7 no Windows:** um processo PowerShell só, com cada parte num `try { … } catch { 'E:<parte>:' + motivo }` e prazo de 6 s no `execFile`. Se o processo inteiro estourar o prazo, as duas partes são registradas como "tempo esgotado". Se só uma parte falhar, a outra é usada. | Dois PowerShells dobrariam o custo de partida (~1 s cada). Com o `RunningAppID`, o bloco do jogo fica leve, e a lista de processos só roda no fallback. |
| T-10 | **RF-9:** `criarAtividade` ganha `pendente`: um `verificar()` chamado durante uma leitura marca `pendente = true`, e o `finally` roda de novo. O `aoMudarConfig` de `index.ts:254` só chama `verificar()` quando `atividade` mudou. | Corrige o pedido descartado, e uma rajada de gravações de configuração não vira uma rajada de leituras. |
| T-11 | **RF-10:** a ponte `captura` ganha `somLevaChamada: boolean` (`process.platform === 'win32'`, lido no próprio preload; desvio na T8: a técnica previa um `sendSync`, mas o preload já tem `process.platform` e um canal a menos dá o mesmo resultado). Quando é `true`:<br>• o `SeletorTela` recebe `avisoSomChamada` e inicia desmarcado;<br>• a `TelaPrincipal` não lê nem grava `tela.audio`.<br>Texto do aviso: "No Windows, o som do sistema leva também a voz da chamada: quem está na chamada vai se ouvir. Marque só se não estiver em chamada." | O renderer não sabe a plataforma hoje. Um booleano com o nome do problema sai sozinho quando o item 31 definitivo chegar. |

## 3. Componentes afetados
| Projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| server | node | `emitirAtividade` filtrado (T-1); reenvio ao aceitar ou desfazer amizade (T-2) | `server/src/realtime/tempo-real.ts:167-173,354`; `server/src/realtime/amizades.ts:27`; `server/src/realtime/mensagens.ts:91-98` (padrão); `server/src/dominio/amizades.ts:31`, `dominio/comunidades.ts:46` |
| client/main | node | leitura separada por parte, Steam, navegador, `pendente`, registro | `client/src/main/atividade.ts` (todo); `client/src/main/steam.ts` (novo); `client/src/main/registro.ts` (novo); `client/src/main/index.ts:218-223,254-258`; `client/src/main/captura.ts:71-73` |
| client/preload | front | `captura.somLevaChamada` | `client/src/preload/index.ts:62`; `client/src/preload/api.ts:62` |
| client/renderer | front | atividade na aba Amigos; seletor no Windows | `componentes/BarraLateral.tsx:457,483,532,608`; `telas/TelaPrincipal.tsx:137,155,1463,1954-1961`; `componentes/SeletorTela.tsx:33-36,143-146`; `estado/atividade.ts:4` (`textosAtividade`) |
| shared | — | `novidades.ts`: entrada da próxima versão (feita na demanda que fechar a versão grande) | `shared/src/novidades.ts` |

## 4. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| Evento `atividade:atualizada` (`protocolo.ts:694`) | `io.emit` para todas as conexões | só para conexões que podem ver (T-1); também emitido ao aceitar ou desfazer amizade (T-2) | formato igual; app 0.17.x recebe menos eventos, sem quebrar |
| Evento `presenca:atividade` | — | sem mudança | — |
| Ponte `captura` (`preload/api.ts`) | `somDisponivel` | + `somLevaChamada: boolean` | interno ao app; o mock de `App.test.tsx:80` ganha o campo |
| `PreferenciasTela.audio` | lida e gravada em todas as plataformas | ignorada no Windows | configurações antigas continuam válidas |

## 5. Dados
Não se aplica: sem banco novo nem migração. A atividade continua só na memória do servidor. No app, o log novo (`tofalany.log`) tem no máximo ~2 MB (atual + um antigo).

## 6. Segurança e privacidade
- **RN-2 (atividade só para quem pode ver):** T-1 e T-2. O teste do servidor confere que uma conta sem relação não recebe nada (CA-2).
- **RN-9 (log sem dados):** o `registro` recebe só a parte (`jogo`/`musica`) e um motivo fixo (`tempo esgotado`, `erro <código>`, `winrt indisponível`, `sem dbus`). Nunca a saída do PowerShell, nomes de processo, títulos de janela ou de música. Há um teste para isso.
- **Leitura do registro do Windows:** só leitura de `HKCU\Software\Valve\Steam` (`RunningAppID`, `SteamPath`), sem privilégio.
- **Fora do escopo, visto na análise:** `presenca:atualizada` (status online) também usa `io.emit` para todos (`tempo-real.ts:192,198`). É o mesmo vazamento, de menor gravidade. Registrado no backlog como item 48 (20/11), na demanda `qualidade-de-vida`.

## 7. Observabilidade
- `tofalany.log` na pasta de logs do app:
  - Linux: `~/.config/ToFalany/logs/`;
  - Windows: `%APPDATA%\ToFalany\logs\`.
- Uma linha por falha de leitura, sem repetir a mesma falha seguida (só registra quando o motivo muda), para não encher a cada 20 s.
- Para o relato de um amigo: pedir esse arquivo.

## 8. Estratégia de testes
| Critério | Teste unitário | Integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | `Dms.test.tsx`: `BarraLateral` com `atividades` mostra "Jogando Hades" na linha do amigo | — | CA-15 |
| CA-2 | — | `server/test/atividade.test.ts`: amigo e membro recebem; conta só da comunidade 2 sem amizade não recebe (`onAny` + espera); aceitar amizade reenvia; desfazer manda `null` | — |
| CA-3, CA-4, CA-5 | `atividade.test.ts`: `musicaDoMpris` com `xesam:url`; `escolherPlayer` (função pura sobre a lista de players) com Firefox no Spotify, Firefox no YouTube e Spotify pausado | — | Gabriel no Linux, open.spotify.com |
| CA-6, CA-7 | `steam.test.ts`: parser de `.acf`; `nomeDoJogo` com manifesto (Dota 2) e sem manifesto (nome da pasta) | — | CA-15 |
| CA-8 | `atividade.test.ts`: `wallpaper_engine` e `Lossless Scaling` → sem jogo; appid 431960 → sem jogo | — | — |
| CA-9 | `atividade.test.ts`: linha de comando com runtime, Proton e Hades → Hades | — | — |
| CA-10 | `atividade.test.ts`: `lerSaidaWindows` (função pura sobre a saída marcada) com `E:jogo:…` e música válida → só música | — | CA-15 (Windows) |
| CA-11 | `registro.test.ts`: grava, rotaciona em 1 MB e não repete o mesmo motivo; `atividade.test.ts`: o registrador injetado recebe `('atividade', 'jogo: tempo esgotado')` sem o nome do processo | — | ver o arquivo no Linux depois de forçar a falha |
| CA-12 | `atividade.test.ts`: `ler` com promessa controlada; `verificar()` durante a leitura → segunda leitura com as preferências novas | — | — |
| CA-13, CA-13b | `transmissao.test.tsx`: `SeletorTela` com `avisoSomChamada` → desmarcado, marcável, com o aviso | `App`/`TelaPrincipal`: com `somLevaChamada`, não grava `tela.audio` | CA-15 (Windows) |
| CA-14 | `transmissao.test.tsx`: sem `avisoSomChamada`, igual a hoje | E2E `voz.spec.ts:735-745` (Linux) | — |
| CA-14b | `atividade.test.ts`: `lerSaidaWindows` com sessão `chrome` tocando + título de janela `"Song • Band - Google Chrome"` → música; com título do YouTube → nada | — | CA-15 (Windows) |
| CA-15 | — | — | **Manual:** Gabriel + um amigo no Windows, em chamada (perfil: `pare_e_pergunte`) |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | `RunningAppID` e SMTC pelo PowerShell não foram verificados num Windows real | (a) só processos; (b) registro + SMTC com fallback para o caminho de hoje | (b): resolve anticheat e o navegador, e o fallback mantém o comportamento atual se algo falhar. CA-15 confirma. |
| R-2 | O Chrome pode não mandar `xesam:url` pelo MPRIS no Linux | (a) aceitar qualquer player de navegador; (b) exigir a URL | (b): sem a URL, qualquer vídeo viraria "Ouvindo". Com Chrome no Linux, a música pelo navegador fica sem aparecer até confirmar. Registrar se acontecer. |
| R-3 | Aba do Spotify no Windows precisa estar visível na janela (T-5) | (a) aceitar sem cruzar o título; (b) cruzar | (b): falso positivo com YouTube é pior que não mostrar. |
| R-4 | O PowerShell com WinRT pode passar de 6 s na primeira execução (carregar os tipos) | prazo maior; blocos separados | Prazo de 6 s e partes separadas (T-9). Se estourar, aparece no log, e CA-15 mede. |
| R-5 | Antivírus barrando PowerShell escondido | — | Já era assim. O log agora mostra a falha. |
| R-6 | Log novo pode crescer | rotação | 1 MB + um antigo, sem repetir o mesmo motivo (T-3). |

## 10. Implantação e rollback
- **Ordem:** servidor e app podem sair em qualquer ordem. O app novo funciona com o servidor antigo (só não ganha o filtro), e o app antigo funciona com o servidor novo.
- Vai junto da **atualização grande**, sem versão própria.
- **Rollback:** voltar a versão. Não há dados nem migração.

## 11. CI/CD
Não se aplica: nenhum workflow muda. O `release.yml` já monta o Windows e o servidor.

> Aprovação: o plano só começa com esta especificação aprovada (registrada no topo).
