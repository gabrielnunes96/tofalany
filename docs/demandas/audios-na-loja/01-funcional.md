# Áudios na loja, com raridade — especificação funcional

> Demanda: `audios-na-loja` · Item 28 do backlog · Versão 1 · 22/11/2026 · Situação: **rascunho**

## 1. Objetivo
Dar mais uma coisa para comprar com os pontos de voz: áudios curtos, com raridade (comum, raro, épico, lendário), que a pessoa compra na loja e passa a tocar no soundboard de qualquer servidor.

## 2. Contexto
- A loja (`pontos-e-loja`) é uma só para a instalação: o saldo e as compras valem em todos os servidores. Hoje vende temas e vales de transmissão, com preços na configuração do servidor (`PRECO_*`). O ganho está em 3 pontos por minuto em voz na VM (`PONTOS_POR_MINUTO=3`).
- O soundboard (Painel do soundboard, na sala de voz) tem até 5 sons por servidor, iguais para todos, cadastrados por quem tem "Gerenciar sons" (Configurações do servidor → Sons). Cada som tem até 10 s e 2 MB (MP3, OGG ou WAV). Tocar exige "Soundboard" (`tocar_sons`), com intervalo mínimo de 3 s entre toques.
- A funcional da loja deixou "sons" como item para depois (seção 4, Fora); esta demanda é esse depois.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Administrador da instalação | Cadastra, troca a raridade e tira áudios da loja. Tem todos os áudios sem comprar. |
| Membro | Ouve a prévia, compra com pontos e toca os áudios comprados no soundboard. |
| Quem está na sala de voz | Ouve o áudio tocado, como qualquer som do soundboard. |
| Servidor do ToFalany | Guarda os áudios, as compras e o saldo; confere quem pode tocar cada áudio. |

## 4. Escopo
**Dentro:**
- Cadastro de áudios da loja pelo administrador da instalação: arquivo, nome e raridade.
- Seção "Áudios" na loja, com a cor e o brilho da raridade, o preço, o botão de ouvir e o de comprar.
- Preço por raridade, ajustável na configuração do servidor.
- Seção "Meus sons" no soundboard, com os áudios comprados.
- Tirar da loja um áudio (quem comprou continua com ele).
- Auditoria de cadastro, troca de raridade e retirada.

