# Servidor do ToFalany numa VPS: roteiro do zero

Este roteiro leva do nada até o grupo conversando, num servidor na nuvem com HTTPS. Para os detalhes de cada configuração, veja o [README](../README.md#servidor-numa-vps-com-https).

## 1. Qual servidor escolher

### O que o ToFalany consome

| Uso | CPU | Memória | Banda de saída do servidor |
| --- | --- | --- | --- |
| Chat, contas e arquivos | quase nada | cerca de 150 MB | pequena (as imagens enviadas) |
| Voz, 5 pessoas falando | menos de 5% de um núcleo | cerca de 100 MB (LiveKit) | até cerca de 1,3 Mbps (64 kbps por pessoa para cada ouvinte) |
| Tela em 720p30 para 4 pessoas | baixa (o LiveKit só repassa a mídia, sem recodificar) | — | cerca de 10 Mbps |
| Tela em 1440p60 para 4 pessoas | baixa | — | cerca de 40 Mbps |
| Câmeras, 3 ligadas para 5 pessoas | baixa | — | até cerca de 20 Mbps |

O gargalo não é CPU nem memória: é a **banda de saída** e o **tráfego do mês**. Uma hora de transmissão em 1440p para 4 pessoas gasta cerca de 18 GB.

O build da imagem do servidor é o momento mais pesado: com menos de 2 GB de memória, crie um swap antes. O `vm.sh instalar` já faz isso.

### Opções

| Opção | Custo | Máquina | Tráfego | Para o grupo |
| --- | --- | --- | --- | --- |
| **Oracle Cloud Always Free, Ampere A1** (recomendada) | R$ 0 | 2 núcleos Arm e 12 GB (os limites mudaram em 2026; confira no console) | 10 TB/mês | Sobra para voz, câmeras e tela em 1440p |
| Oracle Always Free, VM micro (AMD) | R$ 0 | 1/8 de núcleo e 1 GB | 10 TB/mês | Chat e voz bem; transmissão de tela em qualidade alta sofre com a rede limitada |
| VPS paga em São Paulo (Platon, Serversp, Kronich…) | R$ 45 a R$ 80/mês | 2 vCPU e 4 GB | ilimitado ou grande | Ótima, preço previsível; confira o valor da renovação |
| AWS (EC2 ou Lightsail) | créditos por até 6 meses, depois paga | pequena no grátis | cobrada por GB | Funciona, mas a conta da banda pode surpreender |

**Use datacenter no Brasil** (Oracle São Paulo ou Vinhedo, ou VPS em São Paulo). Fora do país, a voz fica com atraso perceptível (150 ms ou mais).

### Cuidados com a Oracle grátis

- **VM ociosa pode ser recuperada:** a Oracle pode recuperar VMs grátis que passam 7 dias com uso muito baixo. Converter a conta para "Pay As You Go" (continua grátis dentro dos limites, mas usa o cartão) tira a VM dessa regra.
- **Falta de capacidade:** às vezes a criação da A1 dá "Out of host capacity". Tente de novo mais tarde ou em outro horário. Enquanto isso, a micro serve para começar.
- **A região não muda depois:** escolha São Paulo ou Vinhedo ao criar a conta.

## 2. Criar a VM (Oracle)

1. Crie a conta em cloud.oracle.com, com a região São Paulo ou Vinhedo.
2. Vá em **Compute → Instances → Create instance**:
   - imagem: **Ubuntu 24.04**;
   - shape: **VM.Standard.A1.Flex** (Ampere), com 2 OCPU e 12 GB; se não tiver capacidade, use a micro;
   - SSH: deixe a Oracle gerar a chave e **baixe a chave privada** (algo como `ssh-key-2026-11-07.key`).
3. Anote o **IP público** da VM.
4. Libere as portas: **Networking → Virtual Cloud Networks → a VCN → Security Lists → Default Security List → Add Ingress Rules**. Todas com origem `0.0.0.0/0`:

| Protocolo | Porta de destino | Para quê |
| --- | --- | --- |
| TCP | 80, 443 | HTTPS do app e emissão do certificado |
| UDP | 443 | HTTP/3 |
| TCP | 7881 | mídia de reserva |
| UDP | 7882 | voz, câmera e tela |

## 3. Atalho de SSH no seu PC

Troque o caminho da chave e o IP pelos seus:

```bash
CHAVE=/caminho/da/ssh-key.key && chmod 600 "$CHAVE" && printf '\nHost tofalany\n  HostName SEU_IP\n  User ubuntu\n  IdentityFile %s\n  ServerAliveInterval 30\n' "$CHAVE" >> ~/.ssh/config && ssh tofalany
```

Daí em diante, para entrar:

```bash
ssh tofalany
```

## 4. Instalar o ToFalany na VM

Dentro da VM (`ssh tofalany`):

```bash
git clone https://github.com/gabrielnunes96/tofalany.git && cd tofalany/deploy && ./vm.sh instalar
```

O script faz tudo:
- instala o Docker e o compose;
- cria swap, se a memória for pouca;
- gera a configuração com o IP público, o endereço HTTPS grátis (`IP-com-hifens.sslip.io`), um código de convite e o segredo do LiveKit;
- baixa os instaladores da última release para a página do convite;
- constrói e sobe tudo.

No fim, ele mostra o **código de convite**. Na VM micro, o primeiro build leva de 10 a 20 minutos.

Para conferir do seu PC (troque pelo seu IP com hifens):

```bash
curl https://SEU-IP-COM-HIFENS.sslip.io/api/saude
```

A resposta esperada é `{"ok":true,"sqlite":true,"livekit":"ok"}`. Se travar ou der erro de certificado, confira as portas 80 e 443 na Security List e rode `./vm.sh status` na VM.

## 5. Primeiro acesso e convites

1. Instale o app pelas [releases do GitHub](https://github.com/gabrielnunes96/tofalany/releases/latest).
2. Na primeira tela, informe `https://SEU-IP-COM-HIFENS.sslip.io`.
3. Clique em **Tenho um convite** e use o código que o script mostrou. **A primeira conta é a do administrador.**
4. Para chamar o grupo, use **Copiar link de convite** e mande o link. Quem abrir baixa o app, e o botão da página abre o cadastro já preenchido. Se a pessoa instalou pelo GitHub, ela pode **colar o link** na primeira tela do app.

## 6. Dia a dia

| Tarefa | Comando (no seu PC) |
| --- | --- |
| Atualizar o servidor (código novo e instaladores da última release) | `ssh -t tofalany 'cd ~/tofalany && git pull && cd deploy && ./vm.sh atualizar'` |
| Ver se está tudo no ar | `ssh tofalany 'cd ~/tofalany/deploy && ./vm.sh status'` |
| Ver os registros do servidor | `ssh tofalany 'cd ~/tofalany/deploy && docker compose --profile vps logs --tail 50 server'` |
| Backup | veja "Atualizar e voltar" no [README](../README.md#atualizar-e-voltar) |

O app se atualiza sozinho a cada release no Windows e no AppImage. No .deb, ele avisa e abre a página para baixar.

## 7. Trocar para um domínio próprio (opcional)

1. Crie o nome: DuckDNS é grátis; um `.com.br` no registro.br sai por cerca de R$ 40 por ano.
2. Aponte o nome para o IP da VM (registro `A`).
3. Na VM, troque o endereço nas três linhas da configuração (troque `NOVO` pelo seu nome):

```bash
cd ~/tofalany/deploy && sed -i 's/[0-9-]*\.sslip\.io/NOVO/g' .env && docker compose --profile vps up -d
```

Quem já usa o app precisa usar **Trocar servidor** com o endereço novo. A conta continua a mesma.
