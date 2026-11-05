import { describe, expect, it } from 'vitest';
import { conferirSenha, gerarHashSenha } from './senha.js';
import { criarLimitador } from './limitador.js';
import { iguaisSeguro } from './tokens.js';

describe('senha', () => {
  it('confere a senha certa e recusa a errada; hashes diferentes para a mesma senha', async () => {
    const a = await gerarHashSenha('minha-senha');
    const b = await gerarHashSenha('minha-senha');
    expect(a).not.toBe(b);
    expect(await conferirSenha('minha-senha', a)).toBe(true);
    expect(await conferirSenha('outra', a)).toBe(false);
    expect(await conferirSenha('minha-senha', 'lixo')).toBe(false);
  });
});

describe('limitador', () => {
  it('libera de novo depois da janela', () => {
    let agora = 0;
    const l = criarLimitador(2, 1000, () => agora);
    expect([l.permitir('ip'), l.permitir('ip'), l.permitir('ip')]).toEqual([true, true, false]);
    expect(l.permitir('outro')).toBe(true);
    agora = 1001;
    expect(l.permitir('ip')).toBe(true);
  });
});

describe('iguaisSeguro', () => {
  it('compara textos de tamanhos diferentes sem erro', () => {
    expect(iguaisSeguro('abc', 'abc')).toBe(true);
    expect(iguaisSeguro('abc', 'abcd')).toBe(false);
  });
});

describe('limitador (memória)', () => {
  it('esquece IPs sem tentativas recentes', () => {
    let agora = 0;
    const l = criarLimitador(5, 1000, () => agora);
    l.permitir('a');
    l.permitir('b');
    agora = 5000;
    l.permitir('c');
    expect(l.tamanho()).toBe(1);
  });
});
