# Chat legível com várias transmissões — especificação técnica

> Demanda: `previa-transmissao` · Base: funcional v3 · 23/11/2026 · Situação: **aprovada em 23/11/2026**

## 1. Visão da solução
Hoje cada painel de transmissão é `flex: none` com `max-height: 60vh` (`base.css:656-658`) e o chat pode ir a zero (`base.css:376-377`). Os painéis passam a ficar num contêiner `.transmissoes` com `max-height: calc(100% - var(--chat-minimo))`; cada painel `flex: 1 1 0; min-height: 0` e o vídeo `object-fit: contain`, para encolher mantendo a proporção. `--chat-minimo` = 8 linhas + caixa de escrever (`calc(8 * var(--linha-chat) + var(--altura-composer))`). A publicação da tela não muda (item 60 descartado).

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| client: renderer | front | Contêiner `.transmissoes` em volta dos painéis; CSS do chat mínimo | `telas/TelaPrincipal.tsx:2391,2443-2458,2532`, `estilos/base.css:327,376-377,395,656-658,1284` |

## 3. Contratos
Não se aplica: só layout.

## 4. Dados
Não se aplica.

## 5. Integrações externas
Não se aplica.

## 6. Segurança
Não se aplica.

## 7. Observabilidade
Não se aplica.

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-5 | — | E2E `voz.spec.ts`: duas transmissões falsas assistidas, janela de 900 px, altura visível do chat ≥ 8 linhas | Usuário: duas transmissões reais |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Modo teatro e tela cheia | aplicar; não aplicar | **Não aplicar**: neles o chat não aparece junto (`base.css:1284,1378`) |

## 10. Implantação e rollback
Só app.

## 11. CI/CD
Sem mudança.
