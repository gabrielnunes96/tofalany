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

/**
 * Mostrar as notas desta versão? Só para quem já usava o app (tem servidor salvo ou viu notas antes) e ainda não
 * viu as desta versão. `gravar`: a versão a guardar como vista sem mostrar (instalação nova).
 */
export function decidirNovidades(versao: string, vistas: string | undefined, jaUsava: boolean): { mostrar: NotasVersao | null; gravar: string | null } {
  if (!versao || vistas === versao) return { mostrar: null, gravar: null };
  if (!jaUsava && vistas === undefined) return { mostrar: null, gravar: versao };
  return { mostrar: NOVIDADES[versao] ?? null, gravar: NOVIDADES[versao] ? null : versao };
}
