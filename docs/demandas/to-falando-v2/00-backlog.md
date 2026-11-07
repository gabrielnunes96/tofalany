# Backlog da próxima versão do ToFalany

Pedidos do usuário de 06/11/2026, depois de fechar a to-falando-v1. Ainda não é especificação: na próxima sessão cada bloco vira demanda (funcional → técnica → plano), na ordem de prioridade abaixo.

**Regra que vale para tudo:** zero configuração de sistema para quem usa o app. A pessoa instala (next, next, finish), entra pelo link de convite e só mexe em personalização.

## Prioridades

### P1: usar no dia a dia sem depender do terminal

Primeiro o que impede o grupo de usar o app de verdade, e os incômodos que já aparecem no uso.

| # | Item | Análise rápida |
| --- | --- | --- |
| 1 | **Indicador de fala atrasado na lista do canal de voz** | A bolinha da lista vem do "quem está falando" do LiveKit, que o servidor de mídia calcula e envia com algumas centenas de milissegundos de atraso. A do rodapé mede o próprio microfone na hora, por isso é imediata. Caminho provável: medir o nível do áudio que já chega de cada pessoa (como o rodapé faz com o seu) e acender a bolinha por isso. |
| 1b | **Colar imagem no chat (Ctrl+V)** | Bug de uso: o campo de mensagem não trata o colar, então um print da área de transferência não vira anexo. Hoje a imagem só entra pelo botão de anexo. Tratar o evento de colar no campo do canal e da DM e mandar a imagem pelo mesmo envio de anexo, com prévia antes de enviar. É pequeno: dá para fazer primeiro. |
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
| 13 | **Som do computador na transmissão no Linux** | É possível. O PipeWire e o PulseAudio expõem o som do sistema como um "monitor" que dá para capturar como se fosse um microfone. O desafio é não mandar de volta a voz da chamada (eco), ou seja, capturar só o som de um aplicativo ou excluir o do próprio ToFalany. Há projetos abertos que já fazem isso no Linux (por exemplo, a biblioteca venmic, usada pelo Vesktop). Precisa de prova de conceito. O mesmo cuidado com eco vale para o Windows (validação pendente da T22). |

### P4: extras

| # | Item | Análise rápida |
| --- | --- | --- |
| 14 | **Bot de música** | Tocar o áudio de um link do YouTube no canal de voz por comando (ex.: `/tocar <link>`), com fila, pular e parar. O bot entra no LiveKit como participante, rodando no servidor. Riscos: os termos de uso do YouTube proíbem baixar ou retransmitir fora do player, e as ferramentas de extração (yt-dlp) quebram quando o YouTube muda. Decidir com o usuário antes de planejar. |
| 15 | **Acesso ao banco para consultas** | Desenvolvimento e produção. Hoje dá para fazer na mão (DB Browser for SQLite; em produção, copiar com `docker compose cp`). Decidir se vira só um roteiro no README, um script de cópia segura ou uma tela no app. Cuidado com hashes de senha e tokens. |

## Pendências da v1 (antes ou em paralelo)

- Validações manuais em [to-falando-v1/validacoes-usuario.md](../to-falando-v1/validacoes-usuario.md).
- PR da v1, que depende do item 5 (repositório no GitHub).
- Correção do aviso de voz não configurada (06/11), feita mas sem commit.
