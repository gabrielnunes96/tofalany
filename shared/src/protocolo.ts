/** Tempo máximo do teste de conexão com o servidor (RF-1). */
export const TEMPO_TESTE_SERVIDOR_MS = 5000;

/** Identificador devolvido por GET /api/servidor para o app reconhecer um servidor Tô Falando. */
export const APP_ID = 'tofalando';

/** Resposta de GET /api/servidor (público). */
export interface ServidorInfo {
  app: typeof APP_ID;
  nome: string;
  versao: string;
  limiteContas: number;
}

/** Resposta de GET /api/saude. */
export interface SaudeInfo {
  ok: boolean;
}

/** Configurações guardadas por máquina (RN-14). */
export interface ConfiguracoesLocais {
  servidorUrl: string | null;
}

export const CONFIGURACOES_PADRAO: ConfiguracoesLocais = {
  servidorUrl: null,
};
