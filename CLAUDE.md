# CLAUDE.md

**ToFalany**: app desktop privado (estilo Discord) para até 4 amigos — texto, voz, vídeo e transmissão de tela. Uso pessoal, não comercial; prioridade é simplicidade, estabilidade e hospedagem barata. Processo no plugin `fluxo`; comandos e proteções em `.claude/projeto.json`.

## Arquitetura (planejada)
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
- Máquina de dev é Linux: build .exe a partir do Linux precisa de wine (ou CI/Windows).
