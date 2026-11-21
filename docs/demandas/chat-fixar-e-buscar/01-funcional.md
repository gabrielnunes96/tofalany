# Fixar e buscar mensagens: especificação funcional

> Demanda: `chat-fixar-e-buscar` · Versão 1 · 21/11/2026 · Situação: **aprovada em 21/11/2026**

## 1. Objetivo
Achar de novo o que importa na conversa:
- **fixar:** guardar as mensagens importantes de um canal ou DM numa lista à mão (item 26);
- **buscar:** procurar mensagens por texto, com filtros simples, e ir direto até a mensagem achada (item 25).

## 2. Contexto
- **Pedidos de 17/11.** Hoje, para achar uma mensagem antiga, a pessoa rola o histórico até ela.
- **Já existe "ir até a mensagem":** a resposta leva até a original, carregando o histórico até ela e destacando-a. Fixadas e resultados de busca usam o mesmo caminho.
- **Permissões:** os cargos têm permissões marcáveis (ex.: "Apagar mensagens"). Não existe uma de fixar.
- **Pessoas:** o grupo (usa) e quem administra o servidor (dá a permissão nos cargos).

## 3. Atores
| Ator | Papel |
| --- | --- |
| Membro | Vê as fixadas, busca e vai até a mensagem |
| Membro com "Fixar mensagens" | Fixa e desafixa nos canais |
| Participante de uma DM | Fixa e desafixa nessa DM (os dois) |
| Administrador do servidor | Dá a permissão "Fixar mensagens" aos cargos (o administrador já tem) |

## 4. Escopo
**Dentro:**
- Fixar e desafixar uma mensagem num canal de texto ou numa DM, pelo menu da mensagem.
- Botão "Fixadas" no topo da conversa, com a lista; clicar num item leva até a mensagem.
- Linha "fulano fixou uma mensagem" no chat, clicável, sem notificar (D-3).
- Permissão nova "Fixar mensagens" nos cargos (D-1).
- Limite de 50 fixadas por conversa (D-4).
- Campo "Buscar" no topo da conversa (canal ou DM), com os filtros: de quem, em qual canal (conversa aberta ou todos os canais do servidor, D-2), com anexo, com GIF.
- Resultados com autor, data, canal e o trecho achado em destaque; clicar leva até a mensagem.

**Fora (explícito):**
- Busca entre servidores diferentes, ou de canais e DMs numa busca só (D-2).
- Busca dentro do conteúdo de arquivos anexados (PDF, imagens); só o nome do arquivo conta.
- Filtros por data e operadores de busca (aspas, "-palavra").
- Notificação (som ou aviso do sistema) ao fixar.
- Fixar em canal de voz (não tem chat próprio).

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Num canal, só quem tem "Fixar mensagens" fixa e desafixa. O administrador do servidor tem sempre. Quem está de castigo não fixa. | D-1 |
| RN-2 | Numa DM, os dois participantes fixam e desafixam. | Item 26 |
| RN-3 | No máximo 50 fixadas por conversa. A 51ª é recusada com o aviso para desafixar uma antes. | D-4 |
| RN-4 | Fixar aparece no chat como uma linha "fulano fixou uma mensagem", clicável e sem notificação. Desafixar não gera linha. | D-3 |
| RN-5 | Mensagem apagada sai da lista de fixadas. Mensagem editada aparece na lista com o texto atual. | Coerência com o chat |
| RN-6 | A busca só devolve mensagens que a pessoa pode ver hoje: canais do servidor aberto em que ela pode ler, e as DMs de que ela participa. | Item 25 |
| RN-7 | A busca começa na conversa aberta. No canal, um filtro troca para "todos os canais do servidor". Na DM, a troca é para "todas as minhas DMs". | D-2 |
| RN-8 | A busca não diferencia maiúsculas de minúsculas nem acentos ("voce" acha "você") e acha palavras pelo começo ("jog" acha "jogo"). | Uso em português |
| RN-9 | A busca pede pelo menos 2 letras, ou só filtros (ex.: "com anexo" sem texto). | Evitar busca vazia |
| RN-10 | Anexo conta pelo nome do arquivo; GIF conta como "com GIF", não pelo texto. | Item 25 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | O menu da mensagem deve ter "Fixar" (ou "Desafixar", se já fixada) para quem pode, num canal de texto ou numa DM. | RN-1, RN-2, RN-3 |
| RF-2 | O topo da conversa deve ter o botão "Fixadas", com a lista da conversa (autor, data, trecho e quem fixou), da mais nova para a mais antiga; clicar num item leva até a mensagem. Quem pode fixar desafixa pela lista também. | RN-1, RN-2, RN-5 |
| RF-3 | Fixar deve aparecer para todos na conversa na hora (lista e linha no chat), sem recarregar. | RN-4 |
| RF-4 | A permissão "Fixar mensagens" deve aparecer na tela de cargos, desmarcada para cargos que já existem e para os novos. | RN-1 |
| RF-5 | O topo da conversa deve ter o campo "Buscar"; Enter busca e mostra os resultados num painel ao lado, mais novos primeiro, 25 de cada vez, com "Mais resultados". | RN-6, RN-8, RN-9 |
| RF-6 | O painel de busca deve ter os filtros: de quem (lista de pessoas), onde (conversa aberta / todos os canais do servidor ou todas as minhas DMs), com anexo, com GIF. | RN-7, RN-10 |
| RF-7 | Cada resultado deve mostrar autor, data, nome do canal (quando a busca é no servidor todo) e o trecho com as palavras achadas em destaque; clicar leva até a mensagem e a destaca, abrindo o canal se for outro. | RN-6 |
| RF-8 | Mensagens antigas (de antes desta versão) também devem ser achadas. | RN-6 |

