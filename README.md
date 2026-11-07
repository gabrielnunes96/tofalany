# ToFalany

App desktop privado para um grupo pequeno de amigos: chat de texto, mensagens diretas, voz, webcam e transmissão de tela. O servidor é seu: roda no seu PC (acessado pelo Tailscale) ou numa VPS com HTTPS. Sem telemetria e sem serviço pago.

- **App**: Windows (.exe) e Linux (.AppImage ou .deb).
- **Servidor**: Node.js + SQLite (contas, canais, mensagens, arquivos, convite) e LiveKit (voz, vídeo e tela), num docker-compose.
- **Limite**: até 20 contas (ajustável). Na prática, o limite é a banda da internet do servidor (veja a [tabela de banda](#tabela-de-banda)).

Sumário: [Como funciona](#como-funciona) · [Servidor via Tailscale](#servidor-via-tailscale) · [Servidor numa VPS com HTTPS](#servidor-numa-vps-com-https) · [Instaladores e convite](#instaladores-e-convite) · [Administração](#administração) · [Atualizar e voltar](#atualizar-e-voltar) · [Tabela de banda](#tabela-de-banda) · [Limitações conhecidas](#limitações-conhecidas) · [Desenvolvimento](#desenvolvimento)

---

## Como funciona

```
 app ──HTTP/WebSocket──► servidor (porta 3000)    chat, contas, arquivos, convite
 app ──WebRTC──────────► LiveKit (7880 sinalização, 7881/tcp e 7882/udp mídia)   voz, câmera, tela
```

- O app só fala com **um endereço**: o do servidor. O LiveKit precisa estar no **mesmo host** (mesmo IP ou domínio, outra porta ou caminho). Qualquer outro destino é bloqueado pelo app.
- Quem transmite envia a tela **uma vez** ao LiveKit, e o LiveKit repassa para cada espectador. Por isso, o que pesa é o **upload do servidor** (veja a tabela).
- A primeira conta criada vira **administrador**. As demais entram pelo **código de convite**.

## Servidor via Tailscale

Use este cenário para o servidor no seu próprio PC com Linux (Windows com WSL2 e Mac não foram testados: o IP do tailnet e a porta UDP da mídia precisam chegar ao Docker), acessível só para quem está no seu tailnet. Não precisa de domínio nem de HTTPS: o Tailscale já criptografa o tráfego.

### 1. Pré-requisitos

- Docker com o plugin compose (`docker compose version` deve responder).
- [Tailscale](https://tailscale.com/download) instalado e logado **no PC do servidor e no de cada amigo**, todos no mesmo tailnet (convide os amigos pelo painel do Tailscale ou compartilhe a máquina com eles).
- Este repositório no PC do servidor (`git clone` ou cópia da pasta).

Descubra o IP do servidor no tailnet:

```bash
tailscale ip -4
```

Os exemplos abaixo usam `100.64.0.10`. Troque pelo seu IP.

### 2. Configuração

```bash
cd deploy
cp exemplo.env .env
openssl rand -hex 32
```

Abra o arquivo `.env` e preencha (use o resultado do `openssl` como segredo):

```ini
NOME_SERVIDOR=ToFalany
CODIGO_CONVITE=um-codigo-dificil-de-adivinhar
URL_PUBLICA=http://100.64.0.10:3000
LIVEKIT_API_SECRET=<resultado do openssl rand -hex 32>
LIVEKIT_URL=ws://100.64.0.10:7880
LIVEKIT_NODE_IP=100.64.0.10
BIND_IP_HTTP=100.64.0.10
BIND_IP_MIDIA=100.64.0.10
```

- `LIVEKIT_URL` usa **o mesmo IP** de `URL_PUBLICA`. Se não usar, o app bloqueia a voz.
- Com `BIND_IP_*` no IP do tailnet, as portas só abrem no tailnet. Ninguém da sua rede local ou da internet acessa.

### 3. Subir

```bash
docker compose up -d --build
docker compose ps
```

Os dois serviços (`server` e `livekit`) devem ficar `healthy`. Confira a saúde:

```bash
curl http://100.64.0.10:3000/api/saude
```

A resposta esperada é `{"ok":true,"sqlite":true,"livekit":"ok"}`.

### 4. Primeiro acesso

1. Instale o app (veja [Instaladores e convite](#instaladores-e-convite)).
2. Na primeira execução, informe o endereço `http://100.64.0.10:3000`.
3. Escolha **Tenho um convite**, digite o código de `CODIGO_CONVITE` e crie sua conta. A primeira conta é a do administrador.
4. Use o botão **Copiar link de convite**, no painel do usuário, e mande para os amigos (eles também precisam estar no tailnet).

O servidor fica no ar enquanto o PC estiver ligado. **Depois de reiniciar o PC**, o Docker costuma subir antes de o Tailscale ter o IP do tailnet, e os contêineres não conseguem abrir as portas nesse IP. Se o app não conectar, rode `docker compose up -d` de novo na pasta `deploy`. Para automatizar, faça o Docker esperar o Tailscale com `sudo systemctl edit docker.service`, acrescentando:

```ini
[Unit]
After=tailscaled.service
Wants=tailscaled.service
```

## Servidor numa VPS com HTTPS

> **Atalho:** na VM (Ubuntu), com o repositório clonado, `cd tofalany/deploy && ./vm.sh instalar` faz os passos abaixo sozinho: instala o Docker, cria swap se a memória for pouca, gera o `.env` com o IP público e o domínio sslip.io, baixa os instaladores da última release e sobe tudo. Depois, para atualizar, use `./vm.sh atualizar`, e para ver como está, `./vm.sh status`. Liberar as portas na Oracle (Security List) continua sendo com você.

Use este cenário para o servidor numa VPS (por exemplo, a camada gratuita da Oracle Cloud, com arm64), acessível pela internet com HTTPS automático (Let's Encrypt, pelo Caddy).

### 1. Pré-requisitos

- VPS Linux com Docker e o plugin compose, e IP público fixo. Os exemplos usam `203.0.113.7`.
- Um **nome de domínio** apontando para esse IP. Opções:
  - **domínio próprio**: crie um registro `A` (por exemplo, `fala.seudominio.com`) com o IP da VPS;
  - **DNS grátis, sem cadastro**: [sslip.io](https://sslip.io) resolve `203-0-113-7.sslip.io` para `203.0.113.7`, e o Caddy emite o certificado normalmente;
  - **DNS grátis com nome fixo**: [DuckDNS](https://www.duckdns.org) (por exemplo, `meugrupo.duckdns.org`).
- Portas abertas **no firewall do provedor e no da VPS**:

| Porta | Protocolo | Para quê |
| --- | --- | --- |
| 80 | TCP | emissão do certificado (Let's Encrypt) e redirecionamento para HTTPS |
| 443 | TCP e UDP | app, convite e sinalização da voz (pelo Caddy) |
| 7881 | TCP | mídia de reserva (redes que bloqueiam UDP) |
| 7882 | UDP | mídia: voz, câmera e tela |

Na Oracle Cloud, o essencial é liberar as portas na *Security List* (ou no *Network Security Group*) da VCN. As portas publicadas pelo Docker passam pelas regras do próprio Docker, não pela chain INPUT, então as regras do iptables da imagem Ubuntu não as bloqueiam. Não rode `netfilter-persistent save` com o Docker no ar: ele grava as regras do Docker, que voltam desatualizadas no boot.

Prefira a instância Ampere (arm64) da camada gratuita: a micro amd64 tem 1 GB de RAM, e o build da imagem pode acabar a memória (se for usá-la, crie um swap de 2 GB antes).

### 2. Configuração

```bash
cd deploy
cp exemplo.env .env
openssl rand -hex 32
```

Arquivo `.env` (exemplo com sslip.io; para um domínio próprio, troque o domínio nas três linhas):

```ini
NOME_SERVIDOR=ToFalany
CODIGO_CONVITE=um-codigo-dificil-de-adivinhar
URL_PUBLICA=https://203-0-113-7.sslip.io
LIVEKIT_API_SECRET=<resultado do openssl rand -hex 32>
LIVEKIT_URL=wss://203-0-113-7.sslip.io
LIVEKIT_NODE_IP=203.0.113.7
BIND_IP_HTTP=127.0.0.1
BIND_IP_MIDIA=0.0.0.0
DOMINIO=203-0-113-7.sslip.io
ATRAS_DE_PROXY=true
```

- `BIND_IP_HTTP=127.0.0.1`: o servidor e a sinalização do LiveKit ficam acessíveis só ao Caddy. Da internet, só entram o HTTPS (80 e 443) e a mídia (7881 e 7882).
- `LIVEKIT_URL` é `wss://` no **mesmo domínio**: o Caddy encaminha `/rtc` ao LiveKit.
- `ATRAS_DE_PROXY=true` faz o limite de tentativas de login usar o IP real de quem acessa (informado pelo Caddy).

### 3. Subir

```bash
docker compose --profile vps up -d --build
docker compose --profile vps ps
curl https://203-0-113-7.sslip.io/api/saude
```

O certificado sai em poucos segundos na primeira subida. Se o `curl` falhar, veja `docker compose logs caddy`: em geral, é a porta 80 ou 443 fechada ou o DNS ainda não propagado.

O primeiro acesso é igual ao do Tailscale, com o endereço `https://203-0-113-7.sslip.io` (ou o seu domínio).

### Arquitetura arm64

A imagem do servidor é construída na própria VPS (`--build`), então sai na arquitetura dela (amd64 ou arm64). O LiveKit e o Caddy publicam imagens para as duas.

## Instaladores e convite

Gere os instaladores numa máquina de desenvolvimento (veja [Desenvolvimento](#desenvolvimento)):

```bash
npm run dist:linux
```

O comando gera `client/release/ToFalany-<versão>.AppImage` e `client/release/tofalany_<versão>_amd64.deb`.

```bash
npm run dist:win
```

O comando gera `client/release/ToFalany-Setup-<versão>.exe`. No Linux, ele precisa do wine.

Copie os instaladores para `deploy/downloads/` no servidor. Eles aparecem na **página do convite**: quem abre o link de convite no navegador baixa o instalador e, com o app instalado, o botão abre o cadastro já preenchido (link `tofalany://`).

- **.deb**: `sudo apt install ./tofalany_<versão>_amd64.deb`. Recomenda PipeWire ou PulseAudio para o áudio.
- **.AppImage**: `chmod +x ToFalany-*.AppImage` e execute. Na primeira execução, o app cria um atalho no menu e registra os links `tofalany://`. Com o .deb também instalado, fica com os links o último AppImage aberto.
- **.exe**: instalador sem assinatura de código. O Windows SmartScreen mostra "O Windows protegeu o computador" na primeira vez: clique em **Mais informações** e depois em **Executar assim mesmo**.

## Administração

### Redefinir a senha de alguém

A senha nova é pedida duas vezes no terminal (não aparece na tela e não fica no histórico do shell). Todas as sessões da pessoa são encerradas.

```bash
cd deploy
docker compose exec server node server/dist/cli/redefinir-senha.js <usuario>
```

Fora do Docker (servidor de desenvolvimento): `npm run build` e depois `npm run redefinir-senha -w server -- <usuario>` (usa o banco `server/data/tofalando.db`).

### Outras opções do `.env`

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `LIMITE_CONTAS` | 20 | máximo de contas no servidor |
| `AUDITORIA_DIAS` | 30 | por quantos dias a auditoria (entradas, saídas, voz, tela) fica guardada |
| `PORTA_SERVIDOR` | 3000 | porta do servidor no host (lembre de ajustar `URL_PUBLICA`) |
| `VERSAO` | local | tag da imagem do servidor (veja abaixo) |

O código de convite pode ser trocado pelo app (administrador, em **Convite**). O `CODIGO_CONVITE` do `.env` só vale na primeira subida.

### Onde ficam os dados

Banco, arquivos enviados e backups ficam no volume Docker `tofalany_dados` (em `/data` dentro do contêiner). Apagar o volume (`docker compose down -v`) **apaga tudo**.

## Consultar o banco

O banco é um SQLite. Os comandos abaixo abrem o banco **só para leitura**: não alteram nada no servidor. Colunas com hash de senha, token ou código aparecem mascaradas (`•••`).

Na VPS, de dentro de `~/tofalany/deploy`:

```bash
./vm.sh tabelas                                   # tabelas e quantas linhas cada uma tem
./vm.sh consulta "SELECT id, usuario, cargo FROM usuarios"
./vm.sh copia-banco                               # cópia sem senhas, sessões e códigos de redefinição
```

A cópia fica em `deploy/copia-banco-<data>.db`. Baixe para o seu PC e abra no [DB Browser for SQLite](https://sqlitebrowser.org/); depois apague a da VM:

```bash
scp tofalany:tofalany/deploy/copia-banco-<data>.db .
```

Em desenvolvimento (banco `server/data/tofalando.db`), depois de `npm run build`:

```bash
npm run banco -w server -- tabelas
npm run banco -w server -- consulta "SELECT * FROM canais"
npm run banco -w server -- copia minha-copia.db
```

As consultas mostram no máximo 200 linhas; use `LIMIT` e `OFFSET` para paginar.

## Atualizar e voltar

### Backup manual

Pare o servidor para o banco ficar consistente, copie o volume e suba de novo:

```bash
cd deploy
docker compose stop server
docker compose run --rm --no-deps --user root -v "$PWD:/backup" server tar czf /backup/tofalany-backup.tgz --exclude=./downloads -C /data .
docker compose start server
```

O backup fica em `deploy/tofalany-backup.tgz`. Guarde uma cópia fora do servidor.

### Atualizar

1. Anote a versão atual (`VERSAO` no `.env`; se não houver, é `local`) e o commit do código (`git rev-parse HEAD`).
2. Faça um backup manual (acima).
3. Atualize o código (`git pull`, ou copie a pasta nova por cima mantendo `deploy/.env` e `deploy/downloads/`), defina uma versão nova no `.env` (por exemplo, `VERSAO=2026-11-06`) e suba:

```bash
docker compose up -d --build
```

Na VPS, acrescente `--profile vps`. A imagem anterior continua no Docker com a tag antiga.

Se a versão nova mudar o formato do banco, o servidor copia o banco antigo para `/data/backup/tofalando-v<N>-<data>.db` antes de migrar.

### Voltar para a versão anterior

1. Volte o código para o commit anotado (`git checkout <commit>`: compose, LiveKit e Caddy voltam junto) e `VERSAO` no `.env` para a tag anterior.
2. Se a versão nova migrou o banco, restaure a cópia de antes da migração (a versão antiga não entende o banco novo). O que foi gravado depois da migração se perde:

```bash
docker compose stop server
docker compose run --rm --no-deps server ls /data/backup
docker compose run --rm --no-deps server sh -c 'cp /data/backup/<arquivo>.db /data/tofalando.db && rm -f /data/tofalando.db-wal /data/tofalando.db-shm'
```

3. Suba sem construir: `docker compose up -d` (com `--profile vps` na VPS).

Para restaurar um backup manual completo:

```bash
docker compose stop server
docker compose run --rm --no-deps --user root -v "$PWD:/backup" server sh -c 'find /data -mindepth 1 -maxdepth 1 ! -name downloads -exec rm -rf {} + && tar xzf /backup/tofalany-backup.tgz -C /data'
docker compose start server
```

## Tabela de banda

A tela é enviada **uma vez** por quem transmite e repassada pelo LiveKit para cada espectador. Os valores são os tetos configurados no app. Uma tela parada gasta bem menos, e um jogo em movimento chega perto do teto.

| Qualidade da tela | Quem pode usar | Upload de quem transmite | Upload do servidor com 1 espectador | 3 espectadores | 5 espectadores | 10 espectadores | 19 espectadores |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 720p 30 qps | todos | 2,5 Mbps | 2,5 Mbps | 7,5 Mbps | 12,5 Mbps | 25 Mbps | 47,5 Mbps |
| 1080p 60 qps | só administrador | 6 Mbps | 6 Mbps | 18 Mbps | 30 Mbps | 60 Mbps | 114 Mbps |
| 1440p 60 qps | só administrador | 10 Mbps | 10 Mbps | 30 Mbps | 50 Mbps | 100 Mbps | 190 Mbps |

Somam-se a isso:

- **Voz**: de 30 a 50 kbps por pessoa falando, para cada ouvinte. Com 5 pessoas falando na sala, dá até cerca de 1 Mbps no servidor.
- **Câmera**: cerca de 2,3 Mbps de upload de quem liga a câmera (720p mais duas camadas menores) e até 1,7 Mbps de upload do servidor por câmera para cada pessoa na sala (quem assiste em quadro pequeno recebe uma camada menor).
- **Download de cada espectador**: igual ao upload de quem transmite (2,5, 6 ou 10 Mbps).

Referências: a internet residencial costuma ter upload bem menor que o download, então confira o upload real (por exemplo, num teste de velocidade) antes de transmitir em 1440p pelo seu PC. Numa VPS, confira a banda e a franquia de tráfego do plano: 1 hora de 1440p para 3 espectadores passa de 13 GB de saída.

## Limitações conhecidas

- **Atalhos globais no Wayland (Linux)**: os atalhos (push-to-talk, mudo, deafen) usam um gancho de teclado do X11. Numa sessão Wayland (padrão no GNOME e no KDE recentes), o gancho só recebe as teclas enviadas a janelas X11 (XWayland): com uma janela nativa do Wayland em foco, os atalhos não disparam. Jogos pelo Steam/Proton costumam rodar no XWayland. Se os atalhos não funcionarem, entre numa sessão "X11/Xorg" na tela de login ou use o modo de voz por sensibilidade.
- **Status ausente no Wayland**: o "ausente" automático (10 minutos sem usar o computador) depende de o sistema informar o tempo ocioso. Em algumas sessões Wayland, esse tempo fica sempre zerado e a pessoa aparece como online.
- **Áudio do sistema na transmissão**: só no Windows. No Linux, a transmissão de tela vai sem o som do computador (a voz continua normal).
- **Instalador do Windows sem assinatura**: o SmartScreen avisa na primeira instalação (veja acima).
- **Mesmo host para servidor e LiveKit**: por privacidade, o app bloqueia qualquer endereço que não seja o do servidor. `LIVEKIT_URL` precisa usar o mesmo IP ou domínio de `URL_PUBLICA`.
- **Uma transmissão de tela por canal de voz** por vez. Para outra pessoa transmitir, quem está transmitindo para antes.

## Desenvolvimento

Requisitos: Node.js 24+, npm e Docker (para o LiveKit e os testes de voz). Na raiz do repositório:

```bash
npm install
```

Servidor de desenvolvimento, com LiveKit em modo dev (chaves `devkey`/`secret`):

```bash
docker run -d --rm --name tofalany-livekit-dev -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server:v1.13.11 --dev --bind 0.0.0.0 --node-ip 127.0.0.1
```

Ele usa as portas 7880 a 7882 (as mesmas do compose: não rode os dois no mesmo PC). Para parar: `docker stop tofalany-livekit-dev`.

```bash
CODIGO_CONVITE=teste LIVEKIT_URL=ws://127.0.0.1:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret npm run dev:server
```

App com recarga automática (informe `http://127.0.0.1:3000` na primeira execução):

```bash
npm run dev:client
```

Rode os comandos npm **a partir da raiz** (os scripts de cada pacote são chamados por workspace).

| Comando | O que faz |
| --- | --- |
| `npm run build` | compila shared, server e client |
| `npm test` | testes unitários e de integração (Vitest) |
| `npm run lint` | ESLint |
| `npm run test:e2e` | testes de ponta a ponta com o Electron (Playwright); os de voz sobem um LiveKit no Docker e salvam prints em `docs/demandas/to-falando-v1/prints/` |
| `npm run dist:linux` / `npm run dist:win` | instaladores em `client/release/` |

Testes de ponta a ponta opcionais:

- **App empacotado**: depois de `npm run build` e `npm run dist:linux`, `npx playwright test e2e/empacotado.spec.ts` (na pasta `client`). O teste é pulado se o pacote não existir ou for mais velho que o último build.
- **Contra um servidor do compose já no ar**: depois de `npm run build`, na pasta `client`, rode o comando abaixo. Crie antes a sua conta de administrador (senão a primeira conta de teste vira administrador). O teste cria duas contas, um canal de voz e uma mensagem em #geral; as contas contam no `LIMITE_CONTAS`, então remova-as depois (administrador, em **Membros**, **Remover conta**).

```bash
TOFALANDO_COMPOSE_URL=http://100.64.0.10:3000 TOFALANDO_COMPOSE_CONVITE=<código> npx playwright test e2e/implantacao.spec.ts
```

Estrutura: `shared/` (tipos e regras comuns), `server/` (Fastify, Socket.IO, SQLite, LiveKit), `client/` (Electron, React), `deploy/` (compose, Caddy, LiveKit), `docs/demandas/` (especificação, plano e cards de cada tarefa).
