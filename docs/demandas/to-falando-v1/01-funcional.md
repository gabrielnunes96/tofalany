# ToFalany v1 — Especificação funcional

> Demanda: `to-falando-v1` · Versão 4 · 05/11/2026 · Situação: **aprovada em 05/11/2026**

## 1. Objetivo
Um app desktop próprio (Windows e Linux) para um grupo de amigos conversar por texto, voz, vídeo e transmissão de tela, hospedado pelo próprio grupo, sem custo de serviço e sem depender de plataformas de terceiros.

## 2. Contexto
- Hoje o grupo usa plataformas de terceiros. A demanda pede um equivalente privado, simples e estável, para uso pessoal, não comercial.
- Texto original em `00-demanda.md`. Complementos do usuário em 04/11/2026: soundboard, cargo de administrador, limite de 20 contas, push-to-talk com atalho editável, edição e exclusão de mensagens, notificações e sons de voz. Na versão 2: mensagens diretas e transmissão acima de 720p30 só para administrador. Na versão 3: anexos de documento (PDF e ZIP) além de imagem, até 25 MB. Na versão 4 (05/11/2026): auditoria para administradores. Na versão 5 (05/11/2026): status das pessoas (online, ausente, offline), silenciar uma pessoa na voz e desligar notificações (geral e por conversa).
- Envolvidos: o usuário (dono e host do servidor) e os amigos convidados.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Visitante | Tem o app e o código de convite, mas ainda não tem conta. |
| Membro | Usuário com conta: conversa, entra em voz, transmite, toca sons. |
| Administrador | Membro que também gerencia cargos, sons do soundboard e configurações do servidor. |
| Host | Quem sobe o servidor (PC com Tailscale ou VPS) e define o arquivo de configuração. Não é um papel dentro do app. |

## 4. Escopo
**Dentro:**
- Acesso por link de convite (página de download + abrir no app), cadastro, login e senha, perfil (avatar, cor, nome de exibição).
- Cargos administrador/membro.
- Canais de texto e de voz.
- Chat com histórico, anexos (imagens e documentos PDF/ZIP), indicador de digitando, edição e exclusão.
- Mensagens diretas (DM) entre dois membros, com os mesmos recursos do chat.
- Voz com detecção de voz ajustável, push-to-talk opcional, atalhos editáveis, mute/deafen, dispositivos, tratamento de áudio, volume por usuário e teste de microfone.
- Soundboard: até 5 sons curtos tocados no canal de voz.
- Webcam e transmissão de tela (uma por canal) com qualidade selecionável.
- Notificações de mensagem e sons de entrada/saída/mute.
- Auditoria: registro de entradas e saídas, canais de voz, ações de administração e edição/exclusão de mensagens em canais, consultado por administradores.
- Instaladores Windows (.exe) e Linux (.AppImage, .deb); servidor em docker-compose; README de implantação (Tailscale e VPS).

