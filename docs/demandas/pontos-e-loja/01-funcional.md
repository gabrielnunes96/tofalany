# Pontos e loja — Especificação funcional

> Demanda: `pontos-e-loja` · Versão 1 · 11/11/2026 · Situação: **aprovada em 12/11/2026**

## 1. Objetivo
Dar ao grupo um motivo para ficar no ToFalany: quem passa tempo em canal de voz junta pontos e troca por temas exclusivos e por vales que liberam transmissões de qualidade maior.

## 2. Contexto
- Hoje o app tem 3 temas grátis (Neon da Madrugada, Breu, Aurora) e a qualidade da transmissão vem do cargo: com "Transmitir a tela" a pessoa transmite em 720p30, e as permissões "Transmitir em 1080p" (1080p60) e "Transmitir em 2K" (1440p60) liberam as outras qualidades. O administrador tem todas.
- O status "ausente" de hoje liga depois de 10 min sem mexer em teclado e mouse. Ele não serve para saber se a pessoa está na conversa, porque quem só fala na call também não mexe no PC.
- Uma conta pode estar em vários servidores da mesma instalação, mas só em um canal de voz por vez.
- Em paralelo, o plugin de design vai redesenhar o app e propor um sistema de temas por tokens. Os temas da loja serão feitos nesse sistema, então a arte e os nomes de cada tema saem do trabalho de design.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Membro | Ganha pontos em voz, vê o saldo e o extrato, compra temas e vales e usa o que comprou. |
| Administrador | Tem todos os temas e todas as qualidades sem gastar pontos. Também ganha pontos, como qualquer pessoa. |
| Servidor do ToFalany | Conta o tempo em voz, guarda saldo, compras e validade dos vales, e confere a qualidade de cada transmissão. |

## 4. Escopo
**Dentro:**
- Ganho de pontos por tempo em voz, com a regra de AFK.
- Saldo e extrato (ganhos e compras) da própria pessoa.
- Loja com duas seções: temas e vales de transmissão.
- 3 temas de loja na primeira entrega, todos escuros, originais e inspirados no clima de fantasia sombria (Souls/Elden Ring), arena arcana (LoL) e super-herói de HQ (Marvel): Cinzas do Trono, Arcano Dourado e Gibi (protótipo em `docs/demandas/redesenho-visual/prototipo-temas.html`).
- Novas qualidades de transmissão: 720p60 e 1080p30, além das que já existem.
- Vales de 7 dias que se somam quando a pessoa compra de novo.

