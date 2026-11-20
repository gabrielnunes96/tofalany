// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NOVIDADES } from '@tofalando/shared';
import { JanelaNovidades } from './JanelaNovidades';

afterEach(cleanup);

describe('JanelaNovidades', () => {
  it('mostra a chamada e os itens, não toca som e fecha no "Entendi"', () => {
    const somCriado = vi.fn();
    vi.stubGlobal('AudioContext', somCriado);
    const aoFechar = vi.fn();
    const { rerender } = render(<JanelaNovidades notas={NOVIDADES['0.15.0']!} versao="0.15.0" aoFechar={aoFechar} />);
    const janela = screen.getByRole('dialog', { name: 'Novidades da versão 0.15.0' });
    expect(screen.getByRole('heading', { name: 'O ToFalany está de cara nova' })).toBeTruthy();
    expect(janela.textContent).toContain('Temas refeitos');
    // CA-25: a nota da versão explica a loja e como ganhar pontos.
    expect(janela.textContent).toContain('Loja de pontos');
    expect(janela.textContent).toContain('1 ponto por minuto em voz');
    rerender(<JanelaNovidades notas={NOVIDADES['0.15.0']!} versao="0.15.0" aoFechar={aoFechar} />);
    // Sem som (item 17 do backlog): nenhum áudio é criado.
    expect(somCriado).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it('sem chamada, o título é "Novidades da versão"', () => {
    render(<JanelaNovidades notas={{ itens: [{ titulo: 'A', texto: 'b' }] }} versao="0.14.0" aoFechar={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Novidades da versão 0.14.0' })).toBeTruthy();
  });
});
