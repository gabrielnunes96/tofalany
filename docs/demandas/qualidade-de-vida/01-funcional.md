# Qualidade de vida: especificação funcional

> Demanda: `qualidade-de-vida` · Versão 2 · 20/11/2026 · Situação: **aprovada em 20/11/2026**

## 1. Objetivo
Tirar quatro atritos do uso diário:
- o administrador só configura o ToOuvini estando no servidor principal;
- convidar alguém para outro servidor exige copiar o link e mandar à mão;
- atualizar o app exige ir até Configurações → Novidades e depois esperar o aviso;
- o status (online, ausente…) chega a contas que não têm relação com a pessoa.

## 2. Contexto
- **Item 32 (19/11):** a tela "Bot de música (ToOuvini)" (subir cookies, ver a situação) só aparece no menu estando no servidor principal (`servidorId === 1`). As rotas `/api/admin/musica*` exigem o principal, e o app chama a API do servidor aberto.
- **Item 44 (20/11):** o convite de cada servidor já existe (Configurações do servidor → Convite, para quem tem "Gerenciar convite"). O cartão da pessoa (mini perfil, 0.17.0) tem "Mensagem", "Ver perfil" e o campo de mensagem, mas não tem convite.
- **Item 29, parte do app (19/11):** "Procurar atualização" fica só em Configurações → Novidades. Ao achar versão, ele baixa e espera o aviso de reiniciar no canto da tela. Pedido: um botão bem à vista que procura e, se houver versão, já baixa e instala. A parte do servidor ("Atualizar o servidor agora") fica na demanda `infra-e-atualizacao`.
- **Item 48 (20/11):** o evento de status (`presenca:atualizada`) vai para todas as conexões da instalação, como a atividade ia antes da demanda `correcoes-atividade`. E quem sai de um servidor (ou é tirado) continua com a última atividade dos membros que ficaram, até ela mudar.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Administrador da instalação | Configura o ToOuvini (cookies, situação), de qualquer servidor |
| Membro | Convida amigos para os servidores em que está; atualiza o próprio app |
| Quem recebe o convite | Recebe a mensagem direta com o convite e entra pelo link |
| Quem vê o status | Amigo ou membro de servidor em comum |

## 4. Escopo
**Dentro:**
- ToOuvini acessível de qualquer servidor para o administrador da instalação (32).
- "Convidar para servidor" no cartão da pessoa e no menu da pessoa (clique direito) (44).
- Botão "Atualizar o app" no menu do usuário que procura, baixa e instala (29, app).
- Status só para quem pode ver; ao sair de um servidor, a atividade de quem ficou deixa de aparecer (48).

**Fora (explícito):**
- "Atualizar o servidor agora" e a trava do `vm.sh` (29, servidor): demanda `infra-e-atualizacao`.
- Convite para quem não é amigo nem membro de servidor em comum (só dá para abrir o cartão de quem a pessoa conhece).
- Mudar quem pode ver o convite em Configurações do servidor.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Só o administrador da instalação (administrador do servidor principal) configura o ToOuvini, de qualquer servidor. | Item 32 |
| RN-2 | Convidar para um servidor exige ter "Gerenciar convite" naquele servidor (ou ser administrador dele). (D-1) | Item 44 |
| RN-3 | A lista de "Convidar para servidor" mostra só os servidores em que eu estou e a pessoa não está nem está banida. | Item 44 |
| RN-4 | O convite chega como mensagem direta minha para a pessoa, com o nome do servidor e o link de convite atual dele. | Item 44 |
| RN-5 | "Atualizar o app" procura na hora; se houver versão nova, baixa e instala sem passar pelo aviso do canto, e reinicia sozinho; numa chamada de voz, pergunta antes "Reiniciar agora? Você vai sair da chamada." (D-2) | Item 29 |
| RN-6 | O status de alguém só chega à própria pessoa, a amigos e a membros de um servidor em comum, a mesma regra da atividade. | Item 48 |
| RN-7 | Quem deixa de estar num servidor em comum com alguém (e não é amigo) deixa de ver a atividade e o status dele na hora. | Item 48 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | O menu do servidor deve mostrar "Bot de música (ToOuvini)" ao administrador da instalação em qualquer servidor, e a tela deve ler e gravar sempre no servidor principal. | RN-1 |
| RF-2 | O cartão da pessoa e o menu da pessoa devem ter "Convidar para servidor", com a lista dos servidores que atendem RN-2 e RN-3. O item não aparece quando a lista está vazia. | RN-2, RN-3 |
| RF-3 | Escolher um servidor deve mandar uma mensagem direta para a pessoa com o convite (nome do servidor e link) e mostrar a confirmação "Convite enviado". | RN-4 |
| RF-4 | O link de convite numa mensagem deve abrir o fluxo de entrar no servidor ao ser clicado (como colar o link em "Adicionar servidor"). | RN-4 |
| RF-5 | O menu do usuário (cartão no pé da barra de canais) deve ter "Atualizar o app", que procura, baixa com indicação de progresso e instala. | RN-5 |
| RF-6 | O servidor deve mandar a mudança de status só às conexões que podem vê-lo. | RN-6 |
| RF-7 | Ao sair de um servidor (ou ser tirado), a pessoa deve receber `null` na atividade e o status "offline" de quem ela não pode mais ver, e quem ficou deve receber o mesmo sobre ela. | RN-7 |

