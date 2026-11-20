import type { MotivoRevogacao } from '@tofalando/shared';

/** Aviso mostrado na tela de login quando o servidor encerra a sessão (undefined = sem aviso). */
export function avisoDeRevogacao(motivo: MotivoRevogacao, detalhe?: string | null, servidor?: string): string | undefined {
  const onde = servidor ? ` de ${servidor}` : ' do servidor';
  const porque = detalhe ? ` Motivo: ${detalhe}` : '';
  switch (motivo) {
    case 'saiu':
      return undefined;
    case 'sessao_invalida':
      return 'Sua sessão foi encerrada. Entre de novo.';
    case 'conta_removida':
      return 'Sua conta foi removida deste servidor.';
    case 'fora_do_servidor':
      return 'Você não participa mais deste servidor.';
    case 'expulso':
      return `Você foi expulso${onde}.${porque} Para voltar, peça um convite.`;
    case 'banido':
      return `Você foi banido${onde}.${porque}`;
  }
}
