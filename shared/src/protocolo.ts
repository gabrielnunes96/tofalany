import { ATALHOS_PADRAO, type Atalhos } from './atalhos.js';
/** Tempo máximo do teste de conexão com o servidor (RF-1). */
export const TEMPO_TESTE_SERVIDOR_MS = 5000;

/** Identificador devolvido por GET /api/servidor para o app reconhecer um servidor ToFalany. */
export const APP_ID = 'tofalany';

/** Resposta de GET /api/servidor (público). */
export interface ServidorInfo {
  app: typeof APP_ID;
  nome: string;
  versao: string;
  contas: number;
  limiteContas: number;
}

/** Resposta de GET /api/saude. */
export interface SaudeInfo {
  /** O servidor e o banco respondem (o chat funciona mesmo com a mídia fora, RNF de estabilidade). */
  ok: boolean;
  sqlite: boolean;
  /** LiveKit: respondendo, fora do ar, ou não configurado neste servidor. */
  livekit: 'ok' | 'fora' | 'sem_config';
}

export type Cargo = 'admin' | 'membro';

export interface UsuarioDto {
  id: number;
  usuario: string;
  nomeExibicao: string;
  cor: string;
  avatarUrl: string | null;
  cargo: Cargo;
  /** Backlog v2, item 10c: cargo personalizado (ex.: Moderador), com nome, cor e permissões; null/ausente = nenhum. */
  funcaoId?: number | null;
}

/**
 * O que um cargo libera. Básicas: o que todo membro faz (um cargo personalizado vem com elas marcadas e dá para
 * desmarcar). Extras: vêm desmarcadas. O administrador tem tudo, e só ele mexe em contas e cargos.
 */
export type Permissao =
  | 'enviar_mensagens'
  | 'enviar_anexos'
  | 'entrar_voz'
  | 'usar_camera'
  | 'transmitir_tela'
  | 'tocar_sons'
  | 'usar_toouvini'
  | 'gerenciar_canais'
  | 'apagar_mensagens'
  | 'gerenciar_convite'
  | 'gerenciar_sons'
  | 'transmitir_1080p'
  | 'transmitir_1440p'
  | 'ver_auditoria';

export const PERMISSOES: { id: Permissao; nome: string; descricao: string; basica?: boolean }[] = [
  { id: 'enviar_mensagens', nome: 'Enviar mensagens', descricao: 'escrever nos canais de texto', basica: true },
  { id: 'enviar_anexos', nome: 'Enviar arquivos', descricao: 'anexar imagens e arquivos nos canais', basica: true },
  { id: 'entrar_voz', nome: 'Entrar na voz', descricao: 'entrar nos canais de voz e falar', basica: true },
  { id: 'usar_camera', nome: 'Câmera', descricao: 'ligar a câmera nos canais de voz', basica: true },
  { id: 'transmitir_tela', nome: 'Transmitir a tela', descricao: 'transmitir a tela em 720p30', basica: true },
  { id: 'tocar_sons', nome: 'Soundboard', descricao: 'tocar os sons do soundboard', basica: true },
  { id: 'usar_toouvini', nome: 'ToOuvini', descricao: 'pedir música ao bot (/play, /next…)', basica: true },
  { id: 'gerenciar_canais', nome: 'Gerenciar canais', descricao: 'remover canais de texto e de voz' },
  { id: 'apagar_mensagens', nome: 'Apagar mensagens', descricao: 'apagar mensagens dos outros nos canais' },
  { id: 'gerenciar_convite', nome: 'Gerenciar convite', descricao: 'ver e trocar o código de convite' },
  { id: 'gerenciar_sons', nome: 'Gerenciar sons', descricao: 'cadastrar, trocar e remover sons do soundboard' },
  { id: 'transmitir_1080p', nome: 'Transmitir em 1080p', descricao: 'transmitir a tela em 1080p60' },
  { id: 'transmitir_1440p', nome: 'Transmitir em 2K', descricao: 'transmitir a tela em 1440p60 (se o monitor tiver)' },
  { id: 'ver_auditoria', nome: 'Ver auditoria', descricao: 'ver o registro de entradas, saídas e ações' },
];

/** O que todo membro sem cargo personalizado faz (e o que um cargo novo traz marcado). */
export const PERMISSOES_BASICAS: Permissao[] = PERMISSOES.filter((p) => p.basica).map((p) => p.id);

