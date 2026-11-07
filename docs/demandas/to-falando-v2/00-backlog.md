# Backlog da próxima versão do ToFalany

Pedidos do usuário de 06/11/2026, depois de fechar a to-falando-v1. Ainda não é especificação: na próxima sessão cada bloco vira demanda (funcional → técnica → plano), na ordem de prioridade abaixo.

**Regra que vale para tudo:** zero configuração de sistema para quem usa o app. A pessoa instala (next, next, finish), entra pelo link de convite e só mexe em personalização.

## Situação (07/11/2026, 12h)

| Versão | Itens | Estado |
| --- | --- | --- |
| v0.2.0 | 0a (endereço https), 0b (transmissão cortada), 1b (colar imagem), 1d (atualização automática), ganho automático desligado, compositor que perdia anexo | publicada no GitHub |
| v0.3.0 | 1 (bolinha de fala sem atraso), 1c (qualidade da voz), 1e (bandeja), 2 (status manual), 3 (redefinir senha pelo app), 4 (colar o link de convite); 6 (roteiro da VPS em docs/vps.md) | publicada |
| v0.4.0 | P2: 7 (vários servidores), 8 (painel compacto com menu), 9 (temas Neon da Madrugada, Breu e Aurora), 10 (esconder canais, membros e câmeras) | publicada |
| v0.5.0 | 10b (prévia de links e player do YouTube no chat) | publicada |
| v0.6.0 | 10c (cargos: Moderador de fábrica e cargos personalizados com cor e permissões); 0c resolvido (Enter durante um envio era ignorado) | publicada |
| v0.7.0 | 11 e 11b (câmera em tela cheia e janelinha flutuante arrastável), 12 (prévia da própria transmissão) | publicada |
| v0.8.0 | .deb se atualiza sozinho (pede a senha do sistema); 15 (`./vm.sh consulta`, `./vm.sh copia-banco` e `npm run banco -w server`); não lidas dos outros servidores no ícone da coluna | publicada (tag enviada) |
| próxima | 13 (som do sistema na transmissão no Linux, pela venmic e PipeWire); 14 (bot de música: /tocar, /pular, /parar, fila por canal, yt-dlp e ffmpeg no servidor); VM se atualiza sozinha (./vm.sh automatico) | commitado; falta testar com o grupo |
| depois | imagem do servidor pronta no CI (a VM só baixa) | a fazer |

## Prioridades

### P0: defeitos vistos no primeiro uso real (07/11, servidor na Oracle)

| # | Item | Análise rápida |
| --- | --- | --- |
| 0a | **Endereço sem `https://` deixava o app "Reconectando…" para sempre** | O app completava com `http://`. O login funcionava, porque o servidor redireciona para HTTPS, mas o tempo real (WebSocket) não segue redirecionamento. **Já corrigido (sem commit):** sem esquema, o app tenta HTTPS primeiro e guarda o endereço final; quem já salvou `http://` é consertado ao abrir. Vai na v0.2.0. |
| 0b | **Transmissão de tela com o formato errado** | Nos prints, a tela transmitida chega com a proporção alterada e com faixas pretas nas laterais. Causa provável: o app pede a captura com largura **e** altura fixas da qualidade (1280×720 para membro), e o Chromium ajusta a imagem a essa caixa em vez de manter a proporção da tela, o que estica ou distorce telas que não são 16:9 (ultrawide, 16:10, dois monitores). Correção: pedir só o limite (no máximo 1280 de largura e 720 de altura), mantendo a proporção, e exibir com `object-fit: contain`. A regra do servidor (que confere o tamanho da faixa) continua valendo. Reproduzir com uma tela que não seja 16:9 antes de corrigir. |
| 0c | **Contador de não lidas às vezes conta uma a menos** | No E2E CA-19, rodando na tela virtual (mais rápida), a ana às vezes vê "1 não lida" depois de duas mensagens num canal recém-criado. Não é a confirmação de leitura (ela só vai para o próprio dono) nem a ordem dos eventos (o servidor manda "canal criado" antes da mensagem). Suspeita: o pacote inicial da conexão (ola) aplicado depois de uma mensagem ao vivo sobrescreve o contador. Investigar com registro dos eventos no app de teste. Até lá, o teste tem uma nova tentativa automática. |

### P1: usar no dia a dia sem depender do terminal

Primeiro o que impede o grupo de usar o app de verdade, e os incômodos que já aparecem no uso.

