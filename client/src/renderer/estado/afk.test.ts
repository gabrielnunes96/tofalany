import { describe, expect, it } from 'vitest';
import { controlesAoTrocar, deveIrParaAfk } from './afk';

const agora = 1_000_000_000;
const base = { afk: { canalId: 9, minutos: 15 }, minhaVoz: 3, ociosoSegundos: 15 * 60, ultimaFalaMs: agora - 15 * 60_000, agora, camera: false, tela: false };

describe('deveIrParaAfk (mover-e-afk RN-7, RN-8)', () => {
  it('CA-9: parado e calado pelo tempo escolhido vai (sozinho também, D-3)', () => {
    expect(deveIrParaAfk(base)).toBe(true);
  });
  it('CA-11: mexendo no teclado ou no mouse não vai', () => {
    expect(deveIrParaAfk({ ...base, ociosoSegundos: 15 * 60 - 1 })).toBe(false);
  });
  it('CA-11: falou há pouco não vai', () => {
    expect(deveIrParaAfk({ ...base, ultimaFalaMs: agora - 60_000 })).toBe(false);
  });
  it('CA-10: com câmera ou transmitindo a tela não vai', () => {
    expect(deveIrParaAfk({ ...base, camera: true })).toBe(false);
    expect(deveIrParaAfk({ ...base, tela: true })).toBe(false);
  });
  it('CA-13: sem AFK configurada, fora da voz ou já na AFK não vai (nem sai)', () => {
    expect(deveIrParaAfk({ ...base, afk: null })).toBe(false);
    expect(deveIrParaAfk({ ...base, minhaVoz: null })).toBe(false);
    expect(deveIrParaAfk({ ...base, minhaVoz: 9 })).toBe(false);
  });
  it('respeita os minutos escolhidos', () => {
    expect(deveIrParaAfk({ ...base, afk: { canalId: 9, minutos: 5 }, ociosoSegundos: 5 * 60, ultimaFalaMs: agora - 5 * 60_000 })).toBe(true);
    expect(deveIrParaAfk({ ...base, afk: { canalId: 9, minutos: 30 } })).toBe(false);
  });
});

describe('controlesAoTrocar (mover-e-afk RN-9, RN-15)', () => {
  const aberto = { mudo: false, surdo: false, camera: true };
  it('CA-12: indo para a AFK fica mudo e sem câmera, guardando o mudo de antes', () => {
    expect(controlesAoTrocar(aberto, null, true)).toEqual({ controles: { mudo: true, surdo: false, camera: false }, mudoAntes: false });
  });
  it('CA-18: microfone ligado antes da AFK volta ligado na sala seguinte', () => {
    const naAfk = controlesAoTrocar(aberto, null, true);
    expect(controlesAoTrocar(naAfk.controles, naAfk.mudoAntes, false)).toEqual({ controles: { mudo: false, surdo: false, camera: false }, mudoAntes: null });
  });
  it('CA-18: mutada antes da AFK volta mutada', () => {
    const naAfk = controlesAoTrocar({ ...aberto, mudo: true }, null, true);
    expect(naAfk.mudoAntes).toBe(true);
    expect(controlesAoTrocar(naAfk.controles, naAfk.mudoAntes, false).controles.mudo).toBe(true);
  });
  it('de uma AFK para outra (a AFK mudou) não perde o mudo de antes', () => {
    expect(controlesAoTrocar({ mudo: true, camera: false }, false, true).mudoAntes).toBe(false);
  });
  it('CA-7: troca comum (mover) não mexe em mudo nem câmera', () => {
    const r = controlesAoTrocar(aberto, null, false);
    expect(r.controles).toBe(aberto);
    expect(r.mudoAntes).toBeNull();
  });
});