## 7. Requisitos não funcionais
- **Tempo da busca:** até 500 ms no servidor para 100 mil mensagens (a VM tem hoje bem menos).
- **Segurança:** a busca e a lista de fixadas não podem devolver nada de conversa que a pessoa não vê (RN-6), nem para quem chama a API direto.
- **Auditoria:** fixar e desafixar em canal entram na auditoria do servidor (quem, qual mensagem, qual canal).
- **Compatibilidade:** app antigo conectado a servidor novo continua funcionando (só não vê os recursos novos).

## 8. Critérios de aceite
- **CA-1** (RF-1, RN-1): Dado um membro sem "Fixar mensagens", quando abre o menu de uma mensagem do canal, então não vê "Fixar"; e a chamada direta à API é recusada (403).
- **CA-2** (RF-1, RF-4): Dado um cargo com "Fixar mensagens" marcada, quando alguém com esse cargo escolhe "Fixar" numa mensagem, então ela entra na lista "Fixadas" do canal.
- **CA-3** (RN-2): Dado uma DM entre Ana e Bia, quando Bia fixa uma mensagem de Ana, então as duas a veem na lista "Fixadas" da DM, e as duas podem desafixar.
- **CA-4** (RN-3): Dado um canal com 50 fixadas, quando alguém tenta fixar mais uma, então recebe "Este canal já tem 50 mensagens fixadas. Desafixe uma antes." e a lista continua com 50.
- **CA-5** (RF-3, RN-4): Dado duas pessoas no mesmo canal, quando uma fixa uma mensagem, então a outra vê, sem recarregar, a linha "fulano fixou uma mensagem" e a mensagem na lista; e nenhum aviso do sistema (notificação ou som) é disparado.
- **CA-6** (RF-2): Dado uma fixada de 3 meses atrás, quando a pessoa clica nela na lista, então o chat carrega o histórico até ela e a destaca.
- **CA-7** (RN-5): Dado uma mensagem fixada, quando ela é apagada, então some da lista de fixadas para todos; quando é editada, a lista mostra o texto novo.
- **CA-8** (RF-5, RN-8): Dado a mensagem "Você vai jogar hoje?", quando alguém busca "voce jog", então ela aparece nos resultados com "Você" e "jogar" em destaque.
- **CA-9** (RN-6): Dado um canal que a pessoa não pode ler (ou uma DM de outras duas pessoas), quando ela busca uma palavra que só existe lá, pelo app ou pela API, então nenhum resultado vem.
- **CA-10** (RF-6, RN-7): Dado o canal #geral aberto, quando a pessoa busca "churrasco" com "todos os canais do servidor", então vêm resultados de #geral e de outros canais, cada um com o nome do canal; com "conversa aberta", só de #geral.
- **CA-11** (RF-6, RN-10): Dado mensagens com anexo "planilha.xlsx" e com GIF, quando a pessoa marca "com anexo" sem texto, então vêm só as com anexo; buscando "planilha", vem a do anexo; marcando "com GIF", vêm só as com GIF.
- **CA-12** (RF-6): Dado o filtro "de quem" com Ana, quando a pessoa busca "ok", então só vêm mensagens da Ana.
- **CA-13** (RF-7): Dado um resultado de outro canal, quando a pessoa clica nele, então o app abre esse canal, carrega o histórico até a mensagem e a destaca.
- **CA-14** (RF-8): Dado mensagens enviadas antes da atualização do servidor, quando a pessoa busca uma palavra delas, então elas aparecem.
- **CA-15** (RN-9): Dado o campo com 1 letra e nenhum filtro, quando a pessoa aperta Enter, então o app pede "Digite pelo menos 2 letras" e não busca.
- **CA-16** (RNF desempenho): Dado um banco de teste com 100 mil mensagens, quando se busca uma palavra comum no servidor todo, então a resposta chega em até 500 ms.

## 9. Impacto em consumidores
- **App:** menu da mensagem, topo da conversa (Fixadas e Buscar), painel de resultados, tela de cargos.
- **Servidor:** rotas novas, permissão nova, índice de texto montado na primeira subida da versão (com as mensagens que já existem).
- **App antigo com servidor novo:** a linha "fulano fixou" pode chegar como mensagem desconhecida; tratado na técnica.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | ~~No canal, quem fixa?~~ | Gabriel | 21/11: permissão nova "Fixar mensagens" no cargo; o administrador já tem. |
| D-2 | ~~Onde a busca procura?~~ | Gabriel | 21/11: começa na conversa aberta; filtro para todos os canais do servidor (ou todas as minhas DMs). |
| D-3 | ~~Avisar no chat ao fixar?~~ | Gabriel | 21/11: linha discreta, clicável, sem notificar. |
| D-4 | ~~Limite de fixadas?~~ | Gabriel | 21/11: 50 por conversa. |
