# Mover membros e sala de AFK — especificação funcional

> Demanda: `mover-e-afk` · Versão 2 · 21/11/2026 · Situação: **aprovada em 21/11/2026** (v2: RN-13 a RN-15, respostas do Gabriel na técnica)

## 1. Objetivo
Organizar quem está nas salas de voz:
- quem modera leva alguém para outra sala, ou tira da chamada, sem pedir que a pessoa clique;
- quem saiu do computador vai sozinho para uma sala de AFK, sem ocupar a sala onde o grupo conversa.

## 2. Contexto
- **Hoje:** cada pessoa entra e sai das salas de voz sozinha. A moderação já tem castigo, expulsar e banir, e o castigo já tira a pessoa da voz pelo servidor (o app dela sai sozinho).
- **Ausente:** o app já marca a pessoa como "ausente" com 10 min sem teclado e mouse, e sabe quando ela fala (detecção de voz).
- **Pessoas:** o grupo nas salas de voz e quem administra ou modera o servidor.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Quem tem "Mover membros" | Move pessoas entre salas e desconecta da chamada (o administrador sempre pode) |
| Administrador do servidor | Escolhe a sala de AFK e o tempo |
| Membro em chamada | É movido (por alguém ou por inatividade) |

## 4. Escopo
**Dentro:**
- Permissão nova "Mover membros" nos cargos.
- Mover alguém que está em chamada para outra sala de voz do mesmo servidor: arrastando o nome da pessoa para a outra sala, ou pelo menu da pessoa → "Mover para…".
- "Desconectar da chamada" pelo menu da pessoa (D-4).
- A pessoa movida troca de sala sozinha, mantendo microfone e câmera como estavam; a transmissão de tela recomeça na sala nova.
- Sala de AFK por servidor, escolhida pelo administrador, com tempo de 5, 10, 15, 30 ou 60 min (padrão 15, D-2), ou desligada.
- Ida automática para a AFK por inatividade (sem falar e sem mexer no computador pelo tempo escolhido), com aviso para a pessoa e som para quem fica.
- Na sala de AFK, ninguém fala (entra mutado e não desmuta).
- Ícone próprio da sala de AFK na lista de canais.
- Auditoria de mover, desconectar e da ida para a AFK.

**Fora (explícito):**
- Mover para sala de outro servidor.
- Puxar para uma sala quem não está em chamada.
- Voltar sozinho da AFK para a sala anterior (D-1).
- Mover várias pessoas de uma vez.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Só quem tem "Mover membros" move ou desconecta alguém; o administrador sempre pode. | Item 43, D-4 |
| RN-2 | Quem não é administrador não move nem desconecta um administrador. | Item 43 |
| RN-3 | Só se move quem está em chamada no servidor, para uma sala de voz que existe nesse servidor e que não é a sala onde ela já está. A pessoa movida precisa poder entrar na voz (sem castigo e com "Entrar na voz"). | Item 43 |
| RN-4 | A pessoa movida vê quem a moveu e para onde ("Ana moveu você para Jogos"); a desconectada vê "Ana desconectou você da chamada". | Item 43 |
| RN-5 | Microfone mutado, surdo e câmera continuam como estavam ao trocar de sala; a transmissão de tela para e a pessoa a recomeça na sala nova. | Item 43 |
| RN-6 | A sala de AFK é um canal de voz do servidor marcado pelo administrador, com tempo de 5, 10, 15, 30 ou 60 min (padrão 15) ou desligada. Apagar o canal desliga a AFK. | Item 42, D-2 |
| RN-7 | Vai para a AFK quem está numa sala de voz (que não é a de AFK) e passa o tempo escolhido sem falar e sem mexer no teclado e no mouse, inclusive se estiver sozinho na sala. | Item 42, D-3 |
| RN-8 | Não vai para a AFK quem está transmitindo a tela ou com a câmera ligada. | Item 42 |
| RN-9 | Na sala de AFK a pessoa fica mutada e não consegue desmutar enquanto estiver lá. | Item 42 |
| RN-10 | Quem foi para a AFK fica lá até escolher outra sala (D-1). | D-1 |
| RN-11 | Quem continua na sala original ouve o som de "saiu da voz" (o mesmo de hoje); quem foi movido vê o aviso "Você foi para a sala de AFK por inatividade". | Item 42 |
| RN-12 | Mover, desconectar e ir para a AFK entram na auditoria do servidor (quem, quem foi movido, de onde, para onde). | Item 43 |
| RN-13 | Quem não é administrador também não move nem desconecta quem tem "Mover membros" (igual à moderação de hoje). | D-5 |
| RN-14 | Tempo na sala de AFK não conta pontos da loja. | D-6 |
| RN-15 | Ao sair da AFK para outra sala, o microfone volta como estava antes de ir para a AFK. | D-7 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Os cargos devem ter a permissão "Mover membros" (desmarcada nos cargos que já existem). | RN-1 |
| RF-2 | Quem pode deve conseguir arrastar o nome de alguém da lista de uma sala de voz para outra sala de voz, e usar "Mover para…" (com a lista de salas) e "Desconectar da chamada" no menu da pessoa. | RN-1, RN-2, RN-3 |
| RF-3 | O app da pessoa movida deve trocar de sala sozinho, com o aviso de quem moveu, mantendo microfone e câmera. | RN-4, RN-5 |
| RF-4 | O administrador deve escolher a sala de AFK e o tempo (ou desligar) na edição do servidor. | RN-6 |
| RF-5 | O app deve levar a pessoa para a AFK depois do tempo de inatividade, avisando a pessoa. | RN-7, RN-8, RN-10, RN-11 |
| RF-6 | Na sala de AFK, o microfone fica mutado e o botão de desmutar não funciona. | RN-9 |
| RF-7 | A sala de AFK deve aparecer na lista com um ícone próprio. | RN-6 |
| RF-8 | Mover, desconectar e ida para a AFK devem entrar na auditoria. | RN-12 |

