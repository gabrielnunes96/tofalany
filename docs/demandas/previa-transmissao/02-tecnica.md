# Prévia da transmissão e chat legível — especificação técnica

> Demanda: `previa-transmissao` · Base: funcional v2 · 23/11/2026 · Situação: **rascunho: depende da decisão R-1**

## 1. Visão da solução
**Prévia.** Na faixa "<nome> está transmitindo a tela" (`PainelTransmissao.tsx:122-134`), o `<video muted>` passa a ser anexado também quando a pessoa **não** assiste (hoje só em `assistindo`, `:106-111`), num quadro pequeno de 160×90.
- A prévia não chama `aoAssistir`, então não emite `tela:assistir` e o olho não muda (RN-3, por construção).
- A pausa fora da tela vem de graça: o `adaptiveStream` do livekit-client 2.23 observa a visibilidade do elemento anexado (IntersectionObserver) e pausa a assinatura quando ele sai da tela ou fica escondido (RN-2).

**Qualidade baixa (R-1, decisão sua).** Hoje a tela é publicada com uma camada só (`simulcast: false`, `servicos/voz.ts:500-506`, 2,5 a 10 Mbps). Assim, a prévia receberia a transmissão inteira, por menor que fosse o quadro. A proposta:
- publicar a tela com `simulcast: true` e `screenShareSimulcastLayers: [new VideoPreset(320, 180, 150_000, 5)]`;
- com o `dynacast` já ligado (`voz.ts:132`), essa camada só é codificada e enviada **enquanto alguém olha uma prévia**;
- o `adaptiveStream` escolhe a camada pelo tamanho do elemento, então a prévia pede a pequena sozinha e quem assiste em tela grande recebe a cheia.
- Isso exige um ajuste de texto na RN-3 (funcional v2): a camada extra só é enviada enquanto há prévia aberta.

**Ocultar uma prévia (RN-6).** Botão de ícone (olho riscado / olho, `aria-pressed`, rótulo "Ocultar prévia"/"Exibir prévia") na faixa; estado `previasOcultas: Set<usuarioId>` na `TelaPrincipal`, só em memória. Oculta → o `<video>` é desanexado (`detach`) e o SDK desassina a camada; com dynacast, se ninguém mais olha a prévia, quem transmite para de codificar a camada pequena.

**Desligar todas.** Nova preferência `previas` em `ConfiguracoesLocais`, ligada por padrão, com uma caixa em Configurações → Voz. Desligada, a faixa fica como hoje.

**Chat legível.** Hoje os painéis de transmissão são `flex: none` com `max-height: 60vh` cada (`base.css:656-658`), e o chat pode ir a zero (`base.css:376-377`). A mudança:
- os painéis passam a ficar num contêiner `.transmissoes` com `max-height: calc(100% - var(--chat-minimo))`;
- cada painel fica com `flex: 1 1 0` e `min-height: 0`, e o vídeo com `object-fit: contain`, para encolher mantendo a proporção;
- `--chat-minimo` são 8 linhas mais a caixa de escrever: `calc(8 * var(--linha-chat) + var(--altura-composer))`.

```text
faixa não assistida + previas ligada ─► ligarFaixa(faixa, <video 160×90 muted>)  (sem aoAssistir)
   adaptiveStream: visível? assina camada 320×180@5fps (dynacast liga a camada em quem transmite) : pausa
Assistir ─► aoAssistir(true) + elemento grande ─► adaptiveStream pede a camada cheia
```

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| client: renderer | front | Prévia anexada na faixa; prop `previas`; publicação com simulcast e camada própria; contêiner `.transmissoes` com chat mínimo | `componentes/PainelTransmissao.tsx:14,61-70,106-134,152`, `servicos/voz.ts:39,491,500-506`, `servicos/faixa-em-janela.ts:30-36`, `telas/TelaPrincipal.tsx:597,2391,2443-2458,2532`, `telas/TelaConfiguracoes.tsx:316,410`, `estilos/base.css:327,376-377,395,656-658,1284` |
| shared | node | `ConfiguracoesLocais.previas?: boolean` (padrão `true`) | `shared/src/protocolo.ts:332,436` |
| client: main | node | `mesclar` lê `previas` | `client/src/main/configuracoes.ts:15-75` |

