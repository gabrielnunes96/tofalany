# Chat legível com várias transmissões — especificação funcional

> Demanda: `previa-transmissao` · Item 61 · Versão 3 · 23/11/2026 · Situação: **aprovada em 23/11/2026** (v3: prévia da transmissão (item 60) retirada pelo usuário em 23/11 para não pesar a internet; fica só o chat)

## 1. Objetivo
Continuar lendo o chat com várias transmissões abertas.

## 2. Contexto
Com duas transmissões assistidas, os painéis empilhados ocupam quase toda a altura e o chat vira uma faixa mínima.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Pessoa na voz | Assiste transmissões e lê o chat. |

## 4. Escopo
**Dentro:** altura mínima do chat.

**Fora:** prévia da transmissão antes de assistir (item 60, descartado em 23/11: pesaria a internet de quem transmite); divisória para arrastar, transmissões lado a lado, recolher transmissões.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-5 | O chat da conversa aberta nunca fica com menos de 8 linhas de altura visível, por mais transmissões que estejam abertas; as transmissões encolhem (mantendo a proporção) para caber. | Usuário, 23/11 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-2 | Altura mínima do chat com transmissões abertas. | RN-5 |

## 7. Requisitos não funcionais
Não se aplica.

## 8. Critérios de aceite
- **CA-5** (RN-5): Dado duas transmissões assistidas numa janela de 900 px de altura, quando se olha o chat, então ao menos 8 linhas do chat ficam visíveis.

## 9. Impacto em consumidores
Só o app.

## 10. Dúvidas em aberto
Não há.