**Fora (explícito):**
- DM em grupo (mais de duas pessoas) e chamada de voz/vídeo por DM: a voz acontece nos canais de voz.
- Recuperação de senha por e-mail. Senha esquecida é resolvida pelo host com um comando no servidor (RF-4).
- Minimizar para a bandeja do sistema (o usuário não escolheu).
- Atualização automática do app.
- App mobile, versão web e macOS.
- Mais de um "servidor" (comunidade) por instalação: uma instalação = um grupo.
- Moderação além do que está nas regras (sem banimento por IP, sem filtros de conteúdo).
- Anexos em outros formatos além de JPEG, PNG, GIF, WebP, PDF e ZIP; pré-visualização de PDF dentro do app; abrir o conteúdo do ZIP no app.
- Auditoria: exportar o registro (CSV ou outro formato), registrar IP ou dispositivo, registrar qualquer coisa das DMs, alertas automáticos.

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Só cria conta quem informar o código de convite vigente. O valor inicial vem da configuração do host; o administrador pode trocá-lo no app, e o código e o link antigos deixam de valer. O link de convite é fixo (o mesmo para todos). | Demanda + usuário, 04/11 (D-5) |
| RN-2 | O servidor aceita no máximo 20 contas (limite configurável pelo host, padrão 20). O cadastro é recusado quando o limite é atingido. | Usuário, 04/11 |
| RN-3 | Nome de usuário (login) é único, sem diferenciar maiúsculas de minúsculas. Nome de exibição pode repetir. | Assumido |
| RN-4 | A primeira conta criada no servidor é administrador. As demais nascem membro. | Assumido (ver D-1) |
| RN-5 | Administrador pode promover membro a administrador e rebaixar administrador. Sempre deve existir pelo menos um administrador. | Usuário, 04/11 |
| RN-6 | Só administrador cadastra, troca ou remove sons do soundboard e altera configurações do servidor. | Usuário, 04/11 |
| RN-7 | Qualquer membro cria e renomeia canais; só administrador remove. | Usuário, 04/11 (D-2) |
| RN-8 | Remover um canal de texto apaga o histórico e os anexos dele. A remoção pede confirmação. | Assumido |
| RN-9 | Cada um edita e apaga só as próprias mensagens. Administrador pode apagar mensagens de qualquer um nos canais (não nas DMs, ver RN-18). | Usuário, 04/11 (D-3) |
| RN-16 | Administrador pode remover a conta de um membro: a pessoa é desconectada na hora, não entra mais e a vaga do limite é liberada. As mensagens dela continuam no histórico com o autor "conta removida". Não é possível remover o último administrador. | Usuário, 04/11 (D-3) |
| RN-10 | Por canal de voz, só uma transmissão de tela fica ativa por vez. | Demanda |
| RN-17 | A qualidade padrão da transmissão é 720p30. Membro transmite só em 720p30; só administrador pode transmitir em 1080p60 ou 1440p60 (máximo). O servidor aplica o limite, não só a tela. | Usuário, 04/11 (v2) |
| RN-18 | Uma DM é privada entre as duas pessoas: nem administrador lê ou apaga mensagens de DM alheias. Cada um edita e apaga só as próprias. | Usuário, 04/11 (v2) + assumido |
| RN-11 | O soundboard é um só para o servidor todo, com no máximo 5 sons; som com mais de 10 segundos é recusado no cadastro. | Usuário, 04/11 (D-4) |
| RN-12 | Um som só pode ser tocado por quem está num canal de voz, e é ouvido por todos daquele canal (exceto quem está com deafen). | Usuário, 04/11 |
| RN-13 | Cada membro pode tocar um som a cada 3 segundos (evita spam). | Usuário, 04/11 (D-4) |
| RN-14 | Configurações de dispositivo, áudio, atalhos, qualidade padrão e URL do servidor são guardadas por máquina, não na conta. | Demanda |
| RN-15 | Avatar: PNG, JPEG, GIF ou WebP, até 8 MB, redimensionado para 256×256. | Demanda + assumido |
| RN-19 | Anexo no chat (canal ou DM): até 25 MB por arquivo. Imagens (JPEG, PNG, GIF, WebP) aparecem no chat; documentos (PDF, ZIP) aparecem como arquivo para baixar, com nome e tamanho. O formato é conferido pelo conteúdo, não só pela extensão. | Usuário, 04/11 (v3) |
| RN-20 | O servidor registra na auditoria, com data e hora, quem fez e o alvo: (a) cadastro, login, saída e quando a pessoa fica online/offline no app; (b) entrada e saída de canal de voz e início/fim de transmissão de tela; (c) ações de administração: cargo alterado, conta removida, código de convite trocado, som cadastrado/trocado/removido, canal criado/renomeado/removido, mensagem apagada por administrador, senha redefinida pelo host; (d) mensagem editada ou apagada pelo autor em canal. O texto das mensagens nunca vai para a auditoria. | Usuário, 05/11 (v4) |
| RN-21 | Nada das DMs entra na auditoria (nem edição/exclusão), coerente com RN-18. | Usuário, 05/11 (v4) + assumido |
| RN-22 | Só administrador consulta a auditoria; o servidor recusa para membro. | Usuário, 05/11 (v4) |
| RN-23 | Registros com mais de 30 dias são apagados automaticamente (prazo configurável pelo host, padrão 30). | Usuário, 05/11 (v4) |
| RN-24 | Quedas curtas de conexão não poluem o registro: "offline" só é registrado se a pessoa não voltar em até 30 segundos. | Assumido |
| RN-25 | Status de cada pessoa, calculado automaticamente: **online** com o app aberto e conectado; **ausente** depois de 10 minutos sem mexer no computador (teclado/mouse), voltando a online ao mexer; **offline** com o app fechado ou sem conexão além da carência de RN-24. Não há status manual. | Usuário, 05/11 (v5) |
| RN-26 | Silenciar uma pessoa vale só no computador de quem silenciou, não avisa a pessoa silenciada e é lembrado entre sessões. | Usuário, 05/11 (v5) + assumido |
| RN-27 | Desligar notificações (geral ou de um canal/DM) vale só no computador onde foi feito; o contador de não lidas continua contando. O som da notificação não é configurável. | Usuário, 05/11 (v5) + assumido |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Na primeira execução sem convite, o app pede a URL do servidor, testa a conexão e a guarda. A URL pode ser trocada depois nas configurações. | RN-14 |
| RF-1a | Link de convite: qualquer membro copia no app um link de convite (ex.: `https://servidor/convite/<código>`). Ao abrir o link, a pessoa vê uma página do servidor com o download do instalador (Windows/Linux) e o botão "Abrir no ToFalany". O app abre com a URL do servidor e o código já preenchidos, e a pessoa só escolhe nome de usuário e senha. | RN-1 |
| RF-2 | Cadastro com código de convite (preenchido pelo link ou digitado), nome de usuário e senha (mínimo 8 caracteres). Depois disso, entra com login e senha. | RN-1, RN-2, RN-3, RN-4 |
| RF-3 | Login com nome de usuário e senha. A sessão continua ativa ao reabrir o app até o usuário sair. | — |
| RF-4 | O host redefine a senha de uma conta por comando no servidor. | — |
| RF-5 | Perfil: trocar avatar, cor de perfil (seletor de cor) e nome de exibição. As mudanças aparecem para todos sem reiniciar. | RN-15 |
| RF-6 | Tela de membros com cargo; administrador promove, rebaixa e remove contas. | RN-5, RN-16 |
| RF-6a | Configurações do servidor (administrador): trocar o código de convite. | RN-1, RN-6 |
| RF-7 | Listar, criar, renomear e remover canais de texto e de voz. As mudanças aparecem para todos em tempo real. | RN-7, RN-8 |
| RF-8 | Enviar mensagens de texto; histórico persistido e carregado em páginas ao rolar para cima. | — |
| RF-9 | Enviar anexos no chat (botão ou arrastar e soltar): imagens exibidas no chat e ampliáveis ao clicar; PDF e ZIP como cartão com nome e tamanho, que ao clicar salva o arquivo onde a pessoa escolher e oferece abrir com o programa do sistema. | RN-19 |
| RF-10 | Indicador "fulano está digitando" no canal de texto. | — |
| RF-11 | Editar e apagar mensagens; mensagem editada mostra "(editada)". | RN-9 |
| RF-12 | Contador de não lidas por canal e por DM, e notificação do sistema quando chega mensagem num canal ou DM que não está aberto ou com o app sem foco. | — |
| RF-12a | Mensagens diretas: abrir uma conversa com qualquer membro pela lista de membros ou pelo perfil; lista de DMs com a mais recente no topo. Texto, imagens, histórico paginado, digitando, edição e exclusão como nos canais. | RN-18 |
| RF-13 | Entrar e sair de canal de voz; ver quem está em cada canal de voz e quem está falando no momento. | — |
| RF-14 | Modo de microfone: detecção de voz com sensibilidade ajustável (padrão) ou push-to-talk. | — |
| RF-15 | Atalhos globais editáveis (funcionam com o app em segundo plano): push-to-talk, mute e deafen. O app recusa atalho já em uso por outra ação do app. | Usuário, 04/11 |
| RF-16 | Mute (microfone) e deafen (áudio de saída, que também muta o microfone). | — |
| RF-17 | Escolher dispositivo de entrada e de saída; a troca vale na hora, mesmo dentro de uma chamada. | RN-14 |
| RF-18 | Ligar e desligar, cada um separadamente: supressão de ruído (forte, com alternativa básica se a forte não estiver disponível), cancelamento de eco, controle automático de ganho. | RN-14 |
| RF-19 | Volume individual de cada participante (0 a 200%), só na própria máquina. | — |
| RF-20 | Teste de microfone com medidor de nível nas configurações, com a marca da sensibilidade de detecção de voz. | — |
| RF-21 | Sons de entrar e sair do canal de voz e de mute/desmute. | Usuário, 04/11 |
| RF-22 | Soundboard (administrador): cadastrar som com nome e arquivo de áudio (MP3, OGG ou WAV), trocar e remover. | RN-6, RN-11 |
| RF-23 | Soundboard (membro em voz): botão que abre os sons cadastrados; ao escolher um, ele toca para todos no canal. Mostra quem tocou. | RN-12, RN-13 |
| RF-24 | Volume local dos sons do soundboard (inclusive 0 para não ouvir). | — |
| RF-25 | Ligar e desligar a própria webcam dentro de um canal de voz; os outros veem o vídeo. | — |
| RF-26 | Transmitir tela inteira ou uma janela, escolhida num seletor próprio com miniaturas. | RN-10 |
| RF-27 | Ao tentar transmitir num canal que já tem transmissão, o app avisa quem está transmitindo e não inicia. | RN-10 |
| RF-28 | Qualidade da transmissão: 720p30 para todos (padrão); 1080p60 e 1440p60 aparecem só para administrador, que pode escolher o próprio padrão. | RN-14, RN-17 |
| RF-29 | No Windows, opção de incluir o áudio do sistema na transmissão. No Linux, o app informa que a opção não está disponível e o README explica por quê. | — |
| RF-30 | Quem está no canal assiste a transmissão em tamanho grande e pode pôr em tela cheia. | — |
| RF-31 | Reconexão automática ao servidor e à chamada de voz quando a rede cai, com aviso na tela enquanto reconecta. | — |
| RF-32 | Instaladores: .exe (Windows) e .AppImage/.deb (Linux), gerados por `npm run dist:win` e `npm run dist:linux`. | — |
| RF-33 | Servidor sobe com docker-compose, com arquivo de configuração de exemplo, em máquinas arm64 e amd64. | — |
| RF-34 | Registrar os eventos de auditoria no servidor no momento em que acontecem. | RN-20, RN-21, RN-24 |
| RF-35 | Tela de auditoria (administrador): lista do mais recente para o mais antigo, com data/hora, pessoa, evento e detalhe (alvo, canal); filtros por pessoa, tipo de evento, canal e período; carrega mais ao rolar. | RN-22 |
| RF-36 | Limpeza automática dos registros fora do prazo. | RN-23 |
| RF-37 | Indicador de status (online, ausente, offline) ao lado de cada pessoa na lista de membros e nas DMs, atualizado em tempo real; a lista separa quem está online/ausente de quem está offline. | RN-25 |
| RF-38 | Botão "Silenciar" em cada pessoa no canal de voz (além do volume de RF-19): a pessoa silenciada não é ouvida, com ícone indicando o silêncio; clicar de novo volta ao volume anterior. | RN-26 |
| RF-39 | Opção geral nas configurações: notificações ligadas ou desligadas. | RN-27 |
| RF-40 | Silenciar notificações de um canal ou DM específico (e desfazer), com indicação na barra lateral. | RN-27 |

