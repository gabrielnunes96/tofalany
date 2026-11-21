# Vídeo: modo teatro, câmeras e sons da transmissão — especificação funcional

> Demanda: `video-teatro-cameras-e-sons` · Versão 1 · 21/11/2026 · Situação: **rascunho**

## 1. Objetivo
Assistir e ver câmeras do jeito que cada um quiser, sem perder nada:
- as câmeras flutuantes não somem mais e podem ir para uma janela própria (outro monitor);
- quem assiste uma transmissão tem modo teatro e uma barra de controles que cabe na janela;
- a transmissão avisa com sons e mostra quantos estão assistindo para todos da sala.

## 2. Contexto
- **Câmeras (item 50):** a grade de câmeras vira uma janelinha flutuante arrastável. Arrastada para cima da lista de membros, ela some, e as câmeras só voltam desligando o modo flutuante. Ela vive dentro da janela do app, então não vai para outro monitor.
- **Transmissão (item 49):** quem transmite tem a prévia ampliada por cima do app; quem assiste tem só o painel no meio e a tela cheia. Prints de 20/11 e 21/11: a prévia ampliada e a barra de controles de quem assiste ficam cortadas na borda direita da janela.
- **Sons e espectadores (item 38):** já existem sons de entrar e sair da voz; não há sons para a transmissão. O contador de quem assiste (olho com número) aparece só no painel da transmissão e no rodapé de quem transmite.
- **Pessoas:** o grupo (até umas 5 pessoas numa sala), em monitores e janelas de tamanhos variados.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Quem transmite | Abre e fecha a transmissão, vê a própria prévia e quem assiste |
| Quem assiste | Abre a transmissão, usa modo teatro, tela cheia, volume e janela própria |
| Quem está na sala de voz | Vê câmeras, ouve os sons e vê o contador |

## 4. Escopo
**Dentro:**
- Câmeras flutuantes que nunca ficam escondidas ou fora da área visível; botão "Voltar as câmeras ao lugar" fora da janelinha.
- "Abrir em janela própria" para as câmeras e para a transmissão assistida: janela do sistema, que vai para qualquer monitor, guarda posição e tamanho e volta para dentro do app ao ser fechada ou se o monitor sumir (D-1, D-2).
- Modo teatro para quem assiste (a transmissão grande por cima do app, dentro da janela).
- Barra de controles sobre o vídeo (assistir e prévia de quem transmite): volume, modo teatro, tela cheia, janela própria, prévia (quem transmite) e fechar. Cabe inteira em qualquer largura de janela.
- Prévia ampliada de quem transmite e modo teatro cabem inteiros na janela, mantendo a proporção.
- Quatro sons: alguém da sala abre uma transmissão, fecha uma transmissão, começa a assistir, para de assistir (D-3).
- Contador de espectadores flutuante para todos da sala de voz enquanto houver transmissão aberta, arrastável, com cores escolhidas por cada um (D-4).