**Fora (explícito):**
- Nome, logo, arte, personagem, fonte ou som oficial de qualquer franquia.
- Comprar pontos com dinheiro, transferir pontos entre pessoas e presentear.
- Administrador dar ou tirar pontos manualmente (pode virar item depois do uso real).
- Ranking ou placar público de pontos.
- Vale de 2K, que continua só por cargo.
- Itens de loja além de temas e vales (molduras de avatar, sons, emblemas). Ficam para depois.
- O redesenho do app em si, que é trabalho do plugin de design.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | A pessoa ganha **1 ponto por minuto completo** em canal de voz, desde que, nesse minuto inteiro, não esteja surda (fone desligado) e tenha pelo menos mais uma pessoa no canal. Estar com o microfone mudo não impede o ganho. | Usuário, 11/11 |
| RN-2 | O ToOuvini (bot de música) não conta como "mais uma pessoa" no canal. | Assistente (decorre de RN-1) |
| RN-3 | O ganho é por conta: dois aparelhos da mesma conta em voz ao mesmo tempo ganham 1 ponto por minuto, não 2. | Assistente (evita trapaça) |
| RN-4 | O saldo é um só por conta e vale para todos os servidores da instalação. O tempo em voz de qualquer servidor conta, e o que se compra vale em todos. | Usuário, 11/11 |
| RN-5 | Pontos não expiram e não podem ficar negativos. Compra sem saldo suficiente é recusada. | Assistente |
| RN-6 | Preços iniciais: tema 600; vale 720p60 por 200; vale 1080p30 por 300; vale 1080p60 por 600. Os valores (incluindo o ganho por minuto) ficam numa configuração do servidor, para ajustar sem nova versão do app. | Usuário, 11/11 |
| RN-7 | O tema comprado é da pessoa para sempre. Qualquer pessoa pode comprar qualquer tema: nenhum é exclusivo. | Usuário, 11/11 |
| RN-8 | O vale vale 7 dias a partir da compra. Comprar o mesmo vale com outro ainda ativo soma 7 dias ao fim do atual (nova validade = maior entre agora e a validade atual + 7 dias). | Usuário, 11/11 |
| RN-9 | O vale de 1080p60 também libera 720p60 e 1080p30. Os vales de 720p60 e 1080p30 liberam só a própria qualidade, além do que a pessoa já tinha. | Assistente; confirmada na aprovação (12/11) |
| RN-10 | O cargo continua liberando qualidades como hoje: "Transmitir em 1080p" passa a liberar 720p60, 1080p30 e 1080p60; "Transmitir em 2K" continua liberando 1440p60. A qualidade permitida é a soma do que o cargo e os vales ativos liberam. | Usuário, 11/11 |
| RN-11 | O administrador tem todos os temas e todas as qualidades sem comprar. | Usuário, 11/11 |
| RN-12 | Os temas de loja são originais: nenhum nome, logo, arte, personagem, fonte ou som oficial de franquia. Só o clima (cores, textura, tipografia livre) pode lembrar a obra. | Assistente; confirmada na aprovação (12/11) |
| RN-13 | Compra não tem devolução. | Assistente |
| RN-14 | Quem está de castigo continua com saldo e itens; como o castigo já tira a voz, não ganha pontos enquanto durar. | Assistente (decorre de RN-1) |
| RN-15 | Se o vale vence durante uma transmissão, essa transmissão continua até a pessoa parar; a próxima já sai limitada ao que ela tem. | Assistente |
| RN-16 | Não há limite de pontos por dia. | Usuário, 11/11 (D-1) |
| RN-17 | Não há pontos retroativos: todo mundo começa com 0 na versão da loja, e só conta o tempo em voz a partir dela. | Usuário, 11/11 (D-3) |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | O servidor deve contar os minutos válidos em voz de cada conta e creditar os pontos. | RN-1, RN-2, RN-3, RN-14 |
| RF-2 | O app deve mostrar o saldo de pontos no painel do usuário, atualizado em até 1 minuto depois de cada crédito ou compra. | RN-4 |
| RF-3 | O app deve ter a tela **Loja**, aberta pelo painel do usuário, com as seções Temas e Vales de transmissão, mostrando preço, se a pessoa já tem o item e, no vale, até quando ele vale. | RN-6, RN-7, RN-8 |
| RF-4 | A pessoa deve poder comprar um tema ou um vale com confirmação ("Comprar Tema X por 600 pontos?"). Sem saldo, o botão fica desligado e mostra quanto falta. | RN-5, RN-6, RN-13 |
| RF-5 | A loja deve mostrar uma prévia do tema antes da compra, sem aplicá-lo de vez. | RN-7 |
| RF-6 | Em Configurações › Aparência, os temas de loja aparecem junto com os grátis: os comprados podem ser escolhidos; os não comprados aparecem com cadeado e levam à loja. | RN-7, RN-11 |
| RF-7 | O seletor de qualidade da transmissão deve oferecer 720p30, 720p60, 1080p30, 1080p60 e 1440p60, liberando só o que o cargo e os vales ativos permitem, e mostrar, nas bloqueadas, que dá para liberar na loja. | RN-9, RN-10, RN-11 |
| RF-8 | O servidor deve conferir a qualidade de cada transmissão contra o cargo e os vales ativos, como já faz hoje com o cargo. | RN-9, RN-10, RN-15 |
| RF-9 | A pessoa deve ver o próprio extrato: data, tipo (ganho, compra), item e valor, do mais novo para o mais antigo. Os ganhos podem vir agrupados por sessão de voz. | RN-1 |
| RF-10 | O administrador vê a loja com todos os itens marcados como "liberado (administrador)", sem botão de compra. | RN-11 |
| RF-11 | A janela de novidades da versão deve apresentar a loja e explicar como se ganham pontos. | — |

