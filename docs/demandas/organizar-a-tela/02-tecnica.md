# Organizar a tela: colunas ajustáveis e pastas de servidores — especificação técnica

> Demanda: `organizar-a-tela` · Base: funcional v1 · 23/11/2026 · Situação: **rascunho**

## 1. Visão da solução
**Colunas.**
- O grid passa a usar variáveis em `.layout-colunas` (`base.css:324`): `var(--largura-canais) minmax(360px, 1fr) var(--largura-membros)`.
- Novo componente `Divisoria`:
  - `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow/min/max` e `tabIndex=0`;
  - arrastar com `setPointerCapture`, setas ±10 px, Home/End, duplo clique volta ao padrão.
- Novo gancho `useLarguraColunas` com a regra de limite: o máximo de cada coluna é o menor entre o máximo da RN-1 e o que deixa 360 px para a conversa na janela atual. Ele recalcula no `resize`.
- Exemplo: na janela mínima de 860 px, com 64 px de servidores, canais e membros dividem 436 px.
- A largura é gravada ao soltar, em `ConfiguracoesLocais.colunas`.
- Em tela estreita (até 720 px) nada muda: continuam as gavetas.

**Pastas.** A ordem dos servidores continua sendo a ordem do array `servidores` (`App.tsx:41`). As pastas ficam numa estrutura própria, `ConfiguracoesLocais.pastas: { id, nome, cor, aberta, urls[] }[]`:
- os servidores de uma pasta ficam **contíguos** no array;
- a pasta aparece na posição do primeiro deles;
- mover a pasta move o bloco.

Uma função pura `normalizarPastas(servidores, pastas)`, em `shared`, garante três coisas:
- só urls que existem, cada url numa pasta só;
- pasta com menos de dois servidores é desfeita;
- membros contíguos.

Ela roda ao carregar, no `mesclar` e depois de cada mudança. Tirar o servidor da lista (`removerDaLista`, `App.tsx:331-356`) tira da pasta sozinho, pela normalização.

**Arrastar** (HTML5, tipo `application/x-tofalany-servidor`, como `TIPO_ARRASTO_PESSOA` em `BarraLateral.tsx:176-292`):
- metade de cima ou de baixo do círculo mostra uma linha e reordena;
- o centro do círculo destaca e cria a pasta, ou soma a ela;
- soltar fora da pasta aberta tira da pasta.

**Menu do clique direito** (`ColunaServidores.tsx:137-179`): passa a abrir para todos os servidores. "Remover da lista" continua só para os de outro host.
- Itens novos no servidor: "Mover para pasta… → (pastas) / Nova pasta", "Tirar da pasta", "Mover para cima", "Mover para baixo".
- Na pasta: "Editar pasta" (nome e cor, com as cores da paleta de cargos) e "Desfazer pasta".

**Não lidas da pasta:** soma de `naolidas` dos servidores de dentro, menos o aberto, que já sai da conta hoje (`ColunaServidores.tsx:126`). A pasta aberta mostra os círculos; a fechada mostra uma grade de até 4 miniaturas.

```text
configuracoes.json { servidores:[A,B,C,D], pastas:[{id,nome,cor,aberta,urls:[B,C]}], colunas:{canais:280, membros:220} }
coluna:  A  [pasta B C]  D        arrastar D sobre A → servidores [D?]: pastas += {urls:[A,D]} → normalizar → contíguos
```

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| shared | node | `ConfiguracoesLocais.colunas?: { canais?: number; membros?: number }`, `pastas?: PastaServidores[]`; `normalizarPastas`, `mesclarColunas`, `mesclarPastas` (até 20 pastas, nome até 30, cor da paleta) | `shared/src/protocolo.ts:332-368,436,447`, `shared/src/validacao.ts` |
| client: main | node | `mesclar` lê `colunas` e `pastas` | `client/src/main/configuracoes.ts:15-75` |
| client: renderer | front | `Divisoria`, `useLarguraColunas`; `ColunaServidores` com pastas, arrastar, menu e soma de não lidas; `App` guarda e grava `pastas` e a ordem; `TelaPrincipal` aplica as larguras | `componentes/ColunaServidores.tsx:125-179`, `app/App.tsx:41-58,281-291,331-356,378-381,466-481,511-536,622-636`, `telas/TelaPrincipal.tsx:345-357,1995-1996`, `estilos/base.css:324,698-709,1440-1449`, `componentes/BarraLateral.tsx:176-292` (padrão) |

## 3. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `ConfiguracoesLocais.colunas` | — | `{ canais?: number; membros?: number }` (px, dentro de 180-400 e 180-360) | Opcional; versão antiga ignora |
| `ConfiguracoesLocais.pastas` | — | `{ id: string; nome: string; cor: string; aberta: boolean; urls: string[] }[]` | Opcional; versão antiga perde as pastas ao gravar, e a ordem continua |
| `ServidorConhecido` | — | **Sem mudança** (pasta fora dele, ver R-1) | — |
| `servidores` (ordem) | ordem de adição | ordem escolhida | Mesmo array |

## 4. Dados
Só a configuração local. Os tetos (20 servidores, já existente em `configuracoes.ts:41`, e 20 pastas) mantêm o arquivo pequeno.

## 5. Integrações externas
Não se aplica.

## 6. Segurança
Não se aplica: dados locais, validados em `mesclar`. Nome e cor da pasta saem como texto e por uma lista de cores fechada.

## 7. Observabilidade
Não se aplica.

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | `Divisoria.test.tsx`: arrastar, `aoMudar(320)`, duplo clique volta ao padrão; `configuracoes.test.ts`: `colunas` validado | E2E `colunas.spec.ts` (novo): arrastar, reiniciar o app, largura mantida | — |
| CA-2 | `useLarguraColunas`/`limitesColunas` (pura): janela de 900 px mantém 360 px para a conversa | — | — |
| CA-3 | `Divisoria.test.tsx`: 3× seta direita dá +30 | — | — |
| CA-4, CA-5 | `normalizarPastas` (pura): criar, somar, tirar, desfazer com um | `ColunaServidores.test.ts`: soltar sobre outro servidor cria pasta | — |
| CA-6 | `ColunaServidores.test.ts`: pasta fechada soma não lidas; clique abre | E2E `naolidas.spec.ts` (estender) | — |
| CA-7 | `ColunaServidores.menu.test.tsx`: "Mover para pasta → Nova pasta" | — | — |
| CA-8 | `reordenar` (pura): C antes de A | E2E `servidores.spec.ts`: ordem mantida ao reabrir | — |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Modelo das pastas | campo `pasta` em `ServidorConhecido`; estrutura própria | **Estrutura própria**: `ServidorConhecido` é reconstruído em 4 lugares (`configuracoes.ts:47-58`, `App.tsx:44-50`, `App.tsx:~470-481`, `endereco-movido.ts:38-45`) e o campo se perderia |
| R-2 | Máximos da RN-1 não cabem na janela mínima | limites fixos; dinâmicos | **Dinâmicos**: a conversa com 360 px vence (CA-2); a largura gravada é a desejada, e a efetiva é limitada |
| R-3 | Servidor trocou de endereço (`endereco-movido.ts`) | — | A troca de url também troca a url dentro da pasta (mesma função que atualiza `servidores`) |
| R-4 | Arrastar e soltar no Electron (HTML5 DnD) | biblioteca; nativo | **Nativo**: já usado para pessoas; nenhuma dependência nova |

## 10. Implantação e rollback
Só app. Rollback: versão anterior (pastas são ignoradas, a ordem fica).

## 11. CI/CD
Sem mudança.