**Fora (explícito):**
- Gravar a transmissão ou as câmeras.
- Mais de uma transmissão ao mesmo tempo na mesma janela própria (cada transmissão abre a sua).
- Mudar a qualidade da transmissão pela barra (continua onde está).
- Picture-in-picture do sistema operacional.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | A janelinha das câmeras fica sempre inteira na área visível do app e por cima dos painéis; soltada em lugar que a esconderia ou fora da área, volta ao canto padrão. | Item 50 |
| RN-2 | "Voltar as câmeras ao lugar" fica fora da janelinha (menu do painel de voz e Configurações → Aparência) e põe ela no canto padrão. | Item 50 (sugestão do Gabriel) |
| RN-3 | Câmeras ou transmissão em janela própria saem do app e voltam ao fechar a janela; a janela lembra posição e tamanho; se o monitor dela não existir mais, abre no monitor do app. | Item 50, D-1, D-2 |
| RN-4 | Modo teatro e prévia ampliada ficam dentro da janela do app, inteiros, mantendo a proporção do vídeo; Esc ou clicar fora sai. | Item 49 |
| RN-5 | A barra de controles mostra só o que se aplica a quem vê (prévia só para quem transmite) e nunca passa da borda: em janela estreita, os botões viram só ícones com nome acessível. | Item 49, prints |
| RN-6 | Os controles da barra somem com o mouse parado e voltam ao mexer, como na tela cheia. | Item 49 |
| RN-7 | Fechar a transmissão no modo teatro, na tela cheia ou na janela própria sai de todos esses modos de uma vez. | Item 49 (junto do item 39) |
| RN-8 | Sons de abrir e fechar a transmissão tocam para quem está no mesmo canal de voz; sons de começar e parar de assistir tocam só para quem transmite e para quem assiste a mesma transmissão. | Item 38 |
| RN-9 | Os quatro sons vêm ligados; cada um se desliga em Configurações; nenhum toca para quem está surdo; entrar e sair em menos de 1 s não repete o som. | Item 38, D-3 |
| RN-10 | O contador flutuante aparece para todos do canal de voz da transmissão (inclusive quem transmite) enquanto ela estiver aberta, e some quando ela fecha. | Item 38, D-4 |
| RN-11 | Cada pessoa arrasta o contador para onde quiser; a posição fica salva no computador, em proporção da janela, e volta ao canto se ficar fora da tela. | Item 38 |
| RN-12 | Cada pessoa escolhe as cores do contador (olho, fundo, número, borda) em Configurações → Aparência, com prévia e "voltar ao padrão"; se o número ficar difícil de ler sobre o fundo, o app avisa. | Item 38 |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | As câmeras flutuantes devem ficar sempre visíveis e voltar ao canto quando soltas onde sumiriam. | RN-1 |
| RF-2 | O app deve ter "Voltar as câmeras ao lugar" no menu do painel de voz e em Configurações → Aparência. | RN-2 |
| RF-3 | As câmeras e a transmissão assistida devem ter "Abrir em janela própria", com a janela indo para qualquer monitor e voltando ao fechar. | RN-3 |
| RF-4 | Quem assiste deve ter modo teatro (entrar pela barra ou duplo clique; sair com Esc, clique fora ou o mesmo botão). | RN-4 |
| RF-5 | O vídeo da transmissão (assistida e prévia de quem transmite) deve ter a barra de controles com volume, modo teatro, tela cheia, janela própria, prévia (quem transmite) e fechar. | RN-5, RN-6, RN-7 |
| RF-6 | O app deve tocar os quatro sons da transmissão para as pessoas certas, com opção de desligar cada um. | RN-8, RN-9 |
| RF-7 | O app deve mostrar o contador de espectadores flutuante, arrastável e com cores personalizáveis. | RN-10, RN-11, RN-12 |

## 7. Requisitos não funcionais
- **Desempenho:** a janela própria usa o mesmo vídeo que já chega (sem nova conexão nem dobrar o tráfego).
- **Acessibilidade:** todos os botões da barra com nome acessível e alcançáveis por teclado; Esc sai do modo teatro.
- **Compatibilidade:** sem mudança no servidor além do que já existe (transmissões e espectadores em tempo real); apps antigos continuam funcionando.
- **Plataformas:** Windows e Linux (AppImage e .deb).

