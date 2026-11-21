// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UsuarioDto } from '@tofalando/shared';
import { GradeVideos, limitarNaJanela } from './GradeVideos';
import { gravarModoCameras, lerModoCameras, POSICAO_PADRAO, voltarCamerasAoLugar } from '../servicos/modo-cameras';

/** video-teatro-cameras-e-sons, T2: câmeras flutuantes sempre à vista e "Voltar as câmeras ao lugar". */
afterEach(cleanup);
beforeEach(() => localStorage.clear());

const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#fff', avatarUrl: null, cargo: 'membro' };
const faixa = { attach: () => undefined, detach: () => undefined };
const videos = [{ usuarioId: 1, meu: false, faixa }] as never;

describe('câmeras flutuantes (CA-1, CA-2)', () => {
  it('limitarNaJanela: a caixa fica inteira dentro da janela', () => {
    expect(limitarNaJanela(5000, -50, 360, 200, 1000, 700)).toEqual({ x: 632, y: 8 });
    expect(limitarNaJanela(100, 100, 360, 200, 1000, 700)).toEqual({ x: 100, y: 100 });
  });

  it('flutuante é desenhada no <body> (fora do painel do meio), na posição limitada à janela', () => {
    gravarModoCameras({ flutuante: true, x: 99_999, y: 99_999 });
    const { container } = render(
      <main className="conteudo">
        <GradeVideos videos={videos} usuarios={[ana]} euId={2} />
      </main>,
    );
    const grade = screen.getByRole('region', { name: 'Câmeras' });
    expect(container.contains(grade)).toBe(false);
    expect(grade.parentElement).toBe(document.body);
    expect(parseFloat(grade.style.left)).toBeLessThan(window.innerWidth);
    expect(parseFloat(grade.style.top)).toBeLessThan(window.innerHeight);
  });

  it('"Voltar as câmeras ao lugar" (de fora da janelinha) leva ao canto padrão e a grade acompanha', () => {
    gravarModoCameras({ flutuante: true, x: 400, y: 300 });
    render(<GradeVideos videos={videos} usuarios={[ana]} euId={2} />);
    act(() => voltarCamerasAoLugar());
    expect(lerModoCameras()).toEqual({ flutuante: true, ...POSICAO_PADRAO });
    const grade = screen.getByRole('region', { name: 'Câmeras' });
    expect(grade.style.left).toBe(`${POSICAO_PADRAO.x}px`);
    expect(grade.style.top).toBe(`${POSICAO_PADRAO.y}px`);
  });

  it('prender de volta tira do <body>; posição guardada inválida volta ao padrão', () => {
    gravarModoCameras({ flutuante: true, x: 10, y: 10 });
    const { container } = render(<GradeVideos videos={videos} usuarios={[ana]} euId={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prender as câmeras no topo' }));
    expect(container.contains(screen.getByRole('region', { name: 'Câmeras' }))).toBe(true);
    localStorage.setItem('tofalany.cameras', '{"flutuante":true,"x":"abc","y":null}');
    expect(lerModoCameras()).toEqual({ flutuante: true, x: POSICAO_PADRAO.x, y: 0 });
  });
});
