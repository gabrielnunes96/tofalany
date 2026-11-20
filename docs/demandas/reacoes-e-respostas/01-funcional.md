# Reações e respostas — Especificação funcional

> Demanda: `reacoes-e-respostas` · Versão 1 · 16/11/2026 · Situação: **aprovada em 16/11/2026**

## 1. Objetivo
Deixar a conversa de texto mais leve e clara. Hoje, para concordar ou rir de uma mensagem, a pessoa escreve uma mensagem nova. Para comentar uma mensagem antiga, ela também não tem como ligar o comentário à original. Com esta demanda, a pessoa reage com um emoji ou responde a uma mensagem específica.

## 2. Contexto
- Hoje uma mensagem pode ser editada pelo autor e apagada pelo autor ou por quem tem "Apagar mensagens". Os botões ficam no topo de cada mensagem. A mensagem pode marcar pessoas com @nome ou @todos, e a marcação destaca a mensagem e avisa quem foi marcado.
- O chat existe em canais de texto e em DMs, com histórico paginado (carrega as mais antigas ao subir).
- GIFs já podem ser enviados como anexo. A busca de GIF por um serviço externo fica para uma demanda posterior.
- Pedido do usuário em 16/11/2026 (`00-demanda.md`), como recurso básico de qualquer chat.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Membro | Reage, tira a própria reação, vê quem reagiu, responde a uma mensagem e é avisado quando respondem a ele. |
| Pessoa de castigo | Lê tudo, mas não reage nem responde enquanto durar o castigo. |
| Servidor do ToFalany | Guarda reações e o vínculo da resposta, confere permissões e avisa todos na hora. |

## 4. Escopo
**Dentro:**
- Reações com emoji padrão (Unicode) em mensagens de canal e de DM.
- Seletor de emoji com busca por nome em português, categorias e "usados recentemente".
- Ver quem reagiu.
- Responder a uma mensagem, em canal e em DM, com o trecho da original acima da resposta e um atalho para ir até ela.
- Aviso a quem foi respondido, com a opção de não avisar.
- Entrada na janela de novidades da 0.16.0.

