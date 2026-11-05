import type { ConfiguracoesLocais } from '@tofalando/shared';

/** Sessão guardada no computador: o token vale só para o servidor em que foi criado. */
export interface SessaoLocal {
  servidorUrl: string;
  token: string;
}

/** O que o preload expõe ao renderer em window.tofalando. */
export interface ApiTofalando {
  config: {
    ler(): Promise<ConfiguracoesLocais>;
    gravar(parcial: Partial<ConfiguracoesLocais>): Promise<ConfiguracoesLocais>;
  };
  sessao: {
    ler(): Promise<SessaoLocal | null>;
    gravar(sessao: SessaoLocal): Promise<void>;
    apagar(): Promise<void>;
  };
}
