// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { useJanelaPropria } from './janela-propria';

/** video-teatro-cameras-e-sons, T1: o hook abre a janela própria, copia o tema e os estilos e desenha nela. */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function falsa() {
  const doc = document.implementation.createHTMLDocument('');
  const ouvintes = new Map<string, () => void>();
  const filha = {
    document: doc,
    closed: false,
    close: vi.fn(() => (filha.closed = true)),
    addEventListener: (t: string, f: () => void) => ouvintes.set(t, f),
    removeEventListener: (t: string) => ouvintes.delete(t),
  };
  return { filha, doc, disparar: (t: string) => ouvintes.get(t)?.() };
}

function Teste({ nome, aoFechar }: { nome: string | null; aoFechar: () => void }) {
  const alvo = useJanelaPropria(nome, 'ToFalany – Câmeras', aoFechar);
  return alvo ? createPortal(<p>dentro da janela</p>, alvo) : null;
}

describe('useJanelaPropria', () => {
  it('abre about:blank com o nome, copia tema e estilos, desenha lá; desmontar solta o vídeo e fecha', async () => {
    const { filha, doc } = falsa();
    const abrir = vi.spyOn(window, 'open').mockReturnValue(filha as never);
    document.documentElement.setAttribute('data-tema', 'arcano');
    const estilo = document.createElement('style');
    estilo.textContent = '.x{}';
    document.head.appendChild(estilo);
    const { unmount } = render(<Teste nome="tofalany-cameras" aoFechar={vi.fn()} />);
    expect(abrir).toHaveBeenCalledWith('about:blank', 'tofalany-cameras', 'popup');
    await waitFor(() => expect(doc.body.textContent).toContain('dentro da janela'));
    expect(doc.documentElement.getAttribute('data-tema')).toBe('arcano');
    expect(doc.head.querySelector('style')?.textContent).toBe('.x{}');
    expect(doc.title).toBe('ToFalany – Câmeras');
    // O tema muda no app: a janela acompanha.
    act(() => document.documentElement.setAttribute('data-tema', 'gibi'));
    await waitFor(() => expect(doc.documentElement.getAttribute('data-tema')).toBe('gibi'));
    const video = doc.createElement('video');
    Object.defineProperty(video, 'srcObject', { value: {}, writable: true });
    doc.body.appendChild(video);
    unmount();
    expect(video.srcObject).toBeNull();
    expect(filha.close).toHaveBeenCalled();
    estilo.remove();
  });

  it('fechar a janela pelo sistema avisa; recusada (null) também', async () => {
    const { filha, disparar } = falsa();
    vi.spyOn(window, 'open').mockReturnValueOnce(filha as never).mockReturnValueOnce(null);
    const aoFechar = vi.fn();
    const { rerender } = render(<Teste nome="tofalany-cameras" aoFechar={aoFechar} />);
    disparar('pagehide');
    expect(aoFechar).toHaveBeenCalledTimes(1);
    rerender(<Teste nome="tofalany-transmissao-3" aoFechar={aoFechar} />);
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(2));
  });
});