## 8. Critérios de aceite
- **CA-1** (RF-1, RN-1): Dado as câmeras flutuantes, quando a pessoa as solta em cima da lista de membros, então a janelinha continua visível por cima; quando solta fora da área visível, volta ao canto padrão.
- **CA-2** (RF-2): Dado a janelinha em qualquer posição, quando a pessoa escolhe "Voltar as câmeras ao lugar" (menu do painel de voz ou Configurações → Aparência), então ela volta ao canto padrão, visível.
- **CA-3** (RF-3, RN-3): Dado as câmeras na sala, quando a pessoa escolhe "Abrir em janela própria", então abre uma janela do sistema com as câmeras e elas saem do app; ao fechar a janela, voltam para o app.
- **CA-4** (RF-3, RN-3): Dado a janela própria movida e redimensionada, quando é fechada e aberta de novo, então volta à mesma posição e tamanho; se essa posição não estiver em nenhum monitor, abre sobre o app.
- **CA-5** (RF-3): Dado uma transmissão assistida, quando a pessoa escolhe "Abrir em janela própria", então a transmissão aparece na janela, com o mesmo volume; fechar a janela devolve a transmissão ao painel.
- **CA-6** (RF-4, RN-4): Dado quem assiste uma transmissão, quando escolhe modo teatro, então a transmissão ocupa a janela do app inteira (sem passar das bordas, na proporção do vídeo); Esc ou clique fora sai.
- **CA-7** (RF-5, RN-5): Dado a janela do app com 900 px de largura, quando a barra de controles aparece (assistindo e na prévia de quem transmite), então todos os botões ficam dentro da janela.
- **CA-8** (RF-5, RN-5): Dado quem assiste, então a barra tem volume, modo teatro, tela cheia, janela própria e fechar (sem prévia); dado quem transmite, a barra da prévia tem também mostrar/ocultar a prévia.
- **CA-9** (RF-5, RN-6): Dado o modo teatro ou a tela cheia, quando o mouse fica parado por 3 s, então a barra some; mexer o mouse traz de volta.
- **CA-10** (RF-5, RN-7): Dado o modo teatro (ou a tela cheia), quando a pessoa fecha a transmissão, então sai do modo teatro e da tela cheia juntos, sem tela preta.
- **CA-11** (RF-6, RN-8): Dado Ana, Bia e Caio no mesmo canal de voz, quando Ana abre uma transmissão, então Bia e Caio ouvem o som de abrir; quando Bia começa a assistir, então Ana (quem transmite) ouve o som de começar a assistir e Caio (que não assiste) não ouve.
- **CA-12** (RF-6, RN-9): Dado Bia surda, ou com o som de "abrir transmissão" desligado em Configurações, quando Ana abre a transmissão, então Bia não ouve; dado Bia entrando e saindo da transmissão em menos de 1 s, então Ana não ouve os sons repetidos.
- **CA-13** (RF-7, RN-10): Dado uma transmissão aberta no canal de voz, então todos do canal (inclusive quem transmite) veem o contador flutuante com o número de quem assiste; quando a transmissão fecha, ele some.
- **CA-14** (RF-7, RN-11): Dado o contador arrastado para um canto, quando a janela é redimensionada ou o app reaberto, então ele continua no mesmo lugar proporcional; se ficaria fora da tela, volta ao canto.
- **CA-15** (RF-7, RN-12): Dado Configurações → Aparência, quando a pessoa troca as cores do contador, então a prévia mostra na hora; "voltar ao padrão" restaura; com número e fundo de pouco contraste, aparece o aviso.

## 9. Impacto em consumidores
- **App:** painel de voz, grade de câmeras, painel da transmissão, prévia de quem transmite, Configurações (Aparência e sons).
- **Servidor:** não muda (as transmissões e os espectadores já chegam em tempo real).
- **Sistema:** uma janela nova do Electron (câmeras e transmissão), com o vídeo vindo da janela principal.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | ~~Câmeras em janela própria entram agora?~~ | Gabriel | 21/11: sim, junto da correção e do botão de voltar ao lugar. |
| D-2 | ~~A transmissão assistida também vai para janela própria?~~ | Gabriel | 21/11: sim. |
| D-3 | ~~Os sons novos vêm ligados?~~ | Gabriel | 21/11: os quatro ligados; cada um desliga em Configurações. |
| D-4 | ~~Para quem aparece o contador flutuante?~~ | Gabriel | 21/11: todos do canal de voz da transmissão, inclusive quem transmite. |
