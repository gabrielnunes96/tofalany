# Correções da voz e da transmissão (AFK, reentrada, teste de microfone, atualização, espectadores, prévia da loja) — especificação técnica

> Demanda: `teste-de-microfone` · Base: funcional v2 · 23/11/2026 · Situação: **aprovada em 23/11/2026**

## 1. Visão da solução
Seis correções independentes. As duas do servidor (59 e 65) são as mais urgentes, porque derrubam a pessoa em produção.

- **59, AFK que derruba.** Hoje, quando o servidor de mídia avisa a saída da sala antiga (`participant_left`), a presença é apagada na hora (`midiaSaiu`, `server/src/realtime/voz.ts:308-315`). Por isso o `voz:estado {motivo:'afk'}`, que chega logo depois, cai na checagem A8 (`voz.ts:189`).
  - Correção: `midiaSaiu` passa a dar um **prazo de troca** de 10 s (`prazoMover`) antes de tirar.
  - Se a mesma conexão mandar `voz:estado` nesse prazo, a troca segue normal: a presença ainda existe, então a A8 passa e não há "saiu/entrou" piscando para os outros. Se a pessoa voltar à mesma sala de mídia (`midiaEntrou`), também segue normal.
  - Sem nada disso, a presença sai como hoje, com o motivo `midia_saiu`.
- **65, reentrada recusada.** A regra de reincidência de `midiaEntrou` (`remocoesRecentes`, `JANELA_REINCIDENCIA_MS`, `voz.ts:62,98,317-339`) tira na hora quem entra na mídia antes de avisar a sala. O app sempre faz isso. Assim, depois de uma remoção, toda tentativa por 5 min é derrubada, e cada uma renova a janela.
  - Correção: apagar a regra.
  - Continua: quem não tem `entrar_voz` sai na hora, e quem não está na presença daquela sala sai em 10 s.
  - Um app em ciclo com token velho passa a ser tirado a cada 10 s, em vez de na hora. O token dura 6 h, e o ciclo só acontece com app modificado.
- **53, teste de microfone dentro da sala.**
  - O caminho do retorno não depende da sala (`TelaConfiguracoes.tsx:198-242`, `pipeline-audio.ts:116-178`). A única diferença é uma segunda captura do mesmo microfone, aberta pela sala (`servicos/voz.ts:292-325`).
  - Primeiro passo: reproduzir com um E2E (microfone falso, dentro da sala), medindo o sinal que chega ao elemento de retorno com um `AnalyserNode`.
  - Correção pela causa achada:
    - **(a)** se a captura do teste morre ou fica muda com a captura da sala aberta, o teste passa a usar um clone da faixa crua da sala (`MediaStreamTrack.clone()`) como fonte do próprio grafo de tratamento, sem abrir uma segunda captura;
    - **(b)** se o problema é o cancelamento de eco cancelando o próprio retorno, o retorno sai por um `AudioContext` próprio para a saída escolhida.
  - Os dois mantêm RN-3 e RN-4. O mudo e o surdo durante o teste já funcionam (`TelaPrincipal.tsx:842-877`).
- **54, atualização com a chamada no fundo.**
  - Novo módulo `servicos/saida-voz.ts`, com duas funções:
    - `registrarSaidaVoz(fn)`: a `TelaPrincipal` que está na voz registra o seu `sairVoz` (`TelaPrincipal.tsx:1837-1855`);
    - `sairDaVozAntesDeAtualizar()`: chama todas as funções registradas, com teto de 3 s.
  - `AvisoAtualizacao.reiniciar` (`AvisoAtualizacao.tsx:17-22`) e `AtualizarAgora.instalar` (`AtualizarAgora.tsx:39-47`) esperam essa saída antes de mostrar `TelaAtualizando` e chamar `atualizacao.instalar()`.
  - O texto "Você vai sair da chamada" passa a ser verdade. Nada muda no IPC.
- **58, espectadores.** O contador flutuante sai por inteiro, porque é ele que soma entre transmissões (`TelaPrincipal.tsx:2460-2466`). O olho do painel já mostra a contagem do servidor (`tela.ts:59-65`), sem quem transmite.
  - A lista (`Espectadores.tsx:39-51`) mede o espaço ao abrir (`getBoundingClientRect` do botão contra o painel e a janela).
  - Ela abre para cima (classe `para-cima`) quando falta espaço embaixo, e limita o `max-height` ao espaço que houver.
  - Isso é necessário porque o `.transmissao-grande` tem `overflow: hidden` (`base.css:657`). Um portal não serve, porque em tela cheia só o elemento em tela cheia aparece.
