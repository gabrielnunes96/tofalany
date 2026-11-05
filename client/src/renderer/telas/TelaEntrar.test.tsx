// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SessaoResponse } from '@tofalando/shared';
import { TelaEntrar } from './TelaEntrar';
import { ErroApiCliente, type ClienteApi } from '../servicos/api';

afterEach(cleanup);

const sessao: SessaoResponse = { token: 't', usuario: { id: 1, usuario: 'ana', nomeExibicao: 'ana', cor: '#fff', avatarUrl: null, cargo: 'admin' } };
const apiFalsa = (extra: Partial<ClienteApi> = {}): ClienteApi => ({
  cadastrar: vi.fn(() => Promise.resolve(sessao)),
  entrar: vi.fn(() => Promise.resolve(sessao)),
  sair: vi.fn(() => Promise.resolve()),
  eu: vi.fn(() => Promise.resolve(sessao.usuario)),
  auditoria: vi.fn(() => Promise.resolve({ registros: [], fim: true })),
  ...extra,
});
const digitar = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe('TelaEntrar', () => {
  it('cadastro: valida no cliente como o servidor, sem chamar a API', async () => {
    const api = apiFalsa();
    render(<TelaEntrar servidorUrl="http://s" aoEntrar={vi.fn()} aoTrocarServidor={vi.fn()} api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tenho um convite' }));
    digitar('Nome de usuário', 'jo');
    digitar('Senha', '123');
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Informe o código de convite.')).toBeTruthy();
    expect(screen.getByText('O nome de usuário deve ter de 3 a 32 caracteres.')).toBeTruthy();
    expect(screen.getByText('A senha deve ter pelo menos 8 caracteres.')).toBeTruthy();
    expect(api.cadastrar).not.toHaveBeenCalled();
  });

  it('cadastro: envia os dados e entra', async () => {
    const api = apiFalsa();
    const aoEntrar = vi.fn();
    render(<TelaEntrar servidorUrl="http://s" aoEntrar={aoEntrar} aoTrocarServidor={vi.fn()} api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tenho um convite' }));
    digitar('Código de convite', ' abc ');
    digitar('Nome de usuário', 'ana');
    digitar('Senha', 'senha-forte-1');
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(aoEntrar).toHaveBeenCalledWith(sessao));
    expect(api.cadastrar).toHaveBeenCalledWith({ convite: 'abc', usuario: 'ana', senha: 'senha-forte-1' });
  });

  it('CA-2 (tela): mostra a mensagem do servidor e libera o botão', async () => {
    const api = apiFalsa({ cadastrar: () => Promise.reject(new ErroApiCliente(403, 'convite_invalido', 'Código de convite inválido.')) });
    render(<TelaEntrar servidorUrl="http://s" aoEntrar={vi.fn()} aoTrocarServidor={vi.fn()} api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tenho um convite' }));
    digitar('Código de convite', 'errado');
    digitar('Nome de usuário', 'ana');
    digitar('Senha', 'senha-forte-1');
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Código de convite inválido.');
    expect(screen.getByRole('button', { name: 'Criar conta' })).toHaveProperty('disabled', false);
  });

  it('login: exige os dois campos e entra', async () => {
    const api = apiFalsa();
    const aoEntrar = vi.fn();
    render(<TelaEntrar servidorUrl="http://s" aoEntrar={aoEntrar} aoTrocarServidor={vi.fn()} api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Informe o nome de usuário.')).toBeTruthy();
    digitar('Nome de usuário', 'ana');
    digitar('Senha', 'qualquer');
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(aoEntrar).toHaveBeenCalled());
    expect(api.entrar).toHaveBeenCalledWith({ usuario: 'ana', senha: 'qualquer' });
  });
});
