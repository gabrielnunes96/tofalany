import type { StatusPessoa } from '@tofalando/shared';

const TEXTO: Record<StatusPessoa, string> = { online: 'online', ausente: 'ausente', offline: 'offline' };

/** RF-37: bolinha de status. `oculto` quando o status já está dito em outro lugar (ex.: nome do botão). */
export function StatusPonto({ status, oculto = false }: { status: StatusPessoa; oculto?: boolean }) {
  return (
    <span
      className={`status-ponto status-${status}`}
      title={TEXTO[status]}
      {...(oculto ? { 'aria-hidden': true } : { role: 'img', 'aria-label': TEXTO[status] })}
    />
  );
}
