/**
 * Notas de cada versão, mostradas uma vez ao abrir o app depois de atualizar (quem instala do zero não vê).
 * O texto de cada versão é aprovado antes de gerar a versão. Sem emojis.
 */
export interface NotasVersao {
  /** Frase grande no topo da janela (opcional): a versão que merece festa. */
  chamada?: string;
  itens: { titulo: string; texto: string }[];
}

export const NOVIDADES: Record<string, NotasVersao> = {
  '0.19.0': {
    itens: [
      { titulo: 'Chamar como um telefone', texto: 'o chamado toca por 15 segundos. Quem é chamado pode Entrar ou Recusar, e quem chama vê "Chamando…" com Cancelar. Só dá para chamar quem está online ou ausente.' },
      { titulo: 'Atalhos de sons', texto: 'em Configurações, Atalhos, ponha uma tecla em cada som (por exemplo F1). O atalho toca o som na voz mesmo com o jogo aberto.' },
      { titulo: 'Pastas de servidores', texto: 'arraste um servidor para cima de outro para criar uma pasta, e arraste para mudar a ordem. Pelo clique direito também dá para mover, criar pasta, dar nome e cor.' },
      { titulo: 'Colunas do seu tamanho', texto: 'arraste a divisória das colunas de canais e de membros. Duplo clique volta ao tamanho normal.' },
      { titulo: 'Chat com várias transmissões', texto: 'com transmissões abertas, o chat sempre mostra pelo menos 8 linhas; os vídeos encolhem para caber.' },
      { titulo: 'Correções da voz', texto: 'ficar inativo leva para a sala de AFK, sem tirar da voz; entrar de novo numa sala não é mais recusado; o teste de microfone funciona dentro da sala; ao atualizar, o app sai da voz antes.' },
      { titulo: 'Quem está assistindo', texto: 'sai o contador flutuante. O olho da transmissão mostra o número e a lista abre para o lado que tiver espaço.' },
      { titulo: 'Loja', texto: 'o botão "Ouvir" vira "Pausar" enquanto o áudio toca.' },
    ],
  },
  '0.18.0': {
    chamada: 'A maior atualização até agora',
    itens: [
      { titulo: 'Fixar e buscar', texto: 'fixe as mensagens importantes pelo menu da mensagem e veja todas em Fixadas, no topo da conversa. O campo Buscar acha mensagens na conversa ou em todos os canais, com filtros de quem mandou, anexo e GIF.' },
      { titulo: 'Mover e sala de AFK', texto: 'quem tem a permissão "Mover membros" muda alguém de sala pelo menu da pessoa ou arrastando o nome. O administrador escolhe uma sala de AFK em Editar servidor: quem fica parado e calado vai para lá sozinho.' },
      { titulo: 'Chamar para a voz', texto: 'estando na voz, chame alguém pelo menu da pessoa ou pela conversa direta. A pessoa recebe o aviso com o botão de entrar.' },
      { titulo: 'Áudios na loja', texto: 'áudios com raridade (comum, raro, épico e lendário) para comprar com pontos e tocar no soundboard de qualquer servidor, em Meus sons.' },
      { titulo: 'Transmissões', texto: 'modo teatro e uma barra de controles para quem assiste; câmeras e transmissão em janela própria, que vai para outro monitor; sons quando alguém abre ou assiste uma transmissão e o contador de quem está assistindo.' },
      { titulo: 'Som do sistema sem eco', texto: 'no Windows 11, quem assiste não ouve mais a própria voz de volta. No Windows 10 a opção fica desligada, porque o sistema não permite tirar o som da chamada.' },
      { titulo: 'Voz mais alta', texto: 'o nivelamento deixa quem fala baixo no mesmo volume de quem fala alto. Em Configurações, Voz: ganho do microfone e volume geral da chamada.' },
      { titulo: 'Atualizar o app', texto: 'no menu do usuário, "Atualizar o app" procura, baixa e instala a versão nova.' },
      { titulo: 'Convidar pelo cartão', texto: '"Convidar para servidor" no cartão e no menu da pessoa.' },
      { titulo: 'Aparelhos conectados', texto: 'em Minha conta, veja onde a sua conta está aberta e desconecte o que você não usa mais.' },
      { titulo: 'Atividade', texto: 'o jogo e a música aparecem também na aba Amigos, com o nome certo do jogo da Steam e o Spotify ouvido pelo navegador.' },
      { titulo: 'Janela pequena', texto: 'com a janela estreita, os canais e os membros viram gavetas.' },
      { titulo: 'Ajustes', texto: 'o ToOuvini e o código de senha funcionam de qualquer servidor; "Apagar" aparece para quem tem a permissão; o status só chega a quem pode ver.' },
    ],
  },
  '0.17.1': {
    itens: [
      { titulo: 'Servidor de casa nova', texto: 'o servidor mudou de endereço. Se o endereço antigo continuar na coluna da esquerda, o app pergunta se pode tirá-lo da lista.' },
      { titulo: 'Remover da lista', texto: 'clique com o botão direito no ícone de um servidor para tirá-lo da lista deste computador, mesmo que ele esteja fora do ar.' },
      { titulo: 'GIF', texto: 'a busca de GIF não some mais ao trocar de servidor.' },
    ],
  },
  '0.17.0': {
    chamada: 'Agora cada um tem o seu cartão',
    itens: [
      { titulo: 'Mini perfil', texto: 'clique no nome ou na foto de alguém (no chat, numa menção, na lista de membros ou nos amigos) para ver o cartão da pessoa: foto, cargos, status, o que ela escreveu sobre si e o que vocês têm em comum.' },
      { titulo: 'Mensagem rápida', texto: 'no cartão, escreva e dê Enter: a mensagem vai direto para a conversa com a pessoa.' },
      { titulo: 'Seu cartão', texto: 'em Minha conta, escolha um fundo (uma cor, um degradê, uma imagem ou um GIF seu) e escreva um "sobre mim". O fundo aparece também, bem suave, na sua linha da lista de membros.' },
      { titulo: 'Perfil completo', texto: 'em "Ver perfil", os amigos e os servidores que vocês dividem.' },
      { titulo: 'Procurar atualização', texto: 'em Novidades, um botão procura a versão nova na hora.' },
      { titulo: 'Linux', texto: 'o ícone certo na barra de tarefas também para quem instalou pelo .deb, e uma barra de espera enquanto a atualização instala.' },
      { titulo: 'Ajustes', texto: 'o menu de status aparece inteiro, e a versão do servidor no menu se atualiza sozinha.' },
    ],
  },
  '0.16.0': {
    chamada: 'Agora dá para reagir, responder e mandar GIF',
    itens: [
      { titulo: 'Reações', texto: 'passe o mouse numa mensagem e reaja com um clique (joinha, risada ou coração) ou escolha qualquer emoji em Reagir, com busca em português. Clique de novo para tirar; passe o mouse na reação para ver quem reagiu.' },
      { titulo: 'Responder', texto: 'em Responder, a sua mensagem sai com o começo da original em cima; clicar nele leva até ela, mesmo lá no começo da conversa.' },
      { titulo: 'Aviso de resposta', texto: 'quem foi respondido recebe o aviso como numa menção. Dá para desligar o aviso antes de enviar.' },
      { titulo: 'GIF', texto: 'o botão GIF, ao lado do anexar, abre os GIFs em alta e uma busca; clique num para mandar, junto com o que você já escreveu. Aparece quando o administrador liga a busca no servidor. A busca e os GIFs vêm direto da Klipy, que recebe o seu IP e o que você buscou.' },
      { titulo: 'Novidades sem som', texto: 'esta janela agora abre em silêncio.' },
      { titulo: 'Atualizando', texto: 'ao reiniciar para atualizar, aparece o ícone girando até a versão nova abrir.' },
      { titulo: 'Ícones', texto: 'o atalho da área de trabalho no Windows e a barra de tarefas no Linux mostram o ícone do ToFalany.' },
    ],
  },
  '0.15.4': {
    itens: [
      { titulo: 'Servidores', texto: 'ser administrador do servidor principal não coloca mais ninguém em todos os servidores: cada um participa só dos que criou ou em que entrou por convite.' },
    ],
  },
  '0.15.3': {
    itens: [
      { titulo: 'Transmissão em tela cheia', texto: 'volume, sair da tela cheia e fechar aparecem por cima do vídeo ao mexer o mouse e somem quando ele para.' },
      { titulo: 'Som da transmissão', texto: 'desligar o áudio da chamada não corta mais o som da transmissão que você está assistindo; ela tem o próprio volume e mudo.' },
      { titulo: 'Telas que rolam', texto: 'Loja, Membros e outras telas longas voltam a rolar em monitores menores (o extrato aparece).' },
      { titulo: 'Lista de membros', texto: 'só o cargo mais alto aparece ao lado do nome, e as linhas ficam alinhadas.' },
      { titulo: 'Menção honrosa', texto: 'ao Ney Marcos, que achou os problemas da tela cheia e do som da transmissão.' },
    ],
  },
  '0.15.2': {
    itens: [
      { titulo: 'Câmeras de volta', texto: 'a janelinha flutuante das câmeras não some mais para fora da tela depois de ocultar e mostrar ou de mudar o tamanho da janela.' },
      { titulo: 'Quem está assistindo', texto: 'o número de quem assiste a transmissão não fica mais cortado.' },
      { titulo: 'Cookies do ToOuvini', texto: 'novo passo a passo (janela anônima, fechada logo depois) para os cookies durarem bem mais.' },
    ],
  },
  '0.15.1': {
    itens: [
      { titulo: 'Configurações em janela', texto: 'abrem sobre o app, com as seções à esquerda (Minha conta, Voz e áudio, Atalhos, Aparência e outras). Esc fecha.' },
      { titulo: 'Autenticação em dois fatores', texto: 'opcional: ligue em Configurações, Minha conta, com um app de autenticação no celular. O código é pedido só ao entrar numa conta.' },
      { titulo: 'Códigos de recuperação', texto: 'ao ligar, você recebe 8 códigos de uso único para entrar se ficar sem o celular; o administrador também pode desligar.' },
      { titulo: 'Novidades de novo', texto: 'as notas de todas as versões ficam em Configurações, Novidades (e no menu do seu painel).' },
      { titulo: 'Como ganhar pontos', texto: 'a Loja agora explica direitinho como os pontos entram.' },
    ],
  },
  '0.15.0': {
    chamada: 'O ToFalany está de cara nova',
    itens: [
      { titulo: 'Visual novo', texto: 'painéis flutuando sobre um fundo com luz que se mexe devagar, cantos suaves e animações curtas em tudo.' },
      { titulo: 'Temas refeitos', texto: 'Neon da Madrugada, Breu e Aurora, que agora é escura, com luz verde e violeta (Configurações, Aparência).' },
      { titulo: 'Quem fala brilha', texto: 'o anel em volta de quem está falando pulsa no canal de voz.' },
      { titulo: 'Ícones novos', texto: 'no lugar dos emojis, ícones desenhados que seguem a cor do tema.' },
      { titulo: 'Letra nova', texto: 'a fonte Inter, igual no Windows e no Linux.' },
      { titulo: 'ToOuvini explica', texto: 'quando a música não toca, ele diz o porquê em vez de ficar calado.' },
      { titulo: 'Loja de pontos', texto: 'ganhe 1 ponto por minuto em voz com mais alguém no canal (com o fone ligado; microfone mudo também conta) e veja o saldo no seu painel.' },
      { titulo: 'Temas da loja', texto: 'Cinzas do Trono, Arcano Dourado e Gibi: compre na Loja (menu do seu painel) e são seus para sempre.' },
      { titulo: 'Vales de transmissão', texto: '720p60, 1080p30 e 1080p60 por 7 dias; comprar de novo soma mais 7 dias.' },
      { titulo: 'Prefere tudo parado?', texto: 'ligue "reduzir movimento" no sistema e as animações somem.' },
    ],
  },
  '0.14.0': {
    itens: [
      { titulo: 'Transmissão sem eco', texto: 'quem assiste não ouve mais a própria voz voltando pela transmissão (Windows 11).' },
      { titulo: 'Várias transmissões', texto: 'até 4 pessoas transmitindo a tela ao mesmo tempo no mesmo canal.' },
      { titulo: 'Volume da transmissão', texto: 'cada um ajusta ou muta o som de cada transmissão, só para si.' },
      { titulo: 'A voz continua', texto: 'dá para olhar outro servidor sem cair da chamada.' },
      { titulo: 'Menções', texto: 'marque alguém com @ (ou @todos) e a pessoa recebe a notificação.' },
      { titulo: 'Atividade', texto: 'mostre o jogo que está jogando e a música do Spotify (ligue em Configurações, Atividade).' },
      { titulo: 'Nome e imagem do servidor', texto: 'administradores podem trocar em "Editar servidor".' },
      { titulo: 'Moderação', texto: 'castigo por tempo, expulsar e banir, com o motivo.' },
    ],
  },
};