**Fora (explícito):**
- Preço próprio por áudio (o preço vem só da raridade).
- Membro enviar áudio para a loja, vender ou dar áudio para outra pessoa.
- Sorteio, caixa surpresa ou qualquer compra às cegas: a pessoa sempre sabe qual áudio está comprando.
- Devolução de pontos (a loja não devolve, RN-13 de `pontos-e-loja`).
- Mudar os sons do servidor (os 5 de hoje continuam como estão).
- Buscar ou baixar áudios de sites de sons pelo app: o administrador baixa fora e envia o arquivo.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Só o administrador da instalação cadastra, troca a raridade e tira áudios da loja. | Usuário, 22/11 |
| RN-2 | Cada áudio tem uma raridade: **comum** (cinza, sem brilho), **raro** (azul, brilho médio), **épico** (roxo, brilho forte) ou **lendário** (dourado, brilho alto e forte). | Pedido de 17/11 |
| RN-3 | O preço vem da raridade. Padrão: comum 100, raro 300, épico 800, lendário 2000. Os quatro valores ficam na configuração do servidor, como os preços de hoje. | Usuário, 22/11 |
| RN-4 | O preço cobrado é o da raridade no momento da compra; mudar a raridade ou o preço depois não mexe em quem já comprou. | Assistente |
| RN-5 | O áudio comprado é da pessoa para sempre e vale em todos os servidores da instalação. Não se compra o mesmo áudio duas vezes. | Usuário, 22/11 |
| RN-6 | O administrador da instalação tem todos os áudios da loja sem comprar (como os temas). | Assistente (segue RN-11 de `pontos-e-loja`) |
| RN-7 | Os mesmos limites do soundboard: MP3, OGG ou WAV de verdade (pelo conteúdo), até 10 s e até 2 MB; nome de 1 a 32 caracteres. | Pedido de 17/11 (o soundboard já tem) |
| RN-8 | Tirar um áudio da loja: ninguém mais compra; quem já comprou continua com ele em "Meus sons". O arquivo só é apagado quando ninguém mais tem o áudio. | Usuário, 22/11 |
| RN-9 | No soundboard, a seção "Meus sons" mostra todos os áudios comprados, sem limite de quantidade, abaixo dos sons do servidor. Só quem comprou vê e toca os seus; todos da sala ouvem. | Usuário, 22/11 |
| RN-10 | Tocar um áudio comprado segue as regras de tocar um som do servidor: estar na sala de voz, ter "Soundboard" no cargo daquele servidor e o intervalo de 3 s entre toques (contando sons do servidor e comprados juntos). Quem está de castigo não toca. | Assistente |
| RN-11 | Na sala de AFK ninguém toca som (nem do servidor, nem comprado). | Assistente (segue RN-9 de `mover-e-afk`) |
| RN-12 | Ouvir a prévia na loja é livre e toca só para a própria pessoa, sem precisar estar em voz. | Pedido de 17/11 |
| RN-13 | O administrador só envia áudios que pode usar (licença que permita uso e redistribuição no grupo). O app mostra esse lembrete no cadastro; a conferência é dele. | Pedido de 17/11 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Em Configurações → Loja (só para o administrador da instalação), a lista de áudios da loja com nome, raridade, duração e quantas pessoas compraram; botões de cadastrar, trocar raridade, renomear, ouvir e tirar da loja. | RN-1, RN-2, RN-7, RN-8, RN-13 |
| RF-2 | Na loja, a seção "Áudios", ordenada por raridade (lendário primeiro) e depois por nome. Cada áudio mostra nome, duração, raridade (cor, brilho e o nome da raridade por escrito), preço, "Ouvir" e "Comprar" (ou "Comprado"). | RN-2, RN-3, RN-5, RN-6, RN-12 |
| RF-3 | Comprar um áudio pede confirmação com nome, raridade e preço, desconta o saldo e entra no extrato ("Áudio: <nome>"). | RN-3, RN-4, RN-5 |
| RF-4 | No soundboard, a seção "Meus sons" com os áudios comprados (cor da raridade na borda). Sem compras, a seção mostra "Compre áudios na loja" com o atalho para a loja. | RN-9, RN-10, RN-11 |
| RF-5 | Ao tocar um áudio comprado, todos da sala ouvem e veem "<pessoa> tocou <áudio>", como nos sons do servidor; o volume do soundboard e o surdo de cada um valem igual. | RN-9, RN-10 |
| RF-6 | Configuração do servidor com o preço de cada raridade (`PRECO_AUDIO_COMUM`, `PRECO_AUDIO_RARO`, `PRECO_AUDIO_EPICO`, `PRECO_AUDIO_LENDARIO`). | RN-3 |
| RF-7 | Auditoria: áudio cadastrado, raridade trocada, áudio tirado da loja (com nome e raridade). A compra fica no extrato da pessoa, como as de hoje. | RN-1, RN-8 |

## 7. Requisitos não funcionais
- Cada pessoa baixa a prévia só quando clica em "Ouvir" (a loja não baixa todos os áudios ao abrir).
- A loja continua abrindo em até 1 s com 100 áudios cadastrados.
- O brilho das raridades respeita "reduzir movimento" do sistema (sem pulsar quando ele estiver ligado) e tem contraste legível nos temas claros e escuros; a raridade também aparece por escrito, não só pela cor.