## 7. Requisitos não funcionais
- **Memória**: app ocioso (logado, sem chamada) abaixo de 300 MB de RAM somando os processos.
- **Privacidade**: sem telemetria, sem serviço pago, sem chamada a servidor de terceiros em tempo de uso.
- **Segurança**: senhas guardadas com hash forte; toda ação exige sessão válida; ações de administrador são verificadas no servidor (não só escondidas na tela); na VPS, conexão por HTTPS.
- **Capacidade**: até 20 contas. A banda é o limite real: uma transmissão 1440p60 usa de 8 a 15 Mbps de upload de quem transmite, e o servidor repassa isso para cada espectador. O README traz uma tabela de banda por qualidade e por número de espectadores.
- **Estabilidade**: queda do servidor de mídia não derruba o chat de texto, e vice-versa.
- **Plataformas**: Windows 10/11 x64; Linux x64 (Ubuntu 22.04+ ou equivalente, com PipeWire ou PulseAudio).

## 8. Critérios de aceite
**Conta e perfil**
- **CA-1** (RF-1) — Dado o app instalado sem configuração, quando ele abre, então pede a URL do servidor; com uma URL inacessível, mostra erro e não avança.
- **CA-1a** (RF-1a) — Dado um membro que copiou o link de convite no app, quando outra pessoa abre o link no navegador, então vê a página com o download; com o app instalado, "Abrir no ToFalany" abre a tela de cadastro com servidor e código preenchidos, e o cadastro conclui só com nome e senha.
- **CA-2** (RF-2) — Dado um código de convite errado, quando o visitante tenta se cadastrar, então recebe "código de convite inválido" e nenhuma conta é criada.
- **CA-3** (RF-2, RN-2) — Dado um servidor com 20 contas, quando um visitante tenta se cadastrar com o código certo, então recebe "limite de contas atingido".
- **CA-4** (RF-2, RN-3) — Dado que já existe "Gabriel", quando alguém tenta cadastrar "gabriel", então é recusado por nome em uso.
- **CA-5** (RF-2, RN-4) — Dado um servidor vazio, quando a primeira conta é criada, então ela é administrador; a segunda é membro.
- **CA-6** (RF-3) — Dado um login feito, quando o app é fechado e reaberto, então entra direto sem pedir senha.
- **CA-7** (RF-4) — Dado o comando de redefinição de senha executado no servidor, quando o usuário entra com a senha nova, então o login funciona e a antiga é recusada.
- **CA-8** (RF-5, RN-15) — Dado um avatar de 1000×800, quando é enviado, então o servidor guarda 256×256 e os outros membros veem o novo avatar sem reiniciar; arquivo acima de 8 MB ou fora dos formatos é recusado.

