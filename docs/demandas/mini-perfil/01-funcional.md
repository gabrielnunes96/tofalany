# Mini perfil — Especificação funcional

> Demanda: `mini-perfil` · Versão 2 · 17/11/2026 · Situação: **aprovada em 17/11/2026**

## 1. Objetivo
Ao clicar no nome ou na foto de alguém, abre um cartão com o perfil da pessoa: fundo personalizado, foto, nome, cargo, status, atividade, "sobre mim" e "membro desde". No cartão dá para mandar uma mensagem direta sem sair dali. Hoje só existe o menu do clique direito, sem perfil, e cada pessoa só personaliza o nome, a cor e a foto.

## 2. Contexto
- O perfil guarda hoje o nome de exibição, a cor e a foto (até 8 MB, gravada em 256×256).
- O clique direito numa pessoa (na sala de voz e na lista de membros) abre um menu com o volume, o silenciar, a conversa direta e a amizade. Esse menu continua.
- O servidor já sabe quando cada pessoa entrou em cada servidor.
- A conversa direta já abre pelo botão "Conversar com" (lista de membros) e pelo clique direito: o botão "Mensagem" do cartão reaproveita essa ação, e o novo é só o campo que envia com Enter.
- O fundo animado vem de um GIF que a própria pessoa envia (decisão de 17/11), não da busca de GIF: fica guardado no servidor como a foto e não depende da Klipy.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Membro | Abre o cartão de alguém, manda mensagem, vê o perfil completo; personaliza o próprio perfil. |
| Servidor do ToFalany | Guarda o fundo e o "sobre mim", confere a imagem enviada e calcula amigos e servidores em comum. |

## 4. Escopo
**Dentro:**
- **Cartão:** abre com um clique no nome ou na foto de alguém. Vale:
  - no autor de uma mensagem;
  - numa @menção;
  - na lista de membros;
  - na lista de amigos;
  - nas conversas diretas.
- **Fundo do cartão:** cor (ou degradê de duas cores) ou imagem enviada pela pessoa, inclusive GIF animado.
- **Campos novos:** "sobre mim" e "membro desde".
- **No cartão:** campo "Mensagem para @fulano" e botões "Mensagem" e "Ver perfil".
- **Perfil completo:** janela maior, com os amigos e os servidores em comum.
- **Fundo na lista de membros:** o fundo de cada pessoa aparece, suave, atrás da linha dela na lista de membros (ver D-4).
- **Edição:** em Configurações → Minha conta, com uma prévia do próprio cartão.

