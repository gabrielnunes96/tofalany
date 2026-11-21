# Volume da voz: especificação técnica

> Demanda: `volume-da-voz` · Base: funcional v2 (aprovada em 21/11/2026) · 21/11/2026 · Situação: **aprovada em 21/11/2026**
> Base: análise de impacto (fluxo:analista) de 21/11.

## 1. Visão da solução
- **Quem fala:** depois do portão da detecção de voz, o sinal passa por:
  1. dois ramos alternados com rampa (nivelado: compressor nativo; direto: sem compressor);
  2. o ganho do microfone;
  3. um limitador nativo, antes de publicar.

  O portão continua medindo e cortando o sinal **antes** de tudo isso: o ganho não abre o microfone com ruído (RN-6).
- **Mudanças ao vivo:** o nivelamento e o ganho mudam ao vivo por um controle novo do `Microfone`, sem reabrir o microfone nem republicar a faixa.
- **Quem ouve:** o volume de cada pessoa passa a ser `min(200%, volume da pessoa × volume da chamada)`, aplicado pelo mesmo `setVolume` de hoje. A transmissão e o ToOuvini ficam de fora.

```text
microfone → [RNNoise] = tratado ─┬→ medição (barra e marca da sensibilidade; antes do ganho)
                                 └→ portão-voz (mede e corta) ─┬→ compressor → cruzamento A ─┐
                                                               └────────────→ cruzamento B ─┴→ ganho → limitador → faixa publicada
quem ouve: setVolume(faixa) = min(2, volumes[id] ?? 1 × volumeChamada)   (tela e ToOuvini: como hoje)
```

