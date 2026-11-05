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
  ok: boolean;
}

export type Cargo = 'admin' | 'membro';

export interface UsuarioDto {
  id: number;
  usuario: string;
  nomeExibicao: string;
  cor: string;
  avatarUrl: string | null;
  cargo: Cargo;
}

/** Visão do administrador: inclui contas removidas (para a auditoria). */
export interface UsuarioAdminDto extends UsuarioDto {
  removido: boolean;
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
  | 'convite_invalido'
  | 'usuario_em_uso'
  | 'limite_contas'
  | 'credenciais_invalidas'
  | 'muitas_tentativas'
  | 'nao_autenticado'
  | 'nao_encontrado'
  | 'sem_permissao'
  | 'ultimo_admin'
  | 'arquivo_grande'
  | 'formato_invalido'
  | 'erro_interno';

export interface ErroApi {
  erro: CodigoErro;
  mensagem: string;
}

/** Configurações guardadas por máquina (RN-14). */
export interface ConfiguracoesLocais {
  servidorUrl: string | null;
}

export const CONFIGURACOES_PADRAO: ConfiguracoesLocais = {
  servidorUrl: null,
};

/** Por que o servidor encerrou a conexão em tempo real de uma sessão. */
export type MotivoRevogacao = 'saiu' | 'sessao_invalida' | 'conta_removida';

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

/** Resposta (ack) dos eventos cliente → servidor. */
export type Ack<T = undefined> = (resposta: { ok: true; valor: T } | { ok: false; erro: string }) => void;

/** Retrato inicial enviado ao conectar o Socket.IO (cresce com canais, DMs, voz… nas próximas tarefas). */
export interface OlaPayload {
  servidor: { nome: string };
  /** Link de convite vigente, que qualquer membro pode copiar (RF-1a). */
  convite: { link: string };
  eu: UsuarioDto;
  usuarios: UsuarioDto[];
  canais: CanalDto[];
  dms: DmDto[];
  /** RF-12: mensagens não lidas por conversa ("c:<id>" / "d:<id>"), só as que têm alguma. */
  naoLidas: Record<string, number>;
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
  /** A própria pessoa leu uma conversa (em qualquer computador): o contador zera em todos. */
  'lido:atualizado': (payload: { chave: string; ultimaMensagemId: number }) => void;
  /** Conversa direta nova (ou com mensagem nova): chega só para os dois participantes. */
  'dm:atualizada': (dm: DmDto) => void;
  /** Conta removida por um administrador: some da lista. */
  'usuario:removido': (payload: { id: number }) => void;
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
}

/**
 * Batimento do Socket.IO: queda de rede sem fechamento da conexão (cabo, Wi-Fi) é percebida
 * em até PING_INTERVALO + PING_TOLERANCIA (< 10 s, CA-42).
 */
export const PING_INTERVALO_MS = 5000;
export const PING_TOLERANCIA_MS = 4000;

/** Mensagem do erro de handshake quando o token não vale. */
export const ERRO_HANDSHAKE_NAO_AUTENTICADO = 'nao_autenticado';
