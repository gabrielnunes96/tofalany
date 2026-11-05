import type { ConfiguracoesLocais } from '@tofalando/shared';

/** O que o preload expõe ao renderer em window.tofalando. */
export interface ApiTofalando {
  config: {
    ler(): Promise<ConfiguracoesLocais>;
    gravar(parcial: Partial<ConfiguracoesLocais>): Promise<ConfiguracoesLocais>;
  };
}
