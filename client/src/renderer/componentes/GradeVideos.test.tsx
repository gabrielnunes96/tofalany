// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UsuarioDto } from '@tofalando/shared';
import { GradeVideos, limitarNaJanela } from './GradeVideos';
import { gravarModoCameras, lerModoCameras, POSICAO_PADRAO, reiniciarModoCameras, voltarCamerasAoLugar } from '../servicos/modo-cameras';
import { ligarFaixa } from '../servicos/faixa-em-janela';

/** video-teatro-cameras-e-sons, T2: câmeras flutuantes sempre à vista e "Voltar as câmeras ao lugar". */
afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  reiniciarModoCameras();
});

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
    reiniciarModoCameras();
    expect(lerModoCameras()).toEqual({ flutuante: true, x: POSICAO_PADRAO.x, y: 0 });
  });
});

describe('câmeras em janela própria (CA-3, T3)', () => {
  function janelaFalsa() {
    const doc = document.implementation.createHTMLDocument('');
    const ouvintes = new Map<string, () => void>();
    const filha = { document: doc, closed: false, close: vi.fn(), addEventListener: (t: string, f: () => void) => ouvintes.set(t, f), removeEventListener: vi.fn() };
    return { filha, doc, fecharPeloSistema: () => ouvintes.get('pagehide')?.() };
  }

  it('abre a janela com as câmeras, que saem do app; fechar a janela traz de volta; sem vídeo (saiu da voz) fecha', async () => {
    const { filha, doc, fecharPeloSistema } = janelaFalsa();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(filha as never);
    const { container, rerender } = render(<GradeVideos videos={videos} usuarios={[ana]} euId={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir as câmeras em janela própria' }));
    expect(abrir).toHaveBeenCalledWith('about:blank', 'tofalany-cameras', 'popup');
    await vi.waitFor(() => expect(doc.querySelector('[aria-label="Vídeo de Ana"]')).toBeTruthy());
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText(/As câmeras estão numa janela própria/)).toBeTruthy();
    act(() => fecharPeloSistema());
    expect(container.querySelector('video')).toBeTruthy();
    // De novo na janela e saiu da voz: a janela fecha.
    fireEvent.click(screen.getByRole('button', { name: 'Abrir as câmeras em janela própria' }));
    await vi.waitFor(() => expect(doc.querySelectorAll('video').length).toBeGreaterThan(0));
    rerender(<GradeVideos videos={[]} usuarios={[ana]} euId={2} />);
    expect(filha.close).toHaveBeenCalled();
    // Ao voltar para uma sala com câmera, as câmeras voltam no app (a janela não abre sozinha).
    expect(lerModoCameras().janela).toBe(false);
  });

  it('ligarFaixa: na janela principal usa attach; noutra janela, a mesma faixa e a visibilidade informada pela janela', () => {
    const attach = vi.fn();
    const detach = vi.fn();
    const observeElementInfo = vi.fn((info: { observe(): void }) => info.observe());
    const stopObservingElementInfo = vi.fn((info: { stopObserving(): void }) => info.stopObserving());
    const mediaStreamTrack = { kind: 'video' } as unknown as MediaStreamTrack;
    const faixaRemota = { attach, detach, mediaStreamTrack, observeElementInfo, stopObservingElementInfo };
    const aqui = document.createElement('video');
    ligarFaixa(faixaRemota, aqui)();
    expect(attach).toHaveBeenCalledWith(aqui);
    expect(detach).toHaveBeenCalledWith(aqui);
    vi.stubGlobal('MediaStream', class {
      constructor(public faixas: unknown[]) {}
    });
    const outro = document.implementation.createHTMLDocument('').createElement('video');
    const soltar = ligarFaixa(faixaRemota, outro);
    expect((outro.srcObject as unknown as { faixas: unknown[] }).faixas).toEqual([mediaStreamTrack]);
    expect(attach).toHaveBeenCalledTimes(1);
    const info = observeElementInfo.mock.calls[0]![0] as unknown as { visible: boolean; element: unknown };
    expect(info.element).toBe(outro);
    expect(info.visible).toBe(true);
    soltar();
    expect(stopObservingElementInfo).toHaveBeenCalled();
    expect(outro.srcObject).toBeNull();
    vi.unstubAllGlobals();
  });
});
