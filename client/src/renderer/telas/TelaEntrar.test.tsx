// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SessaoResponse } from '@tofalando/shared';
import { TelaEntrar } from './TelaEntrar';
import { ErroApiCliente, type ClienteApi } from '../servicos/api';

afterEach(cleanup);

const sessao: SessaoResponse = { token: 't', usuario: { id: 1, usuario: 'ana', nomeExibicao: 'ana', cor: '#fff', avatarUrl: null, cargo: 'admin' } };
type ApiEntrar = Pick<ClienteApi, 'cadastrar' | 'entrar' | 'redefinirSenha'>;
const apiFalsa = (extra: Partial<ApiEntrar> = {}): ApiEntrar => ({
  cadastrar: vi.fn(() => Promise.resolve(sessao)),
  entrar: vi.fn(() => Promise.resolve(sessao)),
  redefinirSenha: vi.fn(() => Promise.resolve()),
  ...extra,
});
const digitar = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe('TelaEntrar', () => {
  it('cadastro: regras da senha ficam ok enquanto digita, e a confirmação precisa bater', async () => {
    const api = apiFalsa();
    render(<TelaEntrar servidorUrl="http://s" aoEntrar={vi.fn()} aoTrocarServidor={vi.fn()} api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tenho um convite' }));
    const regras = () => [...screen.getByRole('list', { name: 'A senha precisa ter' }).querySelectorAll('li')].map((li) => li.className === 'ok');
    expect(regras()).toEqual([false, false, false, false, false]);
    digitar('Senha', 'A');
    expect(regras()).toEqual([false, true, false, false, false]);
    digitar('Senha', 'Abcdefg1');
    expect(regras()).toEqual([true, true, true, true, false]);
    digitar('Confirmar senha', 'Abcdefg2');
    digitar('Código de convite', 'abc');
    digitar('Nome de usuário', 'ana');
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('As senhas não são iguais.')).toBeTruthy();
    expect(api.cadastrar).not.toHaveBeenCalled();
    digitar('Confirmar senha', 'Abcdefg1');
    expect(regras()).toEqual([true, true, true, true, true]);
  });

  it('cadastro: valida no cliente como o servidor, sem chamar a API', async () => {
    const api = apiFalsa();
    render(<TelaEntrar servidorUrl="http://s" aoEntrar={vi.fn()} aoTrocarServidor={vi.fn()} api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tenho um convite' }));
    digitar('Nome de usuário', 'jo');
    digitar('Senha', '123');
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Informe o código de convite.')).toBeTruthy();
    expect(screen.getByText('O nome de usuário deve ter de 3 a 32 caracteres.')).toBeTruthy();
    expect(screen.getByText('A senha precisa ter: pelo menos 8 caracteres, uma letra maiúscula, uma letra minúscula.')).toBeTruthy();
    expect(api.cadastrar).not.toHaveBeenCalled();
  });

  it('cadastro: envia os dados e entra', async () => {
    const api = apiFalsa();
    const aoEntrar = vi.fn();
    render(<TelaEntrar servidorUrl="http://s" aoEntrar={aoEntrar} aoTrocarServidor={vi.fn()} api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tenho um convite' }));
    digitar('Código de convite', ' abc ');
    digitar('Nome de usuário', 'ana');
    digitar('Senha', 'Senha-forte-1');
    digitar('Confirmar senha', 'Senha-forte-1');
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(aoEntrar).toHaveBeenCalledWith(sessao));
    expect(api.cadastrar).toHaveBeenCalledWith({ convite: 'abc', usuario: 'ana', senha: 'Senha-forte-1' });
  });

  it('CA-2 (tela): mostra a mensagem do servidor e libera o botão', async () => {
    const api = apiFalsa({ cadastrar: () => Promise.reject(new ErroApiCliente(403, 'convite_invalido', 'Código de convite inválido.')) });
    render(<TelaEntrar servidorUrl="http://s" aoEntrar={vi.fn()} aoTrocarServidor={vi.fn()} api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tenho um convite' }));
    digitar('Código de convite', 'errado');
    digitar('Nome de usuário', 'ana');
    digitar('Senha', 'Senha-forte-1');
    digitar('Confirmar senha', 'Senha-forte-1');
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Código de convite inválido.');
    expect(screen.getByRole('button', { name: 'Criar conta' })).toHaveProperty('disabled', false);
  });

  it('RF-1a: aberto por um link de convite já vem em "Tenho um convite" com o código', async () => {
    const api = apiFalsa();
    render(<TelaEntrar servidorUrl="http://s" conviteInicial="turma-2026" aoEntrar={vi.fn()} aoTrocarServidor={vi.fn()} api={api} />);
    expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeTruthy();
    expect((screen.getByLabelText('Código de convite') as HTMLInputElement).value).toBe('turma-2026');
    digitar('Nome de usuário', 'ana');
    digitar('Senha', 'Senha-forte-1');
    digitar('Confirmar senha', 'Senha-forte-1');
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(api.cadastrar).toHaveBeenCalledWith({ convite: 'turma-2026', usuario: 'ana', senha: 'Senha-forte-1' }));
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

  it('backlog v2, item 3: "Esqueci a senha" troca a senha com o código e volta para entrar', async () => {
    const api = apiFalsa();
    render(<TelaEntrar servidorUrl="http://s" aoEntrar={vi.fn()} aoTrocarServidor={vi.fn()} api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci a senha' }));
    expect(screen.getByRole('heading', { name: 'Trocar a senha' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Trocar a senha' }));
    expect(screen.getByText('Informe o código que o administrador mandou.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome de usuário'), { target: { value: ' ana ' } });
    fireEvent.change(screen.getByLabelText('Código de redefinição'), { target: { value: 'ABCD-EFGH' } });
    fireEvent.change(screen.getByLabelText('Senha nova'), { target: { value: 'Senha-nova-123' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'Senha-nova-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar a senha' }));
    await waitFor(() => expect(api.redefinirSenha).toHaveBeenCalledWith({ usuario: 'ana', codigo: 'ABCD-EFGH', senha: 'Senha-nova-123' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Senha trocada. Entre com a senha nova.');
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeTruthy();
  });
});