| # | Item | Análise rápida |
| --- | --- | --- |
| 1 | **Indicador de fala atrasado na lista do canal de voz** | A bolinha da lista vem do "quem está falando" do LiveKit, que o servidor de mídia calcula e envia com algumas centenas de milissegundos de atraso. A do rodapé mede o próprio microfone na hora, por isso é imediata. Caminho provável: medir o nível do áudio que já chega de cada pessoa (como o rodapé faz com o seu) e acender a bolinha por isso. |
| 1b | **Colar imagem no chat (Ctrl+V)** | Bug de uso: o campo de mensagem não trata o colar, então um print da área de transferência não vira anexo. Hoje a imagem só entra pelo botão de anexo. Tratar o evento de colar no campo do canal e da DM e mandar a imagem pelo mesmo envio de anexo, com prévia antes de enviar. É pequeno: dá para fazer primeiro. |
| 1c | **Qualidade da voz** | Hoje está "razoável". O app publica o microfone com a configuração padrão do LiveKit (Opus em cerca de 32 kbps, otimizado para fala) e passa o áudio pela supressão de ruído (RNNoise) e pelo portão de voz. Caminho: subir para 48 a 64 kbps em mono, ligar o RED (redundância contra perda de pacotes) e conferir se o RNNoise e o portão estão cortando o começo e o fim das palavras. A banda continua pequena (cerca de 64 kbps por pessoa falando). Testar com duas pessoas, com e sem supressão. |
| 1d | **Atualização automática e aviso de versão nova** | Hoje cada versão nova exige baixar e instalar de novo. Com o `electron-updater` e as releases do GitHub: o app confere ao abrir (e a cada algumas horas), baixa em segundo plano e avisa "Versão nova pronta: reiniciar para atualizar". Funciona no Windows (NSIS) e no AppImage; o .deb não se atualiza sozinho, então nele o app só avisa e abre a página da release. O servidor também pode avisar quando o app estiver mais velho que ele. **Vem antes das outras melhorias:** assim, o grupo recebe a v0.2.0 e as seguintes sem reinstalar. |
| 1e | **Minimizar para a bandeja** | Fechar a janela esconde o app na bandeja do sistema (ícone perto do relógio), e a voz e as notificações continuam. Menu da bandeja: abrir, mutar, sair. Opção nas configurações para fechar de verdade. |
| 2 | **Escolher o próprio status**: online, ausente, não incomodar, invisível (aparece offline) | Hoje o status é só automático (online e ausente). Acrescentar a escolha manual no painel do usuário. "Não incomodar" silencia as notificações. A escolha vale até ser trocada, e o automático continua quando ela é "online". |
| 3 | **Redefinir senha pelo app** | Hoje só existe o comando no terminal. Caminho provável: o administrador gera um código ou link de redefinição de uso único, que a pessoa usa na tela de login. Não depende de e-mail, porque o servidor não tem e-mail. |
| 4 | **Zero configuração e convite que resolve tudo** | Hoje a primeira execução pede o endereço do servidor. O link de convite deve trazer o servidor e o código, e o instalador não deve pedir nada além do básico. Revisar tudo que a pessoa precisa preencher. |
| 5 | **GitHub com releases** | Subir o repositório e criar o processo de release: a cada versão, o CI gera os instaladores de Windows e Linux e publica na página de Releases. A página de convite pode apontar para lá. Também destrava o PR da v1, que não tem remoto. |
| 6 | **Roteiro de VPS em .md** | Passo a passo do zero ao app conectado. Recomendar a melhor opção gratuita (Oracle Cloud Always Free é a candidata) e opções pagas baratas que não travem, com números de CPU, memória, banda e tráfego mensal, e dizer com clareza se a gratuita aguenta voz e transmissão de tela. Precisa de pesquisa de preços e limites atuais. |

### P2: vários servidores e o layout novo

Esses itens vão juntos: o layout precisa nascer pensando na troca de servidor, nos temas e no que pode ser ocultado.

| # | Item | Análise rápida |
| --- | --- | --- |
| 7 | **Vários servidores no app** | Hoje o app guarda um servidor só. Passa a guardar uma lista, cada um com sua conta e sessão, e uma coluna de ícones à esquerda para trocar (o padrão que as pessoas já conhecem). Avaliar se fica conectado a todos ao mesmo tempo (contador de não lidas de cada um) ou só ao aberto. Voz em um servidor por vez. |
| 8 | **Interface mais clean** | Reorganizar o canto inferior esquerdo (configurações, convite, auditoria, membros…) num painel do usuário compacto com menu. Menos bordas e menos texto fixo, com efeitos sutis de transição. Começar por um protótipo para aprovar antes de mexer no app. |
| 9 | **Temas** | Escuro, claro e o atual (neon), com nomes criativos ("Cyberpunk" não). Base: as cores já estão em variáveis, então o tema troca o conjunto. A escolha fica na personalização. |
| 10 | **Ocultar e mostrar elementos da interface** | Esconder a lista de canais, a de membros e o chat, com atalho e botão. Serve também para a câmera (item 11). |

### P2b: chat e servidor mais completos

