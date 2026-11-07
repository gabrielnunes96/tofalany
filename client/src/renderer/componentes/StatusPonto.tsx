import type { StatusPessoa } from '@tofalando/shared';

/** Texto do status, para leitores de tela e dicas. */
export const TEXTO_STATUS: Record<StatusPessoa, string> = { online: 'online', ausente: 'ausente', naoIncomodar: 'não incomodar', offline: 'offline' };

/** RF-37: bolinha de status. `oculto` quando o status já está dito em outro lugar (ex.: nome do botão). */
export function StatusPonto({ status, oculto = false }: { status: StatusPessoa; oculto?: boolean }) {
  return (
    <span
      className={`status-ponto status-${status}`}
      title={TEXTO_STATUS[status]}
      {...(oculto ? { 'aria-hidden': true } : { role: 'img', 'aria-label': TEXTO_STATUS[status] })}
    />
  );
}
