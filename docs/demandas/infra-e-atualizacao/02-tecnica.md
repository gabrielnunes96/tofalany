# Infraestrutura e atualização: especificação técnica

> Demanda: `infra-e-atualizacao` · Base: funcional v2 (aprovada em 21/11/2026) · 21/11/2026 · Situação: **aprovada em 21/11/2026**
> Base: análise de impacto (fluxo:analista) e modelagem de ameaças STRIDE (fluxo:seguranca) de 21/11.

## 1. Visão da solução
- **CI:** a imagem do servidor é montada em dois runners nativos (amd64 e arm64), e um job junta as duas num índice com a tag. A release só sai com as duas.
- **Endereço fixo (DuckDNS):**
  - o `vm.sh` aponta o nome para o IP da VM com o token guardado fora do `.env`;
  - o Caddy atende o nome novo e o antigo (D-3);
  - o app troca as entradas do endereço antigo pelo novo por um **mapa fixo no código**, conferindo que é a mesma instalação.
- **"Atualizar o servidor agora":** a rota do servidor só cria um arquivo vazio numa pasta dedicada e montada no contêiner. Um vigia do systemd na VM roda o mesmo `vm.sh verificar` do timer. Uma trava única (`flock`) cobre o timer, o pedido e o `./vm.sh atualizar` à mão.
- **Cookies do ToOuvini:** cada execução do yt-dlp usa uma cópia protegida. Só uma execução que terminou bem, e com os cookies guardados sem mudança desde a cópia, promove a cópia, por troca atômica.
- **Gerador de token:** o contêiner `bgutil` (versão fixa) fica numa rede só com o servidor, sem porta aberta.

```text
CI:  tag → [imagem amd64 (ubuntu-24.04)] ─┐ (push por digest)
           [imagem arm64 (ubuntu-24.04-arm)]┴→ juntar (imagetools create :tag :latest) → publicar release
VM:  timer 10 min ─┐
     vigia .path ──┼→ vm.sh verificar (flock -n) → atualizar → puxar imagem da arquitetura → up
     ./vm.sh atualizar → (flock -w) → atualizar
     pedido: app (admin) → POST /api/admin/servidor/atualizar → /pedidos/atualizar (vazio) ⇢ /var/lib/tofalany/pedidos (VM)
DNS: vm.sh dominio → curl -K - (token em deploy/duckdns.token, 0600) → duckdns.org/update → OK
App: retomar(url antiga do mapa) → GET https://<novo>/api/servidor (mesmo nome?) → move servidores, sessões e escolhas → retoma no novo
Voz: POST /api/livekit/token → url no host do pedido, se ele estiver em DOMINIOS (lista do .env); senão LIVEKIT_URL
Música: execução → cópia (mkdtemp 0700, arquivo 0600) → yt-dlp --cookies cópia → saiu 0 e geração igual? → rename atômico
```

