// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Divisoria } from './Divisoria';

afterEach(cleanup);

function Teste({ lado = 'esquerda', inicial = 250, aoSoltar = vi.fn() }: { lado?: 'esquerda' | 'direita'; inicial?: number; aoSoltar?: (v: number) => void }) {
  const [v, setV] = useState(inicial);
  return <Divisoria rotulo="Largura dos canais" lado={lado} valor={v} min={180} max={400} padrao={250} aoMudar={setV} aoSoltar={aoSoltar} />;
}

describe('divisória de largura (organizar-a-tela)', () => {
  it('CA-1: arrastar muda a largura e grava ao soltar; duplo clique volta ao padrão', () => {
    const aoSoltar = vi.fn();
    render(<Teste aoSoltar={aoSoltar} />);
    const d = screen.getByRole('separator', { name: 'Largura dos canais' });
    fireEvent.pointerDown(d, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(d, { clientX: 170, pointerId: 1 });
    fireEvent.pointerUp(d, { pointerId: 1 });
    expect(d.getAttribute('aria-valuenow')).toBe('320');
    expect(aoSoltar).toHaveBeenLastCalledWith(320);
    fireEvent.doubleClick(d);
    expect(d.getAttribute('aria-valuenow')).toBe('250');
    expect(aoSoltar).toHaveBeenLastCalledWith(250);
  });

  it('CA-3: seta para a direita 3 vezes deixa 30 px mais larga; nunca passa dos limites', () => {
    render(<Teste />);
    const d = screen.getByRole('separator');
    for (let i = 0; i < 3; i++) fireEvent.keyDown(d, { key: 'ArrowRight' });
    expect(d.getAttribute('aria-valuenow')).toBe('280');
    fireEvent.keyDown(d, { key: 'End' });
    fireEvent.keyDown(d, { key: 'ArrowRight' });
    expect(d.getAttribute('aria-valuenow')).toBe('400');
  });

  it('coluna à direita da divisória (membros) cresce para a esquerda', () => {
    render(<Teste lado="direita" inicial={220} />);
    const d = screen.getByRole('separator');
    fireEvent.keyDown(d, { key: 'ArrowLeft' });
    expect(d.getAttribute('aria-valuenow')).toBe('230');
  });
});
