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
  '0.15.0': {
    chamada: 'O ToFalany está de cara nova',
    itens: [
      { titulo: 'Visual novo', texto: 'painéis flutuando sobre um fundo com luz que se mexe devagar, cantos suaves e animações curtas em tudo.' },
      { titulo: 'Temas refeitos', texto: 'Neon da Madrugada, Breu e Aurora, que agora é escura, com luz verde e violeta (Configurações, Aparência).' },
      { titulo: 'Quem fala brilha', texto: 'o anel em volta de quem está falando pulsa no canal de voz.' },
      { titulo: 'Ícones novos', texto: 'no lugar dos emojis, ícones desenhados que seguem a cor do tema.' },
      { titulo: 'Letra nova', texto: 'a fonte Inter, igual no Windows e no Linux.' },
      { titulo: 'ToOuvini explica', texto: 'quando a música não toca, ele diz o porquê em vez de ficar calado.' },
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
