import { useEffect, useRef, useState, type PointerEvent as EventoPonteiro } from 'react';
import { createPortal } from 'react-dom';
import type { PreferenciasContador } from '@tofalando/shared';
import { Icone } from './Icone';

/**
 * video-teatro-cameras-e-sons (RF-7): quantos estão assistindo, flutuando sobre o app para todos do canal de voz com
 * transmissão aberta. Arrastável; a posição é proporcional à janela (0 a 1) e fica sempre à vista (RN-11). Desenhado
 * no <body>, por cima dos painéis.
 */
export function ContadorEspectadores({
  numero,
  preferencias,
  aoMover,
}: {
  numero: number;
  preferencias: PreferenciasContador;
  aoMover: (posicao: { x: number; y: number }) => void;
}) {
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);
  const [arrastando, setArrastando] = useState<{ x: number; y: number } | null>(null);
  const [, setTamanho] = useState(0);
  useEffect(() => {
    const aoRedimensionar = () => setTamanho(window.innerWidth * 10_000 + window.innerHeight);
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  // Tamanho fixo de referência (o contador é pequeno): a posição não depende de medir o elemento na renderização.
  const { largura, altura } = TAMANHO_CONTADOR;
  const px = posicaoEmPixels(arrastando ?? preferencias.posicao, largura, altura, window.innerWidth, window.innerHeight);

  const comecar = (e: EventoPonteiro<HTMLDivElement>) => {
    arrasto.current = { dx: e.clientX - px.x, dy: e.clientY - px.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const mover = (e: EventoPonteiro<HTMLDivElement>) => {
    if (!arrasto.current) return;
    setArrastando(proporcao(e.clientX - arrasto.current.dx, e.clientY - arrasto.current.dy, largura, altura, window.innerWidth, window.innerHeight));
  };
  const soltar = () => {
    if (!arrasto.current) return;
    arrasto.current = null;
    if (arrastando) aoMover(arrastando);
    setArrastando(null);
  };
  const { cores } = preferencias;
  const rotulo = numero === 1 ? '1 pessoa assistindo' : `${numero} pessoas assistindo`;
  return createPortal(
    <div
      className="contador-espectadores"
      role="status"
      aria-label={rotulo}
      title={`${rotulo} (arraste para mover)`}
      style={{ left: px.x, top: px.y, background: cores.fundo, borderColor: cores.borda, color: cores.numero }}
      onPointerDown={comecar}
      onPointerMove={mover}
      onPointerUp={soltar}
    >
      <span style={{ color: cores.olho }} aria-hidden="true">
        <Icone nome="olho" tamanho={16} />
      </span>
      <span className="contador-numero">{numero}</span>
    </div>,
    document.body,
  );
}

/** Tamanho de referência do contador (largura e altura máximas com até 3 dígitos). */
export const TAMANHO_CONTADOR = { largura: 84, altura: 34 };

/** Proporção (0 a 1) do espaço livre → pixels, com a caixa inteira à vista (8 px de margem). */
export function posicaoEmPixels(p: { x: number; y: number }, largura: number, altura: number, janelaLargura: number, janelaAltura: number) {
  const livreX = Math.max(0, janelaLargura - largura - 16);
  const livreY = Math.max(0, janelaAltura - altura - 16);
  const lim = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return { x: Math.round(8 + lim(p.x) * livreX), y: Math.round(8 + lim(p.y) * livreY) };
}

/** Pixels → proporção (0 a 1) do espaço livre, sempre dentro da janela. */
export function proporcao(x: number, y: number, largura: number, altura: number, janelaLargura: number, janelaAltura: number) {
  const livreX = Math.max(1, janelaLargura - largura - 16);
  const livreY = Math.max(1, janelaAltura - altura - 16);
  return { x: Math.min(1, Math.max(0, (x - 8) / livreX)), y: Math.min(1, Math.max(0, (y - 8) / livreY)) };
}