**Fora (explícito):**
- Pronomes.
- Nota pessoal sobre alguém (D-3).
- Cartão fixo ao lado da conversa direta (D-5).
- Distintivos e conquistas.
- Fundo diferente por servidor (o perfil é o mesmo em todos).
- Comentários no perfil.
- Esconder o perfil de quem não é amigo.
- Moderação do fundo e do "sobre mim" (ver D-1).
- Trocar o menu do clique direito pelo cartão.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | O cartão abre com um clique (não ao passar o mouse). Passar o mouse só mostra que o nome é clicável. Esc ou clique fora fecha. | Pergunta de 17/11 |
| RN-2 | O fundo é uma de três opções:<br>• cor sólida ou degradê de duas cores;<br>• imagem enviada (png, jpeg, gif ou webp, até 8 MB), que o servidor confere e regrava em até 600×240 sem metadados. GIF e webp animados continuam animados, com o número de quadros limitado como nos anexos.<br>Sem escolha, o fundo é a cor de perfil da pessoa. | Pergunta de 17/11; GIF enviado em 17/11 |
| RN-3 | O fundo é guardado pelo servidor como a foto de perfil: aparece mesmo sem a busca de GIF e não faz o app acessar nenhum endereço fora do servidor. | Decisão de 17/11 |
| RN-4 | "Sobre mim" tem até 190 caracteres e no máximo 3 linhas, só texto. Os links aparecem, mas não abrem prévia. | Pergunta de 17/11 |
| RN-5 | "Membro desde" é a data em que a pessoa entrou no servidor aberto, calculada pelo servidor. Na conversa direta, aparece a data da conta. | Pergunta de 17/11 |
| RN-6 | "Mensagem para @fulano" + Enter abre a conversa direta com a pessoa, envia o texto e leva a pessoa ao chat da conversa. O botão "Mensagem" abre a conversa sem enviar nada. No próprio cartão, em vez disso, aparece "Editar perfil". | Pedido de 17/11 |
| RN-7 | O perfil completo mostra os amigos e os servidores em comum. São só os que as duas pessoas já compartilham: nada revela um servidor ou amigo que quem olha não conhece. | Pergunta de 17/11; privacidade |
| RN-8 | A mudança de perfil chega ao vivo a quem tem o cartão ou o chat abertos. | Padrão do app |
| RN-9 | Uma conta removida mostra o cartão sem fundo, sem "sobre mim" e sem campo de mensagem, com "conta removida". | Padrão do app |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Nome e foto de pessoas, nos lugares do escopo, ficam clicáveis e abrem o cartão junto do ponto clicado, dentro da janela. | RN-1 |
| RF-2 | O cartão mostra:<br>• o fundo no topo, com a foto sobreposta na borda de baixo dele;<br>• o nome de exibição e o @usuario;<br>• o cargo e a função como etiquetas, com a bolinha da cor de cada um;<br>• os amigos e os servidores em comum, em uma linha com o número e as fotos ("3 amigos em comum · 1 servidor em comum");<br>• o status e a atividade (jogo, música);<br>• o "sobre mim" e o "membro desde";<br>• o campo de mensagem e os botões "Mensagem" e "Ver perfil". | RN-2, RN-3, RN-4, RN-5, RN-6, RN-9 |
| RF-3 | O perfil completo é uma janela no meio da tela, com o mesmo conteúdo maior, mais os amigos e os servidores em comum e o botão de amizade (pedir, aceitar ou desfazer). | RN-7 |
| RF-4 | Em Configurações → Minha conta, a pessoa edita o fundo e o "sobre mim", com a prévia do cartão:<br>• para a cor, escolhe uma ou duas cores;<br>• para a imagem ou o GIF, envia um arquivo;<br>• "Tirar fundo" volta ao padrão. | RN-2, RN-3, RN-4 |
| RF-5 | O cartão e o perfil completo funcionam por teclado:<br>• Enter ou espaço no nome abre o cartão;<br>• o foco vai para o campo de mensagem;<br>• Tab percorre os botões;<br>• Esc fecha e devolve o foco ao nome. | RN-1 |
| RF-6 | A janela de novidades da versão apresenta o mini perfil. | — |

## 7. Requisitos não funcionais
- **Desempenho.** O cartão abre em até 200 ms com os dados já carregados, sem esperar a imagem de fundo: ela entra depois, sem a tela pular.
- **Privacidade.** O fundo vem do servidor do ToFalany, como a foto. Os amigos e os servidores em comum nunca expõem o que quem olha não vê.
- **Segurança.** A imagem de fundo passa pela mesma conferência das imagens enviadas (formato real, sem metadados, tamanho limitado).
- **Compatibilidade.** Apps 0.16.x continuam funcionando e não veem fundo nem "sobre mim".
- **Textos.** Nenhum texto nem comentário cita outro aplicativo.

