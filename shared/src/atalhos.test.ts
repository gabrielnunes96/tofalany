import { describe, expect, it } from 'vitest';
import { ATALHOS_PADRAO, ATALHOS_SONS_PADRAO, chaveAtalho, combosSons, conflitoAtalho, conflitoAtalhoSom, limparOrfaos, mesclarAtalhos, mesclarAtalhosSons, resolverAtalhoSom, textoAtalho, type Atalho, type AtalhosSons } from './atalhos.js';

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

describe('atalhos de sons (atalhos-de-sons)', () => {
  const f = (codigo: string, mods: Partial<Atalho> = {}): Atalho => ({ codigo, ctrl: false, alt: false, shift: false, meta: false, ...mods });
  const sons: AtalhosSons = { globais: { '7': f('F2') }, porServidor: { 'https://a': { '1': f('F1') }, 'https://b': { '9': f('F3') } } };

  it('CA-1: conflita com a voz, com outro som do servidor e com "Meus sons"; em outro servidor, não', () => {
    expect(conflitoAtalhoSom({ ...ATALHOS_PADRAO, ptt: f('F4') }, sons, 'https://a', { somId: 2 }, f('F4'))).toBe('Push-to-talk');
    expect(conflitoAtalhoSom(ATALHOS_PADRAO, sons, 'https://a', { somId: 2 }, f('F1'))).toBe('outro som');
    expect(conflitoAtalhoSom(ATALHOS_PADRAO, sons, 'https://a', { somId: 2 }, f('F2'))).toBe('outro som');
    expect(conflitoAtalhoSom(ATALHOS_PADRAO, sons, 'https://a', { audioId: 8 }, f('F1'))).toBe('outro som');
    // O próprio som pode regravar o mesmo atalho; F3 é de outro servidor (RN-4).
    expect(conflitoAtalhoSom(ATALHOS_PADRAO, sons, 'https://a', { somId: 1 }, f('F1'))).toBeNull();
    expect(conflitoAtalhoSom(ATALHOS_PADRAO, sons, 'https://a', { somId: 2 }, f('F3'))).toBeNull();
  });

  it('CA-4: resolve primeiro o som do servidor, depois "Meus sons" (que valem em qualquer servidor)', () => {
    expect(resolverAtalhoSom(sons, 'https://a', 'F1')).toEqual({ somId: 1 });
    expect(resolverAtalhoSom(sons, 'https://b', 'F2')).toEqual({ audioId: 7 });
    expect(resolverAtalhoSom(sons, 'https://b', 'F1')).toBeNull();
    expect(combosSons(sons).map(chaveAtalho).sort()).toEqual(['F1', 'F2', 'F3']);
  });

  it('CA-5: som apagado e áudio fora de "Meus sons" perdem o atalho; sem mudança, o mesmo objeto', () => {
    expect(limparOrfaos(sons, 'https://a', [1, 2], [7])).toBe(sons);
    expect(limparOrfaos(sons, 'https://a', [2], null).porServidor['https://a']).toBeUndefined();
    expect(limparOrfaos(sons, 'https://a', null, []).globais).toEqual({});
  });

  it('mescla só ids e atalhos válidos, com tetos', () => {
    const bruto = { globais: { '7': f('F2'), x: f('F5'), '8': { codigo: 'Nada' } }, porServidor: { 'https://a': { '1': f('F1') }, 'https://c': {} } };
    expect(mesclarAtalhosSons(bruto)).toEqual({ globais: { '7': f('F2') }, porServidor: { 'https://a': { '1': f('F1') } } });
    const muitos = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [String(i + 1), f('F1')]));
    expect(Object.keys(mesclarAtalhosSons({ globais: muitos }).globais)).toHaveLength(50);
    expect(mesclarAtalhosSons('lixo')).toEqual(ATALHOS_SONS_PADRAO);
  });
});