/** Backlog v2, item 10c: cargo personalizado. */
export interface FuncaoDto {
  id: number;
  nome: string;
  /** Cor do nome de quem tem o cargo (#rrggbb). */
  cor: string;
  permissoes: Permissao[];
}

/** O que alguém pode fazer: administrador tudo; com cargo personalizado, o que ele libera; sem, as básicas. */
export function permissoesDe(usuario: Pick<UsuarioDto, 'cargo' | 'funcaoId'> | undefined, funcoes: FuncaoDto[]): Set<Permissao> {
  if (!usuario) return new Set();
  if (usuario.cargo === 'admin') return new Set(PERMISSOES.map((p) => p.id));
  const funcao = usuario.funcaoId ? funcoes.find((f) => f.id === usuario.funcaoId) : undefined;
  return new Set(funcao ? funcao.permissoes : PERMISSOES_BASICAS);
}

/** Visão do administrador: inclui contas removidas (para a auditoria). */
export interface UsuarioAdminDto extends UsuarioDto {
  removido: boolean;
}

/** Backlog v2, item 10b: prévia de um link do chat (buscada pelo servidor; a imagem vem embutida). */
export interface PreviaLink {
  url: string;
  tipo: 'pagina' | 'youtube';
  site?: string;
  titulo?: string;
  descricao?: string;
  /** Miniatura reduzida, como data:image/webp. */
  imagem?: string;
  /** Só no YouTube: o vídeo para o player. */
  videoId?: string;
}

/** Backlog v2, item 3: código de redefinição de senha gerado pelo administrador. */
export interface RedefinicaoDto {
  codigo: string;
  /** Quando deixa de valer (ms desde 1970). */
  expiraEm: number;
}

/** Backlog v2, item 3: "Esqueci a senha" com o código recebido do administrador. */
export interface RedefinirSenhaRequest {
  usuario: string;
  codigo: string;
  senha: string;
}

export interface ConviteDto {
  codigo: string;
  link: string;
}

export interface AtualizarPerfilRequest {
  nomeExibicao?: string;
  cor?: string;
}

export interface CadastroRequest {
  convite: string;
  usuario: string;
  senha: string;
}

export interface LoginRequest {
  usuario: string;
  senha: string;
}

export interface SessaoResponse {
  token: string;
  usuario: UsuarioDto;
}

/** Códigos de erro da API; o corpo de erro é { erro, mensagem }. */
export type CodigoErro =
  | 'dados_invalidos'
  | 'voz_indisponivel'
  | 'musica_indisponivel'
  | 'assinatura_invalida'
  | 'convite_invalido'
  | 'codigo_invalido'
  | 'usuario_em_uso'
  | 'limite_contas'
  | 'credenciais_invalidas'
  | 'muitas_tentativas'
  | 'nao_autenticado'
  | 'nao_encontrado'
  | 'sem_permissao'
  | 'ultimo_admin'
  | 'limite_sons'
  | 'limite_cargos'
  | 'nao_membro'
  | 'limite_servidores'
  | 'som_longo'
  | 'arquivo_grande'
  | 'formato_invalido'
  | 'erro_interno';

export interface ErroApi {
  erro: CodigoErro;
  mensagem: string;
}

/** RF-17, RF-18, RF-20: áudio guardado por máquina (RN-14). */
export interface PreferenciasAudio {
  /** deviceId do microfone; null = padrão do sistema. */
  entradaId: string | null;
  /** deviceId da saída; null = padrão do sistema. */
  saidaId: string | null;
  /** Supressão de ruído: RNNoise (forte); se não carregar, a do Chromium (básica). */
  supressaoRuido: boolean;
  cancelamentoEco: boolean;
  ganhoAutomatico: boolean;
  /** Sensibilidade da detecção de voz em dBFS (-100 a 0): abaixo disso não transmite. */
  sensibilidadeDb: number;
  /** RF-14: detecção de voz (padrão) ou push-to-talk. */
  modoMicrofone: 'deteccao' | 'ptt';
}

export const AUDIO_PADRAO: PreferenciasAudio = {
  entradaId: null,
  saidaId: null,
  supressaoRuido: true,
  cancelamentoEco: true,
  // Desligado por padrão: o ganho automático do navegador sobe e desce o volume da voz (pedido do usuário, 07/11).
  ganhoAutomatico: false,
  sensibilidadeDb: -50,
  modoMicrofone: 'deteccao',
};