**Cargos**
- **CA-9** (RF-6, RN-5) — Dado um administrador, quando promove um membro, então o membro passa a ver e usar as funções de administrador.
- **CA-10** (RN-5) — Dado um servidor com um único administrador, quando ele tenta se rebaixar, então é recusado.
- **CA-11a** (RF-6, RN-16) — Dado um membro B conectado, quando um administrador remove a conta de B, então B é desconectado, não consegue mais entrar, as mensagens dele aparecem como "conta removida" e um novo cadastro passa a caber no limite.
- **CA-11b** (RF-6a, RN-1) — Dado o código de convite trocado pelo administrador, quando alguém usa o link ou código antigo, então o cadastro é recusado; com o novo, funciona.
- **CA-11** (RN-6) — Dado um membro, quando tenta cadastrar som ou mudar cargo chamando o servidor diretamente (fora da tela), então o servidor recusa.

**Canais e texto**
- **CA-12** (RF-7) — Dado dois membros conectados, quando um cria ou renomeia um canal, então o outro vê a mudança em até 2 segundos.
- **CA-13** (RF-7, RN-8) — Dado um canal de texto com mensagens, quando é removido (após confirmar), então ele e seu histórico somem para todos.
- **CA-14** (RF-8) — Dado um canal com 500 mensagens, quando o usuário abre o canal, então vê as mais recentes; ao rolar para cima, as anteriores carregam em páginas até a primeira.
- **CA-15** (RF-8) — Dado uma mensagem enviada, quando o servidor reinicia, então ela continua no histórico.
- **CA-16** (RF-9, RN-19) — Dado uma imagem PNG de 2 MB, quando é enviada, então aparece no chat para todos e amplia ao clicar.
- **CA-16a** (RF-9, RN-19) — Dado um PDF de 5 MB e um ZIP de 20 MB, quando são enviados, então aparecem como cartão com nome e tamanho, e quem clica salva o arquivo idêntico ao original.
- **CA-16b** (RN-19) — Dado um arquivo de 30 MB, ou um .exe renomeado para .pdf, quando é enviado, então é recusado com a mensagem do motivo.
- **CA-17** (RF-10) — Dado A digitando, quando B está no mesmo canal, então B vê "A está digitando"; o aviso some até 5 segundos depois que A para.
- **CA-18** (RF-11, RN-9) — Dado uma mensagem de A, quando A edita, então todos veem o texto novo com "(editada)"; quando B (membro) tenta editar ou apagar, então não consegue; quando um administrador apaga, então ela some para todos.
- **CA-19a** (RF-12a) — Dado A e B membros, quando A abre DM com B e envia texto e uma imagem, então só B recebe, com notificação e contador; C não vê a conversa.
- **CA-19b** (RF-12a, RN-18) — Dado uma DM entre A e B, quando A edita ou apaga a própria mensagem, então B vê a mudança; quando um administrador C tenta ler ou apagar mensagens dessa DM chamando o servidor diretamente, então o servidor recusa.
- **CA-19** (RF-12) — Dado A no canal X, quando chega mensagem no canal Y, então Y mostra o contador de não lidas; com o app sem foco, aparece notificação do sistema.

