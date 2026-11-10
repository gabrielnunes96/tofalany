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

describe('novidades da versão', () => {
  it('mostra uma vez a quem já usava; instalação nova só guarda; versão sem notas só guarda', async () => {
    const { decidirNovidades, NOVIDADES } = await import('./novidades.js');
    expect(decidirNovidades('0.14.0', '0.13.0', true).mostrar).toBe(NOVIDADES['0.14.0']);
    expect(decidirNovidades('0.14.0', undefined, true).mostrar).toBe(NOVIDADES['0.14.0']);
    expect(decidirNovidades('0.14.0', '0.14.0', true)).toEqual({ mostrar: null, gravar: null });
    expect(decidirNovidades('0.14.0', undefined, false)).toEqual({ mostrar: null, gravar: '0.14.0' });
    expect(decidirNovidades('9.9.9', '0.14.0', true)).toEqual({ mostrar: null, gravar: '9.9.9' });
    // Sem emoji nas notas.
    for (const notas of Object.values(NOVIDADES)) for (const i of notas.itens) expect(`${i.titulo} ${i.texto}`).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
