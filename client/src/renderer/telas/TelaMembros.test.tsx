// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { UsuarioDto } from '@tofalando/shared';
import { TelaMembros } from './TelaMembros';
import { TelaConvite } from './TelaConvite';

afterEach(cleanup);

const dono: UsuarioDto = { id: 1, usuario: 'dono', nomeExibicao: 'Dono', cor: '#fff', avatarUrl: null, cargo: 'admin' };
const ana: UsuarioDto = { id: 2, usuario: 'ana', nomeExibicao: 'Ana', cor: '#fff', avatarUrl: null, cargo: 'membro' };

describe('TelaMembros', () => {
  it('promove, pede confirmação para remover e mostra o erro do servidor', async () => {
    const api = {
      mudarCargo: vi.fn(async () => ({ ...ana, cargo: 'admin' as const })),
      removerConta: vi.fn(async () => {
        throw new Error('O servidor precisa de pelo menos um administrador.');
      }),
    };
    render(<TelaMembros eu={dono} usuarios={[ana, dono]} servidorUrl="http://s" api={api} aoAtualizar={vi.fn()} aoRemover={vi.fn()} aoVoltar={vi.fn()} />);
    const linhaAna = screen.getByRole('listitem', { name: 'Ana' });
    fireEvent.click(within(linhaAna).getByRole('button', { name: 'Tornar administrador' }));
    await waitFor(() => expect(api.mudarCargo).toHaveBeenCalledWith(2, 'admin'));

    const linhaDono = screen.getByRole('listitem', { name: 'Dono' });
    fireEvent.click(within(linhaDono).getByRole('button', { name: 'Remover conta' }));
    expect(api.removerConta).not.toHaveBeenCalled();
    fireEvent.click(within(linhaDono).getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'O servidor precisa de pelo menos um administrador.');
    expect(api.removerConta).toHaveBeenCalledWith(1);
  });
});

describe('TelaMembros (sucesso)', () => {
  it('aplica o resultado na hora, fecha a confirmação e não mostra erro', async () => {
    const api = { mudarCargo: vi.fn(async () => ({ ...ana, cargo: 'admin' as const })), removerConta: vi.fn(async () => undefined) };
    const aoAtualizar = vi.fn();
    const aoRemover = vi.fn();
    render(<TelaMembros eu={dono} usuarios={[ana, dono]} servidorUrl="http://s" api={api} aoAtualizar={aoAtualizar} aoRemover={aoRemover} aoVoltar={vi.fn()} />);
    const linhaAna = screen.getByRole('listitem', { name: 'Ana' });
    fireEvent.click(within(linhaAna).getByRole('button', { name: 'Tornar administrador' }));
    await waitFor(() => expect(aoAtualizar).toHaveBeenCalledWith({ ...ana, cargo: 'admin' }));
    fireEvent.click(within(linhaAna).getByRole('button', { name: 'Remover conta' }));
    fireEvent.click(within(linhaAna).getByRole('button', { name: 'Confirmar remoção' }));
    await waitFor(() => expect(aoRemover).toHaveBeenCalledWith(2));
    expect(within(linhaAna).queryByRole('button', { name: 'Confirmar remoção' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('TelaConvite', () => {
  it('mostra o código e o link; valida e troca', async () => {
    const api = {
      lerConvite: vi.fn(async () => ({ codigo: 'velho-123', link: 'http://s/convite/velho-123' })),
      trocarConvite: vi.fn(async (codigo: string) => ({ codigo, link: `http://s/convite/${codigo}` })),
    };
    render(<TelaConvite api={api} aoVoltar={vi.fn()} />);
    expect(await screen.findByTestId('codigo-convite')).toHaveProperty('textContent', 'velho-123');
    fireEvent.change(screen.getByLabelText('Novo código'), { target: { value: 'a b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar código' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(api.trocarConvite).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Novo código'), { target: { value: 'turma-nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar código' }));
    await waitFor(() => expect(screen.getByTestId('link-convite').textContent).toBe('http://s/convite/turma-nova'));
  });
});
