# Atalhos de teclado para os sons — especificação funcional

> Demanda: `atalhos-de-sons` · Item 56 · Versão 1 · 23/11/2026 · Situação: **aprovada em 23/11/2026**

## 1. Objetivo
Tocar sons do soundboard pelo teclado (ex.: F1, F2), inclusive com outra janela em foco (jogando), sem abrir o painel.

## 2. Contexto
- O app já tem atalhos globais (push-to-talk, mudo, surdo) em Configurações → Atalhos, que funcionam com o app em segundo plano.
- O soundboard tem os sons do servidor (até 5) e "Meus sons" (comprados na loja).
- O usuário usa só a mão esquerda e tem um mapa próprio de atalhos no sistema.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Pessoa na voz | Escolhe os atalhos e toca os sons. |

## 4. Escopo
**Dentro:** um atalho por som (do servidor e "Meus sons"), escolhido pela pessoa, global, guardado no computador.

**Fora:** atalhos para outras ações (já existem os de voz), combinações com o mouse, atalhos diferentes por servidor para o mesmo som comprado (o atalho é do som).

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Cada som pode ter um atalho (tecla ou combinação com Ctrl, Alt, Shift); o mesmo atalho não pode estar em dois sons nem nos atalhos de voz. | Item 56 |
| RN-2 | Os atalhos funcionam com o app em segundo plano (globais), como o push-to-talk. | Usuário, 23/11 |
| RN-3 | Tocar pelo atalho segue as regras de hoje: só na voz, intervalo de 3 s, sem AFK e sem castigo; fora disso, nada acontece (sem aviso que atrapalhe o jogo). | Regra atual |
| RN-4 | Os sons do servidor guardam o atalho por servidor (o mesmo atalho pode tocar sons diferentes em servidores diferentes); os de "Meus sons" valem em todos. | Assistente |
| RN-5 | Som apagado ou que saiu da lista: o atalho é ignorado e some da lista. | Item 56 |
| RN-6 | Nenhum atalho vem pronto: a pessoa escolhe. A tela sugere F1 a F5 (ao alcance da mão esquerda). | Item 56 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Em Configurações → Atalhos, a seção "Sons" com cada som e o botão de gravar o atalho (como os atalhos de voz), limpar e o aviso de conflito. | RN-1, RN-4, RN-6 |
| RF-2 | Tocar o som ao apertar o atalho, com o app em foco ou não. | RN-2, RN-3, RN-5 |
| RF-3 | No painel do soundboard, o atalho aparece ao lado de cada som. | RN-1 |

## 7. Requisitos não funcionais
- Apertar o atalho toca em até 200 ms (mesma condição do botão).

## 8. Critérios de aceite
- **CA-1** (RN-1): Dado F1 no som "Grilo", quando a pessoa tenta pôr F1 em outro som ou no push-to-talk, então vê o aviso de conflito e não grava.
- **CA-2** (RN-2, RF-2): Dado F1 no "Grilo" e a pessoa na voz com outra janela em foco, quando aperta F1, então todos da sala ouvem o Grilo.
- **CA-3** (RN-3): Dado a pessoa fora da voz, na AFK ou dentro do intervalo de 3 s, quando aperta F1, então nada toca.
- **CA-4** (RN-4): Dado F2 em "Meus sons: Trovão", quando a pessoa está na voz de outro servidor, então F2 toca o Trovão.
- **CA-5** (RN-5): Dado F1 num som que o administrador apagou, quando a pessoa aperta F1, então nada acontece e o atalho some da lista.
- **CA-6** (RF-3): Dado sons com atalho, quando a pessoa abre o soundboard, então vê "F1" ao lado do som.

## 9. Impacto em consumidores
Só o app (configurações locais ganham os atalhos dos sons).

## 10. Dúvidas em aberto
Não há.
