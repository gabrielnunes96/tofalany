import { createContext } from 'react';
import type { ConviteLink } from '@tofalando/shared';

/**
 * qualidade-de-vida, RF-4: link de convite numa mensagem abre o fluxo de entrar no servidor, dentro do app. Só para
 * links do mesmo endereço (`base`) do servidor aberto; os outros seguem para o navegador, como antes (T-5).
 */
export const ContextoConvite = createContext<{
  base: string;
  /** Servidor aberto: um convite para ele mesmo não faz nada (segue como link comum). */
  atual: string;
  /** null = entrou; texto = o motivo da falha (a pessoa continua onde estava). */
  abrir: (convite: ConviteLink) => Promise<string | null>;
} | null>(null);