| # | Item | Análise rápida |
| --- | --- | --- |
| 10b | **Prévia de links e vídeo no chat** | Link do YouTube (e outros) vira um cartão com título, canal e miniatura, com a opção de assistir ali mesmo (print do Discord de 06/11). Limite atual: por privacidade (T23), o app só fala com o próprio servidor. Por isso a prévia é buscada pelo **servidor** (OpenGraph/oEmbed, com cache e limite de tamanho e tempo) e a miniatura passa por ele; o app não contata o site do link. O player embutido do YouTube carregaria o youtube.com dentro do app: entra só ao clicar em "assistir" (youtube-nocookie), como exceção explícita ao filtro de rede, ou fica o botão "abrir no navegador". Decidir com o usuário. Proteger o servidor contra links para a rede interna (SSRF). |
| 10c | **Cargos: intermediário e personalizados** | Hoje só existem administrador e membro. Acrescentar um cargo do meio (moderador: apaga mensagens, gerencia canais e convite, sem mexer em cargos nem na auditoria) e permitir ao administrador criar cargos com nome, cor e permissões escolhidas numa lista (gerenciar canais, apagar mensagens alheias, convidar, soundboard, transmitir acima de 720p30, ver auditoria…). A cor aparece no nome, como no Discord. Mexe em todo lugar que hoje confere "é admin": as regras do servidor passam a conferir permissões. |

### P3: câmera e tela

| # | Item | Análise rápida |
| --- | --- | --- |
| 11 | **Câmeras em tela cheia e chat recolhível** | Tela cheia na grade de câmeras e numa câmera só (clicar para ampliar). Recolher o chat quando houver muitas câmeras ligadas. Usa o item 10. |
| 11b | **Câmera flutuante e arrastável** | Com a câmera pequena (fora da tela cheia), poder arrastar o quadro para qualquer canto da janela, como uma janela flutuante, e lembrar a posição. Hoje a grade de câmeras fica fixa no topo do chat e empurra as mensagens para baixo (print de 06/11). Avaliar também redimensionar o quadro e encaixar nos cantos. Junto do item 11. |
| 12 | **Prévia da própria transmissão** | Mostrar a quem transmite um quadro pequeno com o que está saindo. A faixa local já existe, então falta exibi-la sem gastar banda. |
| 13 | **Som do computador na transmissão no Linux** | **Plano (07/11):** a `@vencord/venmic` 7.2.5 (MPL-2.0) traz o binário pronto para Linux x64 e arm64 (N-API, funciona no Electron). No processo principal, `PatchBay.link({ exclude: [{ 'application.process.binary': 'tofalany' }], only_speakers: true, ignore_devices: true })` cria um microfone virtual com o som de todos os apps menos o próprio ToFalany (sem eco da chamada); a janela captura esse microfone com eco, ruído e ganho desligados e publica como áudio da tela. Sem PipeWire, a caixa "transmitir o som" fica desligada como hoje. Prova de conceito feita em 07/11: o microfone virtual aparece no PipeWire, o ToFalany aberto ficou de fora e some ao desligar. Implementado (main/som-sistema.ts); o binário vai fora do asar e carrega no Electron 45. É possível. O PipeWire e o PulseAudio expõem o som do sistema como um "monitor" que dá para capturar como se fosse um microfone. O desafio é não mandar de volta a voz da chamada (eco), ou seja, capturar só o som de um aplicativo ou excluir o do próprio ToFalany. Há projetos abertos que já fazem isso no Linux (por exemplo, a biblioteca venmic, usada pelo Vesktop). Precisa de prova de conceito. O mesmo cuidado com eco vale para o Windows (validação pendente da T22). |

### P4: extras

| # | Item | Análise rápida |
| --- | --- | --- |
| 14 | **Bot de música** | Tocar o áudio de um link do YouTube no canal de voz por comando (ex.: `/tocar <link>`), com fila, pular e parar. O bot entra no LiveKit como participante, rodando no servidor. Riscos: os termos de uso do YouTube proíbem baixar ou retransmitir fora do player, e as ferramentas de extração (yt-dlp) quebram quando o YouTube muda. Decidir com o usuário antes de planejar. |
| 15 | **Acesso ao banco para consultas** | Desenvolvimento e produção. Hoje dá para fazer na mão (DB Browser for SQLite; em produção, copiar com `docker compose cp`). Decidir se vira só um roteiro no README, um script de cópia segura ou uma tela no app. Cuidado com hashes de senha e tokens. |

## Pendências da v1 (antes ou em paralelo)

- Validações manuais em [to-falando-v1/validacoes-usuario.md](../to-falando-v1/validacoes-usuario.md).
- PR da v1, que depende do item 5 (repositório no GitHub).
- Correção do aviso de voz não configurada (06/11), feita mas sem commit.
