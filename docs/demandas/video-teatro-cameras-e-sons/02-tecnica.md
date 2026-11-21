# Vídeo: modo teatro, câmeras e sons da transmissão — especificação técnica

> Demanda: `video-teatro-cameras-e-sons` · Base: funcional v1 · 21/11/2026 · Situação: **aprovada em 21/11/2026**

## 1. Visão da solução
Só o app muda (servidor, protocolo e banco ficam iguais).

- **Causa dos cortes (itens 49 e 50):** o painel do meio (`main.conteudo`) tem `backdrop-filter: blur(18px)` (`base.css:986-988`) e `overflow: hidden`. Um `backdrop-filter` faz o elemento virar o bloco de referência de todo `position: fixed` dentro dele. Por isso a janelinha das câmeras (`.grade-videos.flutuante`), a prévia ampliada (`.previa-ampliada-fundo`) e qualquer camada "fixa" ficam presas ao painel do meio e são cortadas nas bordas dele. A posição é limitada por `window.innerWidth`, mas conta a partir do canto do painel. **Correção:** tudo o que flutua sobre o app (câmeras flutuantes, modo teatro, prévia ampliada, contador) é desenhado direto no `document.body` com `createPortal`, sem tirar o vidro do painel.
- **Janela própria:** `window.open('about:blank', '<nome fixo>')` a partir da janela principal, liberado no processo principal só para os nomes conhecidos. A janela filha é do mesmo processo e da mesma origem: o React da principal desenha nela por `createPortal`, e o `<video>` dela recebe a mesma `MediaStreamTrack` (sem nova conexão, sem recodificar). Primeiro um protótipo (R-1).
- **Barra de controles** única (`ControlesVideo`) usada no painel, no modo teatro, na tela cheia, na janela própria e na prévia de quem transmite; vira só ícones em largura estreita.
- **Sons:** quatro notas novas em `sons-voz.ts`, disparadas pela diferença entre o estado antes e depois dos eventos `tela:iniciada`, `tela:parada` e `tela:espectadores` que já chegam.
- **Contador flutuante:** componente novo, desenhado no `body`, com posição e cores nas configurações locais.

```text
LiveKit (voz.ts) → faixas de câmera e de tela → TelaPrincipal
  ├─ GradeVideos ──(modo)──┬─ grade no painel (como hoje)
  │                        ├─ flutuante: portal → document.body (z 45), posição limitada pela janela
  │                        └─ janela própria: window.open('about:blank','tofalany-cameras') → portal no body da filha
  ├─ PainelTransmissao ──(modo)──┬─ painel (como hoje) + ControlesVideo
  │                              ├─ teatro: portal → body (z 70), Esc/clique fora sai
  │                              ├─ tela cheia (como hoje)
  │                              └─ janela própria: window.open('about:blank','tofalany-transmissao-<id>')
  ├─ PreviaLocal (quem transmite) → ampliada em portal → body + ControlesVideo (com Prévia)
  ├─ ContadorEspectadores (novo) → portal → body (z 46)
  └─ sons: aoTelaIniciada / aoTelaParada / aoTelaEspectadores → diferença → tocar(som) se a preferência deixar
main: setWindowOpenHandler → allow só about:blank + nome conhecido + frame principal → did-create-window
      (travas, posição salva, monitor conferido, fecha junto com a principal)
```

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| client: main | node | Exceção controlada no `setWindowOpenHandler`; `did-create-window` com travas, posição e tamanho; travas globais em `web-contents-created`; janelas próprias fora da lista de captura | `client/src/main/index.ts:81-165`, `client/src/main/captura.ts:43-53`, `client/src/main/configuracoes.ts:15-79` |
| client: renderer | front | Portais para o `body`; `ControlesVideo` novo; modo teatro; janela própria (`JanelaPropria` com portal); "Voltar as câmeras ao lugar"; sons; `ContadorEspectadores` novo; Configurações (sons e cores) | `GradeVideos.tsx`, `PainelTransmissao.tsx`, `Espectadores.tsx`, `telaCheia.ts`, `TelaPrincipal.tsx:520-526, 1016-1020, 1738-1858, 2070-2102, 2374-2423`, `TelaConfiguracoes.tsx:402-409, 561-600`, `servicos/sons-voz.ts`, `servicos/voz.ts:122`, `estilos/base.css` |
| shared | node | `PreferenciasSons` com 4 sons; `ConfiguracoesLocais.contador` e `.janelasProprias`; `mesclarContador`, `mesclarJanelas`; razão de contraste | `shared/src/protocolo.ts:289-318, 364-371`, `shared/src/validacao.ts:93, 320-327` |
| server | — | Não muda | — |

