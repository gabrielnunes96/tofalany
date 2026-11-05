/** Tipos de evento da auditoria (RN-20). Nada das DMs entra aqui (RN-21). */
export const TIPOS_AUDITORIA = [
  'conta_criada',
  'login',
  'saiu',
  'online',
  'offline',
  'voz_entrou',
  'voz_saiu',
  'tela_iniciou',
  'tela_parou',
  'cargo_alterado',
  'conta_removida',
  'convite_trocado',
  'som_cadastrado',
  'som_trocado',
  'som_removido',
  'canal_criado',
  'canal_renomeado',
  'canal_removido',
  'mensagem_apagada_admin',
  'mensagem_editada',
  'mensagem_apagada',
  'senha_redefinida',
] as const;

export type TipoAuditoria = (typeof TIPOS_AUDITORIA)[number];

/** Texto do evento na tela, completando "<pessoa> …". */
export const ROTULOS_AUDITORIA: Record<TipoAuditoria, string> = {
  conta_criada: 'criou a conta',
  login: 'entrou com usuário e senha',
  saiu: 'saiu da conta',
  online: 'ficou online',
  offline: 'ficou offline',
  voz_entrou: 'entrou no canal de voz',
  voz_saiu: 'saiu do canal de voz',
  tela_iniciou: 'começou a transmitir a tela',
  tela_parou: 'parou de transmitir a tela',
  cargo_alterado: 'alterou o cargo de',
  conta_removida: 'removeu a conta de',
  convite_trocado: 'trocou o código de convite',
  som_cadastrado: 'cadastrou um som',
  som_trocado: 'trocou um som',
  som_removido: 'removeu um som',
  canal_criado: 'criou o canal',
  canal_renomeado: 'renomeou o canal',
  canal_removido: 'removeu o canal',
  mensagem_apagada_admin: 'apagou uma mensagem de',
  mensagem_editada: 'editou uma mensagem',
  mensagem_apagada: 'apagou uma mensagem',
  senha_redefinida: 'redefiniu a senha de',
};

export const PRAZO_AUDITORIA_DIAS_PADRAO = 30;
/** RN-24: offline só é registrado se a pessoa não voltar nesse tempo. */
export const CARENCIA_OFFLINE_MS_PADRAO = 30_000;

export interface PessoaAuditoria {
  id: number;
  nome: string;
}

export interface RegistroAuditoriaDto {
  id: number;
  quando: number;
  tipo: TipoAuditoria;
  /** null = o host, por comando no servidor. */
  ator: PessoaAuditoria | null;
  alvo: PessoaAuditoria | null;
  canal: { id: number; nome: string } | null;
  /** Dados extras do momento (ex.: cargo novo, nome antigo do canal, motivo). */
  detalhes: Record<string, string | number>;
}

export interface FiltroAuditoria {
  pessoa?: number;
  tipo?: TipoAuditoria;
  canal?: number;
  de?: number;
  ate?: number;
  antes?: number;
  limite?: number;
}

export interface PaginaAuditoria {
  registros: RegistroAuditoriaDto[];
  fim: boolean;
}
