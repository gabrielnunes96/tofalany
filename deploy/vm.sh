#!/usr/bin/env bash
# ToFalany na VPS (Ubuntu): instalar do zero ou atualizar.
#
#   ./vm.sh instalar    Docker + compose, swap (se a memória for pouca), .env gerado (IP público, domínio
#                       sslip.io, código de convite e segredo do LiveKit), instaladores da última release e sobe.
#   ./vm.sh atualizar   código e instaladores da última release do GitHub, reconstrói e sobe; confere a saúde.
#   ./vm.sh status      contêineres, saúde, versão e a atualização automática.
#   ./vm.sh automatico  liga a atualização automática: a cada 10 min a VM confere se saiu release nova e,
#                       se saiu, faz o "atualizar" sozinha (log: journalctl -u tofalany-atualizar).
#   ./vm.sh manual      desliga a atualização automática.
#   ./vm.sh consulta "SELECT …"   consulta só de leitura no banco (senhas e tokens aparecem mascarados).
#   ./vm.sh copia-banco           cópia do banco sem senhas e sessões em deploy/copia-banco-<data>.db,
#                                 para baixar (scp) e abrir no DB Browser for SQLite.
#
# Rode de dentro da pasta deploy do repositório (cd ~/tofalany/deploy). Na VM, não no seu PC.
set -euo pipefail

