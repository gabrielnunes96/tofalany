import { useSyncExternalStore } from 'react';

/** celular (T5): abaixo desta largura, a tela vira de uma coluna, com gavetas para canais e membros. */
export const LARGURA_ESTREITA = 720;
const consulta = `(max-width: ${LARGURA_ESTREITA}px)`;

function assinar(aoMudar: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const m = window.matchMedia(consulta);
  m.addEventListener('change', aoMudar);
  return () => m.removeEventListener('change', aoMudar);
}
const agora = () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(consulta).matches);

/** A janela está estreita (celular, ou janela pequena no computador). */
export function useTelaEstreita(): boolean {
  return useSyncExternalStore(assinar, agora, () => false);
}
