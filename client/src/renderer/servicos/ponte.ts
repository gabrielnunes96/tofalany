import type { ApiTofalando } from '../../preload/api';

declare global {
  interface Window {
    tofalando: ApiTofalando;
  }
}

/** Acesso ao que o preload expõe (configurações locais, e depois atalhos, captura etc.). */
export const ponte = (): ApiTofalando => window.tofalando;