## 7. Requisitos não funcionais
- **Tempo de troca:** a pessoa movida está na sala nova em até 5 s (mesma ordem de entrar numa sala clicando).
- **Segurança:** o servidor confere tudo (permissão, cargo, sala, servidor); o app de quem é movido só obedece a um pedido vindo do servidor.
- **Compatibilidade:** app antigo com servidor novo: a pessoa movida é tirada da sala (como no castigo), mas não entra sozinha na nova.

## 8. Critérios de aceite
- **CA-1** (RF-1, RN-1): Dado um membro sem "Mover membros", quando abre o menu de alguém em chamada, então não vê "Mover para…" nem "Desconectar da chamada"; e o pedido direto ao servidor é recusado.
- **CA-2** (RF-2, RF-3): Dado Ana (com a permissão) e Bia na sala Papo, quando Ana arrasta Bia para a sala Jogos, então em até 5 s Bia está em Jogos, vê "Ana moveu você para Jogos" e continua com o microfone como estava.
- **CA-3** (RF-2): Dado Ana com a permissão e Bia em Papo, quando Ana usa "Mover para…" → Jogos no menu de Bia, então o resultado é o mesmo do CA-2.
- **CA-4** (RN-2): Dado Ana com a permissão (não administradora) e o administrador em chamada, quando Ana tenta movê-lo ou desconectá-lo, então o servidor recusa e ele continua onde está.
- **CA-5** (RN-3): Dado Bia de castigo (ou sem "Entrar na voz"), quando alguém tenta movê-la para outra sala, então o servidor recusa.
- **CA-6** (RF-2, RN-4): Dado Bia em chamada, quando Ana usa "Desconectar da chamada", então Bia sai da voz e vê "Ana desconectou você da chamada".
- **CA-7** (RN-5): Dado Bia com a câmera ligada e transmitindo a tela, quando é movida, então a câmera continua ligada na sala nova e a transmissão para (ela pode recomeçar).
- **CA-8** (RF-4, RN-6): Dado o administrador na edição do servidor, quando escolhe a sala "AFK" e 15 min, então a configuração fica gravada e a sala aparece com o ícone de AFK para todos.
- **CA-9** (RF-5, RN-7, RN-11): Dado AFK ligada com 5 min, quando Bia fica 5 min sem falar e sem mexer no computador numa sala (mesmo sozinha), então ela vai para a sala de AFK, vê "Você foi para a sala de AFK por inatividade" e quem estava com ela ouve o som de saída.
- **CA-10** (RN-8): Dado Bia transmitindo a tela ou com a câmera ligada, quando passa o tempo sem falar e sem mexer, então ela não é movida.
- **CA-11** (RN-7): Dado Bia falando (mas sem mexer no mouse) ou mexendo no mouse (sem falar), quando passa o tempo, então ela não é movida.
- **CA-12** (RF-6, RN-9): Dado Bia na sala de AFK, quando tenta desmutar, então continua mutada (o botão avisa que na AFK ninguém fala).
- **CA-13** (RN-10): Dado Bia na AFK, quando volta a mexer no computador, então continua na AFK até clicar noutra sala.
- **CA-14** (RF-8, RN-12): Dado um mover, um desconectar e uma ida para a AFK, então a auditoria mostra as três ações com quem fez, quem foi movido e as salas.
- **CA-15** (RN-6): Dado a sala de AFK apagada, então a AFK fica desligada e ninguém é movido.
- **CA-16** (RN-13): Dado Ana e Caio com "Mover membros" (nenhum administrador), quando Ana tenta mover Caio, então o servidor recusa.
- **CA-17** (RN-14): Dado duas pessoas na sala de AFK, quando passa um minuto, então nenhuma ganha pontos.
- **CA-18** (RN-15): Dado Bia com o microfone ligado ido para a AFK, quando ela entra noutra sala, então o microfone volta ligado; se estava mutada antes, volta mutada.

## 9. Impacto em consumidores
- **Servidor:** permissão nova, configuração de AFK por servidor (banco), eventos de mover e desconectar, auditoria.
- **App:** menu da pessoa, arrastar na lista de voz, troca de sala sozinha, edição do servidor, ícone de AFK, inatividade.
- **App antigo com servidor novo:** é tirado da sala ao ser movido, sem entrar na nova.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | ~~Ao voltar a mexer, sai da AFK sozinho?~~ | Gabriel | 21/11: não, fica na AFK até escolher outra sala. |
| D-2 | ~~Tempo padrão?~~ | Gabriel | 21/11: 15 min (5, 10, 15, 30 ou 60). |
| D-3 | ~~Sozinho na sala também vai?~~ | Gabriel | 21/11: sim. |
| D-4 | ~~"Mover membros" também desconecta?~~ | Gabriel | 21/11: sim, a mesma permissão. |
| D-5 | ~~Quem tem "Mover membros" move outro que também tem?~~ | Gabriel | 21/11: não; só o administrador. |
| D-6 | ~~AFK conta pontos?~~ | Gabriel | 21/11: não. |
| D-7 | ~~Ao sair da AFK, o microfone?~~ | Gabriel | 21/11: volta como estava antes. |
