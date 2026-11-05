import type { ConfiguracoesLocais, ConviteLink } from '@tofalando/shared';

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
  convite: {
    /** Convite que abriu o app (uma vez só). */
    pendente(): Promise<ConviteLink | null>;
    /** Convite aberto com o app já rodando. Devolve a função que para de ouvir. */
    aoChegar(fn: (convite: ConviteLink) => void): () => void;
  };
  areaTransferencia: {
    copiar(texto: string): Promise<void>;
  };
}
