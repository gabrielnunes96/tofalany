// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CONTADOR_PADRAO, mesclarContador, razaoDeContraste } from '@tofalando/shared';
import { ContadorEspectadores, posicaoEmPixels, proporcao } from './ContadorEspectadores';

/** video-teatro-cameras-e-sons, T7 (CA-13 a CA-15). */
afterEach(cleanup);

describe('contador de espectadores flutuante', () => {
  it('CA-13: no <body>, com o número e as cores escolhidas', () => {
    const prefs = { ...CONTADOR_PADRAO, cores: { olho: '#ff0000', fundo: '#000000', numero: '#ffffff', borda: '#00ff00' } };
    const { container } = render(<ContadorEspectadores numero={2} preferencias={prefs} aoMover={vi.fn()} />);
    const c = screen.getByRole('status', { name: '2 pessoas assistindo' });
    expect(container.contains(c)).toBe(false);
    expect(c.parentElement).toBe(document.body);
    expect(c.style.background).toBe('rgb(0, 0, 0)');
    expect(c.style.color).toBe('rgb(255, 255, 255)');
    expect(document.head.querySelectorAll('style').length).toBe(0);
  });

  it('CA-14: posição proporcional, sempre dentro da janela; arrastar grava a proporção', () => {
    expect(posicaoEmPixels({ x: 1, y: 1 }, 84, 34, 1000, 600)).toEqual({ x: 908, y: 558 });
    expect(posicaoEmPixels({ x: 0.5, y: 0 }, 84, 34, 500, 400).x).toBe(Math.round(8 + 0.5 * (500 - 84 - 16)));
    expect(proporcao(99_999, -50, 84, 34, 1000, 600)).toEqual({ x: 1, y: 0 });
    const aoMover = vi.fn();
    render(<ContadorEspectadores numero={1} preferencias={CONTADOR_PADRAO} aoMover={aoMover} />);
    const c = screen.getByRole('status', { name: '1 pessoa assistindo' });
    fireEvent.pointerDown(c, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(c, { clientX: 50, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(c, { pointerId: 1 });
    const p = aoMover.mock.calls[0]![0] as { x: number; y: number };
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(1);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(1);
  });

  it('A8: só #rrggbb e posição de 0 a 1 entram nas preferências', () => {
    const r = mesclarContador(CONTADOR_PADRAO, { cores: { olho: 'red; background:url(https://x)', fundo: '#ABCDEF', numero: '#fff', borda: 'a'.repeat(1e5) }, posicao: { x: 2, y: NaN } });
    expect(r.cores).toEqual({ ...CONTADOR_PADRAO.cores, fundo: '#abcdef' });
    expect(r.posicao).toEqual(CONTADOR_PADRAO.posicao);
    expect(mesclarContador(CONTADOR_PADRAO, { posicao: { x: 0.25, y: 1 } }).posicao).toEqual({ x: 0.25, y: 1 });
  });

  it('razão de contraste (WCAG): preto e branco 21; iguais 1', () => {
    expect(razaoDeContraste('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(razaoDeContraste('#777777', '#777777')).toBe(1);
  });

});
