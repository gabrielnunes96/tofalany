import { useState } from 'react';
import type { GifDto } from '@tofalando/shared';

/** Lado maior do GIF no chat. */
const LADO_MAX = 300;

/**
 * GIF de uma mensagem (RF-4): carregado direto da Klipy, já com o tamanho reservado (a lista não pula quando ele
 * chega) e a descrição como texto alternativo. Se a Klipy o tirou do ar, avisa.
 */
export function GifMensagem({ gif }: { gif: GifDto }) {
  const [falhou, setFalhou] = useState(false);
  const escala = Math.min(1, LADO_MAX / Math.max(gif.largura, gif.altura));
  const largura = Math.max(1, Math.round(gif.largura * escala));
  const altura = Math.max(1, Math.round(gif.altura * escala));
  if (falhou) return <p className="suave gif-indisponivel">GIF indisponível</p>;
  return (
    <img
      className="gif-mensagem"
      src={gif.url}
      width={largura}
      height={altura}
      alt={gif.descricao || 'GIF'}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFalhou(true)}
    />
  );
}
