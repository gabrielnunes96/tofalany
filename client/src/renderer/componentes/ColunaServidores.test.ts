import { describe, expect, it } from 'vitest';
import { iniciais } from './ColunaServidores';

describe('iniciais do servidor (backlog v2, item 7)', () => {
  it('primeira e última palavra, sem "da/de/do"; uma palavra: duas letras; sem nome: o endereço', () => {
    expect(iniciais({ url: 'https://a.io', nome: 'Turma da Faculdade' })).toBe('TF');
    expect(iniciais({ url: 'https://a.io', nome: 'Família' })).toBe('FA');
    expect(iniciais({ url: 'https://a.io', nome: 'Os Amigos de Sempre' })).toBe('OS');
    expect(iniciais({ url: 'https://www.fala.io' })).toBe('FA');
  });
});
