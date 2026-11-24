import { describe, expect, it } from 'vitest';
import { criarPasta, itensColuna, limitesColunas, mesclarColunas, mesclarPastas, moverItem, moverPasso, normalizarPastas, somarAPasta, tirarDaPasta, type Organizacao } from './organizar.js';

const solto: Organizacao = { urls: ['a', 'b', 'c', 'd'], pastas: [] };

describe('organizar a tela', () => {
  it('CA-2: com a janela de 900 px, a conversa fica com pelo menos 360 px', () => {
    // 900 − 72 (servidores) − 220 (membros) − 360 = 248.
    expect(limitesColunas('canais', 900, 220, 72)).toEqual({ min: 180, max: 248 });
    expect(limitesColunas('canais', 1600, 220, 72)).toEqual({ min: 180, max: 400 });
    expect(limitesColunas('membros', 700, 400, 72)).toEqual({ min: 180, max: 180 });
  });

  it('larguras do arquivo ficam dentro dos limites', () => {
    expect(mesclarColunas({ canais: 900, membros: 50, outra: 1 })).toEqual({ canais: 400, membros: 180 });
    expect(mesclarColunas('x')).toEqual({});
  });

  it('CA-4: arrastar A sobre B cria a pasta; C sobre a pasta soma; A para fora sai', () => {
    let o = criarPasta(solto, 'a', 'b', 'p1');
    expect(o.urls).toEqual(['b', 'a', 'c', 'd']);
    expect(o.pastas).toMatchObject([{ id: 'p1', urls: ['b', 'a'], aberta: true }]);
    o = somarAPasta(o, 'd', 'p1');
    expect(o.urls).toEqual(['b', 'a', 'd', 'c']);
    expect(o.pastas[0]!.urls).toEqual(['b', 'a', 'd']);
    o = tirarDaPasta(o, 'a');
    expect(o.pastas[0]!.urls).toEqual(['b', 'd']);
    expect(itensColuna(o.urls, o.pastas).map((i) => (i.tipo === 'servidor' ? i.url : i.pasta.id))).toEqual(['p1', 'a', 'c']);
  });

  it('CA-5: pasta que fica com um só servidor se desfaz', () => {
    const o = tirarDaPasta(criarPasta(solto, 'a', 'b', 'p1'), 'a');
    expect(o.pastas).toEqual([]);
    expect(o.urls).toEqual(['b', 'a', 'c', 'd']);
  });

  it('CA-8: arrastar C para antes de A; a pasta inteira também anda', () => {
    expect(moverItem(solto, 'c', 'a').urls).toEqual(['c', 'a', 'b', 'd']);
    expect(moverItem(solto, 'a', null).urls).toEqual(['b', 'c', 'd', 'a']);
    const comPasta = criarPasta(solto, 'c', 'd', 'p1');
    expect(moverItem(comPasta, 'pasta:p1', 'a').urls).toEqual(['d', 'c', 'a', 'b']);
    // Servidor de dentro da pasta levado para fora: sai dela (e a pasta de um só se desfaz).
    expect(moverItem(comPasta, 'c', 'a')).toEqual({ urls: ['c', 'a', 'b', 'd'], pastas: [] });
  });

  it('RN-7: mover para cima e para baixo, inclusive dentro da pasta', () => {
    expect(moverPasso(solto, 'b', -1).urls).toEqual(['b', 'a', 'c', 'd']);
    expect(moverPasso(solto, 'b', 1).urls).toEqual(['a', 'c', 'b', 'd']);
    expect(moverPasso(solto, 'a', -1)).toBe(solto);
    const comPasta = criarPasta(solto, 'c', 'd', 'p1');
    expect(moverPasso(comPasta, 'c', -1).pastas[0]!.urls).toEqual(['c', 'd']);
    expect(moverPasso(comPasta, 'pasta:p1', -1).urls).toEqual(['a', 'd', 'c', 'b']);
  });

  it('RN-8: tirar um servidor da lista tira da pasta; urls repetidas em pastas ficam só na primeira', () => {
    const o = normalizarPastas(['a', 'c'], [
      { id: 'p1', nome: '', cor: '#7c6cff', aberta: false, urls: ['a', 'b', 'c'] },
      { id: 'p2', nome: '', cor: '#7c6cff', aberta: false, urls: ['c', 'x'] },
    ]);
    expect(o.pastas.map((p) => [p.id, p.urls])).toEqual([['p1', ['a', 'c']]]);
  });

  it('pastas do arquivo: id, nome e cor validados', () => {
    expect(mesclarPastas([{ id: 'p1', nome: '  Jogos  ', cor: '#000000', aberta: true, urls: ['a', 3] }, { id: '../x', urls: [] }, 'lixo'])).toEqual([
      { id: 'p1', nome: 'Jogos', cor: '#7c6cff', aberta: true, urls: ['a'] },
    ]);
  });
});
