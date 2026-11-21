# Volume da voz: especificação funcional

> Demanda: `volume-da-voz` · Versão 2 · 21/11/2026 · Situação: **aprovada em 21/11/2026**

## 1. Objetivo
Acabar com a voz baixa na chamada:
- quem fala baixo (ou tem microfone fraco) chega ao mesmo nível de quem fala alto, sem estourar quando grita;
- quem ouve pode aumentar a chamada inteira, não só uma pessoa de cada vez.

## 2. Contexto
- **Relatos de voz baixa (20/11).**
- **Hoje, do lado de quem fala:** o microfone passa pela supressão de ruído (RNNoise) e pelo portão da detecção de voz (`servicos/pipeline-audio.ts`), sem nenhum ajuste de nível. O "controle automático de ganho" do Chromium existe em Configurações → Voz, mas vem desligado desde a 0.2.0, porque mexia no volume sozinho de forma irregular.
- **Hoje, do lado de quem ouve:** dá para mudar o volume de cada pessoa, de 0 a 200% (menu da pessoa). Não existe um volume geral da chamada.
- **Teste de som:** Configurações → Voz já tem um teste que grava e toca a própria voz. É por ele que a pessoa confere o resultado.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Quem fala | Ajusta o próprio microfone (nivelamento e ganho) |
| Quem ouve | Ajusta o volume geral da chamada |

## 4. Escopo
**Dentro:**
- Nivelamento da voz no microfone (compressor com ganho de compensação), ligado por padrão, com opção de desligar.
- Ganho manual do microfone, de 50% a 300% (padrão 100%) (D-1).
- Volume geral da chamada para quem ouve, de 0 a 200%, somado ao volume de cada pessoa.
- O teste de som reflete o nivelamento e o ganho (a pessoa ouve como os outros vão ouvir).

**Fora (explícito):**
- O som da transmissão de tela (tem volume próprio) e o do ToOuvini (tem volume próprio).
- Sons do soundboard e avisos do app.
- Trocar a supressão de ruído ou o "controle automático de ganho" do Chromium (continuam como estão).

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | O nivelamento vem **ligado** para todo mundo (inclusive quem já usa o app) e pode ser desligado em Configurações → Voz. | Item 45 |
| RN-2 | O nivelamento não deixa a voz estourar: uma fala alta sai, no máximo, no mesmo nível de uma fala normal nivelada (sem distorção audível). | Item 45 |
| RN-3 | O nivelamento e o ganho são do microfone de quem fala: todos ouvem o resultado, sem precisar mexer em nada. | Item 45 |
| RN-4 | O volume geral da chamada é só de quem ouve, vale para todas as pessoas da chamada e multiplica o volume de cada pessoa; o total fica limitado a 200% (D-2). | Item 45 |
| RN-5 | As escolhas ficam guardadas neste computador, como as outras de Configurações → Voz. | Padrão do app |
| RN-6 | A detecção de voz continua decidindo pelo som **antes** do ganho: aumentar o ganho não faz o ruído de fundo abrir o microfone. | Coerência com a sensibilidade de hoje |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Configurações → Voz deve ter "Nivelar o volume da voz" (ligado por padrão). | RN-1, RN-5 |
| RF-2 | Com o nivelamento ligado, a voz enviada deve ter o nível parecido para fala baixa e alta, sem estourar. | RN-2, RN-3 |
| RF-3 | Configurações → Voz deve ter "Ganho do microfone", de 50% a 300% (padrão 100%), aplicado à voz enviada. | RN-3, RN-5 |
| RF-4 | Configurações → Voz e o painel de voz (menu da voz) devem ter "Volume da chamada", de 0 a 200%, que multiplica o volume de cada pessoa, com o total limitado a 200%. | RN-4, RN-5 |
| RF-5 | O teste de som deve tocar a voz já com o nivelamento e o ganho. | RN-3 |
| RF-6 | Mudar as opções durante a chamada deve valer na hora, sem sair da chamada. | RN-3, RN-4 |

## 7. Requisitos não funcionais
- **Atraso:** o nivelamento não acrescenta atraso perceptível (no máximo alguns milissegundos).
- **CPU:** usa o processamento de áudio do próprio navegador; sem custo perceptível em PC comum.
- **Compatibilidade:** quem tem app antigo continua ouvindo normalmente; quem tem o novo envia a voz nivelada.

## 8. Critérios de aceite
- **CA-1** (RF-1): Dado um app novo ou atualizado, quando a pessoa abre Configurações → Voz, então "Nivelar o volume da voz" está ligado.
- **CA-2** (RF-2): Dado o nivelamento ligado, quando a entrada tem um trecho baixo (−40 dBFS) e um alto (−6 dBFS), então a diferença de nível na voz enviada cai para no máximo um terço da original (de 34 dB para até ~11 dB), e o pico não passa de −1 dBFS.
- **CA-3** (RF-2): Dado o nivelamento desligado, quando a mesma entrada passa, então a voz enviada sai igual à de hoje (sem compressor).
- **CA-4** (RF-3): Dado o ganho em 200%, quando a pessoa fala, então a voz enviada sai 6 dB mais alta (respeitando o limite de pico do CA-2).
- **CA-5** (RN-6): Dado o ganho em 200% e um ruído de fundo abaixo da sensibilidade escolhida, quando ninguém fala, então o microfone continua fechado.
- **CA-6** (RF-4): Dado o volume da chamada em 150% e o volume da Ana em 120%, quando a Ana fala, então a voz dela toca a 180%.
- **CA-6b** (RF-4): Dado o volume da chamada em 150% e o volume da Ana em 180%, quando a Ana fala, então a voz dela toca a 200% (o limite), não a 270%.
- **CA-7** (RF-4): Dado o volume da chamada em 0%, quando alguém fala, então nada toca (o som da transmissão e do ToOuvini continua nos volumes deles).
- **CA-8** (RF-5): Dado o nivelamento e o ganho escolhidos, quando a pessoa faz o teste de som, então ouve a própria voz com eles aplicados.
- **CA-9** (RF-6): Dado que a pessoa está numa chamada, quando muda o nivelamento, o ganho ou o volume da chamada, então o efeito vale na hora, sem reconectar.
- **CA-10** (validação manual): Dado o Gabriel e um amigo em chamada, quem tinha a voz baixa passa a ser ouvido no mesmo nível dos outros, sem ninguém mexer no volume de ninguém.

## 9. Impacto em consumidores
- **Configurações locais:** ganham três campos novos com padrão (nivelar, ganho, volume da chamada). Arquivo de configuração antigo continua valendo.
- **Servidor:** não muda.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | ~~Ganho manual do microfone: de **50% a 300%** com padrão 100% (recomendação: com o nivelamento, quase ninguém precisa mexer, mas ele resolve microfone muito fraco), ou **sem ganho manual** (só o nivelamento)?~~ | Gabriel | 21/11: sim, de 50% a 300%, padrão 100%. |
| D-2 | ~~Volume geral × volume da pessoa: o resultado pode passar de 200% (até 400%, 200% × 200%), ou fica **limitado a 200%** no total? Recomendação: limitar a 200% no total, para não distorcer.~~ | Gabriel | 21/11: limitar a 200% no total. |
