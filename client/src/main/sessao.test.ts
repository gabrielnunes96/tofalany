import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { criarArmazemSessao, type Cifra } from './sessao';

const pastas: string[] = [];
const arquivoTemp = () => {
  const pasta = mkdtempSync(join(tmpdir(), 'tofalando-sessao-'));
  pastas.push(pasta);
  return join(pasta, 'sessao.json');
};
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});
const cifraFalsa = (disponivel: boolean): Cifra => ({
  disponivel: () => disponivel,
  cifrar: (t) => Buffer.from(`X${Buffer.from(t).toString('hex')}`),
  decifrar: (d) => Buffer.from(d.toString().slice(1), 'hex').toString(),
});
const sessao = { servidorUrl: 'http://s:3000', token: 'token-secreto' };

describe('criarArmazemSessao', () => {
  it('grava cifrado, relê e não deixa o token em texto no disco', () => {
    const arquivo = arquivoTemp();
    const armazem = criarArmazemSessao(arquivo, cifraFalsa(true));
    armazem.gravar(sessao);
    expect(criarArmazemSessao(arquivo, cifraFalsa(true)).ler()).toEqual(sessao);
    expect(readFileSync(arquivo, 'utf8')).not.toContain('token-secreto');
    expect(statSync(arquivo).mode & 0o777).toBe(0o600);
  });

  it('mantém permissão 600 mesmo com um .tmp antigo aberto a todos', () => {
    const arquivo = arquivoTemp();
    writeFileSync(`${arquivo}.tmp`, 'sobra', { mode: 0o666 });
    criarArmazemSessao(arquivo, cifraFalsa(true)).gravar(sessao);
    expect(statSync(arquivo).mode & 0o777).toBe(0o600);
  });

  it('sem cofre do sistema, ainda funciona (arquivo com permissão 600)', () => {
    const arquivo = arquivoTemp();
    criarArmazemSessao(arquivo, cifraFalsa(false)).gravar(sessao);
    expect(criarArmazemSessao(arquivo, cifraFalsa(false)).ler()).toEqual(sessao);
  });

  it('apagar e arquivo inexistente ou corrompido dão null', () => {
    const arquivo = arquivoTemp();
    const armazem = criarArmazemSessao(arquivo, cifraFalsa(true));
    expect(armazem.ler()).toBeNull();
    armazem.gravar(sessao);
    armazem.apagar();
    expect(armazem.ler()).toBeNull();
  });

  it('recusa gravar sessão inválida', () => {
    expect(() => criarArmazemSessao(arquivoTemp(), cifraFalsa(true)).gravar({ servidorUrl: 'x', token: '' })).toThrow();
  });
});
