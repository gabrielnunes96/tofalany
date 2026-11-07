import { describe, expect, it } from 'vitest';
import { acaoAoFechar } from './protocolo.js';

describe('acaoAoFechar', () => {
  it('a escolha nova vale; a antiga só quando a pessoa tinha desligado a bandeja; padrão: perguntar', () => {
    expect(acaoAoFechar({})).toBe('perguntar');
    expect(acaoAoFechar({ fecharParaBandeja: true })).toBe('perguntar');
    expect(acaoAoFechar({ fecharParaBandeja: false })).toBe('sair');
    expect(acaoAoFechar({ fecharParaBandeja: false, aoFechar: 'bandeja' })).toBe('bandeja');
    expect(acaoAoFechar({ aoFechar: 'sair' })).toBe('sair');
    expect(acaoAoFechar({ aoFechar: 'xyz' as never })).toBe('perguntar');
  });
});
