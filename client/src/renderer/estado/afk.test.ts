import { describe, expect, it } from "vitest";
import { deveIrParaAfk } from "./afk";

const agora = 1_000_000_000;
const base = {
  afk: { canalId: 9, minutos: 15 },
  minhaVoz: 3,
  ociosoSegundos: 15 * 60,
  ultimaFalaMs: agora - 15 * 60_000,
  agora,
  camera: false,
  tela: false,
};

describe("deveIrParaAfk (mover-e-afk RN-7, RN-8)", () => {
  it("parado e calado pelo tempo escolhido: vai (CA-9; sozinho também, D-3)", () => {
    expect(deveIrParaAfk(base)).toBe(true);
  });
  it("mexendo no teclado ou no mouse: não vai", () => {
    expect(deveIrParaAfk({ ...base, ociosoSegundos: 15 * 60 - 1 })).toBe(false);
  });
  it("falou há pouco: não vai (CA-10)", () => {
    expect(deveIrParaAfk({ ...base, ultimaFalaMs: agora - 60_000 })).toBe(
      false,
    );
  });
  it("com câmera ou transmitindo a tela: não vai (CA-11)", () => {
    expect(deveIrParaAfk({ ...base, camera: true })).toBe(false);
    expect(deveIrParaAfk({ ...base, tela: true })).toBe(false);
  });
  it("sem AFK configurada, fora da voz ou já na AFK: não vai", () => {
    expect(deveIrParaAfk({ ...base, afk: null })).toBe(false);
    expect(deveIrParaAfk({ ...base, minhaVoz: null })).toBe(false);
    expect(deveIrParaAfk({ ...base, minhaVoz: 9 })).toBe(false);
  });
  it("respeita os minutos escolhidos", () => {
    const cinco = {
      ...base,
      afk: { canalId: 9, minutos: 5 },
      ociosoSegundos: 5 * 60,
      ultimaFalaMs: agora - 5 * 60_000,
    };
    expect(deveIrParaAfk(cinco)).toBe(true);
    expect(deveIrParaAfk({ ...base, afk: { canalId: 9, minutos: 30 } })).toBe(
      false,
    );
  });
});
