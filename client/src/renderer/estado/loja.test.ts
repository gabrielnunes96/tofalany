import { beforeEach, describe, expect, it } from 'vitest';
import { useLoja } from './loja';

const eu = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#fff', avatarUrl: null, cargo: 'admin' as const };

describe('useLoja', () => {
  beforeEach(() => useLoja.getState().limpar());

  it('aplica o retrato inicial e limpa ao sair', () => {
    useLoja.getState().aplicarOla({ servidor: { nome: 'Turma' }, convite: { link: 'http://s/convite/a' }, eu, usuarios: [eu], canais: [] });
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

describe('canais na loja', () => {
  beforeEach(() => useLoja.getState().limpar());
  const ola = (canais: { id: number; tipo: 'texto' | 'voz'; nome: string; posicao: number }[]) =>
    useLoja.getState().aplicarOla({ servidor: { nome: 'T' }, convite: { link: 'x' }, eu, usuarios: [eu], canais });

  it('ordena texto antes de voz, abre o primeiro de texto e troca ao remover o aberto', () => {
    ola([
      { id: 5, tipo: 'voz', nome: 'Sala', posicao: 1 },
      { id: 2, tipo: 'texto', nome: 'b', posicao: 2 },
      { id: 1, tipo: 'texto', nome: 'a', posicao: 1 },
    ]);
    expect(useLoja.getState().canais.map((c) => c.id)).toEqual([1, 2, 5]);
    expect(useLoja.getState().canalAtivo).toBe(1);
    useLoja.getState().abrirCanal(2);
    expect(useLoja.getState().canalAtivo).toBe(2);
    useLoja.getState().abrirCanal(5);
    expect(useLoja.getState().canalAtivo).toBe(1);
    useLoja.getState().abrirCanal(2);
    useLoja.getState().removerCanal(2);
    expect(useLoja.getState().canalAtivo).toBe(1);
    useLoja.getState().salvarCanal({ id: 1, tipo: 'texto', nome: 'renomeado', posicao: 1 });
    expect(useLoja.getState().canais.find((c) => c.id === 1)?.nome).toBe('renomeado');
  });

  it('reconectar mantém o canal aberto se ele ainda existe', () => {
    ola([{ id: 1, tipo: 'texto', nome: 'a', posicao: 1 }, { id: 2, tipo: 'texto', nome: 'b', posicao: 2 }]);
    useLoja.getState().abrirCanal(2);
    ola([{ id: 1, tipo: 'texto', nome: 'a', posicao: 1 }, { id: 2, tipo: 'texto', nome: 'b', posicao: 2 }]);
    expect(useLoja.getState().canalAtivo).toBe(2);
  });
});