## 8. Critérios de aceite
- **CA-1** (RF-1, RN-1) — Dada uma mensagem do beto, quando a ana clica no nome ou na foto dele, então abre o cartão do beto junto do clique. Esc fecha e devolve o foco ao nome.
- **CA-2** (RF-1) — Dada uma @menção ao beto, a lista de membros, a lista de amigos e uma conversa direta, quando a ana clica no nome do beto em cada lugar, então abre o mesmo cartão.
- **CA-3** (RF-2, RN-2) — Dado o beto com fundo em degradê, "sobre mim" e cargo Moderador, quando a ana abre o cartão dele, então vê o degradê, a foto, "beto", "@beto", "Moderador" na cor da função, o status, o "sobre mim" e "Membro desde 12/10/2026".
- **CA-4** (RN-6) — Dado o cartão do beto aberto, quando a ana digita "bora jogar?" e dá Enter, então a conversa direta com o beto abre, a mensagem aparece nela e chega ao vivo ao beto.
- **CA-5** (RN-6) — Dado o próprio cartão, quando a ana o abre, então aparece "Editar perfil" no lugar do campo de mensagem, e o botão leva a Configurações → Minha conta.
- **CA-6** (RF-4, RN-2) — Dada a ana em Configurações → Minha conta, quando ela envia uma imagem de 3000×2000, então o fundo fica regravado em até 600×240 sem metadados, a prévia mostra o fundo novo e o beto o vê ao vivo no cartão dela.
- **CA-7** (RN-2) — Dado um arquivo que não é imagem (renomeado para .png) ou acima de 8 MB, quando a ana o envia como fundo, então o servidor recusa e o fundo anterior continua.
- **CA-8** (RF-4, RN-2, RN-3) — Dado um GIF animado de 500×200 enviado como fundo, quando o beto abre o cartão da ana, então vê o GIF animado, carregado do servidor do ToFalany (nenhum pedido fora dele).
- **CA-9** (RN-4) — Dado um "sobre mim" com 191 caracteres ou 4 linhas, quando a ana salva, então o app e o servidor recusam com a mensagem do limite.
- **CA-10** (RF-3, RN-7) — Dados a ana e o beto com 2 amigos em comum e 1 servidor em comum, e o beto num servidor em que a ana não está, quando a ana abre o perfil completo do beto, então vê os 2 amigos e só o servidor em comum.
- **CA-11** (RN-9) — Dada uma mensagem de uma conta removida, quando a ana clica no nome, então o cartão mostra "conta removida", sem fundo, sem "sobre mim" e sem campo de mensagem.
- **CA-12** (RF-5) — Dado só o teclado, quando a ana dá Enter no nome do beto, então o cartão abre com o foco no campo de mensagem, e Tab percorre "Mensagem" e "Ver perfil".
- **CA-14** (D-4) — Dado o beto com fundo escolhido, quando a ana olha a lista de membros, então a linha do beto mostra o fundo dele, suave, atrás do nome, e o nome continua legível (contraste de pelo menos 4,5:1).
- **CA-13** (Compatibilidade) — Dado um app 0.16.x conectado ao servidor novo, quando ele carrega membros e mensagens, então nada quebra (os campos novos são opcionais).

## 9. Impacto em consumidores
- **Servidor:** novos campos de perfil no banco (fundo e "sobre mim"); uma nova rota para enviar a imagem de fundo; uma consulta de amigos e servidores em comum.
- **Apps 0.16.x:** ignoram os campos novos.
- **Backup:** o backup completo (pasta de dados inteira) leva os fundos junto com as fotos. O `copia-banco` leva só o banco, como sempre (técnica T-9).

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | Quem modera o perfil pode tirar o fundo ou o "sobre mim" de alguém, se for ofensivo? Sugestão: o administrador ganha "Limpar perfil" no menu de moderação. Pode ficar para depois. | Usuário | Fica para depois (17/11). |
| D-2 | Os termos da Klipy não falam de GIF fixo como fundo de perfil, só de busca e envio. Sugestão: tratar como um GIF enviado (carregado direto, sem cópia) e confirmar com a Klipy se ela reclamar. | Usuário | Sem GIF da Klipy no fundo: a pessoa envia o próprio GIF (17/11). |
| D-3 | Nota pessoal: um campo "Nota (só você vê)" no perfil completo, até 256 caracteres, guardado no servidor e nunca enviado a mais ninguém. Entra nesta demanda? Sugestão: sim, é pequeno. | Usuário | Não entra (17/11). |
| D-4 | Fundo atrás da linha de cada pessoa na lista de membros, suave, sem atrapalhar a leitura do nome. Entra nesta demanda? Sugestão: sim, como opção ligada por padrão. | Usuário | Entra (17/11). |
| D-5 | Na conversa direta, o cartão da outra pessoa fixo no painel da direita (no lugar da lista de membros), com "Ver perfil completo" embaixo. Entra nesta demanda? Sugestão: sim. | Usuário | Não entra (17/11). |
