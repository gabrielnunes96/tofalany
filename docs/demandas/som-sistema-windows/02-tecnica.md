# Som do sistema sem eco da chamada — especificação técnica

> Demanda: `som-sistema-windows` · Base: funcional v2 · 22/11/2026 · Situação: **aprovada em 22/11/2026**

## 1. Visão da solução
No Windows 11, o som do sistema deixa de vir do "loopback" do Chromium (que leva tudo) e passa a vir de um módulo nativo que usa a captura por processo do Windows (`PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE`) excluindo a árvore do processo principal do app (janelas, serviço de áudio, iframes). O PCM vai do processo principal para a janela por uma `MessagePort`, entra num `AudioWorklet` e é publicado como o áudio da tela, do mesmo jeito que o microfone virtual do Linux já é publicado hoje.

```text
Seletor (som do sistema) → captura:escolher(fonte, audio=true)
  main/captura.ts: win32 e build ≥ 22000 → somWindows.ligar(process.pid) → loopback-capture.startSystemAudio(cb, pid)
     cb(PCM16 48 kHz estéreo) → MessagePortMain.postMessage(pedaço)  ──porta──▶ preload ▶ window.postMessage([porta])
  setDisplayMediaRequestHandler: { video: fonte } (sem audio: 'loopback' no Windows)
  janela (voz.ts): AudioWorklet "som-externo" (buffer circular, Int16→Float32) → MediaStreamDestination
     → publishTrack(ScreenShareAudio, 'tela-audio')  [mesmo caminho do microfone virtual do Linux]
Parar/sair/cair: captura:som-parar | webContents destroyed/render-process-gone | will-quit → stop()
Windows 10, módulo sem carregar, falha ao iniciar → opção desligada com aviso (RN-3, CA-7) ou transmissão só com vídeo (RN-4)
```

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| client: main | node | `som-windows.ts` (novo: carrega `loopback-capture` com `try`, liga/desliga, build do Windows); `captura.ts` com plataforma injetável, `somDisponivel` com motivo, Windows sem `audio:'loopback'`, porta para a janela, paradas (destroyed, render-process-gone, will-quit); notificações sem som durante a captura (RN-8) | `main/captura.ts:81-115`, `main/som-sistema.ts:29-64` (padrão), `main/notificacoes.ts:31`, `main/index.ts:65,320` |
| client: preload | node | repassa a porta à janela (`ipcRenderer.on` com `e.ports` → `window.postMessage(..., [porta])`); `audioDisponivel` vira `{ disponivel, motivo }`; sai `somLevaChamada` | `preload/index.ts:61-69`, `preload/api.ts:61-77` |
| client: renderer | front | `voz.transmitir` recebe o tipo de som (`nenhum` / `microfone-virtual` / `porta`); worklet `som-externo`; seletor sem o contorno do eco e com o aviso do Windows 10; avisos da RN-4 | `servicos/voz.ts:472-531,620-632`, `componentes/SeletorTela.tsx:20-48,163-196`, `telas/TelaPrincipal.tsx:1696-1720,2499-2508`, `servicos/pipeline-audio.ts:62-81` (padrão do worklet) |
| empacotamento/CI | — | `loopback-capture` 5.0.0 (exato) em `optionalDependencies` do client; `asarUnpack` do pacote; nada a compilar no CI (binário N-API pronto) | `client/package.json`, `client/electron-builder.yml:18-22`, `.github/workflows/release.yml:75-79` |
| docs | — | README: o que funciona no Windows 10, 11 e Linux | `README.md:346,351` |

## 3. Contratos
Tudo interno ao app (servidor e `shared` não mudam).
| Contrato | Antes | Depois |
| --- | --- | --- |
| `captura.audioDisponivel` (preload) | `boolean` | `{ disponivel: boolean; motivo?: 'windows-antigo' \| 'sem-modulo' \| 'sem-pipewire' }` |
| `captura.somLevaChamada` | `win32` | sai (o Windows não leva mais a chamada) |
| `captura.escolher(fonte, audio)` | `Promise<boolean>` (microfone virtual?) | `Promise<'nenhum' \| 'microfone-virtual' \| 'porta'>` |
| IPC novo `captura:porta-som` (main → janela) | — | uma `MessagePort` com pedaços `ArrayBuffer` PCM16 48 kHz estéreo; só para a janela principal (`daPaginaDoApp`) |
| `voz.transmitir(q, audio, codec, somVirtual)` | booleano | `fonteSom: 'nenhum' \| 'chromium' \| 'microfone-virtual' \| 'porta'` |

## 4. Dados
Não se aplica (nada persistido). A escolha "lembrar som do sistema" do seletor volta a valer no Windows 11.

