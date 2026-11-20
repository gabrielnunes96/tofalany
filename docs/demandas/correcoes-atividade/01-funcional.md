# Correções da atividade e do som da transmissão: especificação funcional

> Demanda: `correcoes-atividade` · Versão 2 · 20/11/2026 · Situação: **aprovada em 20/11/2026**

## 1. Objetivo
Fazer a atividade (jogo e música) chegar de verdade aos amigos, com o nome certo, inclusive para quem ouve Spotify pelo navegador. E parar de mandar a voz da chamada de volta para todo mundo quando alguém transmite com o som do sistema no Windows.

## 2. Contexto
- **Atividade (0.14.0):** com "Mostrar o jogo" e "Mostrar a música" ligados (Configurações → Atividade), o app lê o que está rodando a cada 20 s e avisa o servidor, que repassa para os outros. Relatos de 19/11 (itens 35, 36 e 37 do backlog):
  - **35:** os amigos não veem a atividade de ninguém. A aba Amigos não mostra atividade (só a lista de membros do servidor aberto, o cartão e o perfil). No Windows a leitura pode estourar o tempo ou ser barrada e some tudo, sem nenhum registro no log.
  - **36:** quem ouve pelo open.spotify.com no navegador (caso do Gabriel, no Linux) nunca aparece "Ouvindo", porque o app só procura o Spotify instalado.
  - **37:** jogo da Steam não aparece ou aparece errado: nome da pasta em vez do nome do jogo ("dota 2 beta"), ferramentas da Steam aparecendo como jogo (papel de parede animado, escala), jogos com anticheat ou como administrador sem aparecer.
- **Som do sistema na transmissão no Windows (item 31):** a captura do Windows pega todo o som do computador, inclusive a chamada, e quem está na chamada ouve a própria voz de volta. A correção definitiva (captura que exclui o próprio app) é grande e fica para outra demanda. Esta só traz o contorno.
- Pessoas: o grupo (até 4 amigos), parte no Windows e parte no Linux (Cinnamon).

## 3. Atores
| Ator | Papel |
| --- | --- |
| Quem mostra a atividade | Liga as opções de atividade; o app lê jogo e música no computador dela |
| Quem vê a atividade | Amigo ou membro de um servidor em comum; vê "Jogando…" ou "Ouvindo…" |
| Quem transmite | Escolhe a tela e se o som do sistema vai junto |
| Quem está na chamada | Ouve a transmissão e não deve ouvir a própria voz de volta |

## 4. Escopo
**Dentro:**
- Atividade dos amigos visível na aba Amigos (35).
- Atividade só para quem pode vê-la: amigos e membros de algum servidor em comum (35).
- Leitura no Windows que não perde tudo quando uma parte falha, e registro da falha no log do app (35).
- Conferência pedida ao ligar uma opção feita logo, mesmo com uma leitura em andamento (35).
- Spotify tocado pelo navegador no Linux e no Windows (36).
- Nome do jogo da Steam pelo nome oficial e ferramentas da Steam fora (37).
- No Windows, "Incluir o áudio do sistema" vem desmarcado e com aviso de que a voz da chamada vai junto (31, contorno).

