# Busca de GIF — Especificação funcional

> Demanda: `busca-de-gif` · Versão 2 · 17/11/2026 · Situação: **aprovada** (v1 em 17/11; v2 segue a escolha "padrão Klipy" de 17/11)

## 1. Objetivo
Deixar a pessoa procurar um GIF por palavra e mandá-lo no chat sem sair do app. Hoje ela precisa achar o GIF fora, baixar e anexar.

## 2. Contexto
- O serviço de busca será a Klipy, que é grátis. A API da Tenor foi desligada em 30/06/2026, e a GIPHY cobra para uso em produção.
- A Klipy exige uma chave de API. O administrador da instalação cria a chave na conta dele e a coloca na configuração do servidor.
- Os requisitos de integração da Klipy (docs.klipy.com/attribution, lidos em 17/11) exigem três coisas:
  - o app chama a API e carrega os GIFs direto da Klipy, sem servidor no meio;
  - o GIF não é baixado nem guardado;
  - os resultados aparecem na ordem e na composição que a Klipy devolve.

  A filtragem se configura no painel da Klipy ou pelo parâmetro de filtro da própria API.
- A Klipy exige que o campo de busca mostre o texto "Search KLIPY". A marca "Powered by KLIPY" e os anúncios são opcionais, e os anúncios ficam desligados na chave.
- Até aqui o app só falava com o próprio servidor, fora o player do YouTube aberto pela pessoa. Esta demanda abre uma segunda exceção, só para os endereços da Klipy.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Membro | Abre a busca, procura um GIF, escolhe e envia. |
| Administrador da instalação | Cria a chave na Klipy, desliga os anúncios e pede a chave de produção no painel da Klipy, e coloca a chave na configuração do servidor. |
| Servidor do ToFalany | Entrega a chave ao app de quem está logado, valida e guarda a referência do GIF na mensagem. |
| Klipy | Responde às buscas e entrega os GIFs. |

## 4. Escopo
**Dentro:**
- Botão GIF no compositor, em canais e DMs.
- Painel com campo de busca. Sem nada digitado, mostra os GIFs em alta.
- O GIF escolhido vai numa mensagem, junto com o texto que já estava no compositor, e aparece animado no chat.
- Filtro de conteúdo moderado.
- Sem a chave configurada, o botão GIF não aparece.

**Fora (explícito):**
- Figurinhas, clipes com som e memes.
- Favoritos e recentes.
- GIF como reação.
- Anúncios.
- Guardar cópia do GIF no servidor.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | A busca e os GIFs vêm direto da Klipy para o app. O app só pode acessar os endereços da Klipy (api.klipy.com e static*.klipy.com), e só quando o servidor tem a busca ligada. | Termos da Klipy; escolha de 17/11 |
| RN-2 | A chave fica na configuração do servidor (`.env`), que a entrega só a quem está logado. Ela não aparece no repositório nem em log. A chave é visível para quem usa o app: os termos exigem que o app chame a Klipy diretamente. | Conversa de 16/11; termos da Klipy |
| RN-3 | A mensagem guarda a referência do GIF: o endereço na Klipy, o tamanho e a descrição. O servidor só aceita endereços https de static*.klipy.com. Se a Klipy tirar o GIF do ar, a mensagem mostra "GIF indisponível". | Termos da Klipy; D-1 revista |
| RN-4 | Pode enviar GIF quem pode enviar anexo ali. No canal, o cargo precisa de "Enviar arquivos", que o castigo tira. Na DM, podem as duas pessoas da conversa. | Segue a regra dos anexos |
| RN-5 | A busca usa o filtro de conteúdo da Klipy no nível médio (equivalente a PG-13). | D-2 |
| RN-6 | O app só busca depois de 300 ms sem digitar e não repete a mesma busca enquanto o painel está aberto. | Assistente |
| RN-7 | Sem chave configurada, o botão GIF não aparece. Com a Klipy fora do ar, o painel mostra "A busca de GIF está indisponível agora." e o resto do chat continua funcionando. | Assistente |
| RN-8 | No painel aparecem miniaturas leves; no chat, a versão média. O app avisa a Klipy de cada envio pelo registro de compartilhamento que os termos pedem. | Termos da Klipy |
| RN-9 | O campo de busca mostra "Search KLIPY". | Termos da Klipy (obrigatório) |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | O compositor tem um botão GIF ao lado do anexar, visível só quando o servidor tem a busca ligada. | RN-7 |
| RF-2 | O botão abre um painel com campo de busca, já com foco. Sem texto, o painel mostra os GIFs em alta; com texto, busca. Os resultados aparecem em grade, na ordem da Klipy, e mais resultados carregam conforme a rolagem. | RN-1, RN-5, RN-6, RN-9 |
| RF-3 | Clicar num GIF (ou dar Enter nele) envia a mensagem com o GIF e fecha o painel. Vão junto o texto do compositor e a resposta em andamento, se houver. | RN-3, RN-4, RN-8 |
| RF-4 | O GIF aparece animado na mensagem, no tamanho certo desde o início, para a tela não pular. A descrição do GIF vira o texto alternativo. | RN-3 |
| RF-5 | Apps 0.16.x, sem a função, veem o endereço do GIF como link na mensagem. | — |
| RF-6 | O painel funciona por teclado: setas na grade, Enter envia, Esc fecha e devolve o foco ao botão. | — |
| RF-7 | A janela de novidades da versão apresenta a busca de GIF. | — |