**Fora (explícito):**
- Busca e envio de GIF por serviço externo: demanda posterior.
- Emojis próprios de cada servidor (imagens enviadas pelo servidor).
- Emoji dentro do texto da mensagem pelo seletor. Hoje dá para colar ou digitar pelo teclado do sistema, e isso continua igual.
- Tópicos ou conversas paralelas (threads).
- Moderador tirar reações de outras pessoas. Apagar a mensagem continua apagando tudo.
- Reações no histórico de auditoria.
- Notificar o autor quando alguém reage.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Reage e responde quem pode enviar mensagens naquele lugar: num canal, quem tem "Enviar mensagens"; numa DM, as duas pessoas da conversa. Quem está de castigo perde isso enquanto durar o castigo, como já acontece com enviar mensagens. | Assistente (segue a permissão que já existe) |
| RN-2 | Cada pessoa pode pôr cada emoji uma vez por mensagem. Clicar de novo no mesmo emoji tira a reação dela. A pessoa pode usar vários emojis diferentes na mesma mensagem. | Usuário, 16/11 |
| RN-3 | Uma mensagem tem no máximo **20 emojis diferentes**. Atingido o limite, só dá para somar aos emojis que já estão nela. | Assistente (evita abuso) |
| RN-4 | Só emojis Unicode padrão são aceitos como reação. O servidor recusa qualquer outro texto. | Assistente |
| RN-5 | Reações aparecem debaixo da mensagem, cada emoji com a contagem e na ordem em que foi usado pela primeira vez. O emoji que a própria pessoa usou aparece destacado. | Assistente |
| RN-6 | Apagar a mensagem apaga as reações dela. Editar a mensagem mantém as reações. | Assistente |
| RN-7 | Reagir não envia aviso a ninguém e não conta como mensagem não lida. | Assistente |
| RN-8 | Uma resposta é uma mensagem normal, com tudo o que uma mensagem tem (anexos, @marcações, editar, apagar), mais o vínculo com a mensagem original. Só dá para responder a uma mensagem do mesmo canal ou da mesma DM. | Assistente |
| RN-9 | A resposta mostra, acima do texto, o nome do autor da original e o começo dela, com até 100 caracteres em uma linha. Se a original só tem anexo, aparece "Anexo". Se a original foi editada, o trecho mostra o texto atual. | Assistente |
| RN-10 | Se a original for apagada, a resposta continua no lugar e o trecho vira "Mensagem original apagada", sem atalho. | Assistente |
| RN-11 | Quem é respondido recebe o mesmo aviso e o mesmo destaque de quando é marcado com @. Por padrão o aviso vai; quem responde pode desligá-lo antes de enviar. Responder a si mesmo não avisa ninguém. | Usuário, 16/11 (aviso como menção) |
| RN-12 | O aviso de resposta segue as mesmas preferências de quem recebe: conversa silenciada e notificações desligadas valem como valem para menções. | Assistente (decorre de RN-11) |
| RN-13 | Clicar no trecho leva até a original e a destaca por alguns segundos. Se ela estiver no histórico que ainda não foi carregado, o app carrega até ela. | Usuário, 16/11 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Ao passar o mouse numa mensagem (ou focar com o teclado), aparecem as ações **Reagir** e **Responder**, junto com Editar e Apagar quando a pessoa pode. | RN-1 |
| RF-2 | **Reagir** abre o seletor de emoji: campo de busca, "Usados recentemente" (até 16, guardados no aparelho) e categorias. Escolher um emoji reage e fecha o seletor. | RN-2, RN-3, RN-4 |
| RF-1a | Ao passar o mouse, além de Reagir, aparecem 👍 😂 ❤️ para reagir com um clique. | RN-2 |
| RF-3 | Debaixo da mensagem, cada reação é um botão com o emoji e a contagem. Clicar soma ou tira a própria reação. Um botão "+" ao lado abre o seletor. | RN-2, RN-3, RN-5 |
| RF-4 | Passar o mouse (ou focar) numa reação mostra quem reagiu: até 10 nomes e "e mais N". | RN-5 |
| RF-5 | Reagir, tirar a reação e apagar a mensagem aparecem para todos que estão vendo a conversa, sem recarregar. | RN-2, RN-6 |
| RF-6 | **Responder** coloca no compositor uma faixa "Respondendo a {nome}", com o trecho da original, o botão "Avisar" (ligado por padrão) e um X para cancelar. Enviar manda a mensagem como resposta, e Esc cancela. | RN-8, RN-11 |
| RF-7 | A resposta mostra o trecho da original acima do próprio texto. Clicar nele leva até a original. | RN-9, RN-10, RN-13 |
| RF-8 | Quem foi respondido (com o aviso ligado) vê a resposta destacada e recebe a notificação, como numa menção. | RN-11, RN-12 |
| RF-9 | A janela de novidades da 0.16.0 apresenta reações e respostas. | — |

## 7. Requisitos não funcionais
- **Validação no servidor.** Permissão, emoji válido, limite de 20 e o vínculo da resposta ao mesmo canal ou DM são conferidos no servidor. Um app alterado não deve conseguir burlar essas regras.
- **Sem duplicar.** Dois cliques rápidos ou duas abas não geram reação dupla da mesma pessoa com o mesmo emoji.
- **Desempenho.** Abrir um canal com 50 mensagens cheias de reações continua levando o mesmo tempo de hoje, com as reações vindo junto da página e não uma consulta por mensagem.
- **Compatibilidade.** Apps de versões anteriores continuam funcionando. Eles mostram a resposta como mensagem comum, sem o trecho, e não mostram as reações. O servidor novo aceita mensagens sem vínculo de resposta.
- **Acessibilidade.** Reações e ações funcionam por teclado. Cada botão de reação diz, para o leitor de tela, o emoji, quantas pessoas reagiram e se a própria pessoa está entre elas.
- **Textos.** Nenhum texto nem comentário cita outro aplicativo.