**Fora (explícito):**
- Captura do som do sistema no Windows sem a chamada (item 31 definitivo, demanda própria).
- Jogos de outras lojas (Epic, GOG, Xbox) e de fora da `steamapps`.
- Outras mídias no navegador (YouTube, SoundCloud) como "Ouvindo".
- Jogos com anticheat que escondem o processo de quem não é administrador: o app não pede privilégio de administrador. Se a Steam informar o jogo de outro jeito, a técnica pode propor.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Nada de atividade sai do computador sem a pessoa ligar a opção correspondente (jogo e música separados). Invisível não mostra atividade. | Regra da 0.14.0 |
| RN-2 | Só veem a atividade de alguém os amigos dela e quem está num servidor em comum com ela. | Backlog 35 (pergunta "conferir se o io.emit sem filtro é o desejado") |
| RN-3 | A atividade de um amigo aparece também na aba Amigos, mesmo sem servidor em comum. | Backlog 35, hipótese (a) |
| RN-4 | "Ouvindo" vem só do Spotify: o app instalado ou a aba do open.spotify.com tocando. Pausado não mostra nada. | Backlog 36 |
| RN-5 | O nome mostrado do jogo da Steam é o nome oficial que a Steam guarda para ele; sem esse dado, o nome da pasta. | Backlog 37 (d) |
| RN-6 | Programas da Steam que não são jogos (ferramentas, papel de parede, runtime, Proton, SteamVR) não aparecem como "Jogando". | Backlog 37 (c) |
| RN-7 | Falha ao ler o jogo não apaga a música, e vice-versa. | Backlog 35 (b) |
| RN-8 | No Windows, até a correção definitiva do item 31, o som do sistema vem desmarcado ao transmitir, e o aviso diz que quem está na chamada vai ouvir a própria voz. A pessoa pode marcar, com o aviso, mas toda transmissão abre desmarcada de novo (a última escolha não é guardada no Windows). (D-1) | Backlog 31 |
| RN-9 | O log registra por que a atividade não foi lida (erro, tempo esgotado), sem gravar a lista de processos nem os títulos das músicas. | Backlog 35 (c); privacidade |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | A aba Amigos deve mostrar, abaixo do nome de cada amigo, a atividade dele ("Jogando X", "Ouvindo Y de Z"), como a lista de membros já mostra. | RN-1, RN-3 |
| RF-2 | O servidor deve mandar a atualização de atividade só para as conexões de amigos e de membros de servidores em comum, e para a própria pessoa. | RN-2 |
| RF-3 | No Linux, o app deve reconhecer como música um player de mídia do sistema tocando uma faixa do open.spotify.com, além do app do Spotify. | RN-4 |
| RF-4 | O app deve mostrar o nome oficial do jogo da Steam em vez do nome da pasta, quando a Steam tiver esse dado instalado no computador. | RN-5 |
| RF-5 | O app não deve mostrar como jogo as ferramentas conhecidas da Steam (lista mantida no código, com teste). | RN-6 |
| RF-6 | No Linux, um processo cuja linha de comando cita várias pastas da Steam deve ser reconhecido pelo jogo, não pelo primeiro item (runtime ou Proton). | RN-5, RN-6 |
| RF-7 | No Windows, a leitura de jogo e a de música devem falhar separadas, e a leitura deve caber no intervalo de conferência num PC comum. | RN-7 |
| RF-8 | O app deve gravar no log uma linha quando a leitura da atividade falhar ou estourar o tempo, com a parte (jogo ou música) e o motivo. | RN-9 |
| RF-9 | Ligar uma opção de atividade deve mostrar o resultado na primeira leitura depois de ligar, mesmo se outra leitura estiver em andamento. | RN-1 |
| RF-10 | No Windows, o seletor de tela deve abrir sempre com "Incluir o áudio do sistema" desmarcado e marcável, e mostrar o aviso da voz da chamada. | RN-8 |
| RF-11 | No Windows, o app deve reconhecer como música uma faixa do open.spotify.com tocando num navegador, além do app do Spotify. | RN-4 |

## 7. Requisitos não funcionais
- **Desempenho:** a leitura no Windows termina em até 5 s num PC comum (hoje o limite é 8 s, e a conferência é a cada 20 s). No Linux, nada muda.
- **Privacidade:** a atividade não chega a quem não é amigo nem membro de servidor em comum (RN-2). O log não grava processos nem músicas (RN-9).
- **Compatibilidade:** apps antigos (0.17.x) continuam funcionando com o servidor novo. O formato da atividade não muda. Só muda quem recebe.
- **Sem configuração nova:** nada para a pessoa ligar além das opções que já existem.