REPO="gabrielnunes96/tofalany"
# Imagem do servidor publicada pelo CI a cada release (o registro só aceita minúsculas).
IMAGEM="ghcr.io/$(echo "${REPO%%/*}" | tr '[:upper:]' '[:lower:]')/tofalany-server"
PASTA="$(cd "$(dirname "$0")" && pwd)"
# Versão (tag) que está no ar, gravada depois de cada atualização que deu certo.
INSTALADA="$PASTA/.versao-instalada"
UNIDADE="tofalany-atualizar"
cd "$PASTA"

ok() { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
info() { printf '\033[1;36m→ %s\033[0m\n' "$*"; }
erro() { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

compose() {
  if docker info > /dev/null 2>&1; then docker compose --profile vps "$@"; else sudo docker compose --profile vps "$@"; fi
}

instalar_docker() {
  if command -v docker > /dev/null && docker compose version > /dev/null 2>&1; then
    ok "Docker e compose já instalados"
    return
  fi
  info "Instalando Docker e compose"
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker.io docker-compose-v2 docker-buildx > /dev/null
  sudo systemctl enable --now docker > /dev/null
  sudo usermod -aG docker "$USER"
  ok "Docker instalado (o grupo docker vale a partir do próximo login; até lá o script usa sudo)"
}

garantir_swap() {
  local memoria_mb swap_mb
  memoria_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  swap_mb=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
  if [ "$memoria_mb" -ge 3000 ] || [ "$swap_mb" -ge 1000 ]; then
    ok "Memória ok (${memoria_mb} MB, swap ${swap_mb} MB)"
    return
  fi
  info "Pouca memória (${memoria_mb} MB): criando swap de 2 GB para o build"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile > /dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
  ok "Swap de 2 GB ativo"
}

gerar_configuracao() {
  if [ -f .env ]; then
    ok "Configuração (.env) já existe; não mexo nela"
    return
  fi
  info "Gerando a configuração (.env)"
  local ip dominio
  ip=$(curl -fsS -m 10 https://checkip.amazonaws.com | tr -d '[:space:]') || erro "Não consegui descobrir o IP público."
  dominio="${DOMINIO_TOFALANY:-${ip//./-}.sslip.io}"
  (
    umask 077
    cat > .env << EOF
NOME_SERVIDOR=ToFalany
CODIGO_CONVITE=$(openssl rand -hex 6)
URL_PUBLICA=https://${dominio}
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
LIVEKIT_URL=wss://${dominio}
LIVEKIT_NODE_IP=${ip}
BIND_IP_HTTP=127.0.0.1
BIND_IP_MIDIA=0.0.0.0
DOMINIO=${dominio}
ATRAS_DE_PROXY=true
EOF
  )
  ok "Configuração criada para https://${dominio}"
}

# Última release do GitHub: a primeira linha é a tag; as outras, "arquivo url" dos instaladores.
ultima_release() {
  curl -fsS -m 20 "https://api.github.com/repos/${REPO}/releases/latest" | python3 -c '
import json, sys
r = json.load(sys.stdin)
print(r["tag_name"])
for a in r["assets"]:
    n = a["name"]
    if n.endswith((".exe", ".AppImage", ".deb")):
        print(n, a["browser_download_url"])
'
}

# O servidor fica preso à release (não ao que estiver no main): o código vai para a tag dela.
codigo_da_release() {
  local tag="$1"
  info "Código de ${tag}"
  git -C "$PASTA/.." fetch --quiet --tags --force origin
  git -C "$PASTA/.." -c advice.detachedHead=false checkout --quiet --detach "refs/tags/${tag}"
}

baixar_instaladores() {
  local lista="$1" tag
  tag=$(echo "$lista" | head -1)
  info "Baixando os instaladores de ${tag}"
  mkdir -p downloads
  local novos=()
  while read -r nome url; do
    [ -n "$nome" ] || continue
    novos+=("$nome")
    if [ -f "downloads/$nome" ]; then continue; fi
    curl -fsSL -m 600 -o "downloads/$nome.parcial" "$url" && mv "downloads/$nome.parcial" "downloads/$nome"
  done < <(echo "$lista" | tail -n +2)
  # Tira os instaladores de versões antigas (a página do convite mostra o que estiver na pasta).
  for f in downloads/*.exe downloads/*.AppImage downloads/*.deb; do
    [ -e "$f" ] || continue
    local base
    base=$(basename "$f")
    printf '%s\n' "${novos[@]}" | grep -qxF "$base" || rm -f "$f"
  done
  ok "Instaladores de ${tag} na página do convite"
}

puxar() {
  info "Baixando a imagem $1"
  if docker info > /dev/null 2>&1; then docker pull -q "$1" > /dev/null 2>&1; else sudo docker pull -q "$1" > /dev/null 2>&1; fi
}

# Grava (ou troca) uma variável na configuração, sem mexer no resto.
definir_config() {
  local chave="$1" valor="$2"
  if grep -q "^${chave}=" .env; then
    sed -i "s|^${chave}=.*|${chave}=${valor}|" .env
  else
    echo "${chave}=${valor}" >> .env
  fi
}

# Imagem pronta da release (segundos); se não houver (release antiga, pacote privado), monta aqui (minutos).
subir() {
  local tag="${1:-}"
  if [ -n "$tag" ] && puxar "${IMAGEM}:${tag}"; then
    definir_config IMAGEM_SERVIDOR "$IMAGEM"
    definir_config VERSAO "$tag"
    info "Imagem pronta ${IMAGEM}:${tag}; subindo"
    compose up -d --no-build
  else
    [ -n "$tag" ] && info "Sem imagem pronta de ${tag} (ou o pacote no GitHub está privado): montando aqui"
    definir_config IMAGEM_SERVIDOR tofalany-server
    definir_config VERSAO "${tag:-local}"
    info "Construindo e subindo (na VM pequena o build leva alguns minutos)"
    compose up -d --build
  fi
  info "Esperando o servidor ficar saudável"
  local i
  for i in $(seq 1 60); do
    if curl -fsS -m 3 http://127.0.0.1:3000/api/saude > /dev/null 2>&1; then
      ok "Servidor no ar: $(curl -fsS -m 3 http://127.0.0.1:3000/api/servidor)"
      return
    fi
    sleep 5
  done
  erro "O servidor não respondeu em 5 min. Veja: docker compose --profile vps logs --tail 50 server"
}

status() {
  compose ps
  echo
  curl -fsS -m 5 http://127.0.0.1:3000/api/saude && echo
  curl -fsS -m 5 http://127.0.0.1:3000/api/servidor && echo
  grep -E '^(URL_PUBLICA|DOMINIO)=' .env 2> /dev/null || true
  echo "Versão instalada: $(cat "$INSTALADA" 2> /dev/null || echo '?')"
  if systemctl is-active --quiet "${UNIDADE}.timer" 2> /dev/null; then
    echo "Atualização automática: ligada (próxima conferência: $(systemctl show "${UNIDADE}.timer" -p NextElapseUSecRealtime --value 2> /dev/null))"
  else
    echo "Atualização automática: desligada (./vm.sh automatico)"
  fi
}

atualizar() {
  local lista tag
  lista=$(ultima_release) || erro "Não consegui ler as releases do GitHub."
  tag=$(echo "$lista" | head -1)
  [ -n "$tag" ] || erro "O GitHub não devolveu a última release."
  codigo_da_release "$tag"
  baixar_instaladores "$lista"
  subir "$tag"
  echo "$tag" > "$INSTALADA"
  ok "${tag} no ar"
}

# Chamado pelo timer: só atualiza quando a última release muda. Sem internet ou GitHub fora, tenta na próxima.
verificar() {
  exec 9> "$PASTA/.atualizando.lock"
  flock -n 9 || { echo "Já há uma atualização em andamento."; return 0; }
  local lista tag
  lista=$(ultima_release 2> /dev/null) || { echo "GitHub indisponível; confiro de novo depois."; return 0; }
  tag=$(echo "$lista" | head -1)
  [ -n "$tag" ] || return 0
  if [ "$tag" = "$(cat "$INSTALADA" 2> /dev/null)" ]; then
    echo "Em dia: ${tag}"
    return 0
  fi
  info "Release nova: ${tag} (no ar: $(cat "$INSTALADA" 2> /dev/null || echo '?'))"
  atualizar
}

automatico() {
  # Primeira vez: a versão no ar é a que o servidor informa (assim não reconstrói à toa).
  if [ ! -f "$INSTALADA" ]; then
    local versao
    versao=$(curl -fsS -m 5 http://127.0.0.1:3000/api/servidor | python3 -c 'import json,sys; print(json.load(sys.stdin)["versao"])' 2> /dev/null || true)
    if [ -n "$versao" ]; then echo "v${versao}" > "$INSTALADA"; fi
  fi
  sudo tee "/etc/systemd/system/${UNIDADE}.service" > /dev/null << EOF
[Unit]
Description=ToFalany: atualiza o servidor quando sai release nova no GitHub
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=${USER}
WorkingDirectory=${PASTA}
ExecStart=${PASTA}/vm.sh verificar
TimeoutStartSec=45min
EOF
  sudo tee "/etc/systemd/system/${UNIDADE}.timer" > /dev/null << EOF
[Unit]
Description=ToFalany: confere releases novas a cada 10 minutos

[Timer]
OnBootSec=5min
OnUnitActiveSec=10min
RandomizedDelaySec=60
Persistent=true

[Install]
WantedBy=timers.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable --now "${UNIDADE}.timer" > /dev/null
  ok "Atualização automática ligada: a cada 10 min a VM confere o GitHub (no ar: $(cat "$INSTALADA" 2> /dev/null || echo '?'))"
  echo "   Acompanhar: journalctl -u ${UNIDADE} -f    Desligar: ./vm.sh manual"
}

manual() {
  sudo systemctl disable --now "${UNIDADE}.timer" > /dev/null 2>&1 || true
  ok "Atualização automática desligada (atualize com ./vm.sh atualizar)"
}

banco_cli() {
  compose exec -T server node server/dist/cli/banco.js "$@"
}

copia_banco() {
  local nome
  nome="copia-banco-$(date +%Y%m%d-%H%M%S).db"
  banco_cli copia "/data/$nome"
  compose cp "server:/data/$nome" "./$nome"
  compose exec -T server rm -f "/data/$nome"
  chmod 600 "./$nome"
  ok "Cópia em $PASTA/$nome"
  echo "   No seu PC: scp tofalany:$PASTA/$nome .   (depois apague a da VM: rm $PASTA/$nome)"
}

# Tudo dentro de uma função: o bash lê o arquivo inteiro antes de rodar, então trocar o código da VM no meio
# da atualização (checkout da tag nova, que pode mudar este script) não mistura a versão velha com a nova.
main() {
case "${1:-}" in
  instalar)
    instalar_docker
    garantir_swap
    gerar_configuracao
    atualizar
    echo
    ok "Pronto. Código de convite: $(grep '^CODIGO_CONVITE=' .env | cut -d= -f2)"
    echo "   Libere na Security List da Oracle: TCP 80, 443, 7881 e UDP 443, 7882 (origem 0.0.0.0/0)."
    ;;
  atualizar) atualizar ;;
  verificar) verificar ;;
  automatico) automatico ;;
  manual) manual ;;
  status) status ;;
  tabelas) banco_cli tabelas ;;
  consulta)
    [ -n "${2:-}" ] || erro 'Uso: ./vm.sh consulta "SELECT …"'
    banco_cli consulta "$2"
    ;;
  copia-banco) copia_banco ;;
  *)
    echo "Uso: ./vm.sh instalar | atualizar | automatico | manual | status | tabelas | consulta \"SELECT …\" | copia-banco"
    exit 1
    ;;
esac
}

main "$@"
exit $?
