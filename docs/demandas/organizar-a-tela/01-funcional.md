# Organizar a tela: colunas ajustáveis e pastas de servidores — especificação funcional

> Demanda: `organizar-a-tela` · Itens 62 e 63 · Versão 1 · 23/11/2026 · Situação: **rascunho**

## 1. Objetivo
Cada pessoa arruma a tela do seu jeito: largura das colunas de canais e de membros, e servidores agrupados em pastas na coluna da esquerda.

## 2. Contexto
- As colunas de canais (250 px) e de membros (220 px) são fixas; dá só para esconder.
- A coluna de servidores mostra um círculo por servidor, na ordem em que foram adicionados.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Pessoa | Ajusta as colunas e organiza os servidores no próprio computador. |

## 4. Escopo
**Dentro:** divisórias arrastáveis nas colunas de canais e de membros; reordenar servidores; pastas de servidores (criar, somar, tirar, abrir/fechar, nome e cor).

**Fora:** sincronizar a arrumação entre computadores; pastas dentro de pastas; tela estreita (lá continuam as gavetas).

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | A coluna de canais vai de 180 a 400 px e a de membros de 180 a 360 px; a conversa nunca fica com menos de 360 px. | Assistente |
| RN-2 | A largura fica guardada no computador; duplo clique na divisória volta ao padrão. | Item 62 |
| RN-3 | Pelo teclado: a divisória recebe foco e as setas mudam a largura (10 px por toque). | Item 62 |
| RN-4 | Arrastar um servidor para cima de outro cria uma pasta com os dois; arrastar para cima de uma pasta soma a ela; arrastar para fora tira; pasta com um só servidor se desfaz. | Item 63 |
| RN-5 | Arrastar entre os círculos muda a ordem (servidores e pastas). | Item 63 |
| RN-6 | A pasta abre e fecha com um clique, mostra miniaturas dos servidores de dentro, soma as não lidas e pode ter nome e cor (clique direito → "Editar pasta"). | Item 63 |
| RN-7 | Pelo teclado e sem arrastar: clique direito no servidor → "Mover para pasta…" (lista das pastas e "Nova pasta") e "Tirar da pasta"; "Mover para cima/baixo". | Item 63 (acessibilidade) |
| RN-8 | Tudo fica guardado no computador; tirar um servidor da lista tira ele da pasta. | Assistente |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Divisórias de largura nas colunas de canais e de membros. | RN-1 a RN-3 |
| RF-2 | Reordenar servidores arrastando. | RN-5 |
| RF-3 | Pastas de servidores (arrastar, menu, nome, cor, não lidas). | RN-4, RN-6 a RN-8 |

## 7. Requisitos não funcionais
- Arrastar mostra onde o servidor vai cair (linha entre os círculos ou destaque na pasta).

## 8. Critérios de aceite
- **CA-1** (RN-1, RN-2): Dado a coluna de canais, quando a pessoa arrasta a divisória para 320 px e reabre o app, então a coluna está com 320 px; duplo clique volta a 250.
- **CA-2** (RN-1): Dado uma janela de 900 px, quando a pessoa tenta alargar as colunas além do limite, então a conversa fica com pelo menos 360 px.
- **CA-3** (RN-3): Dado a divisória com foco, quando aperta a seta para a direita 3 vezes, então a coluna fica 30 px mais larga.
- **CA-4** (RN-4): Dado os servidores A e B, quando a pessoa arrasta A sobre B, então aparece uma pasta com A e B; arrastando C sobre a pasta, ela tem três; arrastando A para fora, sai da pasta.
- **CA-5** (RN-4): Dado uma pasta com dois servidores, quando um sai, então a pasta some e o outro volta solto.
- **CA-6** (RN-6): Dado uma pasta fechada com mensagens não lidas num servidor de dentro, quando a pessoa olha, então a pasta mostra o total; clicando, abre e mostra os servidores.
- **CA-7** (RN-7): Dado o menu de um servidor, quando a pessoa escolhe "Mover para pasta… → Nova pasta", então o servidor vai para uma pasta nova, sem arrastar.
- **CA-8** (RN-5): Dado A, B e C, quando a pessoa arrasta C para antes de A, então a ordem fica C, A, B e continua assim ao reabrir.

## 9. Impacto em consumidores
Só o app (configurações locais ganham larguras, ordem e pastas).

## 10. Dúvidas em aberto
Não há.