/** Configurações guardadas por máquina (RN-14). */
export interface ConfiguracoesLocais {
  servidorUrl: string | null;
  audio: PreferenciasAudio;
  /** RF-15: atalhos globais (PTT, mute, deafen). */
  atalhos: Atalhos;
  /** RF-19, RF-38: volume e silêncio de cada pessoa, por servidor (chave = URL do servidor). */
  pessoas: Record<string, PreferenciasPessoas>;
  /** RF-21, RF-41: sons que dá para desligar. */
  sons: PreferenciasSons;
  /** RF-39, RF-40, RF-41: notificações deste computador (RN-27). */
  notificacoes: PreferenciasNotificacoes;
  /** RF-28, R-3: qualidade padrão da transmissão (admin escolhe a própria) e codec. */
  tela: PreferenciasTela;
  /** Backlog v2, 1e: versão antiga da escolha (true = bandeja, false = sair); vale enquanto não houver `aoFechar`. */
  fecharParaBandeja?: boolean;
  /** O que fazer ao fechar a janela: perguntar (padrão), ir para a bandeja ou fechar o app. */
  aoFechar?: AcaoFechar;
  /** Backlog v2, item 7: servidores em que a pessoa entrou (a coluna à esquerda). */
  servidores?: ServidorConhecido[];
  /** Backlog v2, item 10: partes da tela escondidas. */
  ocultos?: PartesOcultas;
  /** Backlog v2, item 9: tema da interface (padrão: neon). */
  tema?: Tema;
  /** Backlog v2, item 2: status escolhido em cada servidor (chave = URL do servidor). */
  statusEscolhido?: Record<string, EscolhaStatus>;
}

export interface PreferenciasTela {
  qualidade: QualidadeTela;
  /** R-3: H.264 (codificação por hardware comum) ou VP9. */
  codec: 'h264' | 'vp9';
}

export const TELA_PADRAO: PreferenciasTela = { qualidade: '720p30', codec: 'h264' };

export interface PreferenciasNotificacoes {
  /** RF-39: notificação de mensagens ligada. */
  mensagens: boolean;
  /** RF-41: som quando alguém entra ou sai do servidor. */
  entradaSaidaSom: boolean;
  /** RF-41: notificação "fulano entrou/saiu". */
  entradaSaidaAviso: boolean;
  /** RF-40: conversas silenciadas ("c:<id>"/"d:<id>") por servidor. */
  silenciadas: Record<string, string[]>;
}

export const NOTIFICACOES_PADRAO: PreferenciasNotificacoes = { mensagens: true, entradaSaidaSom: true, entradaSaidaAviso: true, silenciadas: {} };

/** Volume (0 a 2 = 0 a 200%) e silêncio de cada pessoa num servidor (só neste computador, RN-26). */
export interface PreferenciasPessoas {
  volumes: Record<string, number>;
  silenciados: number[];
}

export interface PreferenciasSons {
  /** Sons de entrar e sair do canal de voz e de mute/desmute (RF-21). */
  voz: boolean;
  /** RF-24: volume local do soundboard (0 a 1; 0 = não ouvir). */
  soundboard: number;
}

export const SONS_PADRAO: PreferenciasSons = { voz: true, soundboard: 0.8 };

export const CONFIGURACOES_PADRAO: ConfiguracoesLocais = {
  servidorUrl: null,
  audio: AUDIO_PADRAO,
  atalhos: ATALHOS_PADRAO,
  pessoas: {},
  sons: SONS_PADRAO,
  notificacoes: NOTIFICACOES_PADRAO,
  tela: TELA_PADRAO,
};

/** Backlog v2, item 7: servidor da coluna à esquerda (o nome vem do próprio servidor). */
export interface ServidorConhecido {
  url: string;
  nome?: string;
}

/** Backlog v2, item 10: canais (coluna da esquerda), membros (da direita) e câmeras escondidos. */
export interface PartesOcultas {
  canais: boolean;
  membros: boolean;
  cameras: boolean;
}

