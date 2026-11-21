// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PreviaLocal } from './PreviaLocal';

/** video-teatro-cameras-e-sons (CA-8 de quem transmite, RN-4): a prévia ampliada no <body> com a barra. */
afterEach(cleanup);

describe('prévia ampliada de quem transmite', () => {
  it('fica no <body>, com tela cheia, ocultar prévia e fechar; Esc fecha', () => {
    vi.stubGlobal('MediaStream', class {});
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
    const aoOcultar = vi.fn();
    const { container } = render(
      <main className="conteudo">
        <PreviaLocal faixa={{} as MediaStreamTrack} telaInteira={false} mesmaTela={false} aoOcultar={aoOcultar} />
      </main>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar prévia' }));
    const dialogo = screen.getByRole('dialog', { name: 'Prévia ampliada' });
    expect(container.contains(dialogo)).toBe(false);
    for (const nome of ['Tela cheia', 'Ocultar prévia', 'Fechar (Esc)']) expect(screen.getByRole('button', { name: nome })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar prévia' }));
    expect(aoOcultar).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Prévia ampliada' })).toBeNull();
    vi.unstubAllGlobals();
  });

  it('transmitindo a tela em que o app está: só o aviso (sem espelho)', () => {
    render(<PreviaLocal faixa={{} as MediaStreamTrack} telaInteira mesmaTela aoOcultar={vi.fn()} />);
    expect(screen.getByRole('note').textContent).toContain('para não virar espelho');
    expect(screen.queryByRole('button', { name: 'Ampliar prévia' })).toBeNull();
  });
});