## 8. Critérios de aceite
- **CA-1** (RF-1): Dado que Ana e Zé são amigos sem servidor em comum e Zé está com "Jogando Hades" ativo, quando Ana abre a aba Amigos, então ela vê "Jogando Hades" na linha do Zé.
- **CA-2** (RF-2): Dado que Zé muda de atividade, quando o servidor repassa, então recebem o aviso só as conexões de amigos do Zé, de membros de servidores em comum e do próprio Zé. Uma conta sem relação com o Zé não recebe nada.
- **CA-3** (RF-3): Dado um player com o nome `org.mpris.MediaPlayer2.firefox.instance_1_123`, tocando, com `xesam:url` em `https://open.spotify.com/track/…`, título "Song" e artista "Band", quando o app lê a música no Linux, então a atividade é "Ouvindo Song de Band".
- **CA-4** (RF-3): Dado um player de navegador tocando um vídeo do YouTube (`xesam:url` fora do open.spotify.com), quando o app lê a música, então não há música na atividade.
- **CA-5** (RF-3): Dado a aba do open.spotify.com pausada e nenhum outro player tocando, quando o app lê, então não há música.
- **CA-6** (RF-4): Dado o processo `…\steamapps\common\dota 2 beta\game\bin\win64\dota2.exe` e o `appmanifest_570.acf` com `installdir` "dota 2 beta" e `name` "Dota 2", quando o app lê o jogo, então mostra "Jogando Dota 2".
- **CA-7** (RF-4): Dado um jogo sem `appmanifest` correspondente, quando o app lê, então mostra o nome da pasta, como hoje.
- **CA-8** (RF-5): Dado só o Wallpaper Engine aberto (pasta `wallpaper_engine`) ou só o Lossless Scaling, quando o app lê, então não há jogo.
- **CA-9** (RF-6): Dado no Linux um processo com a linha de comando `…/SteamLinuxRuntime_sniper/…/Proton 9.0/proton waitforexitandrun …/steamapps/common/Hades/Hades.exe`, quando o app lê, então mostra "Jogando Hades".
- **CA-10** (RF-7): Dado que a leitura dos processos no Windows falha ou estoura o tempo e a do Spotify funciona, quando o app lê, então a música aparece e o jogo não.
- **CA-11** (RF-8): Dado que a leitura do jogo estoura o tempo, quando o app termina a rodada, então o log do app tem uma linha com "atividade", "jogo" e o motivo, sem nome de processo.
- **CA-12** (RF-9): Dado uma leitura em andamento, quando a pessoa liga "Mostrar a música", então uma nova leitura roda logo que a atual termina, sem esperar os 20 s.
- **CA-13** (RF-10): Dado o app no Windows, quando a pessoa abre "Transmitir a tela" pela primeira vez, então "Incluir o áudio do sistema" está desmarcado e aparece o aviso da voz da chamada.
- **CA-13b** (RF-10): Dado que a pessoa marcou o som do sistema numa transmissão no Windows, quando ela abre "Transmitir a tela" de novo, então a opção está desmarcada outra vez, e ela consegue marcar.
- **CA-14** (RF-10): Dado o app no Linux com PipeWire, quando a pessoa abre "Transmitir a tela", então o comportamento é o de hoje (marcado por padrão, sem o aviso).
- **CA-14b** (RF-11): Dado no Windows uma aba do open.spotify.com tocando "Song" de "Band" no navegador, sem o app do Spotify, quando o app lê a música, então a atividade é "Ouvindo Song de Band"; um vídeo do YouTube tocando no navegador não vira música.
- **CA-15** (RF-1 a RF-11, validação entre máquinas): Dado o Gabriel e um amigo no Windows, em chamada, com as opções ligadas, quando o amigo abre um jogo da Steam e toca música no open.spotify.com pelo navegador, e o Gabriel toca música no open.spotify.com, então cada um vê a atividade do outro na aba Amigos e na lista de membros em até 40 s. Validação manual do usuário (`pare_e_pergunte` do perfil).

## 9. Impacto em consumidores
- **Apps antigos:** continuam recebendo atividade (só de quem têm relação) e o formato não muda.
- **Servidor:** muda só o destino do aviso de atividade; sem migração de banco.
- **Quem transmite no Windows:** passa a precisar marcar o som do sistema de propósito. A nota de novidades da próxima versão deve explicar o motivo.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | ~~No Windows, o som do sistema vem desmarcado **e pode ser marcado** (com o aviso), ou fica **desabilitado** até a correção definitiva? Recomendação: pode marcar, porque para um jogo ou vídeo sem chamada ele ainda serve. E a última escolha fica guardada (hoje fica) ou volta a desmarcado toda vez? Recomendação: volta a desmarcado toda vez, enquanto o eco existir.~~ | Gabriel | 20/11: desmarcado sempre, pode marcar com o aviso. |
| D-2 | ~~Spotify pelo navegador **no Windows** entra agora (leitura das sessões de mídia do sistema, sem como testar aqui no Linux) ou fica para depois? Recomendação: depois, porque não dá para testar sem um amigo no Windows.~~ | Gabriel | 20/11: entra agora; validar no Windows com os amigos em chamada (CA-15). |
