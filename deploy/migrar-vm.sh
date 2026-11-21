#!/usr/bin/env bash
# Migra o servidor do ToFalany de uma VM para outra, levando tudo (servidores, salas, contas, membros, mensagens,
# arquivos enviados, pontos, cookies do bot de música) e a configuração (.env), trocando só o IP e o endereço.
#
#   ./migrar-vm.sh NOVO_IP [CHAVE_SSH]
#
# Roda no SEU PC, não na VM. Usa o atalho de SSH "tofalany" (VM antiga) e cria o "tofalany-novo".
# CHAVE_SSH é a chave privada da VM nova (padrão: ~/.ssh/tofalany-novo.key).
#
# Domínio fixo (DuckDNS, se a VM antiga tiver deploy/duckdns.token): a VM nova sobe só com o nome sslip dela; o
# nome fixo passa a apontar para ela só depois da restauração e do teste (apontar antes mandaria o grupo para um
# servidor vazio), e só então entra no DOMINIO dela (o Caddy não tenta certificado de um nome que ainda não é seu).
#
# Ordem: a VM nova sobe e é testada com a antiga ainda no ar; o servidor só fica fora do ar durante a cópia
# dos dados (alguns minutos), e o script pede confirmação antes. A VM antiga fica parada (não apagada) para
# voltar atrás se precisar:  ssh tofalany-antigo 'cd ~/tofalany/deploy && docker compose --profile vps start && ./vm.sh automatico'
set -euo pipefail

ANTIGA="tofalany"
NOVA="tofalany-novo"
REPO_URL="https://github.com/gabrielnunes96/tofalany.git"
COPIAS="$HOME/tofalany-backups"
CONTAGEM='SELECT (SELECT COUNT(*) FROM usuarios) AS usuarios, (SELECT COUNT(*) FROM comunidades) AS servidores, (SELECT COUNT(*) FROM canais) AS canais, (SELECT COUNT(*) FROM membros) AS membros, (SELECT COUNT(*) FROM mensagens) AS mensagens'