**Voz**
- **CA-20** (RF-13) — Dado A e B no mesmo canal de voz, quando A fala, então B ouve A e vê o indicador de fala de A aceso.
- **CA-21** (RF-14) — Dado detecção de voz com sensibilidade alta, quando A fala baixo abaixo da marca, então B não ouve; ao baixar a sensibilidade, B passa a ouvir.
- **CA-22** (RF-14, RF-15) — Dado push-to-talk ligado com o app em segundo plano, quando A segura o atalho, então B ouve A; ao soltar, para.
- **CA-23** (RF-15) — Dado o atalho de mute trocado para outra tecla, quando o app reinicia, então o novo atalho continua valendo e o antigo não faz nada; usar a mesma tecla em duas ações é recusado.
- **CA-24** (RF-16) — Dado A com deafen, quando B fala, então A não ouve nada e o microfone de A fica mudo.
- **CA-25** (RF-17) — Dado A numa chamada, quando troca o microfone ou a saída, então o áudio passa a usar o novo dispositivo sem sair da chamada.
- **CA-26** (RF-18) — Dado supressão de ruído ligada e um ventilador perto do microfone, quando A não está falando, então B não ouve o ventilador; desligada, ouve.
- **CA-27** (RF-19) — Dado B com volume de A em 50%, quando A fala, então B ouve A mais baixo e C continua ouvindo normal.
- **CA-28** (RF-20) — Dado as configurações abertas, quando A fala no microfone, então o medidor de nível se mexe.
- **CA-29** (RF-21) — Dado A num canal de voz, quando B entra ou sai, então A ouve o som correspondente.
- **CA-30** (RN-14) — Dado dispositivos, tratamentos de áudio, atalhos e qualidade escolhidos, quando o app reinicia, então as escolhas continuam.