## 8. Critérios de aceite
- **CA-1** (RN-1): Dado um membro (mesmo administrador de outro servidor), quando tenta cadastrar, trocar a raridade ou tirar um áudio da loja, então é recusado; o administrador da instalação consegue.
- **CA-2** (RN-7): Dado um arquivo que não é áudio (mesmo com nome .mp3), com mais de 10 s ou mais de 2 MB, quando o administrador cadastra, então é recusado com a mensagem do motivo.
- **CA-3** (RN-2, RN-3, RF-2): Dado um áudio raro cadastrado, quando Ana abre a loja, então vê o áudio na seção "Áudios" com a cor azul, o texto "Raro" e o preço 300.
- **CA-4** (RN-12): Dado Ana fora da voz, quando clica em "Ouvir", então o áudio toca só no app dela e ninguém mais ouve.
- **CA-5** (RN-3, RN-5, RF-3): Dado Ana com 350 pontos, quando compra o áudio raro, então o saldo fica 50, o extrato mostra "Áudio: <nome>" com −300 e o botão vira "Comprado".
- **CA-6** (RN-5): Dado Ana com o áudio comprado, quando tenta comprar de novo (inclusive por duas chamadas ao mesmo tempo), então é cobrada uma vez só.
- **CA-7**: Dado Ana com 200 pontos, quando tenta comprar um áudio épico (800), então é recusado e o saldo não muda.
- **CA-8** (RN-5, RN-9, RF-4): Dado Ana com o áudio comprado, quando entra numa sala de voz de **outro** servidor, então o áudio aparece em "Meus sons" e ela consegue tocar; Bia, na mesma sala, ouve e vê "Ana tocou <áudio>".
- **CA-9** (RN-9): Dado Bia sem o áudio, quando abre o soundboard, então não vê o áudio da Ana; e se mandar ao servidor o pedido de tocá-lo, é recusado.
- **CA-10** (RN-10, RN-11): Dado Ana sem "Soundboard" no cargo, de castigo, na sala de AFK ou fora da voz, quando tenta tocar um áudio comprado, então é recusado; e dois toques em menos de 3 s (um do servidor e um comprado) recusam o segundo.
- **CA-11** (RN-4): Dado o áudio comprado por 300 como raro, quando o administrador o passa para lendário, então Ana continua com ele e não paga nada; quem não comprou passa a ver o preço 2000.
- **CA-12** (RN-8): Dado o áudio comprado por Ana, quando o administrador tira da loja, então ele some da loja para todos, continua em "Meus sons" da Ana e ela continua tocando; quem não comprou não consegue mais comprar.
- **CA-13** (RN-6): Dado o administrador da instalação, quando abre a loja e o soundboard, então todos os áudios da loja aparecem como dele, sem comprar.
- **CA-14** (RF-6): Dado `PRECO_AUDIO_RARO=250` na configuração, quando o servidor reinicia, então o áudio raro custa 250 na loja e na compra.
- **CA-15** (RF-7): Dado o cadastro, a troca de raridade e a retirada de um áudio, quando o administrador abre a auditoria, então vê os três registros com quem fez, o nome e a raridade.

## 9. Impacto em consumidores
- App antigo (sem esta versão): não mostra a seção de áudios nem "Meus sons"; continua funcionando com a loja e o soundboard de hoje. Ninguém perde nada.
- Servidor: novos itens no contrato da loja e do soundboard (opcionais para o app antigo); quatro configurações novas com valor padrão (não é preciso mexer na VM).

## 10. Dúvidas em aberto
| # | Dúvida | Para quem |
| --- | --- | --- |
| D-1 | De qual site virão os áudios e qual a licença (ex.: domínio público ou CC0 permitem; "uso pessoal" não). O app só lembra no cadastro (RN-13). | Usuário (administrador) |
| D-2 | Limite de áudios cadastrados na loja: proposta de 200 no total (só para evitar abuso de espaço; 200 × 2 MB = 400 MB no pior caso). | Usuário |
