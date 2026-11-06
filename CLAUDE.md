# CLAUDE.md

**ToFalany**: app desktop privado (estilo Discord) para até 4 amigos — texto, voz, vídeo e transmissão de tela. Uso pessoal, não comercial; prioridade é simplicidade, estabilidade e hospedagem barata. Processo no plugin `fluxo`; comandos e proteções em `.claude/projeto.json`.

## Arquitetura
| Pasta | Papel |
| --- | --- |
| `client/` | Electron + React + TypeScript (Vite); empacotado com electron-builder (.exe NSIS, .AppImage, .deb) |
| `server/` | Node.js + TypeScript, WebSocket, SQLite (better-sqlite3): contas, canais, texto, anexos, tokens do LiveKit |
| `deploy/` | docker-compose: server + LiveKit (SFU) + Caddy (HTTPS na VPS); imagens arm64/amd64 |

Mídia (voz/vídeo/tela) passa pelo LiveKit, nunca pelo servidor Node.

## Convenções
- Tudo em pt-BR na interface e nos documentos; código e identificadores em inglês.
- Sem telemetria, sem serviços pagos.

## Armadilhas conhecidas
- Rode os comandos npm a partir da raiz (workspaces); de dentro de `client/` ou `client/release` dá "Missing script".
- Prettier, quando reformatar: `--single-quote --print-width 160` (sem isso ele troca as aspas do arquivo inteiro).
- electron-builder: o .deb exige `homepage`; `electronVersion` no yml tem de ser a versão exata; `desktopName` (tofalany.desktop) é o .desktop que `setAsDefaultProtocolClient` usa no Linux. O AppImage registra o link pelo próprio atalho (`client/src/main/integracao.ts`).
- E2E do app empacotado (`e2e/empacotado.spec.ts`) só roda depois de `npm run build` e `npm run dist:linux`; é pulado se o pacote for mais velho que `out/`.
- E2E de voz: o microfone falso do Chromium é um apito que o RNNoise abafa; os testes de fala desligam a supressão. O indicador de fala do LiveKit é lento sob carga (voz.spec repete uma vez).
- Máquina de dev é Linux: build .exe a partir do Linux precisa de wine (ou CI/Windows).