**Soundboard**
- **CA-31** (RF-22, RN-11) — Dado um administrador, quando cadastra um som de 8 segundos, então ele aparece no soundboard de todos; um som de 15 segundos é recusado; um sexto som é recusado.
- **CA-32** (RF-23, RN-12) — Dado A e B no mesmo canal de voz, quando A toca um som, então B ouve o som e vê que foi A; C, em outro canal, não ouve.
- **CA-33** (RN-12) — Dado A fora de qualquer canal de voz, quando abre o soundboard, então os botões ficam desabilitados.
- **CA-34** (RN-13) — Dado A que acabou de tocar um som, quando tenta tocar outro em menos de 3 segundos, então o app não toca.
- **CA-35** (RF-24) — Dado B com volume do soundboard em 0, quando A toca um som, então B não ouve o som, mas continua ouvindo as vozes.

**Vídeo e transmissão**
- **CA-36** (RF-25) — Dado A num canal de voz, quando liga a webcam, então B vê o vídeo de A; quando desliga, o vídeo some.
- **CA-37** (RF-26) — Dado A num canal de voz, quando abre o seletor, então vê miniaturas das telas e janelas abertas e transmite a que escolher.
- **CA-38** (RF-27, RN-10) — Dado A transmitindo no canal, quando B tenta transmitir no mesmo canal, então B vê "A já está transmitindo" e nada inicia; quando A para, B consegue.
- **CA-39a** (RF-28, RN-17) — Dado um membro (não administrador), quando abre a transmissão, então só há 720p30, que já vem selecionado; se pedir 1440p60 chamando o servidor diretamente, o servidor recusa ou limita a 720p30.
- **CA-39** (RF-28, RN-17) — Dado um administrador com a qualidade 1440p60, quando transmite, então B recebe a transmissão em 2560×1440 com 50 a 60 quadros por segundo, com banda suficiente.
- **CA-40** (RF-29) — Dado Windows com a opção de áudio do sistema ligada, quando A toca um vídeo, então B ouve o áudio dele; no Linux, a opção aparece desabilitada com a explicação.
- **CA-41** (RF-30) — Dado uma transmissão ativa, quando B clica nela, então ela abre grande e permite tela cheia.

