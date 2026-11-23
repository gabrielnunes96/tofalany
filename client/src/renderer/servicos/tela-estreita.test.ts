// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { LARGURA_ESTREITA, useTelaEstreita } from './tela-estreita';

/** celular, T5: a tela estreita muda junto com a largura da janela. */
afterEach(() => vi.unstubAllGlobals());

describe('useTelaEstreita', () => {
  it('segue a consulta de mídia e muda quando a janela muda', () => {
    let casa = false;
    const ouvintes = new Set<() => void>();
    vi.stubGlobal('matchMedia', (q: string) => ({
      get matches() {
        return casa && q === `(max-width: ${LARGURA_ESTREITA}px)`;
      },
      addEventListener: (_: string, fn: () => void) => ouvintes.add(fn),
      removeEventListener: (_: string, fn: () => void) => ouvintes.delete(fn),
    }));
    window.matchMedia = globalThis.matchMedia;
    const { result } = renderHook(() => useTelaEstreita());
    expect(result.current).toBe(false);
    act(() => {
      casa = true;
      for (const fn of ouvintes) fn();
    });
    expect(result.current).toBe(true);
  });
});
