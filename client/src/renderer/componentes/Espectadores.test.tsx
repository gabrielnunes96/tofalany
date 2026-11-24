// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Espectadores, posicaoLista } from './Espectadores';

afterEach(cleanup);

describe('lista de quem assiste (teste-de-microfone, item 58)', () => {
  it('CA-9: perto da borda de baixo abre para cima, inteira; com espaço embaixo, abre para baixo', () => {
    expect(posicaoLista({ top: 600, bottom: 630 }, { top: 0, bottom: 700 })).toEqual({ paraCima: true, maxAltura: 260 });
    expect(posicaoLista({ top: 20, bottom: 50 }, { top: 0, bottom: 700 })).toEqual({ paraCima: false, maxAltura: 260 });
  });

  it('sem espaço para a lista inteira, limita a altura ao lado maior', () => {
    expect(posicaoLista({ top: 150, bottom: 180 }, { top: 0, bottom: 330 })).toEqual({ paraCima: false, maxAltura: 138 });
    expect(posicaoLista({ top: 180, bottom: 210 }, { top: 0, bottom: 330 })).toEqual({ paraCima: true, maxAltura: 168 });
  });

  it('o olho mostra o número e a lista dos nomes', () => {
    render(<Espectadores nomes={['Caio', 'Bia']} />);
    fireEvent.click(screen.getByRole('button', { name: '2 pessoas assistindo' }));
    expect(screen.getByRole('dialog', { name: 'Quem está assistindo' }).textContent).toContain('BiaCaio');
  });
});