- **64, prévia da loja.** Novo módulo `servicos/previa-audio.ts` com um tocador único, `tocar(id, url)`, `pausar()`, `aoMudar(cb)` e o limite de 10 s.
  - `TelaLoja` guarda `tocandoId` e alterna o botão entre "Ouvir" e "Pausar".
  - Em `TelaAudiosLoja`, o `<audio controls>` nativo chama `pausarOutros` no `onPlay`.

```text
59  sala.sair() ─► webhook participant_left ─► midiaSaiu: p.saidaMidia = setTimeout(tirar, 10 s)
    voz:estado {afk} (mesma conexão) ─► atual existe ─► A8 ok ─► clearTimeout(saidaMidia) ─► troca de canal normal
65  participant_joined (antes do voz:estado) ─► !pode? tira já : naPresenca? ok : espera 10 s e confere
54  [Reiniciar] ─► await sairDaVozAntesDeAtualizar() (voz:estado null + sala.sair) ─► TelaAtualizando ─► instalar()
```

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| server | node | `Presente.saidaMidia` (timer); `midiaSaiu` com prazo; `voz:estado` e `midiaEntrou` limpam o timer; `tirar` limpa os dois timers; sai `remocoesRecentes` e `JANELA_REINCIDENCIA_MS` | `server/src/realtime/voz.ts:62,98,136-145,158-204,286-292,308-341` |
| client: renderer | front | `servicos/saida-voz.ts` (novo); `AvisoAtualizacao`, `AtualizarAgora` esperam a saída; `TelaPrincipal` registra `sairVoz`; teste de microfone pela causa achada; `Espectadores` abre para o lado com espaço; remoção do contador; `servicos/previa-audio.ts` (novo); `TelaLoja`, `TelaAudiosLoja` | `componentes/AvisoAtualizacao.tsx:17-22`, `componentes/AtualizarAgora.tsx:39-56`, `telas/TelaPrincipal.tsx:599,630,726-731,842-877,1837-1855,2460-2466,2579`, `telas/TelaConfiguracoes.tsx:3,80-82,119,198-242,633-664`, `servicos/pipeline-audio.ts:116-178`, `servicos/voz.ts:292-325`, `componentes/Espectadores.tsx:39-51`, `componentes/ContadorEspectadores.tsx` (sai), `estilos/base.css:657,929,1402-1405`, `telas/TelaLoja.tsx:84-93,364-365`, `telas/TelaAudiosLoja.tsx:133` |
| shared | node | Sai `ConfiguracoesLocais.contador`, `PreferenciasContador`, `CONTADOR_PADRAO`, `mesclarContador` | `shared/src/protocolo.ts:361-375`, `shared/src/validacao.ts:413-430` |
| client: main | node | `mesclar` deixa de ler `contador` (some ao gravar) | `client/src/main/configuracoes.ts:34` |

## 3. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `voz:estado` com `motivo:'afk'` | Recusado se o `participant_left` chegou antes | Aceito dentro do prazo de troca (10 s), na mesma conexão | App antigo ganha a correção sem atualizar (só servidor) |
| Webhook `participant_joined` | Reincidente em 5 min é tirado na hora | Só sem permissão é tirado na hora; o resto espera 10 s | Só servidor |
| `ConfiguracoesLocais.contador` | Existe | Removido; ignorado se vier no arquivo | Versão antiga lendo arquivo novo usa o padrão |
| `tela:espectadores` | — | Sem mudança | — |

## 4. Dados
Nada no banco. Configuração local: `contador` deixa de ser gravado.

## 5. Integrações externas
- LiveKit 1.13.11: webhook `participant_left` e `participant_joined` (`server/src/routes/livekit.ts:86-105`), sem mudança. O LiveKit dos testes E2E sobe sem webhook, e é por isso que o 59 passou. Os testes novos chamam `midiaSaiu`/`midiaEntrou` direto, e `server/test/voz.test.ts` usa o `webhook()` assinado.
- electron-updater 6.8.11: `quitAndInstall` sem gancho para sair da voz. A saída vem do renderer, antes do IPC.

## 6. Segurança
- A A8 (RN-2) continua valendo. O prazo de troca só existe para a **mesma conexão** que estava na presença; outra conexão, ou alguém que nunca esteve em chamada, segue recusado (`afk-voz.test.ts:61-65`).
- O 65 tira uma defesa contra reentrada em ciclo. O que fica (permissão na hora, presença em 10 s, token de 6 h) é suficiente para app modificado; registrado como R-2.