## 7. Requisitos não funcionais
- **Compatibilidade:** apps 0.17.x continuam funcionando com o servidor novo. Os formatos dos eventos não mudam, só quem recebe.
- **Privacidade:** status e atividade seguem a mesma regra (RN-6 e a RN-2 de `correcoes-atividade`).
- **Atualização:** "Atualizar o app" não fecha o app no meio de uma chamada sem avisar (D-2).
- **Linux .deb:** a instalação continua pedindo a senha do sistema (pkexec), como hoje.

## 8. Critérios de aceite
- **CA-1** (RF-1): Dado o administrador da instalação aberto num servidor que não é o principal, quando abre o menu do servidor, então vê "Bot de música (ToOuvini)"; ao abrir, a situação e o envio de cookies funcionam (falam com o principal).
- **CA-2** (RF-1): Dado um administrador só do servidor aberto (não da instalação), quando abre o menu, então não vê o item.
- **CA-3** (RF-2): Dado que eu tenho "Gerenciar convite" nos servidores A e B, e Zé já está em A, quando abro o cartão do Zé, então "Convidar para servidor" lista só o B.
- **CA-4** (RF-2): Dado que não tenho "Gerenciar convite" em nenhum servidor em que o Zé não está, quando abro o cartão dele, então não aparece "Convidar para servidor".
- **CA-5** (RF-3): Dado o cartão do Zé, quando escolho "Convidar para servidor" → B, então o Zé recebe na DM comigo a mensagem com o nome de B e o link de convite de B, e eu vejo "Convite enviado".
- **CA-6** (RF-3): Dado que o Zé está banido de B, quando abro o cartão dele, então B não aparece na lista.
- **CA-7** (RF-4): Dado a mensagem com o link de convite de B, quando o Zé clica no link, então o app abre o fluxo de entrar em B.
- **CA-8** (RF-5): Dado uma versão nova publicada, quando clico em "Atualizar o app", então o app mostra "Baixando…" com o progresso e, ao terminar, instala e reinicia sozinho.
- **CA-8b** (RF-5): Dado que estou numa chamada de voz, quando o download de "Atualizar o app" termina, então o app pergunta "Reiniciar agora? Você vai sair da chamada." e só reinicia se eu confirmar; se eu recusar, fica o aviso de reiniciar do canto, como hoje.
- **CA-9** (RF-5): Dado que já estou na versão mais nova, quando clico em "Atualizar o app", então aparece "Você já está na versão mais nova.".
- **CA-10** (RF-5): Dado o app rodando fora do instalado (desenvolvimento), quando clico, então aparece que a atualização só funciona no app instalado.
- **CA-11** (RF-6): Dado que Zé muda o status, quando o servidor repassa, então só recebem amigos do Zé, membros de servidores em comum e o próprio Zé; uma conta sem relação não recebe nada.
- **CA-12** (RF-7): Dado que eu e a Bia só temos o servidor B em comum e ela está "Jogando Hades", quando eu saio de B, então paro de ver a atividade e o status dela, e ela para de ver os meus.

## 9. Impacto em consumidores
- **Apps antigos:** recebem menos eventos de status; funcionam igual.
- **Servidor:** sem migração de banco. As rotas do ToOuvini não mudam.
- **Quem recebe o convite com app antigo:** vê o link como texto e pode copiá-lo em "Adicionar servidor", como hoje.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | ~~Quem pode convidar: **só quem tem "Gerenciar convite"** naquele servidor (recomendação: é a regra de hoje para ver o link), ou **qualquer membro** do servidor?~~ | Gabriel | 20/11: só quem tem "Gerenciar convite" (ou é administrador). |
| D-2 | ~~Ao terminar de baixar, o app **reinicia sozinho** ou **pergunta antes**? Recomendação: reinicia sozinho, menos quando a pessoa está numa chamada de voz; nesse caso pergunta "Reiniciar agora? Você vai sair da chamada.".~~ | Gabriel | 20/11: sozinho, menos em chamada (aí pergunta). |
