# Demanda original (texto do usuário, sem edição)

> Recebida em 04/11/2026. Nome do produto: "Tô Falando". Pasta: /dados/to-falanu.
> Em 05/11/2026 o usuário renomeou o app para **"ToFalany"**.

Viabilidade

* Executável: um único código gera builds separadas, como `.exe` (instalador NSIS) para Windows e `.AppImage`/`.deb` para Linux. Use Electron com `electron-builder`. Tauri é mais leve, mas no Linux usa WebKitGTK, cujo suporte a WebRTC e captura de tela é fraco.
* Voz, vídeo e transmissão: use WebRTC com um SFU (LiveKit, open source e auto-hospedável). Em P2P puro, quem transmite em 2K60 envia um stream separado para cada amigo, e a banda de upload estoura. Com SFU, o emissor envia uma vez só.
* Supressão de ruído: as constraints nativas do WebRTC (`noiseSuppression`, `echoCancellation`, `autoGainControl`) cobrem o básico. O RNNoise em WASM é a opção mais forte.
* Hospedagem, em ordem de custo:
   1. Seu PC + Tailscale (grátis). Cria uma VPN entre vocês 4, sem abrir portas, mas só funciona com seu PC ligado.
   2. Oracle Cloud Always Free (VM ARM gratuita). Roda 24/7. Confirme as condições atuais antes de criar a conta.
   3. VPS barata (Hetzner, Contabo). Custa poucos euros por mês e é mais previsível.
* Gargalo real: 2K60 exige de 8 a 15 Mbps de upload de quem transmite, e o servidor precisa repassar isso para 3 pessoas. Na VM grátis ou via Tailscale, o limite é a banda, não a CPU.

Prompt para o agente

# Projeto: App de comunicação privado (estilo Discord) — uso pessoal, até 4 usuários

## Objetivo
Aplicativo desktop multiplataforma (Windows + Linux) para chat de texto, voz, vídeo e
transmissão de tela entre no máximo 4 pessoas. Não é produto comercial. Priorizar
simplicidade, estabilidade e baixo custo de hospedagem.

## Stack obrigatória
- Cliente: Electron + React + TypeScript (Vite). Empacotamento via electron-builder:
  - Windows: instalador .exe (NSIS)
  - Linux: .AppImage e .deb
- Servidor de sinalização/texto: Node.js + TypeScript, WebSocket (Socket.IO ou ws), SQLite (better-sqlite3).
- Mídia: LiveKit Server (self-hosted, Docker) como SFU + livekit-client no app.
- Tudo do servidor orquestrado via docker-compose.

## Funcionalidades

### Contas e perfil
- Entrada via código de convite fixo definido no .env do servidor; usuário escolhe nome e senha.
- Perfil: avatar (upload de imagem, redimensionado para 256x256 no servidor), cor de perfil (color picker), nome de exibição.

### Canais
- Múltiplos canais de texto e múltiplos canais de voz, criáveis/renomeáveis/removíveis por qualquer usuário (escopo pequeno, sem sistema de permissões).

### Chat de texto
- Histórico persistido em SQLite, paginação ao rolar.
- Envio de imagens (anexos salvos em disco no servidor).
- Indicador de "digitando".

### Voz
- Entrar/sair de canal de voz; lista de participantes com indicador de quem está falando.
- Mute de microfone e deafen (mutar áudio de saída).
- Seleção de dispositivo de entrada e saída (enumerateDevices + setSinkId), troca a quente.
- Toggles independentes: supressão de ruído (RNNoise via WASM, com fallback para noiseSuppression nativo), cancelamento de eco, controle automático de ganho.
- Controle de volume por usuário (local).
- Teste de microfone com medidor de nível na tela de configurações.

### Vídeo e transmissão
- Webcam opcional por usuário.
- Transmissão de tela/janela: apenas UMA transmissão ativa por canal de voz; ao tentar iniciar outra, exibir aviso.
- Qualidade selecionável: 720p30, 1080p60, 1440p60 (máximo). Codec preferencial VP9 ou H.264 com aceleração de hardware quando disponível; simulcast desligado para a transmissão.
- Áudio do sistema na transmissão no Windows (desktopCapturer com loopback); no Linux, documentar limitação (PipeWire/PulseAudio).
- Picker de tela/janela próprio usando desktopCapturer.getSources.

### Configurações persistidas localmente
- Dispositivos selecionados, toggles de áudio, qualidade padrão de transmissão, URL do servidor.

## Rede e implantação
- O app pede a URL do servidor na primeira execução.
- Suportar dois cenários documentados no README:
  1. Servidor no PC do host, acesso via Tailscale (sem port forwarding).
  2. VPS (Oracle Cloud Always Free ARM ou similar): docker-compose com Caddy para HTTPS automático, portas UDP do LiveKit liberadas.
- Imagens Docker compatíveis com arm64 e amd64.

## Requisitos não funcionais
- Uso de RAM do cliente ocioso abaixo de 300 MB.
- Reconexão automática de WebSocket e da sala LiveKit.
- Sem telemetria e sem dependências de serviços pagos.
- Código organizado em monorepo: /client, /server, /deploy.

## Entregáveis
1. Código-fonte completo no monorepo.
2. Scripts de build: `npm run dist:win`, `npm run dist:linux`.
3. docker-compose.yml + .env.example do servidor.
4. README com setup local, setup em VPS, setup via Tailscale, e tabela de banda estimada por qualidade de transmissão.

## Ordem de implementação
1. Servidor + texto + contas + perfil.
2. Voz com seleção de dispositivos e toggles de áudio.
3. Webcam.
4. Transmissão de tela com limite de 1 por canal.
5. Empacotamento e documentação de deploy.
Validar cada etapa funcionando antes de avançar.
