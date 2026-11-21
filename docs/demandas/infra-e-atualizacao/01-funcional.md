# Infraestrutura e atualização: especificação funcional

> Demanda: `infra-e-atualizacao` · Versão 2 · 21/11/2026 · Situação: **aprovada em 21/11/2026**

## 1. Objetivo
Deixar o servidor mais fácil de manter:
- a VM (Arm) atualiza em segundos com a imagem pronta;
- o endereço não muda quando a VM muda;
- o administrador atualiza o servidor na hora, pelo app;
- o ToOuvini para de pedir cookies novos todo dia.

## 2. Contexto
- **Item 46:** o CI publica a imagem do servidor só para amd64. A VM atual (Ampere, arm64) não usa a imagem e monta a dela a cada versão (~4 min, com o servidor parado no fim).
- **Item 47:** o endereço é o IP no sslip.io (`168-138-133-232.sslip.io`). Na migração de 19/11 ele mudou, e cada app ficou com o servidor antigo na lista (o item 41 resolveu o sintoma). Uma próxima migração repetiria a troca para todos.
- **Item 29, parte do servidor:** a VM confere as releases a cada 10 min (timer do `vm.sh`). Não há como pedir pelo app. E o `./vm.sh atualizar` manual não usa a mesma trava do timer: em 20/11 os dois rodaram juntos e um falhou.
- **Item 33:** os cookies do YouTube vencem rápido. Parte é o jeito de exportar (já explicado no app). No servidor:
  - as execuções do yt-dlp em paralelo regravam o mesmo arquivo de cookies, e uma pode pôr cookies velhos por cima;
  - o YouTube desconfia de IP de datacenter, e um gerador de "token de origem" ao lado do servidor ajuda.
- **Pessoas:** o Gabriel (administrador e quem mantém a VM) e o grupo (usa o endereço).

## 3. Atores
| Ator | Papel |
| --- | --- |
| Administrador da instalação | Pede "Atualizar o servidor agora" pelo app; envia os cookies do ToOuvini |
| Quem mantém a VM (Gabriel) | Roda o `vm.sh`, faz migração, cuida do domínio |
| Membro do grupo | Usa o endereço do servidor no app |

## 4. Escopo
**Dentro:**
- Imagem do servidor para amd64 **e** arm64 em toda release; a VM Arm baixa a pronta.
- Endereço fixo do servidor no DuckDNS (D-1), com o `vm.sh` mantendo o nome apontado para o IP da VM e o app trocando sozinho o endereço antigo pelo novo.
- "Atualizar o servidor agora" para o administrador da instalação (no menu do servidor principal), que faz a VM conferir a release na hora.
- `./vm.sh atualizar` e o timer com a mesma trava: nunca dois ao mesmo tempo.
- Cookies do ToOuvini: cada execução com a própria cópia; só uma execução que terminou bem atualiza o arquivo guardado, uma de cada vez.
- Gerador de token de origem do YouTube ao lado do servidor (D-2).
- O endereço antigo (sslip.io) continua respondendo por um tempo, para quem ainda não atualizou o app (D-3).

**Fora (explícito):**
- Atualizar o servidor para uma versão escolhida (sempre a última release).
- Trocar de provedor de VM ou de nuvem.
- Assinatura dos pacotes (AppImage e .deb).

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Toda release publica a imagem do servidor para amd64 e arm64 com a mesma tag; a VM sempre usa a imagem da própria arquitetura. | Item 46 |
| RN-2 | O endereço público do servidor não depende do IP da VM. Migrar a VM só troca o IP para onde o nome aponta. | Item 47 |
| RN-3 | O app que conhece o endereço antigo (sslip.io) passa sozinho para o endereço fixo, sem duplicar o servidor na lista e sem pedir login de novo. | Item 47 + item 41 |
| RN-4 | Só o administrador da instalação pode pedir "Atualizar o servidor agora". | Item 29 |
| RN-5 | O pedido não roda comando nenhum de dentro do servidor: ele só deixa um sinal, e quem atualiza é o `vm.sh` na VM (o mesmo caminho do timer). | Item 29 |
| RN-6 | Nunca rodam duas atualizações ao mesmo tempo (timer, pedido pelo app ou `./vm.sh atualizar` à mão). | Item 29 |
| RN-7 | Os cookies guardados só são trocados pelo envio do administrador ou por uma execução do yt-dlp que terminou bem, uma de cada vez. | Item 33 |
| RN-8 | Os cookies não saem do servidor e não aparecem em log. | Já era assim |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | O CI deve publicar `tofalany-server:<tag>` como imagem para amd64 e arm64. | RN-1 |
| RF-2 | O `vm.sh` deve usar a imagem pronta também na VM Arm (sem montar localmente quando a imagem existe). | RN-1 |
| RF-3 | O servidor deve ter um endereço fixo (D-1), e o `vm.sh` deve manter o nome apontado para o IP atual da VM (na instalação, na migração e se o IP mudar). | RN-2 |
| RF-4 | O app deve trocar sozinho as entradas do endereço antigo pelas do endereço fixo, mantendo a sessão. | RN-3 |
| RF-5 | O menu do servidor deve ter "Atualizar o servidor agora" para o administrador da instalação; o app mostra que o pedido foi feito e, depois, a versão nova quando o servidor voltar. | RN-4, RN-5 |
| RF-6 | O `vm.sh` deve atender ao pedido em até 1 minuto, pelo mesmo caminho do timer. | RN-5, RN-6 |
| RF-7 | `./vm.sh atualizar` deve esperar ou recusar se outra atualização estiver rodando. | RN-6 |
| RF-8 | Cada execução do yt-dlp deve usar uma cópia dos cookies; ao terminar bem, a cópia substitui o arquivo guardado, uma execução por vez. | RN-7, RN-8 |
| RF-9 | O servidor deve usar um gerador de token de origem do YouTube rodando ao lado dele (D-2). | Item 33 |