## 3. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `PreferenciasSons` | `{ voz, soundboard }` | + `telaAbrir`, `telaFechar`, `assistirComecar`, `assistirParar` (ligados em `SONS_PADRAO`) | App antigo que gravar `sons` descarta as novas; voltam ligadas pelo padrão |
| `ConfiguracoesLocais` | — | + `contador?: { cores: { olho, fundo, numero, borda }; posicao: { x, y } }` (x e y de 0 a 1) e `camerasPosicao?` (hoje no localStorage `tofalany.cameras`, migrado) | Chaves opcionais, validadas no `mesclar` do main |
| Configuração do main (arquivo à parte, não exposta ao renderer) | — | `janelas-proprias.json`: `{ cameras?, transmissao? }` com `{ x, y, largura, altura }` | Só o main lê e grava (A4) |
| `SomVoz` | 6 sons | + `tela-abrir`, `tela-fechar`, `assistir-comecar`, `assistir-parar` | Interno |
| `setWindowOpenHandler` | nega tudo | permite só `about:blank` com nome `tofalany-cameras` ou `tofalany-transmissao-<id>` vindo do frame principal; o resto como hoje | — |
| Servidor (`tela:*`, `espectadores`) | — | Igual | Servidor antigo sem `espectadores`: contador e sons de assistir não aparecem |

## 4. Dados
Sem banco. Configurações locais:
- `contador` e `camerasPosicao` em `ConfiguracoesLocais` (arquivo de configurações do app), validados em `shared/validacao.ts`; inválido volta ao padrão.
- A posição das câmeras sai do `localStorage` (`tofalany.cameras`) para as configurações, para o botão "Voltar ao lugar" (fora do componente) poder mexer; o valor antigo é lido uma vez e migrado.
- Posição e tamanho das janelas próprias em `janelas-proprias.json`, só no main, com gravação adiada (500 ms) para não reescrever a cada pixel.

## 5. Integrações externas
- **LiveKit (livekit-client 2.23):** com `adaptiveStream`, o vídeo pausa quando a janela principal fica escondida (`pauseVideoInBackground`, padrão verdadeiro), e a janela própria congelaria com o app minimizado. Decisão: `adaptiveStream: { pauseVideoInBackground: false }` (R-3).
- **Electron 45:** `window.open` com `overrideBrowserWindowOptions`, `outlivesOpener` (falso: a filha fecha com a principal) e `did-create-window`; `screen.getAllDisplays()`/`getDisplayMatching()` para o monitor.

## 6. Segurança
Modelagem STRIDE de 21/11 (A1 a A10). Mitigações:
- **A1 — abrir janela:** `allow` só com `url === 'about:blank'`, nome na lista fechada (`tofalany-cameras`, `tofalany-transmissao-<id>` com id numérico) e o frame que chamou sendo o principal da janela principal; o resto continua negado (links http(s) no navegador). Uma janela por nome (a segunda chamada só foca), no máximo 5.
- **A2 — travas da filha:** `overrideBrowserWindowOptions.webPreferences` fixo (`sandbox`, `contextIsolation`, sem `nodeIntegration`, sem `webviewTag`); `will-navigate`/`will-redirect` e `setWindowOpenHandler` (negar) aplicados a todo `webContents` em `app.on('web-contents-created')`.
- **A3 — sem ponte na filha:** `preload` vazio na filha (ela não precisa do `window.tofalando`); os IPCs sensíveis (`sessao:*`, `arquivo:*`, `config:gravar`, `captura:*`) passam a exigir o frame principal da janela principal.
- **A4/A5 — geometria só no main:** o renderer não manda posição nem tamanho; o main lê `getBounds()` da filha e grava. Ao abrir, `limitesSeguros(salvo, monitores, principal)` confere a interseção com as áreas de trabalho (pelo menos 100×40 px visíveis); senão, centraliza no monitor da janela principal. `display-removed` reavalia.
- **A6 — vídeo depois de sair:** a janela própria fecha (e solta o vídeo) ao sair da voz, ser desconectado (inclusive expulsão), trocar de canal ou de servidor, sair da conta, ou a transmissão acabar. A filha nunca conecta ao LiveKit.
- **A7 — captura:** `captura:fontes` e `captura:escolher` tiram as fontes das janelas do próprio app (principal e próprias) da lista de janelas.
- **A8 — cores:** só `#rrggbb` (`validarCor`), posição de 0 a 1 finita; aplicadas por `style` do React ou `setProperty` com o valor já validado, nunca em texto de `<style>`.
- **A10 — título:** fixo ("ToFalany – Câmeras" / "ToFalany – Transmissão").

