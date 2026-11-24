# Chamar para a voz como um telefone — especificação funcional

> Demanda: `chamar-tocando` · Item 55 · Versão 1 · 23/11/2026 · Situação: **aprovada em 23/11/2026**

## 1. Objetivo
Fazer o "Chamar para a voz" funcionar como um telefone: o chamado toca de verdade, quem chama sabe que está chamando, dá para recusar e cancelar, e ele desiste sozinho se ninguém atender.

## 2. Contexto
- Na 0.18.0, quem está na voz chama alguém pelo menu da pessoa ou pela conversa direta. A pessoa recebe só um aviso fixo com Entrar e Agora não; os avisos de quem chamou ("Chamado enviado", erros) ficam presos na tela.
- Hoje dá para chamar quem está offline (o chamado se perde).

## 3. Atores
| Ator | Papel |
| --- | --- |
| Quem chama | Está numa sala de voz e chama alguém do servidor. |
| Quem é chamado | Recebe o toque e atende, recusa ou deixa tocar. |

## 4. Escopo
**Dentro:** toque, tela de "chamando", recusar, cancelar, tempo limite, avisos que somem, só para quem está online.

**Fora:** chamada para várias pessoas de uma vez, toque personalizado por pessoa, histórico de chamadas perdidas.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Só dá para chamar quem está online ou ausente; quem está offline ou invisível não aparece como chamável e o servidor recusa. Não incomodar continua sem receber. | Usuário, 23/11 |
| RN-2 | Quem é chamado ouve um toque que se repete enquanto o chamado está aberto, respeitando o surdo e a preferência de chamados. | Item 55 |
| RN-3 | O chamado fica aberto por 15 segundos; sem resposta, encerra dos dois lados: quem chamou vê "<nome> não atendeu". | Usuário, 23/11 |
| RN-4 | Quem é chamado pode Entrar (vai para a sala de quem chamou, encerrando o chamado) ou Recusar (quem chamou vê "<nome> recusou"). | Item 55 |
| RN-5 | Quem chama vê "Chamando <nome>…" com Cancelar; cancelar ou sair da voz encerra o chamado dos dois lados. | Item 55 |
| RN-6 | Um chamado aberto por pessoa chamada por vez; o limite de hoje (1 por minuto para a mesma pessoa, 5 por minuto de quem chama) continua. | Regra atual |
| RN-7 | Os avisos de resultado ("Chamado enviado", "não atendeu", "recusou", erros) somem sozinhos em 6 segundos. | Item 55 |
| RN-8 | Com o app fechado (celular, quando existir), o aviso por push dura o mesmo tempo do chamado. | Item 55 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | "Chamar para a voz" só para pessoas online ou ausentes (menu e conversa direta), com o servidor conferindo. | RN-1 |
| RF-2 | Tela de chamado recebido com toque, Entrar e Recusar. | RN-2, RN-4 |
| RF-3 | Tela de "Chamando…" com Cancelar. | RN-5 |
| RF-4 | Encerramento por tempo, recusa, cancelamento, entrada ou saída da voz, avisando os dois lados. | RN-3, RN-4, RN-5, RN-6 |
| RF-5 | Avisos de resultado que somem sozinhos. | RN-7 |

## 7. Requisitos não funcionais
- O toque começa em até 1 s depois de chamar (mesma rede); o som do toque é curto e baixo.

## 8. Critérios de aceite
- **CA-1** (RN-1): Dado Bia offline ou invisível, quando Ana abre o menu dela, então não há "Chamar para a voz"; e se o pedido chegar ao servidor, é recusado.
- **CA-2** (RN-2, RN-4): Dado Ana chamando Bia, quando Bia recebe, então ouve o toque repetido; tocando em Entrar, vai para a sala da Ana e o toque para dos dois lados.
- **CA-3** (RN-4): Dado o chamado tocando, quando Bia recusa, então o toque para e Ana vê "Bia recusou".
- **CA-4** (RN-3): Dado o chamado tocando, quando passam 15 s sem resposta, então para dos dois lados e Ana vê "Bia não atendeu".
- **CA-5** (RN-5): Dado o chamado tocando, quando Ana cancela ou sai da voz, então o toque da Bia para.
- **CA-6** (RN-2): Dado Bia com o som desligado (surdo) ou com a preferência de chamados desligada, quando é chamada, então não ouve toque (no surdo, ainda vê o aviso).
- **CA-7** (RN-7): Dado qualquer aviso de resultado, quando passam 6 s, então ele some.
- **CA-8** (RN-6): Dado um chamado aberto para Bia, quando Caio também a chama, então o pedido do Caio é recusado com "Bia já está sendo chamada".

## 9. Impacto em consumidores
App antigo (0.18.x) chamado por um app novo: recebe o aviso de hoje (sem toque). O servidor ganha eventos de responder e cancelar.

## 10. Dúvidas em aberto
Não há.
