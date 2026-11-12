import { describe, expect, it } from 'vitest';
import { acaoAoFechar, qualidadesPermitidas, QUALIDADES_TELA } from './protocolo.js';
import { temaPermitido } from './loja.js';

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

describe('qualidadesPermitidas (pontos-e-loja, RN-9/RN-10)', () => {
  it('membro: só 720p30; administrador: todas', () => {
    expect(qualidadesPermitidas('membro')).toEqual(['720p30']);
    expect(qualidadesPermitidas('admin')).toEqual(QUALIDADES_TELA);
  });
  it('CA-18: "Transmitir em 1080p" libera 720p60, 1080p30 e 1080p60; 2K continua à parte', () => {
    expect(qualidadesPermitidas('membro', new Set(['transmitir_1080p']))).toEqual(['720p30', '720p60', '1080p30', '1080p60']);
    expect(qualidadesPermitidas('membro', new Set(['transmitir_1440p']))).toEqual(['720p30', '1440p60']);
  });
  it('vales somam ao cargo', () => {
    expect(qualidadesPermitidas('membro', new Set(), ['1080p30'])).toEqual(['720p30', '1080p30']);
    expect(qualidadesPermitidas('membro', new Set(['transmitir_1440p']), ['720p60'])).toEqual(['720p30', '720p60', '1440p60']);
  });
});

describe('temaPermitido (pontos-e-loja, R-8)', () => {
  it('grátis sempre; de loja só comprado, com tudo liberado; sem loja no servidor, não', () => {
    expect(temaPermitido('aurora', null)).toBe(true);
    expect(temaPermitido('gibi', { temas: ['gibi'], tudoLiberado: false })).toBe(true);
    expect(temaPermitido('cinzas', { temas: ['gibi'], tudoLiberado: false })).toBe(false);
    expect(temaPermitido('cinzas', { temas: [], tudoLiberado: true })).toBe(true);
    expect(temaPermitido('cinzas', undefined)).toBe(false);
  });
});
