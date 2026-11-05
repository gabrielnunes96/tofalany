// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FiltroAuditoria, PaginaAuditoria, RegistroAuditoriaDto } from '@tofalando/shared';
import { TelaAuditoria } from './TelaAuditoria';

afterEach(cleanup);

const reg = (id: number, nome = 'ana'): RegistroAuditoriaDto => ({
  id,
  quando: Date.UTC(2026, 10, 5, 12),
  tipo: 'login',
  ator: { id: 1, nome },
  alvo: null,
  canal: null,
  detalhes: {},
});
const usuarios = [
  { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#fff', avatarUrl: null, cargo: 'admin' as const },
  { id: 2, usuario: 'bia', nomeExibicao: 'Bia', cor: '#fff', avatarUrl: null, cargo: 'membro' as const },
];

describe('TelaAuditoria', () => {
  it('lista os registros e pagina com "Carregar mais antigos"', async () => {
    const auditoria = vi.fn(
      async (f: FiltroAuditoria): Promise<PaginaAuditoria> =>
        f.antes ? { registros: [reg(1)], fim: true } : { registros: [reg(3), reg(2)], fim: false },
    );
    render(<TelaAuditoria api={{ auditoria }} usuarios={usuarios} aoVoltar={vi.fn()} />);
    const lista = await screen.findByRole('list', { name: 'Registros da auditoria' });
    await waitFor(() => expect(lista.textContent).toContain('ana entrou com usuário e senha'));
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais antigos' }));
    await waitFor(() => expect(auditoria).toHaveBeenLastCalledWith(expect.objectContaining({ antes: 2 })));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Carregar mais antigos' })).toBeNull());
    expect(lista.querySelectorAll('time')).toHaveLength(3);
  });

  it('filtros viram a consulta (pessoa, evento e período)', async () => {
    const auditoria = vi.fn(async (): Promise<PaginaAuditoria> => ({ registros: [], fim: true }));
    render(<TelaAuditoria api={{ auditoria }} usuarios={usuarios} aoVoltar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Pessoa'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Evento'), { target: { value: 'offline' } });
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-11-05' } });
    await waitFor(() =>
      expect(auditoria).toHaveBeenLastCalledWith({
        pessoa: 2,
        tipo: 'offline',
        de: new Date(2026, 10, 1).getTime(),
        ate: new Date(2026, 10, 5, 23, 59, 59, 999).getTime(),
        antes: undefined,
      }),
    );
    expect(await screen.findByText('Nenhum registro com esses filtros.')).toBeTruthy();
  });

  it('rolagem até o fim carrega mais; depois de um erro, só o botão tenta de novo (sem laço)', async () => {
    let avisar: (visivel: boolean) => void = () => undefined;
    class ObservadorFalso {
      constructor(fn: (entradas: { isIntersecting: boolean }[]) => void) {
        avisar = (visivel) => fn([{ isIntersecting: visivel }]);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    let falhar = true;
    const auditoria = vi.fn(async (f: FiltroAuditoria): Promise<PaginaAuditoria> => {
      if (!f.antes) return { registros: [reg(3), reg(2)], fim: false };
      if (falhar) throw new Error('Sem conexão com o servidor.');
      return { registros: [reg(1)], fim: true };
    });
    render(<TelaAuditoria api={{ auditoria }} usuarios={usuarios} aoVoltar={vi.fn()} />);
    await screen.findByText('Carregar mais antigos');

    avisar(true);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sem conexão com o servidor.');
    const chamadas = auditoria.mock.calls.length;
    avisar(true);
    avisar(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(auditoria.mock.calls.length).toBe(chamadas);

    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais antigos' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Carregar mais antigos' })).toBeNull());
    vi.unstubAllGlobals();
  });

  it('mostra o erro do servidor', async () => {
    const auditoria = vi.fn(async (): Promise<PaginaAuditoria> => {
      throw new Error('Só administradores podem fazer isso.');
    });
    render(<TelaAuditoria api={{ auditoria }} usuarios={usuarios} aoVoltar={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Só administradores podem fazer isso.');
  });
});