/** Backlog v2, item 9: temas (o nome na tela fica no app). */
export type Tema = 'neon' | 'breu' | 'aurora';
export const TEMAS: Tema[] = ['neon', 'breu', 'aurora'];

/** Por que o servidor encerrou a conexão em tempo real de uma sessão. */
export type MotivoRevogacao = 'saiu' | 'sessao_invalida' | 'conta_removida' | 'fora_do_servidor';

/** Esquema do link que abre o app (RF-1a): tofalany://convite?servidor=<url>&codigo=<código>. */
export const ESQUEMA_LINK = 'tofalany';

export type TipoCanal = 'texto' | 'voz';

export interface CanalDto {
  id: number;
  tipo: TipoCanal;
  nome: string;
  posicao: number;
}

export type TipoAnexo = 'imagem' | 'documento';

export interface AnexoDto {
  id: string;
  /** Caminho no servidor (/files/<id>), relativo à URL do servidor. */
  url: string;
  tipo: TipoAnexo;
  nome: string;
  bytes: number;
  largura: number | null;
  altura: number | null;
}

/** Onde a mensagem vive: um canal de texto ou uma conversa direta (DM). */
export type Destino = { canalId: number } | { dmId: number };

/** Conversa direta entre a pessoa logada e `outroId` (RN-18: só os dois veem). */
export interface DmDto {
  id: number;
  outroId: number;
  /** Momento da última mensagem (ou da criação), para ordenar a lista. */
  ultimaEm: number;
}

export interface MensagemDto {
  id: number;
  canalId: number | null;
  dmId: number | null;
  autorId: number;
  /** Pode ser vazio quando a mensagem só tem anexos. */
  texto: string;
  criadaEm: number;
  editadaEm: number | null;
  anexos: AnexoDto[];
}

export interface PaginaMensagens {
  /** Da mais antiga para a mais nova. */
  mensagens: MensagemDto[];
  /** true quando não há mensagens mais antigas. */
  fim: boolean;
}

/** Som do soundboard (RF-22). */
export interface SomDto {
  id: number;
  nome: string;
  /** Caminho no servidor (/files/<id>), relativo à URL do servidor. */
  url: string;
  duracaoMs: number;
}

/** RF-37, RN-25: status calculado de cada pessoa. */
export type StatusPessoa = 'online' | 'ausente' | 'naoIncomodar' | 'offline';
/** Status visível de quem está conectado (offline é a ausência dele). */
export type StatusVisivel = Exclude<StatusPessoa, 'offline'>;
/**
 * Backlog v2, item 2: o que a pessoa escolhe. "auto" segue a ociosidade (online/ausente); "invisivel" aparece
 * como offline para os outros; "naoIncomodar" silencia as notificações dela.
 */
export type EscolhaStatus = 'auto' | 'ausente' | 'naoIncomodar' | 'invisivel';
export const ESCOLHAS_STATUS: EscolhaStatus[] = ['auto', 'ausente', 'naoIncomodar', 'invisivel'];

/** RN-25: sem mexer no computador por este tempo, a pessoa fica ausente. */
export const AUSENTE_APOS_S = 600;

/** Quem está em qual canal de voz (RF-13), com mute/deafen/câmera para os ícones. */
export interface VozEstadoDto {
  usuarioId: number;
  canalVozId: number;
  mudo: boolean;
  surdo: boolean;
  camera: boolean;
}

/** O que o app informa ao entrar, mudar de estado ou sair (canalVozId null) da voz. */
export interface VozEstadoPedido {
  canalVozId: number | null;
  mudo: boolean;
  surdo: boolean;
  camera: boolean;
  /** Sessão de mídia no LiveKit (participant.sid), para o servidor reconhecer a saída certa. */
  sid?: string;
}

/** RF-26/RF-28: qualidade da transmissão de tela (membro só 720p30, RN-17). */
export type QualidadeTela = '720p30' | '1080p60' | '1440p60';
export const QUALIDADES_TELA: QualidadeTela[] = ['720p30', '1080p60', '1440p60'];

/** RF-28/RN-17: dimensões máximas de cada qualidade (o servidor confere a faixa publicada). */
export const DIMENSOES_TELA: Record<QualidadeTela, { largura: number; altura: number; quadros: number }> = {
  '720p30': { largura: 1280, altura: 720, quadros: 30 },
  '1080p60': { largura: 1920, altura: 1080, quadros: 60 },
  '1440p60': { largura: 2560, altura: 1440, quadros: 60 },
};