**Auditoria**
- **CA-48** (RF-34, RN-20a) — Dado A que se cadastra, entra, fecha o app e sai, quando um administrador abre a auditoria, então vê cadastro, login, online, offline e saída de A com horário.
- **CA-49** (RF-34, RN-20b) — Dado A que entra no canal de voz "Geral", transmite a tela e sai, quando o administrador filtra pelo canal "Geral", então vê entrada, início e fim da transmissão e saída de A.
- **CA-50** (RF-34, RN-20c) — Dado um administrador que muda o cargo de B, troca o convite e remove um canal, e o host que redefine a senha de C, quando a auditoria é aberta, então cada ação aparece com quem fez e o alvo.
- **CA-51** (RF-34, RN-20d, RN-21) — Dado A que edita e apaga mensagens num canal e numa DM, quando o administrador abre a auditoria, então aparecem só as do canal, sem o texto das mensagens.
- **CA-52** (RN-22) — Dado um membro, quando tenta abrir a auditoria pela tela ou chamando o servidor diretamente, então não vê a opção e o servidor recusa.
- **CA-53** (RF-36, RN-23) — Dado registros com 31 dias e com 29 dias, quando a limpeza roda, então só os de 31 dias somem.
- **CA-54** (RF-35) — Dado 300 registros de várias pessoas e tipos, quando o administrador filtra por pessoa, tipo e período, então só os correspondentes aparecem, e rolar carrega os mais antigos.
- **CA-55** (RN-24) — Dado A conectado, quando a conexão de A cai por 10 segundos e volta, então nenhum offline/online é registrado; quando A fica 1 minuto fora, então o offline é registrado.