/** Compara versões "x.y.z" (negativo: a vem antes de b). */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Mostrar notas? Só para quem já usava o app (tem servidor salvo ou viu notas antes): as notas mais recentes que a
 * pessoa ainda não viu, até a versão instalada. Assim, quem pula de versão (ex.: da 0.17.1 direto para a 0.18.1, que
 * não tem notas) vê as da 0.18.0. `versaoNotas`: de qual versão são as notas mostradas. `gravar`: a versão a guardar
 * como vista sem mostrar (instalação nova, ou nada novo para mostrar).
 */
export function decidirNovidades(
  versao: string,
  vistas: string | undefined,
  jaUsava: boolean,
): { mostrar: NotasVersao | null; versaoNotas: string | null; gravar: string | null } {
  if (!versao || vistas === versao) return { mostrar: null, versaoNotas: null, gravar: null };
  if (!jaUsava && vistas === undefined) return { mostrar: null, versaoNotas: null, gravar: versao };
  const candidatas = Object.keys(NOVIDADES)
    .filter((v) => compararVersoes(v, versao) <= 0 && (vistas === undefined || compararVersoes(v, vistas) > 0))
    .sort(compararVersoes);
  const escolhida = candidatas.at(-1);
  if (!escolhida) return { mostrar: null, versaoNotas: null, gravar: versao };
  return { mostrar: NOVIDADES[escolhida]!, versaoNotas: escolhida, gravar: null };
}