/** RN-17: o que cada cargo pode escolher. */
/** Qualidades que o cargo libera: 720p30 com "Transmitir a tela"; 1080p e 2K por permissão própria (administrador: todas). */
export const qualidadesPermitidas = (cargo: Cargo, permissoes: ReadonlySet<Permissao> = new Set()): QualidadeTela[] => {
  if (cargo === 'admin') return QUALIDADES_TELA;
  return QUALIDADES_TELA.filter((q) => q === '720p30' || (q === '1080p60' && permissoes.has('transmitir_1080p')) || (q === '1440p60' && permissoes.has('transmitir_1440p')));
};

/** RN-10: quem transmite em cada canal de voz. */
export interface TransmissaoDto {
  canalVozId: number;
  usuarioId: number;
  qualidade: QualidadeTela;
  /** Quem está assistindo agora (servidor antigo não manda). */
  espectadores?: number[];
}

/** Sala do LiveKit de um canal de voz. */
export const salaLivekit = (canalVozId: number) => `voz-${canalVozId}`;

/** Resposta de POST /api/livekit/token. */
export interface TokenVozResponse {
  url: string;
  token: string;
}

/** Resposta (ack) dos eventos cliente → servidor. */
export type Ack<T = undefined> = (resposta: { ok: true; valor: T } | { ok: false; erro: string }) => void;

/** Retrato inicial enviado ao conectar o Socket.IO (cresce com canais, DMs, voz… nas próximas tarefas). */
export interface OlaPayload {
  /** Servidor desta conexão: nome, id (1 = principal) e quem criou (só quem criou exclui; servidor antigo não manda). */
  servidor: { nome: string; id?: number; donoId?: number | null };
  /** Link de convite vigente, que qualquer membro pode copiar (RF-1a). */
  convite: { link: string };
  eu: UsuarioDto;
  usuarios: UsuarioDto[];
  /** Backlog v2, item 10c: cargos personalizados do servidor (servidor antigo não manda). */
  funcoes?: FuncaoDto[];
  canais: CanalDto[];
  dms: DmDto[];
  sons: SomDto[];
  /** RF-13: quem está em cada canal de voz. */
  voz: VozEstadoDto[];
  /** RN-10: transmissões de tela ativas. */
  transmissoes: TransmissaoDto[];
  /** RF-37: quem não está offline (id → online/ausente). */
  presencas: Record<string, StatusVisivel>;
  /** RF-12: mensagens não lidas por conversa ("c:<id>" / "d:<id>"), só as que têm alguma. */
  naoLidas: Record<string, number>;
  /** Backlog v2, item 14: o que o bot de música toca em cada canal de voz (servidor antigo não manda). */
  musica?: EstadoMusica[];
  /** Amizades da conta (valem em todos os servidores da instalação) e quem são essas pessoas. */
  amizades?: AmizadeDto[];
  /** Pessoas das amizades e das conversas diretas que não são membros deste servidor (nome, cor, avatar). */
  conhecidos?: UsuarioDto[];
}

