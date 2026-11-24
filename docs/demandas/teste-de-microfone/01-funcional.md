# Correções da voz e da transmissão (AFK, teste de microfone, atualização, espectadores) — especificação funcional

> Demanda: `teste-de-microfone` · Itens 59, 53, 54 e 58 · Versão 1 · 23/11/2026 · Situação: **rascunho**

## 1. Objetivo
Acertar quatro coisas que atrapalham a chamada: a ida para a AFK que derruba a pessoa, o teste de microfone que não funciona dentro da sala, a chamada que continua escondida enquanto o app atualiza, e o contador de espectadores que confunde.

## 2. Contexto
- **59:** na 0.18.0, ao ficar inativa, a pessoa sai da voz em vez de ir para a AFK (causa achada: o servidor recusa a ida para a AFK depois que a sala antiga já avisou a saída).
- **53:** em Configurações → Voz, o teste de microfone funciona fora de uma sala; dentro de uma sala, a pessoa não se ouve.
- **54:** na tela de atualização (ícone girando), a chamada continua no fundo: a pessoa ouve e é ouvida sem ver nada.
- **58:** há dois "olhos" de espectadores (o flutuante da 0.18.0 e o do painel da transmissão), com números diferentes; a lista do olho fica cortada dentro da transmissão.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Pessoa na voz | Fica inativa, testa o microfone, atualiza o app, assiste transmissões. |
| Quem transmite | Vê quantos e quem assistem. |

## 4. Escopo
**Dentro:** os quatro itens acima, no app de computador (Windows e Linux) e no servidor.

**Fora:** mudar o tempo da AFK, o visual do teste de som, o processo de atualização em si (download e instalação) e o modo teatro.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Ir para a AFK por inatividade nunca tira a pessoa da voz: ela termina na sala de AFK. | Item 59 |
| RN-2 | A ida para a AFK continua sendo recusada para quem não estava em chamada por aquela conexão. | Segurança (A8 de mover-e-afk) |
| RN-3 | Durante o teste de microfone, a pessoa se ouve como os outros vão ouvi-la (com ganho, nivelamento e supressão), pela saída escolhida, esteja ou não numa sala. | Item 53 |
| RN-4 | Dentro de uma sala, começar o teste muta a pessoa e tira o som da chamada para ela; parar o teste devolve exatamente o estado de antes (se já estava muda, continua muda). | Item 53 |
| RN-5 | Antes de reiniciar para instalar uma atualização, o app sai da voz (como "Sair da voz"): avisa o servidor e para microfone, câmera e transmissão. Ao abrir a versão nova, não volta sozinho para a sala. | Item 54 |
| RN-6 | O contador de espectadores flutuante deixa de existir, com o arrastar, a posição guardada e as cores em Aparência. | Item 58, usuário 23/11 |
| RN-7 | O olho do painel da transmissão mostra quantas pessoas estão assistindo aquela transmissão agora, o mesmo número para todos; quem transmite não conta. | Item 58 |
| RN-8 | A lista de quem assiste abre para o lado que tiver espaço e nunca passa da borda do vídeo ou da janela. | Item 58 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Ida para a AFK que sobrevive à saída da sala antiga. | RN-1, RN-2 |
| RF-2 | Teste de microfone que funciona dentro da sala, com mudo automático e volta ao estado anterior. | RN-3, RN-4 |
| RF-3 | Sair da voz antes de instalar a atualização. | RN-5 |
| RF-4 | Remover o contador flutuante; contagem única e lista que cabe na tela. | RN-6, RN-7, RN-8 |

## 7. Requisitos não funcionais
- O retorno do teste com atraso perceptível de no máximo 300 ms (medido na validação manual).

## 8. Critérios de aceite
- **CA-1** (RN-1): Dado a AFK ligada e a pessoa parada numa sala, quando passa o tempo, então ela está na sala de AFK, mutada, e continua na voz (com o servidor de mídia avisando a saída da sala antiga antes, como em produção).
- **CA-2** (RN-2): Dado uma conexão que nunca esteve em chamada, quando ela pede a AFK, então é recusada.
- **CA-3** (RN-3): Dado a pessoa fora de uma sala, quando testa o microfone, então se ouve (como hoje).
- **CA-4** (RN-3, RN-4): Dado a pessoa numa sala com o microfone aberto, quando começa o teste, então se ouve, os outros não a ouvem e ela não ouve a chamada; quando para, volta a falar e ouvir na chamada.
- **CA-5** (RN-4): Dado a pessoa muda na sala, quando começa e para o teste, então continua muda depois.
- **CA-6** (RN-5): Dado a pessoa na voz, quando manda atualizar e o app reinicia, então os outros a veem sair da sala antes da tela de atualização, e ao abrir a versão nova ela não está em nenhuma sala.
- **CA-7** (RN-6): Dado uma transmissão aberta, quando se olha a tela, então não há olho flutuante, e Configurações → Aparência não tem mais as cores do contador.
- **CA-8** (RN-7): Dado Ana transmitindo e Bia e Caio assistindo, quando Ana, Bia, Caio e Dani (sem assistir) olham o olho, então todos veem 2.
- **CA-9** (RN-8): Dado a transmissão em tela grande, modo teatro ou tela cheia, quando a pessoa abre a lista do olho perto da borda de baixo, então a lista abre para cima, inteira.

## 9. Impacto em consumidores
Só o app e o servidor. A preferência `contador` some das configurações locais (ignorada se existir).

## 10. Dúvidas em aberto
Não há.
