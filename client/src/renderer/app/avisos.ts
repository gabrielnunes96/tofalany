import type { MotivoRevogacao } from '@tofalando/shared';

/** Aviso mostrado na tela de login quando o servidor encerra a sessão (undefined = sem aviso). */
export function avisoDeRevogacao(motivo: MotivoRevogacao): string | undefined {
  switch (motivo) {
    case 'saiu':
      return undefined;
    case 'sessao_invalida':
      return 'Sua sessão foi encerrada. Entre de novo.';
    case 'conta_removida':
      return 'Sua conta foi removida deste servidor.';
  }
}