/** Eventos servidor → cliente. */
export interface EventosServidor {
  ola: (payload: OlaPayload) => void;
  'sessao:revogada': (payload: { motivo: MotivoRevogacao }) => void;
  /** Conta nova no servidor: aparece na lista de todos sem reconectar. */
  'usuario:criado': (usuario: UsuarioDto) => void;
  /** Perfil mudou (nome, cor, avatar, cargo). */
  'usuario:atualizado': (usuario: UsuarioDto) => void;
  /** Código de convite trocado: o link copiável muda para todos. */
  'convite:atualizado': (convite: { link: string }) => void;
  'canal:criado': (canal: CanalDto) => void;
  'canal:renomeado': (canal: CanalDto) => void;
  'canal:removido': (payload: { id: number }) => void;
  'mensagem:nova': (mensagem: MensagemDto) => void;
  'mensagem:editada': (mensagem: MensagemDto) => void;
  'mensagem:apagada': (payload: { id: number; canalId: number | null; dmId: number | null }) => void;
  /** Alguém está digitando no canal ou na DM (não chega para quem digita; DM só para o outro participante). */
  digitando: (payload: { canalId: number | null; dmId: number | null; usuarioId: number }) => void;
  /** Soundboard mudou (cadastro, troca, remoção): lista inteira, na ordem. */
  'sons:atualizados': (sons: SomDto[]) => void;
  /** A própria pessoa leu uma conversa (em qualquer computador): o contador zera em todos. */
  'lido:atualizado': (payload: { chave: string; ultimaMensagemId: number }) => void;
  /** Conversa direta nova (ou com mensagem nova): chega só para os dois participantes. */
  'dm:atualizada': (dm: DmDto) => void;
  /** RF-13: lista inteira de quem está na voz (até 20 pessoas), a cada mudança. */
  'voz:estados': (estados: VozEstadoDto[]) => void;
  /** A mesma pessoa entrou na voz por outro computador: este sai da sala. */
  'voz:tirado': (payload: { motivo: 'outro_computador' }) => void;
  /** RF-23: alguém tocou um som do soundboard; chega só para quem está naquele canal de voz. */
  'som:tocado': (payload: { somId: number; porUsuarioId: number; canalVozId: number }) => void;
  /** RN-10: transmissão de tela começou ou parou (para todos: a barra mostra quem transmite). */
  'tela:iniciada': (t: TransmissaoDto) => void;
  'tela:parada': (payload: { canalVozId: number; usuarioId: number }) => void;
  /** Quem assiste a transmissão do canal mudou. */
  'tela:espectadores': (payload: { canalVozId: number; espectadores: number[] }) => void;
  /** RF-37: status de alguém mudou. */
  'presenca:atualizada': (payload: { id: number; status: StatusPessoa }) => void;
  /** Conta removida por um administrador: some da lista. */
  'usuario:removido': (payload: { id: number }) => void;
  /** Backlog v2, item 10c: a lista de cargos personalizados mudou. */
  'funcoes:atualizadas': (funcoes: FuncaoDto[]) => void;
  /** Backlog v2, item 14: o bot de música mudou num canal de voz (sem tocando e fila vazia = parou). */
  'musica:estado': (estado: EstadoMusica) => void;
  /** Amizades da conta mudaram (pedido, aceite, recusa ou remoção): a lista inteira, e quem é cada pessoa. */
  'amizades:atualizadas': (payload: { amizades: AmizadeDto[]; conhecidos: UsuarioDto[] }) => void;
}

/** Eventos cliente → servidor, sempre com resposta (ack). */
export interface EventosCliente {
  /** RN-7: qualquer membro cria e renomeia. */
  'canal:criar': (dados: { tipo: TipoCanal; nome: string }, ack: Ack<CanalDto>) => void;
  'canal:renomear': (dados: { id: number; nome: string }, ack: Ack<CanalDto>) => void;
  /** RN-7, RN-8: só administrador remove; apaga o histórico do canal. */
  'canal:remover': (dados: { id: number }, ack: Ack) => void;
  /** RF-8: enviar mensagem num canal de texto (DMs na T12). */
  /** Anexos já enviados por POST /api/anexos (até 10). */
  'mensagem:enviar': (dados: { destino: Destino; texto: string; anexos?: string[] }, ack: Ack<MensagemDto>) => void;
  /** RN-9: só o autor edita. */
  'mensagem:editar': (dados: { id: number; texto: string }, ack: Ack<MensagemDto>) => void;
  /** RN-9: o autor apaga; administrador apaga qualquer mensagem de canal. */
  'mensagem:apagar': (dados: { id: number }, ack: Ack) => void;
  /** Sinal de "digitando" (sem resposta). */
  digitando: (dados: { destino: Destino }) => void;
  /** RF-12: leu a conversa até esta mensagem (sem resposta; só avança, nunca volta). */
  'lido:marcar': (dados: { destino: Destino; ultimaMensagemId: number }) => void;
  /** RF-12a: abre (ou cria) a conversa direta com outra pessoa. */
  'dm:abrir': (dados: { usuarioId: number }, ack: Ack<DmDto>) => void;
  /** RF-13: entrou, mudou (mute/deafen/câmera) ou saiu (canalVozId null) da voz. */
  'voz:estado': (dados: VozEstadoPedido, ack: Ack) => void;
  /** RF-23: toca um som para o canal de voz em que estou (RN-12, RN-13). */
  'som:tocar': (dados: { somId: number }, ack: Ack) => void;
  /** RF-26/RN-10: pede a trava do canal para transmitir (recusa se outro já transmite). */
  'tela:pedir': (dados: { canalVozId: number; qualidade: QualidadeTela }, ack: Ack<TransmissaoDto>) => void;
  'tela:parar': (dados: { canalVozId: number }, ack: Ack) => void;
  /** Abri ou fechei a transmissão de alguém do meu canal de voz. */
  'tela:assistir': (dados: { canalVozId: number; assistindo: boolean }, ack: Ack) => void;
  /** RN-25: o computador ficou ocioso (ou voltou), sem resposta. */
  'presenca:ausente': (dados: { ausente: boolean }) => void;
  /** Backlog v2, item 2: status escolhido (vale até trocar; o app reenvia ao reconectar). */
  'presenca:escolher': (dados: { status: EscolhaStatus }) => void;
  /** Backlog v2, item 14: bot de música no canal de voz em que estou (/tocar, /pular, /parar). */
  'musica:comando': (dados: ComandoMusica, ack: Ack<EstadoMusica>) => void;
  /** Amigos: pedir (se a outra pessoa já pediu, vira amizade), aceitar e recusar/desfazer. */
  'amizade:pedir': (dados: { usuarioId: number }, ack: Ack<AmizadeDto[]>) => void;
  'amizade:aceitar': (dados: { usuarioId: number }, ack: Ack<AmizadeDto[]>) => void;
  'amizade:remover': (dados: { usuarioId: number }, ack: Ack<AmizadeDto[]>) => void;
}