## 2. Decisões tomadas aqui (para a aprovação)
| # | Decisão | Por quê |
| --- | --- | --- |
| T-1 | **Ordem dos nós:** `portão → (compressor \| direto) → ganho → limitador → destino`. A medição continua ligada a `tratado` (antes de tudo). | RN-6 por construção. O ganho depois do compressor dá os +6 dB do CA-4 (antes, o compressor o absorveria). O limitador segura o pico com ganho de até 300%. |
| T-2 | **Parâmetros numa função pura** `parametrosNivel({ nivelar, ganho })` em `servicos/nivel-voz.ts`. **Compressor:** limiar −30 dB, ratio 4, joelho 10 dB, ataque 3 ms, soltura 250 ms, com o ganho de compensação calculado por nós (não o automático do navegador). **Limitador:** limiar −2 dBFS, ratio 20, joelho 0, ataque 0. | Valores de nivelamento de voz comuns. A margem de −2 dBFS cobre o limitador nativo, que não é rígido (o pico fica abaixo de −1 dBFS). Ficam testáveis e ajustáveis num lugar só. **Ajuste na execução (21/11, revisão da T2):** compressor em −45 dB, 4:1, joelho 6 (com −30 dB a diferença entre −40 e −6 dBFS ficaria em ~16 dB e o CA-2 falharia). O compressor e o limitador do navegador aplicam uma compensação automática que não dá para desligar ((1/curva(0 dBFS))^0,6): o ramo nivelado leva um fator que a corrige para a fala de −20 dBFS sair no nível de hoje, e um ganho fixo depois do limitador desfaz a dele (~+1,1 dB), para o pico ficar abaixo de −1 dBFS e a voz sem nivelamento sair igual à de hoje (CA-3). Os dois fatores são conferidos e calibrados pela medição no Chromium (T6). Efeito conhecido: enquanto o portão está aberto, o ruído abaixo de −45 dBFS sobe junto com a voz (~+19 dB); o portão fecha 300 ms depois da fala. |
| T-3 | **Ligar e desligar o nivelamento** troca dois GainNode de cruzamento (ramo nivelado e direto) com rampa de 15 ms. Não religa nós. | Sem estalo. Com o nivelamento desligado, o ramo direto deixa a voz igual à de hoje (CA-3); o limitador só age acima de −2 dBFS. |
| T-4 | **Controle ao vivo:** `Microfone` e o retorno de `Grafo.processar` ganham `nivel: { definir({ nivelar, ganho }) }` (`setTargetAtTime` no ganho e nos cruzamentos). Em `voz.ts`, `mesmoMic` **não** inclui os campos novos, e o ramo ao vivo chama `mic.nivel.definir` ao lado de `portao.definir`. Em `TelaConfiguracoes.mudar`, ganho e nivelamento vão pelo caminho ao vivo do teste de som (como a sensibilidade), e o volume da chamada não toca no teste. | Mudar o controle deslizante não reabre `getUserMedia` nem o `AudioContext` (RF-6, CA-9). |
| T-5 | **Sem AudioWorklet** (caminho `semPortao`): fica sem nivelamento nem ganho, como hoje (`nivel.definir` não faz nada). | É o caminho de reserva, raro. Montar um grafo só nativo mexeria no contrato `DependenciasAudio` sem ganho real. Fica registrado. |
| T-6 | **Testes de nível:** a ordem dos nós é testada com um contexto falso injetado (`criarContexto`, no padrão de `soundboard.test.ts`). O CA-5 é provado pela ordem mais `LogicaPortao` (o portão só vê a entrada). **Os níveis (CA-2, CA-4) são medidos no Chromium de verdade:** a montagem dos nós (`montarNivel(ctx, params)`) aceita qualquer contexto de áudio, e um E2E roda um `OfflineAudioContext` na janela do app (função exposta só no modo de teste, como os ganchos do E2E de hoje). Ele mede um trecho a −40 e outro a −6 dBFS. | Sem o E2E, o CA-2 e o CA-4 não teriam prova; e o compressor continua sendo o do navegador (RNF). |
| T-7 | **Volume da chamada:** em `voz.ts`, `aplicarVolume` multiplica só a voz de pessoas: `min(VOLUME_PESSOA_MAX, (volumes[id] ?? 1) × volumeChamada)`. A tela (`somTelas`) e o ToOuvini (`IDENTIDADE_BOT_MUSICA`) seguem como hoje. `aplicarAudio` guarda o `volumeChamada` de forma síncrona (antes da fila) e reaplica em todas as faixas, como `definirPessoas`. | CA-6, CA-6b e CA-7. O SDK não tem volume geral da sala. |
| T-8 | **Telas:**<br>• Configurações → Voz ganha "Nivelar o volume da voz" (caixa), "Ganho do microfone" (50–300%, passo 10) e "Volume da chamada" (0–200%, passo 5).<br>• No painel de voz, um botão "Volume da chamada" abre um pequeno painel com o mesmo controle (padrão do volume do ToOuvini).<br>• Texto de ajuda: a barra mede o microfone antes do ganho e do nivelamento; para ouvir o resultado, use o teste de som.<br>• Com o "Controle automático de ganho" do Chromium também ligado, aparece um aviso de que os dois juntos podem deixar o volume oscilando. | O painel de voz já tem 6 botões: um só, que abre o controle, cabe. Os avisos evitam confusão. |
| T-9 | **Preferências:** `PreferenciasAudio` ganha `nivelarVoz: true`, `ganhoMicrofone: 1` e `volumeChamada: 1`. `mesclarAudio` valida (faixas, arredondamento de 2 casas) com constantes novas: `GANHO_MIC_MIN = 0.5`, `GANHO_MIC_MAX = 3`, `VOLUME_CHAMADA_MAX = 2`. | Arquivo antigo ganha os padrões ao mesclar: o nivelamento fica ligado para quem já usa (RN-1), sem migração. |

## 3. Componentes afetados
| Projeto | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- |
| shared | campos e validação das preferências | `shared/src/protocolo.ts:249-273,362`, `shared/src/validacao.ts:270-285` |
| client/renderer (serviços) | nós do nivelamento; controle ao vivo; volume da chamada | `servicos/pipeline-audio.ts:25,41-104,150,173`, `servicos/nivel-voz.ts` (novo), `servicos/voz.ts:137,203-221,248,275-308,452,569` |
| client/renderer (telas) | opções em Configurações → Voz; botão no painel de voz; teste de som ao vivo | `telas/TelaConfiguracoes.tsx:194-249,342-396`, `telas/TelaPrincipal.tsx:466,718,~1538-1640` |
| client/main | sem mudança (a mescla já parte do padrão) | `main/configuracoes.ts:27,83` |
| E2E | medição de nível no Chromium; CA-21 (sensibilidade) como sentinela da RN-6 | `client/e2e/voz.spec.ts` |