## 7. Requisitos não funcionais
- **Contagem só no servidor.** O app não informa pontos: o servidor calcula a partir do estado de voz que já conhece (canal, surdo, quem está no canal). Pontos e compras não podem ser forjados por um app alterado.
- **Compra atômica.** Desconto do saldo e entrega do item acontecem juntos; duas compras simultâneas não podem deixar saldo negativo.
- **Sem perda por queda.** Reinício do servidor perde no máximo o minuto em andamento.
- **Compatibilidade.** Apps de versões anteriores continuam funcionando: não veem a loja, e o servidor aceita deles as qualidades que já existiam, conforme o cargo e os vales.
- **Desempenho.** A contagem não pode pesar na VM (Oracle Always Free) com o grupo inteiro em voz.

## 8. Critérios de aceite
- **CA-1** (RF-1) — Dado Ana e Beto no mesmo canal de voz, ambos sem surdo, quando passam 5 minutos, então cada um tem 5 pontos a mais.
- **CA-2** (RF-1) — Dado Ana sozinha num canal de voz por 5 minutos, então ela não ganha pontos.
- **CA-3** (RF-1) — Dado Ana e o ToOuvini sozinhos no canal por 5 minutos, então Ana não ganha pontos.
- **CA-4** (RF-1) — Dado Ana e Beto no canal, Ana com surdo ligado por 5 minutos, então Ana não ganha pontos nesse tempo e Beto ganha 5.
- **CA-5** (RF-1) — Dado Ana com o microfone mudo (sem surdo) e Beto no canal, quando passam 5 minutos, então Ana ganha 5 pontos.
- **CA-6** (RF-1) — Dado Ana conectada em voz por dois aparelhos com Beto no canal, quando passam 5 minutos, então Ana ganha 5 pontos, não 10.
- **CA-7** (RF-1) — Dado Ana em voz no servidor A com Beto e depois no servidor B com Caio, quando soma 10 minutos válidos, então o saldo único dela sobe 10.
- **CA-8** (RF-2) — Dado o painel aberto, quando Ana ganha um ponto ou faz uma compra, então o saldo mostrado muda em até 1 minuto, sem reabrir o app.
- **CA-9** (RF-4) — Dado Ana com 700 pontos, quando compra um tema de 600 e confirma, então o saldo vira 100, o tema aparece como "Seu" e o extrato mostra a compra.
- **CA-10** (RF-4) — Dado Ana com 500 pontos, quando abre um tema de 600, então o botão de compra está desligado e mostra "faltam 100 pontos"; uma chamada direta à compra pelo servidor é recusada e o saldo continua 500.
- **CA-11** (RF-4) — Dado Ana com 600 pontos, quando dispara duas compras de 600 ao mesmo tempo, então só uma passa e o saldo termina em 0.
- **CA-12** (RF-4, RN-8) — Dado Ana sem vale, quando compra o vale 1080p60 no dia 1, então ele vale até o dia 8 na mesma hora; quando compra de novo no dia 3, então passa a valer até o dia 15.
- **CA-13** (RN-8) — Dado um vale de Ana que venceu no dia 8, quando ela compra de novo no dia 10, então vale até o dia 17.
- **CA-14** (RF-7, RN-9) — Dado Ana membro sem permissão de 1080p e com vale 1080p60 ativo, quando abre o seletor de qualidade, então 720p30, 720p60, 1080p30 e 1080p60 estão liberadas e 1440p60 bloqueada.
- **CA-15** (RF-7) — Dado Ana sem vale e sem permissão de qualidade, quando abre o seletor, então só 720p30 está liberada e as demais dizem que dá para liberar na loja.
- **CA-16** (RF-8) — Dado Ana sem vale e sem permissão, quando um app alterado publica a tela em 1080p60, então o servidor recusa a faixa, como já faz hoje.
- **CA-17** (RF-8, RN-15) — Dado Ana transmitindo em 1080p60 com o vale vencendo no meio, então a transmissão continua; ao parar e começar outra, só as qualidades permitidas sem o vale aparecem.
- **CA-18** (RN-10) — Dado Beto com cargo que tem "Transmitir em 1080p" e sem vale, então 720p60, 1080p30 e 1080p60 estão liberadas para ele.
- **CA-19** (RF-6) — Dado Ana sem nenhum tema de loja, quando abre Configurações › Aparência, então os temas de loja aparecem com cadeado e o clique leva à loja; depois da compra, o mesmo tema pode ser escolhido.
- **CA-20** (RF-5) — Dado Ana na loja, quando pede a prévia de um tema que não tem, então o app mostra o tema e, ao sair da prévia, volta ao tema anterior.
- **CA-21** (RF-10, RN-11) — Dado o administrador com 0 pontos, quando abre a loja, então todos os itens aparecem liberados, e ele consegue escolher qualquer tema e transmitir em qualquer qualidade.
- **CA-22** (RF-9) — Dado Ana com ganhos e compras, quando abre o extrato, então vê cada movimento com data, tipo, item e valor, do mais novo para o mais antigo, e a soma bate com o saldo.
- **CA-23** (RN-6) — Dado o preço do tema mudado para 800 na configuração do servidor, quando Ana reabre a loja, então o tema custa 800, sem atualizar o app.
- **CA-24** (RN-12) — Dado cada tema de loja, quando revisado, então não contém nome, logo, arte, personagem, fonte ou som oficial de franquia.
- **CA-25** (RF-11) — Dado um app atualizado para a versão da loja, quando abre a primeira vez, então a janela de novidades explica a loja e como ganhar pontos.
- **CA-26** (RN-17) — Dado Ana com horas de voz antes da versão da loja, quando o servidor sobe a versão da loja, então o saldo dela é 0.

