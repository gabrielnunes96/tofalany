// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AparelhosConectados } from './AparelhosConectados';

/** celular, T4: aparelhos conectados (CA-15). */
afterEach(cleanup);

describe('AparelhosConectados', () => {
  it('lista os aparelhos, marca o atual (sem desconectar) e desconecta outro com confirmação', async () => {
    let lista = [
      { id: 'a'.repeat(32), aparelho: 'Computador (Linux)', criadoEm: 0, vistoEm: 0, atual: true },
      { id: 'b'.repeat(32), aparelho: 'Android', criadoEm: 0, vistoEm: 0, atual: false },
    ];
    const api = { sessoes: vi.fn(async () => lista), desconectarSessao: vi.fn(async (id: string) => void (lista = lista.filter((s) => s.id !== id))) };
    render(<AparelhosConectados api={api} />);
    const atual = await screen.findByRole('listitem', { name: 'Computador (Linux)' });
    expect(atual.textContent).toContain('(este aparelho)');
    expect(within(atual).queryByRole('button', { name: 'Desconectar' })).toBeNull();
    fireEvent.click(within(screen.getByRole('listitem', { name: 'Android' })).getByRole('button', { name: 'Desconectar' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Confirmar desconectar Android' })).getByRole('button', { name: 'Desconectar' }));
    await waitFor(() => expect(api.desconectarSessao).toHaveBeenCalledWith('b'.repeat(32)));
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Android' })).toBeNull());
  });
});