**Status, silenciar e notificações (v5)**
- **CA-56** (RF-37, RN-25) — Dado A e B conectados, quando B fecha o app, então A vê B como offline em até 1 minuto; quando B abre de novo, então A vê B online.
- **CA-57** (RF-37, RN-25) — Dado B conectado e sem mexer no computador por 10 minutos, então A vê B como ausente; quando B mexe no mouse, então A vê B online.
- **CA-58** (RF-38, RN-26) — Dado A, B e C no canal de voz, quando A silencia B, então A não ouve B, C continua ouvindo B, e B não é avisado; ao reabrir o app, B continua silenciado para A.
- **CA-59** (RF-39, RN-27) — Dado A com notificações desligadas, quando chega mensagem num canal fechado, então não aparece notificação, mas o contador de não lidas aumenta.
- **CA-60** (RF-40, RN-27) — Dado A com o canal X silenciado, quando chega mensagem em X e em Y, então só Y gera notificação; X mostra o contador e o ícone de silenciado.

**Rede, instalação e não funcionais**
- **CA-42** (RF-31) — Dado A numa chamada, quando a rede de A cai por 10 segundos e volta, então A volta ao chat e à chamada sem ação manual, com aviso de "reconectando" durante a queda.
- **CA-43** (RF-32) — Dado o repositório, quando rodar `npm run dist:linux`, então são gerados o .AppImage e o .deb, e o .deb instala e abre no Ubuntu; `npm run dist:win` gera o instalador .exe que instala e abre no Windows.
- **CA-44** (RF-33) — Dado uma máquina amd64 e uma arm64 com Docker, quando rodar `docker compose up`, então o servidor e a mídia sobem e o app conecta.
- **CA-45** (RNF) — Dado o app logado e ocioso por 5 minutos, quando medir a RAM somada dos processos, então fica abaixo de 300 MB.
- **CA-46** (RNF) — Dado o app em uso, quando inspecionar o tráfego, então só há conexões com o servidor configurado.
- **CA-47** (RNF) — Dado o README, quando seguir só ele, então é possível subir o servidor via Tailscale e via VPS com HTTPS, e ele traz a tabela de banda por qualidade.

## 9. Impacto em consumidores
Não se aplica: projeto novo, sem sistemas ou usuários existentes.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem | Resposta |
| --- | --- | --- | --- |
| D-1 | Primeira conta criada vira administrador (RN-4)? Alternativa: o host define o login do administrador no arquivo de configuração. | Usuário | Não bloqueante: segue a proposta (primeira conta) salvo objeção na aprovação. |
| D-2 | Com cargos, quem gerencia canais? Proposta: qualquer membro cria e renomeia, só administrador remove (evita perda de histórico por engano). Alternativas: tudo livre, como na demanda original; ou tudo só administrador. | Usuário | Membro cria e renomeia, administrador remove (04/11). |
| D-3 | Administrador pode apagar mensagem de outro (RN-9)? E remover a conta de um membro? Proposta: apagar mensagem sim; remover conta sim, liberando a vaga do limite de 20. | Usuário | Apagar mensagem e remover conta (04/11). |
| D-4 | Soundboard: os 5 sons são do servidor todo (iguais em todos os canais de voz) ou 5 por canal de voz? Som acima de 10 s é recusado ou cortado nos 10 s? Intervalo de 3 s entre sons está bom? Proposta: 5 para o servidor todo, recusar acima de 10 s, intervalo de 3 s. | Usuário | 5 no servidor todo, recusar acima de 10 s, 3 s (04/11). |

| D-5 | Link de convite: um link fixo (o código do arquivo de configuração, o mesmo para todos) ou links gerados por administrador, com validade e uso único? Proposta: link fixo, como a demanda; o administrador troca o código se ele vazar. | Usuário | Link fixo; administrador troca o código no app (04/11). |

| D-6 | DM: só entre duas pessoas, só texto e imagem, e privada até para administrador (RN-18)? | Usuário | Não bloqueante: segue a proposta salvo objeção na aprovação. |
| D-7 | Auditoria de mensagens: edição/exclusão só nos canais, nunca nas DMs (RN-21)? | Usuário | Não bloqueante: segue a proposta salvo objeção na aprovação. |

> Portão: a especificação técnica só começa com esta seção vazia (ou com as dúvidas restantes marcadas como não bloqueantes) e com a aprovação registrada no topo.