## 5. Integrações externas
- **`loopback-capture` 5.0.0** (npm, MIT, Rust + N-API, binário pronto win32-x64 e linux-x64; repositório WerdoxDev/loopback-capture): `new LoopbackCapture().startSystemAudio(cb, excludePid)`, `stop()`, `lastError`. Entrega PCM16 LE, 2 canais, 48 kHz, sem buffers de silêncio. Exige build 20348+ para excluir a árvore (Windows 11 = 22000+).
  - Versão fixa (sem `^`), conferida pelo `package-lock` (integridade). Só carregado no Windows (o Linux continua com a venmic).
  - Falha ao carregar ou ao iniciar (`start` lança ou `lastError`) → opção desligada (CA-7) ou transmissão sem som com aviso (RN-4).
  - Troca da saída de áudio padrão durante a transmissão: o pacote não reconecta; detectar `lastError` e avisar (RN-4).
- **Electron 45**: `Streams.audio` só aceita `loopback`/`loopbackWithMute`; o "sem o app" anunciado no 45.0.0 não funciona no Windows (eco visto em 19/11 no Windows 11). Fica registrado para rever quando subir o Electron.

## 6. Segurança
- **Áudio do sistema é dado sensível:** a captura só liga em `captura:escolher` com `audio === true`, vindo da página do app (`daPaginaDoApp`, como as outras rotas de captura); a porta vai só para o `webContents` que pediu; nada é gravado em disco.
- **Parada garantida (RN-7):** `stop()` em `captura:som-parar`, nova escolha, `destroyed`/`render-process-gone` do webContents e `will-quit`.
- **Pacote nativo de terceiro:** versão exata, licença MIT, binário do próprio pacote publicado no npm; revisão do código-fonte da versão antes de adotar (T1); o carregamento é preguiçoso e só no Windows.
- **Janela própria (transmissão em janela):** não recebe a porta (sem ponte, A2 da demanda anterior).

## 7. Observabilidade
Log do processo principal ao ligar, parar e falhar a captura (com `lastError`, sem dados de áudio). Contador de pedaços descartados no worklet (buffer cheio) no log de depuração.

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1, CA-2 | `som-windows` com módulo falso: `startSystemAudio` com `process.pid`; pedaços chegam à porta | — | **Manual** com o amigo no Windows 11 (voz, soundboard, bot) |
| CA-3 | `captura`: build 19045 → `{ disponivel: false, motivo: 'windows-antigo' }`; seletor mostra o aviso | — | Manual (Windows 10, se houver) |
| CA-4 | `voz.transmitir('porta')` com falha ao iniciar → só vídeo + aviso | — | Manual |
| CA-5 | `captura`: `som-parar`, `destroyed`, `will-quit` chamam `stop()` | — | Manual |
| CA-6 | — | — | E2E no desktop (`npm run test:e2e:desktop`): lista os links do PipeWire ao nó da venmic e confere que nenhum é do binário do app |
| CA-7 | `som-windows`: módulo que lança ao carregar → `motivo: 'sem-modulo'`, app segue | — | — |
| CA-8 | `notificacoes`: com captura ativa, `silent: true` | — | — |
| Worklet | conversão Int16→Float32, buffer circular (falta → silêncio, sobra → descarta o mais velho) | — | — |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Excluir o app no Windows | Electron (`restrictOwnAudio`); pacote pronto; módulo próprio | Pacote pronto `loopback-capture`: o Electron 45 não exclui na prática; o pacote é MIT, mantido, N-API com binário pronto (sem compilar no CI). Módulo próprio só se a revisão da T1 reprovar o pacote. |
| R-2 | Windows 10 | sem opção; loopback antigo com eco | Sem opção com aviso (usuário, 22/11): o Windows 10 não tem o recurso. |
| R-3 | Onde roda a captura | processo principal; `utilityProcess` | Principal (menor mudança; ~100 mensagens/s de 3,8 KB). Se a validação mostrar estalos, mover para `utilityProcess` (filho do principal, continua excluído). |
| R-4 | Transporte do PCM | IPC comum; `MessagePort` até o worklet | `MessagePort` entregue ao `AudioWorkletNode.port`: o PCM não passa pela thread da página. |
| R-5 | Som das notificações (fora da árvore do app) | aceitar; silenciar durante a captura | Silenciar durante a captura (RN-8). |
| R-6 | Linux | mudar a venmic; só conferir | Só conferir (a venmic já exclui pelo nome do binário); corrigir se o E2E mostrar escape. |
| R-7 | Windows arm64 | — | Sem binário: cai em "sem módulo" (CA-7). |

## 10. Implantação e rollback
Só o app (próxima versão do instalador). Rollback: versão anterior do app (volta o loopback com eco).

## 11. CI/CD
Nenhum passo novo: `npm ci --ignore-scripts` instala o binário pronto do pacote; `asarUnpack` inclui o `.node`.
