import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decidirAbertura, lerLimites, limitesSeguros, opcoesDaJanela, TAMANHO_PADRAO } from './janelas-proprias';

/** video-teatro-cameras-e-sons, T1: o que o processo principal decide sobre a janela própria. */
const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

describe('abrir janela (A1)', () => {
  it('só about:blank com nome conhecido, pedido pela página do app', () => {
    expect(decidirAbertura({ url: 'about:blank', nome: 'tofalany-cameras', doFramePrincipal: true })).toBe('propria');
    expect(decidirAbertura({ url: 'about:blank', nome: 'tofalany-transmissao-12', doFramePrincipal: true })).toBe('propria');
    expect(decidirAbertura({ url: 'about:blank', nome: 'tofalany-cameras', doFramePrincipal: false })).toBe('negar');
    expect(decidirAbertura({ url: 'about:blank', nome: 'outra', doFramePrincipal: true })).toBe('negar');
    expect(decidirAbertura({ url: 'about:blank', nome: 'tofalany-transmissao-0', doFramePrincipal: true })).toBe('negar');
    expect(decidirAbertura({ url: 'about:blank', nome: 'tofalany-transmissao-1x', doFramePrincipal: true })).toBe('negar');
    expect(decidirAbertura({ url: 'https://exemplo.com', nome: 'tofalany-cameras', doFramePrincipal: true })).toBe('externo');
    expect(decidirAbertura({ url: 'file:///etc/hostname', nome: 'tofalany-cameras', doFramePrincipal: true })).toBe('negar');
  });

  it('a janela nasce sem a ponte, com as travas e título fixo (A2, A3, A10)', () => {
    const o = opcoesDaJanela('tofalany-transmissao-3', { x: 0, y: 0, width: 640, height: 400 });
    expect(o.title).toBe('ToFalany – Transmissão');
    expect(o.webPreferences).toMatchObject({ preload: undefined, contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false });
  });
});

describe('onde abrir (A5)', () => {
  const monitor1 = { x: 0, y: 0, width: 1920, height: 1040 };
  const monitor2 = { x: 1920, y: 0, width: 1280, height: 1000 };
  it('dentro de um monitor: fica', () => {
    expect(limitesSeguros({ x: 2000, y: 100, width: 800, height: 450 }, [monitor1, monitor2], monitor1)).toEqual({ x: 2000, y: 100, width: 800, height: 450 });
  });
  it('monitor que sumiu ou só 10 px à vista: centraliza no monitor da principal', () => {
    const fora = limitesSeguros({ x: 2000, y: 100, width: 800, height: 450 }, [monitor1], monitor1);
    expect(fora).toEqual({ x: 560, y: 295, width: 800, height: 450 });
    expect(limitesSeguros({ x: 1910, y: 100, width: 800, height: 450 }, [monitor1], monitor1).x).toBe(560);
  });
  it('sem posição ou com lixo: tamanho padrão no meio do monitor da principal', () => {
    expect(limitesSeguros(undefined, [monitor1], monitor1)).toEqual({
      x: (1920 - TAMANHO_PADRAO.width) / 2,
      y: (1040 - TAMANHO_PADRAO.height) / 2,
      ...TAMANHO_PADRAO,
    });
    expect(limitesSeguros({ x: NaN, y: 0, width: 1e9, height: -5 }, [monitor1], monitor1).width).toBeLessThanOrEqual(1920);
  });
});

describe('arquivo de posições (A4)', () => {
  it('só inteiros razoáveis por tipo; o resto é ignorado', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'tofalany-janelas-'));
    pastas.push(pasta);
    const arquivo = join(pasta, 'janelas-proprias.json');
    writeFileSync(
      arquivo,
      JSON.stringify({ cameras: { x: 10, y: 20, width: 640, height: 400 }, transmissao: { x: '1', y: 0, width: 10, height: 10 }, outra: {} }),
    );
    expect(lerLimites(arquivo)).toEqual({ cameras: { x: 10, y: 20, width: 640, height: 400 } });
    writeFileSync(arquivo, 'não é json');
    expect(lerLimites(arquivo)).toEqual({});
    expect(lerLimites(join(pasta, 'nao-existe.json'))).toEqual({});
  });
});