## 7. Observabilidade
A auditoria `voz_afk` volta a registrar o `de` (sala de origem), porque a presença existe no momento da ida. Sai o `voz_saiu`/`midia_saiu` espúrio a cada troca de sala.

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | — | `afk-voz.test.ts`: `midiaSaiu` da sala antiga e depois `voz:estado {afk}` dá ok, mudo, auditoria com `de`; `voz.test.ts` com `webhook('participant_left')` assinado | Usuário: ficar parado na sala em produção |
| CA-2 | — | `afk-voz.test.ts:61-65` continua; novos: outra conexão no prazo e mesma conexão após 10 s (fake timers) são recusadas | — |
| CA-11 | — | `voz-midia.test.ts`: tirado da mídia, depois `participant_joined` e `voz:estado` da mesma sala dá que fica; sem `entrar_voz` é tirado na hora; fora da presença é tirado em 10 s | Usuário: entrar de novo na sala depois de cair |
| CA-3 | `TelaConfiguracoes.test.tsx:116-140` (continua) | — | — |
| CA-4, CA-5 | `TelaConfiguracoes.test.tsx`: estado antes/depois do teste | E2E novo em `voz.spec.ts`: na sala, testar e medir sinal no retorno (`AnalyserNode`) | Usuário: se ouvir dentro da sala, retorno ≤ 300 ms |
| CA-6 | `AvisoAtualizacao.test.tsx`, `AtualizarAgora.test.tsx`: ordem sair, depois instalar; teto de 3 s; `saida-voz.test.ts` | — | Usuário: atualizar dentro da chamada |
| CA-7 | `TelaConfiguracoes.test.tsx` sem o fieldset; `configuracoes.test.ts` ignora `contador` | E2E `voz.spec.ts:967`: sem `.contador-espectadores`, com `.espectadores-botao` | — |
| CA-8 | `transmissao.test.tsx:211-224` (continua) | `tela.test.ts:117-135` (continua) | — |
| CA-9 | `Espectadores.test.tsx` (novo): espaço simulado embaixo e em cima | — | Usuário: modo teatro e tela cheia |
| CA-10 | `previa-audio.test.ts` (novo); `TelaLoja.audios.test.tsx:55-69` com Ouvir/Pausar; `TelaAudiosLoja.test.tsx` pausa o outro | — | — |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Como aceitar a AFK depois do `participant_left` | (a) lembrar a saída recente por conexão e aceitar na A8; (b) prazo de troca no `midiaSaiu`; (c) app manda `voz:estado` antes de sair da sala antiga | **(b)**: um ponto só, também acaba com o "saiu/entrou" piscando e com o `voz_saiu` falso na auditoria em toda troca de sala, e não tira o bot de música por engano. (c) depende de atualizar o app e o webhook ainda chegaria depois |
| R-2 | Tirar a reincidência enfraquece a defesa contra app em ciclo | manter com janela curta; apagar | **Apagar**: a regra derruba gente legítima e se renova sozinha. Com permissão e presença conferidas, o pior caso é um app modificado entrar 10 s por vez |
| R-3 | Com o prazo de troca, quem cai da mídia sem avisar continua na lista da sala por até 10 s | aceitar; prazo menor | **Aceitar**: já existe carência de 30 s para queda do tempo real |
| R-4 | Causa do 53 não reproduzida | (a) reusar a faixa da sala; (b) retorno fora do cancelamento de eco | A tarefa começa pelo E2E que reproduz e escolhe pela causa. Se o E2E não reproduzir (Linux, microfone falso), segue com (a) e pede a validação ao usuário |
| R-5 | `TelaAudiosLoja` (admin) sem limite de 10 s | aplicar; não aplicar | **Só pausar os outros**: o admin precisa ouvir o áudio inteiro para revisar |
| R-6 | Nota da 0.18.0 cita o contador (`novidades.ts:19`) | reescrever; nota nova | **Nota nova** na próxima versão; histórico não se reescreve |

## 10. Implantação e rollback
Servidor e app na mesma versão. As correções 59 e 65 valem só com o servidor atualizado, inclusive para apps 0.18.x. Rollback: voltar a imagem anterior; não há migração.

## 11. CI/CD
Sem mudança; `ci.yml` e `release.yml` como estão.