## 3. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `ConfiguracoesLocais.previas` | — | `boolean`, padrão `true` | Opcional |
| Publicação da tela | camada única | simulcast: camada cheia + 320×180@5fps/150 kbps | App antigo assinando continua recebendo a cheia; app novo assistindo transmissão de app antigo tem prévia na camada cheia (pesada); aceito até todos atualizarem |
| `tela:assistir` / `tela:espectadores` | — | Sem mudança | — |

## 4. Dados
Só a configuração local.

## 5. Integrações externas
livekit-client 2.23.0:
- `TrackPublishOptions.simulcast`;
- `screenShareSimulcastLayers` (`dist/src/room/track/options.d.ts:107`);
- `VideoPreset`;
- `dynacast` e `adaptiveStream` (já ligados).

O preset padrão do SDK para tela daria 625 kbps em 720p, por isso a camada é própria. Simulcast de H.264 com `backupCodec: false`: o servidor LiveKit 1.13 suporta, mas a combinação não foi verificada aqui. Validar com duas máquinas (R-3).

## 6. Segurança
A prévia mostra a tela de quem transmite antes do clique em Assistir. Quem transmite já escolheu mostrar para a sala, e qualquer pessoa da sala pode assistir com um clique, então não há exposição nova além do "olho" não contar a prévia (RN-3, pedido pelo usuário). Fica registrado na nota da versão.

## 7. Observabilidade
Validação manual de banda pelo `chrome://webrtc-internals`, ou pelas estatísticas do LiveKit (bytes recebidos da faixa na prévia).

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | `transmissao.test.tsx`: sem assistir e com `previas`, anexa `<video muted>` | — | Usuário com um amigo transmitindo |
| CA-2 | `transmissao.test.tsx`: prévia não chama `aoAssistir` | `tela.test.ts` (continua) | idem |
| CA-3 | — (comportamento do SDK) | — | Usuário: rolar ou esconder a conversa; webrtc-internals mostra a faixa parada |
| CA-4 | `transmissao.test.tsx`: `previas=false` não anexa; `TelaConfiguracoes.test.tsx` caixa; `configuracoes.test.ts` valida | — | — |
| CA-6 | `transmissao.test.tsx`: clicar em ocultar desanexa e o botão vira "Exibir prévia"; clicar de novo anexa | — | — |
| CA-5 | — | E2E `voz.spec.ts`: duas transmissões falsas assistidas, janela de 900 px, altura do chat ≥ 8 linhas | — |
| NFR ~150 kbps | `voz.test.ts`: publica com `simulcast` e a camada | — | Usuário: medir |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | **Decisão do usuário.** Como a prévia fica leve | (A) simulcast com camada pequena, enviada só enquanto há prévia (custo pequeno para quem transmite); (B) sem camada extra: a prévia recebe a transmissão inteira (2,5 a 10 Mbps por prévia, contra a NFR); (C) foto a cada ~5 s mandada por quem transmite (leve, mas não é ao vivo) | **Proposta: (A)**, com ajuste da RN-3 na funcional |
| R-2 | Quatro prévias ao mesmo tempo (`LIMITE_TELAS_POR_CANAL = 4`) | — | ~600 kbps no pior caso; dá para desligar (RN-4) |
| R-3 | H.264 com simulcast em máquina sem codificação por hardware | — | Validação manual; se degradar, a camada pequena passa a VP8 (`videoCodec` por camada não existe; seria a tela toda) e vira decisão nova |
| R-4 | Chat mínimo muda o layout da conversa | só CSS; reestruturar | **Contêiner novo + CSS**: mudança pequena no JSX da `TelaPrincipal` |

## 10. Implantação e rollback
Só app. Rollback: versão anterior.

## 11. CI/CD
Sem mudança.
