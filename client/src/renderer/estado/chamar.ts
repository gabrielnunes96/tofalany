import type { MotivoFimChamado, StatusPessoa } from '@tofalando/shared';

/** chamar-tocando (RN-1): só quem está online ou ausente pode ser chamado. */
export function chamavel(status: StatusPessoa | undefined): boolean {
  return status === 'online' || status === 'ausente';
}

/** RN-2 (CA-6): no surdo, ou com a preferência de chamados desligada, o chamado aparece sem toque. */
export function deveTocarChamado(surdo: boolean, preferencia: boolean | undefined): boolean {
  return !surdo && preferencia !== false;
}

/** RN-3, RN-4: o aviso para quem chamou quando o chamado acaba (cancelado e atendido não precisam de aviso). */
export function textoFimChamado(motivo: MotivoFimChamado, nome: string): string | null {
  if (motivo === 'recusado') return `${nome} recusou o chamado.`;
  if (motivo === 'tempo') return `${nome} não atendeu.`;
  return null;
}

/** RN-2: o toque repete a cada `intervaloMs` enquanto o chamado está aberto. Devolve a função que para. */
export function tocarRepetido(tocar: () => void, intervaloMs = 2000): () => void {
  tocar();
  const t = setInterval(tocar, intervaloMs);
  return () => clearInterval(t);
}

/** RN-7: avisos de resultado do chamado somem sozinhos. */
export const AVISO_CHAMADO_MS = 6000;
