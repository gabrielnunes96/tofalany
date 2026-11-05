import { beforeEach, describe, expect, it } from 'vitest';
import { useLoja } from './loja';

const eu = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#fff', avatarUrl: null, cargo: 'admin' as const };

describe('useLoja', () => {
  beforeEach(() => useLoja.getState().limpar());

  it('aplica o retrato inicial e limpa ao sair', () => {
    useLoja.getState().aplicarOla({ servidor: { nome: 'Turma' }, convite: { link: 'http://s/convite/a' }, eu, usuarios: [eu] });
    expect(useLoja.getState().linkConvite).toBe('http://s/convite/a');
    useLoja.getState().definirLinkConvite('http://s/convite/b');
    expect(useLoja.getState().linkConvite).toBe('http://s/convite/b');
    useLoja.getState().definirConexao('conectado');
    expect(useLoja.getState()).toMatchObject({ nomeServidor: 'Turma', eu, usuarios: [eu], conexao: 'conectado' });
    useLoja.getState().adicionarUsuario({ ...eu, id: 2, nomeExibicao: 'Bia' });
    useLoja.getState().adicionarUsuario({ ...eu, id: 3, nomeExibicao: 'abel' });
    useLoja.getState().adicionarUsuario({ ...eu, id: 2, nomeExibicao: 'Bia' });
    expect(useLoja.getState().usuarios.map((u) => u.nomeExibicao)).toEqual(['abel', 'Ana', 'Bia']);
    useLoja.getState().adicionarUsuario({ ...eu, id: 4, nomeExibicao: 'ana' });
    expect(useLoja.getState().usuarios.map((u) => u.id)).toEqual([3, 1, 4, 2]);
    useLoja.getState().atualizarUsuario({ ...eu, nomeExibicao: 'Zuleica' });
    expect(useLoja.getState().eu?.nomeExibicao).toBe('Zuleica');
    expect(useLoja.getState().usuarios.at(-1)?.id).toBe(1);
    useLoja.getState().removerUsuario(4);
    expect(useLoja.getState().usuarios.some((u) => u.id === 4)).toBe(false);
    useLoja.getState().limpar();
    expect(useLoja.getState()).toMatchObject({ nomeServidor: null, eu: null, usuarios: [], conexao: 'conectando' });
  });
});