/**
 * Batimento do Socket.IO: queda de rede sem fechamento da conexão (cabo, Wi-Fi) é percebida
 * em até PING_INTERVALO + PING_TOLERANCIA (< 10 s, CA-42).
 */
export const PING_INTERVALO_MS = 5000;
export const PING_TOLERANCIA_MS = 4000;

/** Mensagem do erro de handshake quando o token não vale. */
export const ERRO_HANDSHAKE_NAO_AUTENTICADO = 'nao_autenticado';

/** Backlog v2: total de não lidas da pessoa neste servidor, para o número no ícone da coluna de servidores. */
export interface ResumoNaoLidas {
  total: number;
}

/** Backlog v2, item 14: uma música da fila do bot. */
export interface MusicaDto {
  titulo: string;
  /** Endereço da página (YouTube). */
  url: string;
  /** Duração em segundos (0 = desconhecida, ex.: ao vivo). */
  duracao: number;
  pedidoPor: number;
}

/** O bot num canal de voz: o que toca agora e o que vem depois. */
export interface EstadoMusica {
  canalVozId: number;
  tocando: MusicaDto | null;
  /** Quando a música atual começou (ms desde a época), para mostrar o tempo. */
  desde: number | null;
  fila: MusicaDto[];
  /** Música atual pausada (/pause). */
  pausado?: boolean;
  /** O ToOuvini está na sala (mesmo sem tocar: depois de /stop ele espera alguns minutos). */
  conectado?: boolean;
  /** Buscando o áudio da música atual no YouTube (ainda sem som). */
  carregando?: boolean;
}

export type ComandoMusica =
  | { comando: 'tocar'; busca: string }
  | { comando: 'pausar' }
  | { comando: 'continuar' }
  | { comando: 'pular' }
  | { comando: 'parar' }
  | { comando: 'expulsar' };

/** Comandos do ToOuvini para a lista que abre ao digitar "/" no chat (o primeiro nome é o que aparece). */
export const COMANDOS_MUSICA: readonly { nomes: string[]; argumento?: string; descricao: string }[] = [
  { nomes: ['play', 'tocar', 'p'], argumento: 'link, playlist ou nome', descricao: 'Toca ou põe na fila (link de playlist põe a playlist inteira)' },
  { nomes: ['pause', 'pausar'], descricao: 'Pausa a música' },
  { nomes: ['resume', 'continuar'], descricao: 'Continua a música pausada' },
  { nomes: ['next', 'skip', 'pular'], descricao: 'Pula para a próxima da fila' },
  { nomes: ['stop', 'parar'], descricao: 'Para e limpa a fila (o ToOuvini espera um pouco na sala)' },
  { nomes: ['queue', 'fila'], descricao: 'Mostra a fila' },
  { nomes: ['kick', 'sair'], descricao: 'Tira o ToOuvini da sala' },
];