## 8. Critérios de aceite
- **CA-1** (RF-2, RF-3) — Dado a ana num canal, quando ela reage com 👍 à mensagem do beto, então aparece "👍 1" debaixo da mensagem, destacado para ela.
- **CA-2** (RF-3) — Dado "👍 1" da ana, quando ela clica nele, então a reação some. Quando clica de novo, ela volta.
- **CA-3** (RF-5) — Dado a ana e o beto com o mesmo canal aberto, quando a ana reage, então o beto vê a reação sem recarregar. Quando a ana tira a reação, ela some para o beto.
- **CA-4** (RF-4) — Dado 👍 da ana e do beto, quando a carla passa o mouse no 👍, então vê "ana e beto".
- **CA-5** (RN-3) — Dado uma mensagem com 20 emojis diferentes, quando alguém tenta um 21º, então o servidor recusa e o app avisa. Somar a um dos 20 continua funcionando.
- **CA-6** (RN-4) — Dado uma chamada direta ao servidor com o texto "abc" como reação, então o servidor responde com erro e nada é gravado.
- **CA-7** (RN-1) — Dado a ana de castigo, quando ela abre a mensagem, então não vê Reagir nem Responder, e uma chamada direta ao servidor para reagir é recusada.
- **CA-8** (RN-6) — Dado uma mensagem com reações, quando ela é apagada, então as reações somem junto. Quando é editada, as reações continuam.
- **CA-9** (RN-7) — Dado o beto com outra conversa aberta, quando a ana reage à mensagem dele, então o beto não recebe notificação e o contador de não lidas não muda.
- **CA-10** (RF-6, RF-7) — Dado a ana, quando ela clica em Responder na mensagem do beto, escreve "concordo" e envia, então a nova mensagem mostra acima "beto" e o começo da mensagem dele.
- **CA-11** (RF-7, RN-13) — Dado uma resposta a uma mensagem que está 200 mensagens acima, quando a ana clica no trecho, então o app carrega o histórico até a original, rola até ela e a destaca.
- **CA-12** (RN-10) — Dado uma resposta, quando a original é apagada, então o trecho vira "Mensagem original apagada" para todos, sem recarregar.
- **CA-13** (RN-9) — Dado uma original que só tem uma imagem, quando alguém responde, então o trecho mostra "Anexo". Dado uma original editada, o trecho mostra o texto novo.
- **CA-14** (RF-8, RN-11) — Dado o beto com outra conversa aberta e notificações ligadas, quando a ana responde a ele com Avisar ligado, então o beto recebe notificação e vê a resposta destacada.
- **CA-15** (RN-11) — Dado a ana respondendo ao beto com Avisar desligado, então o beto não recebe notificação e a resposta não aparece destacada para ele. O mesmo vale quando a ana responde a si mesma.
- **CA-16** (RN-8) — Dado uma chamada direta ao servidor respondendo, num canal, a uma mensagem de outro canal, então o servidor recusa.
- **CA-17** (RF-6) — Dado a faixa "Respondendo a beto" no compositor, quando a ana aperta Esc ou o X, então a faixa some e a próxima mensagem sai sem vínculo.
- **CA-18** (RN-1, RF-1..RF-8) — Dado uma DM entre ana e beto, então reagir e responder funcionam como no canal.
- **CA-19** (RF-1, acessibilidade) — Dado só o teclado, quando a ana foca uma mensagem, então ela alcança Reagir e Responder, e o leitor de tela lê "👍, 2 reações, inclusive você".
- **CA-20** (compatibilidade) — Dado um app 0.15.4 conectado ao servidor novo, quando chega uma resposta com reações, então ele mostra a mensagem como comum, sem erro.

## 9. Impacto em consumidores
- **Apps 0.15.x:** continuam funcionando, sem ver reações nem trechos (CA-20). O aviso de atualização já leva o grupo à versão nova.
- **ToOuvini (bot de música):** não usa o chat, então não muda nada.
- **Banco:** ganha dados novos (reações e o vínculo da resposta). O backup automático antes da migração continua valendo.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | Atalhos rápidos: mostrar, ao passar o mouse, 3 emojis fixos (👍 😂 ❤️) para reagir com um clique, além do seletor completo? Recomendo que sim. | Usuário | Sim (aprovação, 16/11). |
| D-2 | O aviso de resposta vem ligado por padrão (RN-11). Está bom assim? | Usuário | Sim, ligado por padrão (aprovação, 16/11). |
| D-3 | O limite de 20 emojis diferentes por mensagem (RN-3) está bom? | Usuário | Sim, 20 (aprovação, 16/11). |
