# Atalhos de teclado para os sons — especificação técnica

> Demanda: `atalhos-de-sons` · Base: funcional v1 · 23/11/2026 · Situação: **aprovada em 23/11/2026**

## 1. Visão da solução
Os atalhos de sons reutilizam o gancho global que já existe (uiohook, `client/src/main/atalhos.ts`).

**O que muda no main:** o main passa a observar também os combos dos sons. Quando um deles é apertado, ele manda `atalhos:som { combo }`, em que `combo` é o texto canônico do atalho, por exemplo `Ctrl+F1`.

**O main não sabe que som é.** Quem resolve é o renderer, que sabe o servidor atual. A `TelaPrincipal` que está na voz faz isso, e só ela, porque só há uma voz por vez:
1. procura o combo nos sons **deste servidor** (`atalhosSons.porServidor[url]`, chave `somId`) e chama `tocarSom`;
2. se não achar, procura em **Meus sons** (`atalhosSons.globais`, chave `audioId`) e chama `tocarAudio`. O som precisa estar em `pontos.audiosIds`.

**Quando nada toca:** fora da voz, dentro do intervalo de 3 s (`liberadoEm`), na AFK ou de castigo, nada toca e não aparece aviso. O servidor já recusa esses casos (`soundboard.ts:23-57`), e o app descarta o erro quando o pedido veio de um atalho.

**Configuração:**
- Ganha `atalhosSons`. O conflito (RN-1) é conferido no conjunto que vale junto: atalhos de voz, Meus sons e os sons daquele servidor.
- Dois servidores diferentes podem usar o mesmo combo (RN-4).
- A seção "Sons" fica em Configurações → Atalhos e reaproveita a captura dos atalhos de voz. Ela mostra os sons do servidor atual e Meus sons, e sugere F1 a F5 em botões que só preenchem o campo (RN-6).

**Som apagado (RN-5):** quando chegam `sons:atualizados` ou `ola.sons`, os atalhos de sons que não existem mais naquele servidor são tirados e a configuração é gravada. Com Meus sons, o mesmo acontece quando `audiosLoja` muda.

```text
uiohook keydown ─► tratarCodigo: combo ∈ atalhosVoz? → atalhos:evento (como hoje)
                                  combo ∈ combosSons? → atalhos:som {combo}
renderer (TelaPrincipal na voz) ─► porServidor[url][combo→somId] ? tocarSom : globais[combo→audioId] ? tocarAudio : nada
                                 ─► liberadoEm/afk/castigo? nada (sem aviso)
```

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| shared | node | Tipo `AtalhosSons`; `conflitoAtalhoSom(combo, escopo)`; `mesclarAtalhosSons` (teto de 20 servidores, 5 sons por servidor e 50 globais, como `mesclarPessoas`); padrão vazio | `shared/src/atalhos.ts:2-101`, `shared/src/protocolo.ts:332-368,436`, `shared/src/validacao.ts:295-313` |
| client: main | node | `criarAtalhos().definirSons(combos: string[])`; `tratarCodigo` emite `atalhos:som`; `mesclar` lê `atalhosSons`; união dos combos de todos os servidores ao carregar e ao gravar | `client/src/main/atalhos.ts:59-114`, `client/src/main/index.ts:270-277,349`, `client/src/main/configuracoes.ts:15-75` |
| client: preload | node | `atalhos.aoSom(cb)` | `client/src/preload/index.ts:50-54`, `client/src/preload/api.ts:44-49` |
| client: renderer | front | `aoAtalhoSom` na `TelaPrincipal` (resolve e toca); limpeza de órfãos; seção "Sons" em `TelaConfiguracoes`; atalho ao lado do som no `PainelSoundboard` | `telas/TelaPrincipal.tsx:884-903,1100-1103,1749-1758,2218-2224,2570-2576`, `telas/TelaConfiguracoes.tsx:118-140,493-516`, `componentes/PainelSoundboard.tsx:1-21,73,103` |

## 3. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `ConfiguracoesLocais.atalhosSons` | — | `{ globais: Record<string, Atalho>, porServidor: Record<string, Record<string, Atalho>> }` (chaves: `audioId`, url normalizada, `somId`) | Opcional. Versão antiga ignora e apaga ao gravar; aceito: só some o atalho |
| IPC `atalhos:som` (novo) | — | `{ combo: string }` main → renderer | Novo |
| `atalhos:evento` | `{acao, pressionado}` | Sem mudança | — |
| `som:tocar` | — | Sem mudança | — |

## 4. Dados
Só a configuração local. O teto evita que o arquivo cresça sem limite.

## 5. Integrações externas
uiohook-napi 1.5.5: o gancho só observa, então a tecla também chega ao programa em foco. No Linux, ele funciona com janelas X11/XWayland (README:344). Com uma janela Wayland nativa em foco, não dispara. Isso fica escrito na tela de atalhos, no aviso que já existe para os atalhos de voz.

## 6. Segurança
Nenhuma superfície nova: o servidor continua conferindo voz, permissão, posse do som, AFK, castigo e intervalo. A configuração do main é validada em `mesclar`, com tipos, tetos e combos da lista `TECLAS_ATALHO`.

## 7. Observabilidade
Não se aplica: tudo é local.

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | `atalhos.test.ts` (shared): conflito entre som e voz, entre dois sons do mesmo servidor, e entre som e Meus sons; mesmo combo em servidores diferentes é permitido; `TelaConfiguracoes.test.tsx`: aviso e não grava | — | — |
| CA-2 | `atalhos.test.ts` (main): combo de som emite `atalhos:som` | E2E `sons.spec.ts`: `__teclaGlobal('F1')` toca o som do servidor (o outro app recebe `som:tocado`) | Usuário: jogo em foco, F1 |
| CA-3 | `resolverAtalhoSom` (função pura em `estado/atalhos-sons.ts`): fora da voz, intervalo, AFK e castigo dão nada | — | — |
| CA-4 | `resolverAtalhoSom`: Meus sons em servidor sem o combo | — | — |
| CA-5 | `limparOrfaos` (pura): som apagado sai | `mesclarAtalhosSons` com teto | — |
| CA-6 | `PainelSoundboard.test.tsx`: mostra "F1" | — | — |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Quem resolve combo → som | main (precisa saber o servidor atual); renderer | **Renderer**: já sabe o servidor, a lista de sons e o intervalo; o main só filtra combos |
| R-2 | Escopo do conflito (RN-1 × RN-4) | global; por conjunto que vale junto | **Por conjunto**: voz + Meus sons + sons do servidor. Mesmo combo em servidores diferentes é o que a RN-4 pede |
| R-3 | F1 a F5 colidem com atalhos do jogo | consumir a tecla; só observar | **Só observar** (o uiohook não consome). A sugestão é só sugestão; a pessoa escolhe |
| R-4 | Som do servidor A com a voz no servidor B | toca; ignora | **Ignora**: o som é do servidor A, e a voz é do B. Meus sons valem em qualquer um (CA-4) |
| R-5 | Wayland nativo em foco | — | Limitação conhecida; o aviso já existe |

## 10. Implantação e rollback
Só app. Rollback: versão anterior; o campo novo é ignorado.

## 11. CI/CD
Sem mudança.