## 7. Requisitos não funcionais
- **Tempo de atualização na VM Arm:** de ~4 min (montar) para menos de 1 min (baixar a imagem pronta).
- **CI:** a release continua saindo inteira; se a imagem arm64 falhar, a release não é publicada (como hoje com a amd64).
- **Custo:** nada pago (regra do projeto). O domínio fixo precisa ser gratuito (D-1).
- **Memória da VM:** o gerador de token cabe na VM de 6 GB sem prejudicar o servidor e o LiveKit.
- **Produção:** mudanças na VM só com o OK do Gabriel a cada passo (regra do projeto).

## 8. Critérios de aceite
- **CA-1** (RF-1): Dado uma tag nova, quando o CI termina, então `docker manifest inspect ghcr.io/…/tofalany-server:<tag>` lista `linux/amd64` e `linux/arm64`.
- **CA-2** (RF-2): Dado a VM Arm e a release nova, quando o `vm.sh` atualiza, então ele baixa a imagem pronta (log "Imagem pronta") e não monta localmente.
- **CA-3** (RF-3): Dado o endereço fixo configurado, quando o IP da VM muda, então `./vm.sh` (instalar ou o comando de domínio) aponta o nome para o IP novo, e o app conecta pelo mesmo endereço.
- **CA-4** (RF-4): Dado um app com servidores salvos em `https://168-138-133-232.sslip.io`, quando ele abre com o servidor já no endereço fixo, então a lista passa a ter só os do endereço fixo, com a mesma sessão (sem novo login).
- **CA-5** (RF-5): Dado o administrador da instalação, quando clica em "Atualizar o servidor agora", então o app mostra "Pedido enviado: o servidor confere a versão nova em até 1 minuto".
- **CA-6** (RF-5): Dado um membro que não é administrador da instalação, quando abre o menu, então não vê o item; e a rota recusa o pedido (403).
- **CA-7** (RF-6): Dado o pedido feito, quando passa 1 minuto, então o `vm.sh` conferiu a release (log do pedido) e, havendo versão nova, atualizou.
- **CA-8** (RF-7): Dado uma atualização em andamento, quando alguém roda `./vm.sh atualizar`, então ele espera a outra terminar (ou avisa e sai) e não roda junto.
- **CA-9** (RF-8): Dado duas execuções do yt-dlp ao mesmo tempo, quando a primeira termina com erro e a segunda bem, então o arquivo guardado fica com os cookies da segunda; e uma execução com erro nunca troca o arquivo.
- **CA-10** (RF-9): Dado o gerador de token no ar, quando o ToOuvini toca uma música, então o yt-dlp usa o token (log do yt-dlp sem o aviso de token ausente).
- **CA-11** (validação manual na VM): depois da implantação, uma semana sem o ToOuvini pedir cookies novos (ou o registro de quantas vezes pediu, para comparar).

## 9. Impacto em consumidores
- **Apps:** passam a usar o endereço fixo (troca automática). Quem estiver com app antigo usa o endereço antigo enquanto ele responder (D-3).
- **VM:** o `.env` ganha o domínio novo, o docker-compose ganha um contêiner (gerador de token) e o systemd ganha um vigia do pedido de atualização.
- **CI:** o job da imagem passa a montar duas arquiteturas.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | ~~Qual endereço fixo, sem custo? Opções: **DuckDNS** (grátis, `tofalany.duckdns.org` ou outro nome livre; precisa de uma conta lá, feita por você, e o token fica só no `.env` da VM; recomendação), **domínio próprio** (tem custo anual, contra a regra do projeto), ou **manter o sslip.io** e só automatizar a troca na migração.~~ | Gabriel | 21/11: DuckDNS. A conta e o nome são criados pelo Gabriel; o token fica só no `.env` da VM. |
| D-2 | ~~O gerador de token de origem (projeto de código aberto, contêiner `bgutil-ytdlp-pot-provider`) entra agora? Ele roda só na rede interna, sem porta aberta, com uns 150 MB de memória. Recomendação: sim.~~ | Gabriel | 21/11: sim, agora. |
| D-3 | ~~O endereço antigo (sslip.io) continua respondendo depois da troca, para quem ainda não atualizou o app? Recomendação: sim, por um tempo (o Caddy atende os dois nomes); o app novo troca sozinho, e o antigo some numa versão seguinte.~~ | Gabriel | 21/11: sim, por um tempo. |
