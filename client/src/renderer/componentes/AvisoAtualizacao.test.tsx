// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AvisoAtualizacao } from './AvisoAtualizacao';

afterEach(cleanup);

type Estado = { versao: string; modo: 'reiniciar' | 'pagina' };

function ponte(inicial: Estado | null) {
  let ouvinte: ((e: Estado) => void) | undefined;
  const api = {
    estado: vi.fn(async () => inicial),
    aoMudar: vi.fn((fn: (e: Estado) => void) => {
      ouvinte = fn;
      return () => undefined;
    }),
    instalar: vi.fn(async () => undefined),
    abrirPagina: vi.fn(async () => undefined),
    procurar: vi.fn(async () => ({ situacao: 'atualizado' as const })),
  };
  return { api, avisar: (e: Estado) => act(() => ouvinte?.(e)) };
}

describe('aviso de versão nova (backlog v2, 1d)', () => {
  it('sem versão nova, não mostra nada', async () => {
    const { api } = ponte(null);
    render(<AvisoAtualizacao atualizacao={api} />);
    await act(async () => undefined);
    expect(screen.queryByRole('status', { name: 'Versão nova' })).toBeNull();
  });

  it('versão baixada: "Depois" esconde até aparecer outra', async () => {
    const { api, avisar } = ponte(null);
    render(<AvisoAtualizacao atualizacao={api} />);
    avisar({ versao: '0.2.0', modo: 'reiniciar' });
    expect(screen.getByRole('status', { name: 'Versão nova' }).textContent).toContain('ToFalany 0.2.0 está pronto para instalar.');
    fireEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(screen.queryByRole('status', { name: 'Versão nova' })).toBeNull();
    avisar({ versao: '0.3.0', modo: 'reiniciar' });
    expect(screen.getByRole('status', { name: 'Versão nova' }).textContent).toContain('0.3.0');
  });

  it('backlog 18: reiniciar mostra o ícone girando no meio da tela e só então instala', async () => {
    vi.useFakeTimers();
    try {
      const { api, avisar } = ponte(null);
      render(<AvisoAtualizacao atualizacao={api} />);
      avisar({ versao: '0.16.0', modo: 'reiniciar' });
      fireEvent.click(screen.getByRole('button', { name: 'Reiniciar e atualizar' }));
      const tela = screen.getByRole('status');
      expect(tela.className).toBe('tela-atualizando');
      expect(tela.textContent).toContain('Atualizando o ToFalany para a versão 0.16.0…');
      expect(tela.querySelector('img.tela-atualizando-icone')).toBeTruthy();
      expect(api.instalar).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTime(600));
      expect(api.instalar).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no .deb (só disponível), o botão abre a página da versão; estado já existente aparece ao abrir', async () => {
    const { api } = ponte({ versao: '0.2.0', modo: 'pagina' });
    render(<AvisoAtualizacao atualizacao={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar a versão nova' }));
    expect(api.abrirPagina).toHaveBeenCalled();
  });
});