ok() { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
info() { printf '\n\033[1;36m→ %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
erro() { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }
confirmar() {
  local r
  read -r -p "$(printf '\033[1;33m? %s [s/N] \033[0m' "$*")" r
  [[ "$r" =~ ^[sS]$ ]] || erro "Parado a pedido. Nada além do que já foi mostrado foi feito."
}

NOVO_IP="${1:-}"
CHAVE="${2:-$HOME/.ssh/tofalany-novo.key}"
[[ "$NOVO_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || erro "Uso: $0 NOVO_IP [CHAVE_SSH]"
[ -f "$CHAVE" ] || erro "Chave não encontrada: $CHAVE"
chmod 600 "$CHAVE"

ANTIGO_IP=$(ssh -G "$ANTIGA" | awk '/^hostname /{print $2}')
[[ "$ANTIGO_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || erro "Não achei o IP da VM antiga no atalho \"$ANTIGA\" (~/.ssh/config)."
[ "$ANTIGO_IP" != "$NOVO_IP" ] || erro "O IP novo é igual ao antigo."
NOVO_DOMINIO="${NOVO_IP//./-}.sslip.io"

# ---------------------------------------------------------------------------------------------------------
info "1/9 Atalho de SSH \"$NOVA\" ($NOVO_IP)"
if ssh -G "$NOVA" | grep -q "^hostname $NOVO_IP$"; then
  ok "Atalho já existe"
else
  grep -q "^Host $NOVA$" ~/.ssh/config 2> /dev/null && erro "Já existe um \"Host $NOVA\" no ~/.ssh/config com outro IP. Corrija ou apague e rode de novo."
  printf '\nHost %s\n  HostName %s\n  User ubuntu\n  IdentityFile %s\n  ServerAliveInterval 30\n' "$NOVA" "$NOVO_IP" "$CHAVE" >> ~/.ssh/config
  ok "Atalho criado"
fi
ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$NOVA" true || erro "Não consegui entrar na VM nova. Confira o IP, a chave e a porta 22 na Security List."
ssh "$NOVA" 'echo "Arquitetura: $(uname -m) · Memória: $(free -h | awk "/Mem:/{print \$2}") · Disco livre: $(df -h / | awk "NR==2{print \$4}")"'
ssh "$ANTIGA" true || erro "Não consegui entrar na VM antiga (\"$ANTIGA\")."
ok "As duas VMs respondem (antiga: $ANTIGO_IP)"

# ---------------------------------------------------------------------------------------------------------
info "2/9 Código na VM nova"
ssh "$NOVA" "command -v git > /dev/null || (sudo apt-get update -qq && sudo apt-get install -y -qq git > /dev/null); [ -d ~/tofalany/.git ] || git clone -q $REPO_URL ~/tofalany"
ok "Repositório em ~/tofalany"

# ---------------------------------------------------------------------------------------------------------
info "3/9 Configuração (.env) da antiga para a nova, trocando o IP e o endereço"
if ssh "$NOVA" 'test -f ~/tofalany/deploy/.env'; then
  aviso "A VM nova já tem .env; não sobrescrevo."
else
  # Passa direto de uma VM para a outra pelo PC, sem gravar aqui.
  ssh "$ANTIGA" 'cat ~/tofalany/deploy/.env' | ssh "$NOVA" 'umask 077 && cat > ~/tofalany/deploy/.env'
  ssh "$NOVA" "cd ~/tofalany/deploy && sed -i 's/${ANTIGO_IP//./\\.}/$NOVO_IP/g; s/${ANTIGO_IP//./-}/${NOVO_IP//./-}/g' .env"
fi
# DOMINIO pode ser uma lista (nome fixo e sslip): a VM nova começa só com o sslip dela; o resto volta no passo 8.
DOMINIO_FINAL=$(ssh "$NOVA" 'grep "^DOMINIO=" ~/tofalany/deploy/.env | cut -d= -f2-')
ssh "$NOVA" "cd ~/tofalany/deploy && sed -i 's|^DOMINIO=.*|DOMINIO=$NOVO_DOMINIO|' .env"
ssh "$NOVA" 'grep -E "^(URL_PUBLICA|DOMINIO|LIVEKIT_URL|LIVEKIT_NODE_IP)=" ~/tofalany/deploy/.env'
ssh "$NOVA" "! grep -q '${ANTIGO_IP//./\\.}\|${ANTIGO_IP//./-}' ~/tofalany/deploy/.env" || erro "O .env da VM nova ainda tem o IP antigo."
ok "Configuração pronta para https://$NOVO_DOMINIO"

# ---------------------------------------------------------------------------------------------------------
info "4/9 Instalando na VM nova (Docker, imagem e serviços; sobe vazia, sem os dados ainda)"
aviso "Na VM Arm a imagem é montada lá mesmo; pode levar uns 10 minutos."
ssh -t "$NOVA" 'cd ~/tofalany/deploy && ./vm.sh instalar'

info "Testando https://$NOVO_DOMINIO pela internet (certificado e portas)"
for i in $(seq 1 24); do
  if curl -fsS -m 10 "https://$NOVO_DOMINIO/api/saude" 2> /dev/null; then echo; ok "VM nova no ar pela internet"; break; fi
  [ "$i" = 24 ] && erro "A VM nova não respondeu por HTTPS. Confira as portas 80/443 na Security List e rode: ssh $NOVA 'cd ~/tofalany/deploy && ./vm.sh status'. A antiga continua no ar."
  sleep 5
done
ssh "$NOVA" 'docker image inspect -f "Imagem do servidor: {{.Architecture}}" $(docker compose -f ~/tofalany/deploy/docker-compose.yml --profile vps images -q server | head -1)' || true

# ---------------------------------------------------------------------------------------------------------
info "5/9 Daqui em diante o servidor sai do ar na VM antiga"
confirmar "Ninguém em chamada? Parar o servidor antigo e copiar os dados agora?"
echo "Na VM antiga, antes de parar:"
ssh "$ANTIGA" "cd ~/tofalany/deploy && ./vm.sh consulta \"$CONTAGEM\""
ssh "$ANTIGA" 'cd ~/tofalany/deploy && ./vm.sh manual > /dev/null && docker compose --profile vps stop server'
ok "Servidor antigo parado (atualização automática desligada lá)"
ssh "$ANTIGA" 'cd ~/tofalany/deploy && docker compose --profile vps run --rm --no-deps --user root -v "$PWD:/backup" server tar czf /backup/tofalany-backup.tgz --exclude=./downloads -C /data . && ls -lh tofalany-backup.tgz | awk "{print \"Backup: \" \$5}"'

# ---------------------------------------------------------------------------------------------------------
info "6/9 Cópia dos dados (uma cópia fica no seu PC, em $COPIAS)"
mkdir -p "$COPIAS" && chmod 700 "$COPIAS"
LOCAL="$COPIAS/tofalany-backup-$(date +%Y%m%d-%H%M%S).tgz"
scp -q "$ANTIGA:tofalany/deploy/tofalany-backup.tgz" "$LOCAL"
chmod 600 "$LOCAL"
scp -q "$LOCAL" "$NOVA:tofalany/deploy/tofalany-backup.tgz"
ok "Backup na VM nova e em $LOCAL"

# ---------------------------------------------------------------------------------------------------------
info "7/9 Restaurando na VM nova"
ssh "$NOVA" 'cd ~/tofalany/deploy && docker compose --profile vps stop server \
  && docker compose --profile vps run --rm --no-deps --user root -v "$PWD:/backup" server sh -c "find /data -mindepth 1 -maxdepth 1 ! -name downloads -exec rm -rf {} + && tar xzf /backup/tofalany-backup.tgz -C /data" \
  && docker compose --profile vps up -d'
for i in $(seq 1 36); do
  if curl -fsS -m 10 "https://$NOVO_DOMINIO/api/saude" 2> /dev/null; then echo; break; fi
  [ "$i" = 36 ] && erro "O servidor novo não voltou depois da restauração. Para voltar à antiga: ssh $ANTIGA 'cd ~/tofalany/deploy && docker compose --profile vps start && ./vm.sh automatico'"
  sleep 5
done
echo "Na VM nova, depois de restaurar (os números devem bater com os da antiga):"
ssh "$NOVA" "cd ~/tofalany/deploy && ./vm.sh consulta \"$CONTAGEM\" && ./vm.sh automatico > /dev/null && ./vm.sh status"
ok "Dados restaurados e atualização automática ligada na VM nova"

# ---------------------------------------------------------------------------------------------------------
info "8/9 Endereço fixo (DuckDNS)"
NOME_FIXO=""
if ssh "$ANTIGA" 'test -f ~/tofalany/deploy/duckdns.token'; then
  NOME_FIXO="$(ssh "$ANTIGA" 'sed -n 1p ~/tofalany/deploy/duckdns.token' | tr -d '[:space:]').duckdns.org"
  confirmar "Os números batem e o servidor novo respondeu? Apontar $NOME_FIXO para a VM nova ($NOVO_IP)?"
  # O token passa direto de uma VM para a outra pelo PC, sem gravar aqui nem aparecer na tela.
  ssh "$ANTIGA" 'cat ~/tofalany/deploy/duckdns.token' | ssh "$NOVA" 'umask 077 && cat > ~/tofalany/deploy/duckdns.token'
  ssh "$NOVA" "cd ~/tofalany/deploy && ./vm.sh dominio $NOVO_IP"
  info "Esperando $NOME_FIXO apontar para $NOVO_IP"
  for i in $(seq 1 30); do
    [ "$(getent ahostsv4 "$NOME_FIXO" | awk 'NR==1{print $1}')" = "$NOVO_IP" ] && break
    [ "$i" = 30 ] && erro "O nome ainda não aponta para a VM nova. Rode de novo: ssh $NOVA 'cd ~/tofalany/deploy && ./vm.sh dominio'"
    sleep 10
  done
  # Agora o nome é desta VM: entra no Caddy (com o sslip novo no lugar do antigo, que já veio trocado do .env).
  ssh "$NOVA" "cd ~/tofalany/deploy && sed -i 's|^DOMINIO=.*|DOMINIO=${DOMINIO_FINAL}|' .env && docker compose --profile vps up -d"
  for i in $(seq 1 36); do
    if curl -fsS -m 10 "https://$NOME_FIXO/api/saude" 2> /dev/null; then echo; ok "https://$NOME_FIXO na VM nova"; break; fi
    [ "$i" = 36 ] && erro "https://$NOME_FIXO não respondeu (certificado?). Veja: ssh $NOVA 'cd ~/tofalany/deploy && docker compose --profile vps logs --tail 50 caddy'"
    sleep 5
  done
else
  aviso "Sem duckdns.token na VM antiga: a VM nova fica só com https://$NOVO_DOMINIO."
fi

# ---------------------------------------------------------------------------------------------------------
info "9/9 Arrumação"
ssh "$ANTIGA" 'cd ~/tofalany/deploy && docker compose --profile vps stop && rm -f tofalany-backup.tgz'
ssh "$NOVA" 'rm -f ~/tofalany/deploy/tofalany-backup.tgz'
ok "VM antiga parada (os dados continuam lá, para voltar atrás) e cópias temporárias apagadas"
cp ~/.ssh/config ~/.ssh/config.antes-da-migracao
sed -i -E "s/^Host $ANTIGA$/Host $ANTIGA-antigo/; s/^Host $NOVA$/Host $ANTIGA/" ~/.ssh/config
ok "Atalhos trocados: \"ssh $ANTIGA\" agora é a VM nova; a antiga ficou \"ssh $ANTIGA-antigo\""

cat << EOF

$(printf '\033[1;32m')Migração concluída.$(printf '\033[0m')
EOF
if [ -n "$NOME_FIXO" ]; then
  cat << EOF
O endereço do grupo continua https://$NOME_FIXO (agora na VM nova); o app não precisa de nada.

Falta com você:
  1. Testar no app: conta, mensagens, voz, GIF e o ToOuvini.
  2. Depois de uns dias sem problema, encerrar a VM antiga na Oracle e apagar $LOCAL.
EOF
else
  cat << EOF
Endereço novo: https://$NOVO_DOMINIO

Falta com você:
  1. No app: Configurações → Trocar servidor → https://$NOVO_DOMINIO (a conta é a mesma). Teste conta, mensagens,
     voz, GIF e o ToOuvini.
  2. Mandar o endereço novo para o grupo e trocar o código de convite.
  3. Depois de uns dias sem problema, encerrar a VM antiga na Oracle e apagar $LOCAL.
EOF
fi