## 9. Impacto em consumidores
- **Cargos:** a descrição da permissão "Transmitir em 1080p" muda (passa a liberar 720p60, 1080p30 e 1080p60). Quem já tem o cargo não perde nada.
- **Preferência de qualidade padrão:** quem escolheu 1080p60 e perde o vale volta para a melhor qualidade permitida, como já acontece quando o cargo muda.
- **Apps antigos:** continuam sem a loja; os novos valores de qualidade (720p60, 1080p30) só existem no app novo.
- **Temas:** dependem do sistema de temas do redesenho. Se o redesenho mudar os temas grátis, a funcional deles fica com o trabalho de design, não com esta demanda.
- **Banco de dados:** nova versão do banco (saldo, extrato, itens, vales). A cópia do banco (`./vm.sh copia-banco`) e a consulta continuam valendo.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | Limite de pontos por dia? Sugestão: sem limite por enquanto; a regra de AFK já segura a maior parte do abuso. Não bloqueante. | Usuário | Sem limite por dia (usuário, 11/11). Virou RN-16. |
| D-2 | Os 3 temas de loja: nomes e direção visual saem do plugin de design. A funcional só exige que sejam originais (RN-12). Não bloqueante. | Plugin de design | Cinzas do Trono, Arcano Dourado e Gibi, todos escuros (direção de design aprovada em 12/11). |
| D-3 | Quem já ficou em voz antes da loja ganha pontos retroativos? Sugestão: não; todo mundo começa do zero na versão da loja. Não bloqueante. | Usuário | Sem retroativo (usuário, 11/11). Virou RN-17. |

> Portão: a especificação técnica só começa com esta seção vazia (ou com as dúvidas restantes marcadas como não bloqueantes) e com a aprovação registrada no topo.
