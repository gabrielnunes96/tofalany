import { useEffect, useState, type RefObject } from 'react';

/**
 * Entra em tela cheia com o elemento ou, se já houver algo em tela cheia, sai. O mesmo botão faz as duas coisas
 * (antes, dentro da tela cheia, o botão pedia tela cheia de novo e nada acontecia).
 */
export function alternarTelaCheia(el: HTMLElement | null) {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void el?.requestFullscreen?.().catch(() => undefined);
}

/** Este elemento está em tela cheia agora (atualiza com Esc, F11 ou o botão). */
export function useEmTelaCheia(ref: RefObject<HTMLElement | null>): boolean {
  const [cheia, setCheia] = useState(false);
  useEffect(() => {
    const atualizar = () => setCheia(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', atualizar);
    return () => document.removeEventListener('fullscreenchange', atualizar);
  }, [ref]);
  return cheia;
}