## 7. Requisitos não funcionais
- **Privacidade.**
  - O app só acessa a Klipy com a busca ligada.
  - Quem vê um GIF no chat expõe o próprio IP à Klipy, e quem busca envia o termo buscado. É o custo aceito do padrão da Klipy, avisado nas novidades.
  - O identificador de usuário mandado à Klipy é um código derivado, que não revela o nome nem o id da conta.
- **Custo.** O plano grátis tem dois tipos de chave:
  - a chave de teste permite 100 chamadas por hora para o grupo inteiro;
  - a de produção não tem limite e se pede no painel da Klipy, depois de cumprir a atribuição.
- **Desempenho.** O resultado aparece em até 2 s numa conexão normal.
- **Compatibilidade.** O app 0.16.x continua funcionando (RF-5).
- **Textos.** Nenhum texto cita outro aplicativo. A exceção é a marca do fornecedor, que os termos exigem (RN-9).

## 8. Critérios de aceite
- **CA-1** (RF-1, RN-7) — Dado um servidor sem chave, quando a ana abre um canal, então o botão GIF não aparece e o app não faz nenhum pedido à Klipy.
- **CA-2** (RN-4) — Dada a ana de castigo, quando ela tenta enviar um GIF, então o servidor recusa e o app mostra o motivo. Uma chamada direta ao servidor também é recusada.
- **CA-3** (RF-2) — Dado o painel aberto, quando a ana não digita nada, então aparecem os GIFs em alta. Quando digita "gato", então aparecem os resultados de "gato", na ordem devolvida.
- **CA-4** (RF-3, RF-4) — Dado o resultado "gato", quando a ana clica no primeiro GIF, então sai uma mensagem dela com o GIF animado e o beto a vê ao vivo.
- **CA-5** (RF-3) — Dados "olha isso" no compositor e uma resposta em andamento, quando a ana escolhe um GIF, então a mensagem sai com o texto, o GIF e o vínculo da resposta.
- **CA-6** (RN-1) — Dado o app aberto, então os únicos endereços fora do servidor a que ele acessa são os da Klipy, e só com a busca ligada.
- **CA-7** (RN-2) — Dado o servidor com a chave, quando alguém sem login pede a configuração da busca, então recebe 401, e a chave não aparece no log.
- **CA-8** (RN-3) — Dado um envio com endereço de GIF fora de static*.klipy.com, ou sem https, quando chega ao servidor, então é recusado.
- **CA-9** (RN-7) — Dada a Klipy fora do ar, quando a ana busca, então o painel mostra "A busca de GIF está indisponível agora." e o chat continua funcionando.
- **CA-10** (RN-8) — Dado o envio de um GIF, então o app registra o compartilhamento na Klipy, com o texto buscado.
- **CA-11** (RF-6) — Dado só o teclado, quando a ana abre o painel, então ela alcança a busca e a grade e envia com Enter. Esc fecha e devolve o foco ao botão GIF.
- **CA-12** (RF-5) — Dada uma mensagem com GIF, quando um app 0.16.x a recebe, então mostra o endereço do GIF como link.

## 9. Impacto em consumidores
- **Servidor:** ganha a variável `KLIPY_API_KEY` no `.env` e uma coluna na tabela de mensagens.
- **Apps 0.16.x:** veem o GIF como link.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | Anexo guardado ou link? | Usuário | Anexo (17/11), revisto para link na Klipy pelos termos (D-4). |
| D-2 | Nível do filtro? | Usuário | Moderado (17/11): `content_filter=medium`. |
| D-3 | Anúncio ou marca obrigatórios? | Usuário | Sem anúncio obrigatório: os anúncios são opcionais em cada chave. Obrigatório só o texto "Search KLIPY" no campo de busca. |
| D-4 | Os termos proíbem servidor no meio e cópia guardada sem aprovação escrita. | Usuário | Seguir o padrão Klipy (17/11). |