## 4. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `PreferenciasAudio` | 7 campos | + `nivelarVoz`, `ganhoMicrofone`, `volumeChamada` | arquivo antigo ganha os padrões |
| `Microfone` / `Grafo.processar` | faixa, medição, portão | + `nivel.definir` | interno; os dublês dos testes ganham o campo |
| `SalaVoz.aplicarAudio` | aplica microfone e portão | + volume da chamada | interno |
| `elemento.dataset.volume` | volume da pessoa | volume final (com a chamada) | igual com a chamada em 100% |

## 5. Dados
Não se aplica: só as configurações locais do app (três campos com padrão).

## 6. Segurança
Não se aplica: nada novo sai do computador e nada muda no servidor.

## 7. Observabilidade
Não se aplica: sem log novo.

## 8. Estratégia de testes
| Critério | Unitário / componente | Integração / E2E | Validação manual |
| --- | --- | --- | --- |
| CA-1 | `validacao.test.ts`: `AUDIO_PADRAO.nivelarVoz === true`; arquivo antigo mescla com ele ligado; `TelaConfiguracoes.test`: caixa marcada | — | — |
| CA-2 | `nivel-voz.test.ts`: parâmetros do compressor e do limitador | **E2E:** `OfflineAudioContext` no app com −40 e −6 dBFS: diferença de no máximo 11 dB e pico até −1 dBFS | CA-10 |
| CA-3 | cruzamento: nivelar falso → ramo direto 1, nivelado 0 | E2E: mesma entrada sem nivelar sai com a diferença original | — |
| CA-4 | `parametrosNivel` com ganho 2 | E2E: +6 dB (± 1) com ganho 200% | — |
| CA-5 | ordem dos nós (contexto falso): portão antes do ganho; `LogicaPortao` só vê a entrada | E2E `voz.spec` CA-21 (sensibilidade 0 dB não abre) continua verde | — |
| CA-6, CA-6b, CA-7 | `voz.test.ts`: 150% × 120% = 1,8; 150% × 180% = 2 (limite); chamada 0 → voz 0, tela e ToOuvini nos volumes deles | E2E `data-volume` sem mudança com 100% | — |
| CA-8 | `TelaConfiguracoes.test`: ganho e nivelar mudam o `nivel` do microfone do teste sem reabrir | — | ouvir o teste de som |
| CA-9 | `voz.test.ts`: mudar ganho e nivelar na chamada chama `nivel.definir` sem reabrir; volume da chamada reaplica nas faixas | — | — |
| CA-10 | — | — | **Manual:** Gabriel e um amigo em chamada |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | O compressor e o limitador nativos podem se comportar diferente do esperado no Electron 45 | compressor em JS no worklet | Nativo (RNF) e medido no E2E (T-6). Se o E2E mostrar desvio, ajusto os parâmetros em `parametrosNivel`. |
| R-2 | Na abertura do portão, o primeiro ataque passa antes de o compressor agir | — | O limitador segura o pico. |
| R-3 | AGC do Chromium + compressor podem fazer o volume oscilar | desligar um quando o outro liga | Aviso na tela (T-8): a pessoa escolhe. |
| R-4 | O E2E de nível depende de um gancho só de teste na janela | — | Mesmo padrão dos ganchos do E2E de hoje (só com `TOFALANDO_MIDIA_FALSA` e fora do empacotado). |

## 10. Implantação e rollback
Só o app, na atualização grande. O servidor não muda. Rollback: voltar a versão.

## 11. CI/CD
Não se aplica.

> Aprovação: o plano só começa com esta especificação aprovada (registrada no topo).
