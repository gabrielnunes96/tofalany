import { describe, expect, it, vi } from 'vitest';
import { hostsParecidos, procurarEnderecoAntigo } from './endereco-antigo';

const lista = [
  { url: 'https://1-2-3-4.sslip.io', nome: 'Turma' },
  { url: 'https://1-2-3-4.sslip.io/c/2', nome: 'Família' },
  { url: 'https://5-6-7-8.sslip.io', nome: 'Turma' },
  { url: 'https://5-6-7-8.sslip.io/c/2', nome: 'Família' },
  { url: 'https://outro.exemplo.com', nome: 'Jogos' },
];

describe('hostsParecidos (item 41)', () => {
  it('acha o host com o mesmo nome e o mesmo /c/<id>', () => {
    expect(hostsParecidos(lista, 'https://5-6-7-8.sslip.io')).toEqual(['1-2-3-4.sslip.io']);
    expect(hostsParecidos(lista, 'https://5-6-7-8.sslip.io/c/2')).toEqual(['1-2-3-4.sslip.io']);
  });

  it('não compara servidores diferentes da mesma instalação nem nomes diferentes', () => {
    const outra = [
      { url: 'https://a.io', nome: 'Turma' },
      { url: 'https://b.io/c/2', nome: 'Turma' },
      { url: 'https://c.io', nome: 'Outra' },
    ];
    expect(hostsParecidos(outra, 'https://a.io')).toEqual([]);
  });

  it('sem nome (ainda não carregou) não compara', () => {
    expect(hostsParecidos([{ url: 'https://a.io' }, { url: 'https://b.io' }], 'https://a.io')).toEqual([]);
  });
});

describe('procurarEnderecoAntigo (item 41)', () => {
  it('devolve todos os servidores do host que não responde, testando a base dele', async () => {
    const responde = vi.fn(async (url: string) => !url.includes('1-2-3-4'));
    expect(await procurarEnderecoAntigo(lista, 'https://5-6-7-8.sslip.io/c/2', responde)).toEqual({
      host: '1-2-3-4.sslip.io',
      urls: ['https://1-2-3-4.sslip.io', 'https://1-2-3-4.sslip.io/c/2'],
    });
    expect(responde).toHaveBeenCalledWith('https://1-2-3-4.sslip.io');
  });

  it('host que responde (dois servidores no ar com o mesmo nome) não é tirado', async () => {
    expect(await procurarEnderecoAntigo(lista, 'https://5-6-7-8.sslip.io', async () => true)).toBeNull();
  });

  it('falha no teste conta como não responder; host ignorado (a pessoa quis manter) não é testado', async () => {
    const quebra = async () => {
      throw new Error('rede');
    };
    expect(await procurarEnderecoAntigo(lista, 'https://5-6-7-8.sslip.io', quebra)).not.toBeNull();
    const responde = vi.fn(async () => false);
    expect(await procurarEnderecoAntigo(lista, 'https://5-6-7-8.sslip.io', responde, new Set(['1-2-3-4.sslip.io']))).toBeNull();
    expect(responde).not.toHaveBeenCalled();
  });
});
