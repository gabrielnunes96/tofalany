import { describe, expect, it } from 'vitest';
import { ATALHOS_PADRAO, conflitoAtalho, mesclarAtalhos, textoAtalho, type Atalho } from './atalhos.js';

const a = (codigo: string, mods: Partial<Atalho> = {}): Atalho => ({ codigo, ctrl: false, alt: false, shift: false, meta: false, ...mods });

describe('atalhos (RF-15)', () => {
  it('texto legível', () => {
    expect(textoAtalho(ATALHOS_PADRAO.mudo)).toBe('Ctrl+Shift+M');
    expect(textoAtalho(a('Space'))).toBe('Espaço');
    expect(textoAtalho(a('F13', { alt: true, meta: true }))).toBe('Alt+Super+F13');
    expect(textoAtalho(null)).toBe('Nenhum');
  });

  it('CA-23: mesmo atalho em duas ações é conflito', () => {
    expect(conflitoAtalho(ATALHOS_PADRAO, 'ptt', a('KeyM', { ctrl: true, shift: true }))).toBe('mudo');
    expect(conflitoAtalho(ATALHOS_PADRAO, 'mudo', a('KeyM', { ctrl: true, shift: true }))).toBeNull();
    expect(conflitoAtalho(ATALHOS_PADRAO, 'ptt', a('KeyM'))).toBeNull();
    expect(conflitoAtalho(ATALHOS_PADRAO, 'ptt', null)).toBeNull();
  });

  it('mescla só atalhos válidos e sem conflito', () => {
    const r = mesclarAtalhos(ATALHOS_PADRAO, {
      ptt: a('Backquote'),
      surdo: a('KeyM', { ctrl: true, shift: true }),
      mudo: { codigo: 'ShiftLeft', ctrl: false, alt: false, shift: true, meta: false },
    });
    expect(r).toEqual({ ...ATALHOS_PADRAO, ptt: a('Backquote') });
    expect(mesclarAtalhos(ATALHOS_PADRAO, { mudo: null }).mudo).toBeNull();
    // Do disco: PTT com a combinação que era do mute, e o mute já trocado — nada se perde ao reabrir.
    const disco = { ptt: a('KeyM', { ctrl: true, shift: true }), mudo: a('F9'), surdo: ATALHOS_PADRAO.surdo };
    expect(mesclarAtalhos(ATALHOS_PADRAO, disco)).toEqual(disco);
    expect(mesclarAtalhos(ATALHOS_PADRAO, { mudo: null, ptt: a('KeyM', { ctrl: true, shift: true }) })).toMatchObject({ mudo: null, ptt: a('KeyM', { ctrl: true, shift: true }) });
    // Conflito dentro do próprio pedido: a primeira ação alterada cede e volta ao valor anterior (aqui, nenhum).
    expect(mesclarAtalhos(ATALHOS_PADRAO, { ptt: a('F9'), mudo: a('F9') })).toEqual({ ...ATALHOS_PADRAO, ptt: null, mudo: a('F9') });
    expect(mesclarAtalhos(ATALHOS_PADRAO, { ptt: { codigo: 'constructor', ctrl: false, alt: false, shift: false, meta: false } })).toEqual(ATALHOS_PADRAO);
    expect(mesclarAtalhos(ATALHOS_PADRAO, { ptt: { codigo: 'KeyA', ctrl: 'sim' } })).toEqual(ATALHOS_PADRAO);
  });
});
