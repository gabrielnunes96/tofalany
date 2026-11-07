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

  it('versão baixada: reiniciar instala; "Depois" esconde até aparecer outra', async () => {
    const { api, avisar } = ponte(null);
    render(<AvisoAtualizacao atualizacao={api} />);
    avisar({ versao: '0.2.0', modo: 'reiniciar' });
    expect(screen.getByRole('status', { name: 'Versão nova' }).textContent).toContain('ToFalany 0.2.0 está pronto para instalar.');
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar e atualizar' }));
    expect(api.instalar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(screen.queryByRole('status', { name: 'Versão nova' })).toBeNull();
    avisar({ versao: '0.3.0', modo: 'reiniciar' });
    expect(screen.getByRole('status', { name: 'Versão nova' }).textContent).toContain('0.3.0');
  });

  it('no .deb (só disponível), o botão abre a página da versão; estado já existente aparece ao abrir', async () => {
    const { api } = ponte({ versao: '0.2.0', modo: 'pagina' });
    render(<AvisoAtualizacao atualizacao={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar a versão nova' }));
    expect(api.abrirPagina).toHaveBeenCalled();
  });
});
