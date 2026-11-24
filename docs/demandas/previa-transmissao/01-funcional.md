# Prévia da transmissão e chat legível — especificação funcional

> Demanda: `previa-transmissao` · Itens 60 e 61 · Versão 1 · 23/11/2026 · Situação: **aprovada em 23/11/2026**

## 1. Objetivo
Saber o que está sendo transmitido antes de assistir, e continuar lendo o chat com várias transmissões abertas.

## 2. Contexto
- Na faixa "<nome> está transmitindo a tela" aparecem só o texto, o olho e Assistir.
- Com duas transmissões assistidas, os painéis empilhados ocupam quase toda a altura e o chat vira uma faixa mínima.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Pessoa na voz | Vê a prévia, decide assistir e lê o chat. |
| Quem transmite | Não tem nada a fazer; a prévia não pode pesar na internet dele. |

## 4. Escopo
**Dentro:** prévia ao vivo pequena na faixa de cada transmissão não assistida; altura mínima do chat.

**Fora:** divisória para arrastar, transmissões lado a lado, recolher transmissões (não escolhidos em 23/11); prévia com som.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Cada transmissão que a pessoa ainda não assiste mostra, na faixa dela, uma prévia ao vivo pequena, sem som. | Usuário, 23/11 |
| RN-2 | A prévia usa a menor qualidade disponível e só é recebida enquanto a faixa está visível na tela; fora da tela, para. | Item 60 |
| RN-3 | Ver a prévia não conta como assistir (o olho não muda) e não exige que quem transmite mande uma qualidade a mais. | Item 60 |
| RN-4 | Quem tem "dados móveis" ou conexão ruim pode desligar as prévias em Configurações → Voz (ligadas por padrão). | Assistente |
| RN-5 | O chat da conversa aberta nunca fica com menos de 8 linhas de altura visível, por mais transmissões que estejam abertas; as transmissões encolhem (mantendo a proporção) para caber. | Usuário, 23/11 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Prévia ao vivo na faixa de transmissão não assistida, com a opção de desligar. | RN-1 a RN-4 |
| RF-2 | Altura mínima do chat com transmissões abertas. | RN-5 |

## 7. Requisitos não funcionais
- A prévia gasta no máximo ~150 kbps por transmissão (menor camada; medido na validação manual).

## 8. Critérios de aceite
- **CA-1** (RN-1): Dado Ana transmitindo, quando Bia (na sala, sem assistir) olha a faixa, então vê a imagem ao vivo pequena, sem som.
- **CA-2** (RN-3): Dado a prévia na tela da Bia, quando Ana olha o olho, então ele não conta a Bia.
- **CA-3** (RN-2): Dado a faixa fora da tela (rolada ou com a conversa escondida), então a prévia não é recebida.
- **CA-4** (RN-4): Dado "Prévias das transmissões" desligada, quando há transmissão, então a faixa mostra só o texto.
- **CA-5** (RN-5): Dado duas transmissões assistidas numa janela de 900 px de altura, quando se olha o chat, então ao menos 8 linhas do chat ficam visíveis.

## 9. Impacto em consumidores
Só o app.

## 10. Dúvidas em aberto
Não há.
