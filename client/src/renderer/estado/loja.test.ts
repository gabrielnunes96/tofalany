import { beforeEach, describe, expect, it } from 'vitest';
import { useLoja } from './loja';

const eu = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#fff', avatarUrl: null, cargo: 'admin' as const };

describe('useLoja', () => {
  beforeEach(() => useLoja.getState().limpar());

  it('aplica o retrato inicial e limpa ao sair', () => {
    useLoja.getState().aplicarOla({ servidor: { nome: 'Turma' }, eu, usuarios: [eu] });
    useLoja.getState().definirConexao('conectado');
    expect(useLoja.getState()).toMatchObject({ nomeServidor: 'Turma', eu, usuarios: [eu], conexao: 'conectado' });
    useLoja.getState().limpar();
    expect(useLoja.getState()).toMatchObject({ nomeServidor: null, eu: null, usuarios: [], conexao: 'conectando' });
  });
});
