import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { PASSO_DIVISORIA } from '@tofalando/shared';

/**
 * organizar-a-tela (RF-1): divisória que muda a largura de uma coluna. Arrastar, setas (10 px por toque), Home/End e
 * duplo clique (volta ao padrão). `lado`: de que lado da divisória fica a coluna (a da esquerda cresce para a direita).
 */
export function Divisoria({
  rotulo,
  lado,
  valor,
  min,
  max,
  padrao,
  aoMudar,
  aoSoltar,
  className,
}: {
  rotulo: string;
  lado: 'esquerda' | 'direita';
  valor: number;
  min: number;
  max: number;
  padrao: number;
  /** Durante o arraste (só na tela). */
  aoMudar: (v: number) => void;
  /** Valor final (grava). */
  aoSoltar: (v: number) => void;
  className?: string;
}) {
  const arraste = useRef<{ x: number; inicio: number; ultimo: number } | null>(null);
  const limitar = (v: number) => Math.round(Math.min(max, Math.max(min, v)));
  const sinal = lado === 'esquerda' ? 1 : -1;

  function aoApertar(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    arraste.current = { x: e.clientX, inicio: valor, ultimo: valor };
  }
  function aoMover(e: PointerEvent<HTMLDivElement>) {
    const a = arraste.current;
    if (!a) return;
    a.ultimo = limitar(a.inicio + sinal * (e.clientX - a.x));
    aoMudar(a.ultimo);
  }
  function aoSoltarPonteiro() {
    const a = arraste.current;
    arraste.current = null;
    if (a && a.ultimo !== a.inicio) aoSoltar(a.ultimo);
  }
  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    let novo: number | null = null;
    if (e.key === 'ArrowRight') novo = valor + sinal * PASSO_DIVISORIA;
    else if (e.key === 'ArrowLeft') novo = valor - sinal * PASSO_DIVISORIA;
    else if (e.key === 'Home') novo = min;
    else if (e.key === 'End') novo = max;
    if (novo === null) return;
    e.preventDefault();
    const v = limitar(novo);
    aoMudar(v);
    aoSoltar(v);
  }
  return (
    <div
      className={`divisoria ${className ?? ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={rotulo}
      aria-valuenow={valor}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${rotulo} (arraste; duplo clique volta ao padrão)`}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltarPonteiro}
      onPointerCancel={aoSoltarPonteiro}
      onKeyDown={aoTeclar}
      onDoubleClick={() => {
        const v = limitar(padrao);
        aoMudar(v);
        aoSoltar(v);
      }}
    />
  );
}