## 2. Decisões tomadas aqui (para a aprovação)
| # | Decisão | Por quê |
| --- | --- | --- |
| T-1 | **CI multi-arquitetura com runners nativos:** matriz `ubuntu-24.04` e `ubuntu-24.04-arm`, cada uma com `push-by-digest`; um job `juntar` roda `docker buildx imagetools create` com a tag e `latest` (anotação `index:` com a origem do repositório). O cache GHA ganha um `scope` por arquitetura. `publicar.needs` passa a incluir `juntar`. Se o runner arm não estiver disponível de graça para o repositório, cai para QEMU no mesmo job (mesmo resultado, mais lento). | Rápido e sem emulação. A release continua só saindo inteira. |
| T-2 | **Permissões do CI por job** (A10): `instaladores` só `contents: read`; `imagem`/`juntar` com `contents: read, packages: write`; `publicar` com `contents: write`. As actions ficam fixadas por SHA de commit. | Hoje o job dos instaladores (que roda npm e electron-builder) recebe um token capaz de publicar a imagem que a VM baixa sozinha. |
| T-3 | **Token do DuckDNS fora do `.env`** (A7): `deploy/duckdns.token` (0600, no `.gitignore`), lido só pelo `vm.sh`. A URL com o token vai pelo stdin do `curl` (`curl -fsS -K -`), nunca em argumento nem em log; a resposta precisa ser `OK`. O `vm.sh` ganha `./vm.sh dominio`, chamado também no `instalar` e no fim da migração. | O compose passa o `.env` inteiro ao contêiner do servidor (`env_file`), e de lá ao yt-dlp. Quem tem o token aponta o nome para outro IP e tira certificado válido. |
| T-4 | **Dois nomes no Caddy** (D-3): `DOMINIO="tofalany.duckdns.org, 168-138-133-232.sslip.io"` (explícitos, sem curinga nem `on_demand_tls`). `URL_PUBLICA` passa a ser o DuckDNS: convites e links saem com o nome novo. | Quem ainda não atualizou o app continua entrando pelo sslip enquanto esta VM existir. |
| T-5 | **Voz pelo host do pedido** (risco do analista): `POST /api/livekit/token` devolve `wss://<host do pedido>` se o host estiver na lista `DOMINIOS` (a mesma do Caddy); senão `LIVEKIT_URL`, como hoje. | O app só fala com o host salvo: sem isso, a voz de quem está no sslip quebraria. A lista impede que o cabeçalho `Host` escolha a URL. |
| T-6 | **Troca de endereço no app por mapa fixo** (A8): `ENDERECOS_MOVIDOS = { 'https://168-138-133-232.sslip.io': 'https://tofalany.duckdns.org' }` em `shared`.<br>Ao retomar um servidor do mapa, o app:<br>• chama `GET https://<novo>/api/servidor` (sem token, só `https`);<br>• confere o mesmo `nome` da instalação;<br>• move as entradas da mesma base (servidores, inclusive `/c/<id>`, `servidorUrl`, sessões e status escolhido, no padrão da troca http→https do `retomar`).<br>Nada vem do servidor; host comparado exato. | Um servidor (ou quem pegar o IP antigo depois) não consegue mandar o app levar a sessão para outro host. |
| T-7 | **Pedido de atualização:**<br>• **Pasta:** dedicada `/var/lib/tofalany/pedidos` (dono 1000, modo 0700), fora do repositório, montada só no `server` em `/pedidos` (A1).<br>• **Rota:** `POST /api/admin/servidor/atualizar` (`exigirSessao`, `exigirAdmin`, `exigirPrincipal`) cria o arquivo **vazio** `/pedidos/atualizar`, tem espera de 5 min entre pedidos (A4) e grava auditoria (A6). Sem a configuração `PEDIDOS` (dev, Tailscale), responde 503.<br>• **Vigia:** `tofalany-atualizar.path` com `PathExists` de nome fixo, a mesma `.service` do timer, `ExecStartPre=/bin/rm -f --` do pedido, e `StartLimitIntervalSec`/`StartLimitBurst` e `TriggerLimit*` (A2, A4).<br>• **`vm.sh`:** só olha a existência do arquivo, recusa link simbólico (`-L`: só apaga o link, A3) e nunca grava nada na pasta. | O contêiner não escreve em nada que a VM execute (`vm.sh`, `.env`, compose). O conteúdo e o nome do arquivo nunca viram argumento de shell. |
| T-8 | **Trava única** (A5): `flock` em `$PASTA/.atualizando.lock` (fora da pasta compartilhada) nos pontos de entrada do `main`: `atualizar` e `instalar` esperam até 30 min (`-w 1800`, com aviso "outra atualização em andamento; esperando"), e `verificar` continua `-n`. A trava não entra dentro da função `atualizar()`, que o `verificar` chama já com a trava. | Um segundo `flock` dentro de `atualizar()` travaria o próprio `verificar`. |
| T-9 | **Cookies em módulo próprio** `server/src/musica/cookies.ts`:<br>• **Cópia:** cada execução copia para `mkdtemp('tofalany-cookies-')` (0700, arquivo 0600, `wx`) e apaga em `finally`, também no timeout e no `kill` do `abrir` (A13).<br>• **Promoção:** só com código de saída 0, sob uma fila em memória, se a geração (incrementada por cada envio ou exclusão do administrador) for a mesma da cópia e se o conteúdo passar em `conferirCookies`, por `rename` atômico (A14).<br>• **Rota do administrador:** grava e apaga pelo mesmo módulo.<br>• **Sobras:** apagadas ao iniciar, como já se faz com `tofalany-musica`. | RN-7 e CA-9, sem a corrida "envio do admin × execução antiga". |
| T-10 | **Cookies fora de log e de ambiente:**<br>• máscara de `cookie`, `set-cookie` e `authorization` no stderr antes de logar (A15);<br>• `config.ts` recusa `--verbose`, `-v`, `--print-traffic`, `--dump-pages` e `--write-pages` em `MUSICA_YTDLP_ARGS`;<br>• os `spawn` do yt-dlp e do ffmpeg recebem só `PATH`, `HOME`, `LANG` e `TMPDIR` (A16). | O yt-dlp se autoatualiza pela internet; não precisa ver os segredos do servidor. |
| T-11 | **bgutil:**<br>• **Imagem:** `brainicism/bgutil-ytdlp-pot-provider` com versão e digest fixos (A17).<br>• **Contêiner:** `init: true`, sem `ports`, sem `env_file` nem volumes, numa rede `pot` só com o servidor. Leva `cap_drop: [ALL]`, `no-new-privileges`, `mem_limit: 256m`, `pids_limit`, `cpus: 0.5` e log com tamanho máximo; `read_only` e usuário não root só se a imagem aceitar, conferido na implantação (A18, A19).<br>• **Plugin no servidor:** o zip, na mesma versão e com checksum conferido no Dockerfile, fica em `/etc/yt-dlp/plugins/`.<br>• **Opção do yt-dlp:** a URL vai por uma variável à parte (`MUSICA_POT_URL`, somada aos extras), para não perder o `--js-runtimes` do Dockerfile. | O README do projeto avisa que ele não tem autenticação: exposto, abre execução remota. |
| T-12 | **`trustProxy` restrito** (A18): o servidor passa a confiar em `X-Forwarded-For` só da rede do Caddy (sub-rede fixa definida no compose, `TRUST_PROXY` no `.env`), em vez de qualquer rede local. | Com o bgutil na rede do servidor, um contêiner comprometido não forja o IP de quem pede (limites e auditoria). |
| T-13 | **yt-dlp com checksum** (A12): o download inicial no Dockerfile confere o `SHA2-256SUMS` da versão fixada, por arquitetura. O `-U` diário em tempo de execução fica como risco aceito (já existia). | Duas arquiteturas baixam binários diferentes; o checksum garante o que entra na imagem. |
| T-14 | **Migração (`migrar-vm.sh`):** a VM nova sobe só com o nome sslip dela; o DuckDNS é apontado depois da restauração do banco e do teste. O nome DuckDNS só entra no `DOMINIO` da VM nova depois de apontado (evita falhas de certificado e o limite do Let's Encrypt). | Apontar cedo mandaria o grupo para um servidor vazio. |

## 3. Componentes afetados
| Componente | O que muda | Arquivos-chave |
| --- | --- | --- |
| CI | matriz por arquitetura, junção, permissões por job, actions por SHA | `.github/workflows/release.yml:17-19,85-124` |
| Imagem | yt-dlp com checksum; plugin bgutil | `server/Dockerfile:37-41` |
| VM | trava no `main`, `dominio`, vigia `.path`, pasta de pedidos, migração | `deploy/vm.sh:65-90,199-269,288-314`, `deploy/migrar-vm.sh`, `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/exemplo.env`, `.gitignore`, `docs/vps.md` |
| Servidor | rota do pedido; URL da voz pelo host; cookies; `trustProxy`; filtros do yt-dlp | `server/src/routes/musica.ts`, `routes/livekit.ts:64`, `musica/fonte.ts:149-288`, `musica/cookies.ts` (novo), `config.ts:91-121`, `app.ts:46,141-160` |
| Shared | mapa de endereços movidos | `shared/src/protocolo.ts` |
| App | troca de endereço no `retomar`; item "Atualizar o servidor agora" | `app/App.tsx:86-102`, `main/sessao.ts`, `main/configuracoes.ts:37-71`, `telas/TelaPrincipal.tsx:1016,1071,1759-1763`, `servicos/api.ts` |

## 4. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| Imagem `tofalany-server:<tag>` | só amd64 | índice amd64 + arm64 | a VM amd64 continua igual |
| `POST /api/admin/servidor/atualizar` | — | 202 (pedido feito), 429 (espera), 403, 503 | nova |
| `POST /api/livekit/token` (`url`) | `LIVEKIT_URL` fixo | host do pedido se estiver em `DOMINIOS` | app antigo pelo sslip continua com voz |
| `.env` da VM | `DOMINIO` com um nome | lista de nomes; `DOMINIOS`, `TRUST_PROXY`, `PEDIDOS`; token fora | o `vm.sh` grava |
| Arquivo de cookies | escrita direta | só pelo módulo (rename atômico) | igual para quem envia |

## 5. Dados
Sem banco novo. Arquivos na VM: `deploy/duckdns.token` (0600) e `/var/lib/tofalany/pedidos/` (0700, dono 1000). O backup do volume `/data` continua levando `musica-cookies.txt` (conferir a permissão no backup, A13).

## 6. Segurança
Modelagem STRIDE de 21/11 (ameaças A1 a A19). As mitigações estão nas decisões T-2, T-3, T-6, T-7, T-9 a T-13. Riscos aceitos e registrados:
- o `-U` diário do yt-dlp em tempo de execução;
- a tag da imagem é mutável (sem atestação de proveniência nesta demanda);
- a conta do DuckDNS precisa de login forte (2FA no provedor de login): é do Gabriel;
- **reservar o IP público atual na Oracle** enquanto o sslip existir no app: quem pegasse o IP depois ficaria dono do nome sslip. É uma ação do Gabriel na Oracle.

## 7. Observabilidade
- `journalctl -u tofalany-atualizar` registra "Pedido pelo app" e o resultado do `verificar`.
- A auditoria do servidor registra quem pediu a atualização.
- O `vm.sh dominio` diz `OK` ou `KO` sem mostrar o token.
- O log do ToOuvini registra a promoção ou o descarte dos cookies, sem o conteúdo.

## 8. Estratégia de testes
| Critério | Unitário / integração | Validação na VM (com OK do Gabriel) |
| --- | --- | --- |
| CA-1 | revisão do YAML; `actionlint` | `docker buildx imagetools inspect` da tag de teste lista amd64 e arm64 |
| CA-2 | — | log "Imagem pronta" na VM Arm |
| CA-3 | `vm.sh dominio` com `curl` falso (vitest + bash): token só pelo stdin, `KO` falha, nada no log | apontar e conferir o IP |
| CA-4 | função pura da troca (vitest): só hosts do mapa, só `https`, nome igual; move servidores, sessões e status; host parecido não migra | abrir um app com o sslip salvo |
| CA-5, CA-6 | `server/test`: 202 para o admin da instalação; 403 para membro e para admin de `/c/<id>`; 429 dentro de 5 min; 503 sem `PEDIDOS`; arquivo vazio criado; auditoria. App: item no menu e a mensagem | pedir pelo app |
| CA-7 | `vm.sh` com stubs (vitest + bash): pedido apagado antes de rodar; link simbólico só é apagado; conteúdo nunca lido | `journalctl` com "Pedido pelo app" |
| CA-8 | `vm.sh` carregado com stubs: dois processos, o segundo espera a trava | rodar `./vm.sh atualizar` durante um `verificar` |
| CA-9 | `server/test` com yt-dlp falso: erro não promove; sucesso promove; envio do admin no meio vence; DELETE no meio continua apagado; cópia 0600 e apagada depois; máscara de cookie no log; `env` do filho só com a lista | — |
| CA-10 | `config.ts`: `MUSICA_POT_URL` vira o `--extractor-args`; recusa das opções verbosas | `yt-dlp -v` com "Generating a … PO Token" |
| CA-11 | — | uma semana de uso |
| Voz pelo host (T-5) | `server/test`: host na lista → `wss://<host>`; fora da lista → `LIVEKIT_URL` | voz pelo sslip num app antigo |
| `trustProxy` (T-12) | `server/test`: `X-Forwarded-For` de fora da rede confiável não muda o IP registrado | — |
| Shell | `bash -n` e `shellcheck` (pelo contêiner oficial) no `vm.sh` e no `migrar-vm.sh` | — |

## 9. Riscos e decisões
| # | Risco / decisão | Escolha e motivo |
| --- | --- | --- |
| R-1 | Runner arm gratuito não confirmado | Se não estiver disponível, QEMU no mesmo job (T-1). |
| R-2 | O token de origem não dispensa cookies em IP de datacenter (README do bgutil) | O CA-11 mede, não promete. |
| R-3 | O sslip morre na próxima migração de qualquer jeito (o nome carrega o IP) | É o motivo do DuckDNS; o mapa fixo no app cobre esta troca. |
| R-4 | `read_only` e usuário não root no bgutil podem não funcionar | Conferido na implantação; se não der, fica registrado. |
| R-5 | O uid do usuário da VM pode não ser 1000 | O `vm.sh` cria a pasta com dono 1000 (uid do `node` no contêiner). |

## 10. Implantação e rollback
Ordem (cada passo na VM só com o OK do Gabriel):
1. O Gabriel cria a conta e o nome no DuckDNS, guarda o token em `deploy/duckdns.token` na VM e reserva o IP público na Oracle.
2. Release nova com tudo (a VM atualiza pelo timer, já com a imagem arm64).
3. `./vm.sh dominio` aponta o nome; o `.env` passa a ter os dois nomes; o Caddy recarrega.
4. `./vm.sh automatico` de novo, para instalar o vigia `.path` e a pasta de pedidos.
5. O app novo chega pela atualização automática e troca o endereço sozinho.

**Rollback:** voltar a versão da imagem (como hoje); `DOMINIO` volta ao sslip; o vigia sai com `./vm.sh manual`.

## 11. CI/CD
`release.yml` muda (T-1, T-2). Validar com um `workflow_dispatch` numa tag de teste antes da release grande.

> Aprovação: o plano só começa com esta especificação aprovada (registrada no topo).