## 7. Observabilidade
Não se aplica além do que existe: logs do main para janela recusada (nome desconhecido) e para limites corrigidos.

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | `limitarNaJanela` (posição fora volta ao canto) | — | E2E: soltar sobre a lista de membros → `elementFromPoint` no centro é a janelinha |
| CA-2 | botão no painel de voz e em Aparência mudam a posição para o canto | — | E2E: depois de arrastar, "Voltar as câmeras ao lugar" |
| CA-3 | — | — | E2E: `app.waitForEvent('window')`, vídeo na filha, fechar devolve |
| CA-4 | `limitesSeguros` (dentro, meio fora, fora de tudo) | — | Manual: outro monitor (Gabriel) |
| CA-5 | — | — | E2E (transmissão com mídia falsa) e manual |
| CA-6 | `ModoTeatro`: Esc e clique fora saem; caixa dentro da janela | — | E2E: caixa do vídeo dentro da janela |
| CA-7 | `ControlesVideo` estreito: só ícones com nome acessível | — | E2E: janela 900 px, todos os botões dentro da janela |
| CA-8 | botões por papel (assiste × transmite) | — | — |
| CA-9 | auto-esconder com relógio falso (3 s) | — | — |
| CA-10 | fechar sai do teatro e da tela cheia; janela própria fecha | — | E2E |
| CA-11 | `sonsDaTransmissao(antes, depois, eu, minhaVoz)` devolve os sons certos para cada papel | — | Manual com três pessoas |
| CA-12 | preferência desligada e surdo não tocam; entrar e sair em < 1 s não repete | — | — |
| CA-13 | contador aparece com transmissão no meu canal e some quando fecha | — | E2E |
| CA-14 | posição proporcional e volta ao canto | — | — |
| CA-15 | `razaoDeContraste` (WCAG) e aviso abaixo de 3:1; "voltar ao padrão" | `mesclarContador` (valores inválidos) | — |
| Segurança | handler do `window.open` (A1), `limitesSeguros` (A5), fontes de captura sem as janelas do app (A7), `mesclarContador`/`mesclarJanelas` (A4, A8) | — | E2E: `window.open('https://…')` não cria janela; na filha `window.tofalando` é `undefined`; sair da voz fecha a filha |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Janela própria com o mesmo vídeo | (a) `window.open('about:blank')` + portal, mesma faixa; (b) janela independente com par WebRTC local; (c) `captureStream()`; (d) segunda conexão ao LiveKit | (a): sem nova conexão nem recodificação. Não confirmado em Electron 45 com `sandbox` e página em `file://`: **a primeira tarefa é um protótipo**. Se não funcionar, volto com as opções antes de seguir. |
| R-2 | Corte de tudo o que flutua | tirar o `backdrop-filter` do painel; desenhar no `body` | Desenhar no `body` (portal): mantém o visual e resolve câmeras, prévia ampliada, modo teatro e contador. |
| R-3 | Vídeo pausado com o app escondido | aceitar; `pauseVideoInBackground: false` | Desligar a pausa: a janela própria existe justamente para ver com o app atrás. Custo: o vídeo continua chegando com o app minimizado (grupo pequeno, poucas câmeras). |
| R-4 | "Voltar as câmeras ao lugar" no painel de voz | o painel não tem menu | Botão de ícone no painel de voz, visível só com as câmeras flutuantes, e em Configurações → Aparência. |
| R-5 | Som de "começar a assistir" para mim mesmo | tocar; não tocar | Não tocar para as minhas próprias ações (o CA-11 fala dos outros). |
| R-6 | Volume da transmissão na janela própria | estado no painel; estado acima | O estado de volume e de modo sobe para fora do `PainelTransmissao` (por transmissão), para a janela própria e o painel comandarem o mesmo. |
| R-7 | Prévia de quem transmite a própria tela inteira | mostrar; esconder | Continua escondida (evita espelho), como hoje; a barra aparece sem o botão de ampliar. |
| R-8 | Testes de vários monitores e sons entre três pessoas | — | Não rodam no ambiente de teste: validação manual (T final). |

## 10. Implantação e rollback
Só o app (release normal, junto da atualização grande). Sem flag. Rollback: versão anterior do app; as chaves novas das configurações são ignoradas por ela.

## 11. CI/CD
Sem mudança.