/** Até quantas músicas esperam na fila de um canal, e a duração máxima de cada uma. */
export const LIMITE_FILA_MUSICA = 50;
/** Em quantos canais (de qualquer servidor) o ToOuvini toca ao mesmo tempo. */
export const LIMITE_CANAIS_MUSICA = 5;
export const DURACAO_MAXIMA_MUSICA_S = 3 * 60 * 60;

/**
 * Lê um comando de música digitado no chat: "/tocar <link ou busca>", "/pular", "/parar".
 * Devolve undefined se o texto não é comando de música (vai como mensagem normal).
 */
export function lerComandoMusica(texto: string): ComandoMusica | { comando: 'fila' } | { erro: string } | undefined {
  const m = /^\/([a-zà-ú]+)(?:\s+([\s\S]*))?$/i.exec(texto.trim());
  if (!m) return undefined;
  const nome = m[1]!.toLowerCase();
  const resto = (m[2] ?? '').trim();
  const def = COMANDOS_MUSICA.find((c) => c.nomes.includes(nome));
  if (!def) return undefined;
  switch (def.nomes[0]) {
    case 'play':
      if (!resto) return { comando: 'continuar' };
      if (resto.length > 300) return { erro: 'Busca longa demais.' };
      return { comando: 'tocar', busca: resto };
    case 'pause':
      return { comando: 'pausar' };
    case 'resume':
      return { comando: 'continuar' };
    case 'next':
      return { comando: 'pular' };
    case 'stop':
      return { comando: 'parar' };
    case 'queue':
      return { comando: 'fila' };
    default:
      return { comando: 'expulsar' };
  }
}

/** O que fazer ao fechar a janela do app. */
export type AcaoFechar = 'perguntar' | 'bandeja' | 'sair';

/** A escolha valendo: a nova, senão a antiga (só se a pessoa tinha mexido), senão perguntar. */
export function acaoAoFechar(c: { aoFechar?: AcaoFechar; fecharParaBandeja?: boolean }): AcaoFechar {
  if (c.aoFechar === 'perguntar' || c.aoFechar === 'bandeja' || c.aoFechar === 'sair') return c.aoFechar;
  if (c.fecharParaBandeja === false) return 'sair';
  return 'perguntar';
}

/**
 * Servidores (comunidades) na mesma instalação, como no Discord: uma conta, vários servidores. O principal (id 1)
 * fica no endereço raiz; os outros em <endereço>/c/<id>. Cada um tem canais, cargos, sons e convite próprios.
 */
export const COMUNIDADE_PRINCIPAL = 1;
/** Quantos servidores cada pessoa pode criar. */
export const LIMITE_SERVIDORES_POR_PESSOA = 5;

export interface ComunidadeDto {
  id: number;
  nome: string;
  /** Endereço do servidor para o app (raiz para o principal, /c/<id> para os outros). */
  url: string;
}

export interface CriarComunidadeRequest {
  nome: string;
}

/** Caminho do servidor dentro da instalação ('' no principal). */
export const caminhoComunidade = (id: number) => (id === COMUNIDADE_PRINCIPAL ? '' : `/c/${id}`);

/** "https://x.io/c/3" → { base: "https://x.io", comunidade: 3 }; sem /c/<id>, o principal. */
export function separarComunidade(url: string): { base: string; comunidade: number } {
  const m = /^(.*?)\/c\/(\d{1,9})\/?$/.exec(url);
  return m ? { base: m[1]!, comunidade: Number(m[2]) } : { base: url.replace(/\/+$/, ''), comunidade: COMUNIDADE_PRINCIPAL };
}

/** Identidade do ToOuvini na sala de voz (o volume dele fica guardado por esta chave, como o de uma pessoa). */
export const IDENTIDADE_BOT_MUSICA = 'bot-musica';
/** Volume inicial do ToOuvini para quem ouve (música costuma ser mais alta que voz). */
export const VOLUME_BOT_PADRAO = 0.5;

/** Amizade vista por mim: amigo, pedido que eu mandei (aguardando) ou pedido que recebi (posso aceitar). */
export interface AmizadeDto {
  usuarioId: number;
  situacao: 'amigo' | 'enviado' | 'recebido';
}
