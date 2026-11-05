import { describe, expect, it, vi } from 'vitest';
import { UiohookKey } from 'uiohook-napi';
import { ATALHOS_PADRAO, type Atalhos } from '@tofalando/shared';
import { criarAtalhos, type ModuloGancho, type TeclaNativa } from './atalhos';

function ganchoFalso() {
  const fns: Record<string, (e: TeclaNativa) => void> = {};
  const uIOhook = { on: vi.fn((e: string, fn: (e: TeclaNativa) => void) => (fns[e] = fn)), start: vi.fn(), stop: vi.fn() };
  const modulo = { uIOhook, UiohookKey: UiohookKey as unknown as Record<string, number> } satisfies ModuloGancho;
  const tecla = (tipo: 'keydown' | 'keyup', keycode: number, mods: Partial<TeclaNativa> = {}) =>
    fns[tipo]!({ keycode, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
  return { modulo, uIOhook, tecla, carregar: vi.fn(async () => modulo) };
}

const comPtt: Atalhos = { ...ATALHOS_PADRAO, ptt: { codigo: 'Backquote', ctrl: false, alt: false, shift: false, meta: false } };

describe('atalhos globais (RF-15)', () => {
  it('PTT pelo gancho nativo: aperto e soltura; repetição não duplica; mods precisam bater', async () => {
    const { uIOhook, tecla, carregar } = ganchoFalso();
    const enviar = vi.fn();
    const atalhos = criarAtalhos(enviar, carregar);
    atalhos.definir(comPtt);
    await atalhos.pronto();
    expect(uIOhook.start).toHaveBeenCalledTimes(1);
    tecla('keydown', UiohookKey.Backquote);
    tecla('keydown', UiohookKey.Backquote);
    tecla('keyup', UiohookKey.Backquote);
    expect(enviar.mock.calls).toEqual([[{ acao: 'ptt', pressionado: true }], [{ acao: 'ptt', pressionado: false }]]);

    enviar.mockClear();
    tecla('keydown', UiohookKey.M, { ctrlKey: true });
    expect(enviar).not.toHaveBeenCalled();
    tecla('keydown', UiohookKey.M, { ctrlKey: true, shiftKey: true });
    tecla('keyup', UiohookKey.M, { ctrlKey: true });
    expect(enviar.mock.calls).toEqual([[{ acao: 'mudo', pressionado: true }], [{ acao: 'mudo', pressionado: false }]]);
  });

  it('CA-23: atalho trocado — o antigo não faz nada; trocar solta; gravar os mesmos atalhos não solta', async () => {
    const { carregar } = ganchoFalso();
    const enviar = vi.fn();
    const atalhos = criarAtalhos(enviar, carregar);
    atalhos.definir(comPtt);
    atalhos.tratarCodigo('down', 'Backquote');
    atalhos.definir({ ...comPtt });
    expect(enviar).toHaveBeenLastCalledWith({ acao: 'ptt', pressionado: true });
    atalhos.definir({ ...comPtt, ptt: { codigo: 'F8', ctrl: false, alt: false, shift: false, meta: false } });
    expect(enviar).toHaveBeenLastCalledWith({ acao: 'ptt', pressionado: false });
    enviar.mockClear();
    atalhos.tratarCodigo('down', 'Backquote');
    expect(enviar).not.toHaveBeenCalled();
    atalhos.tratarCodigo('down', 'F8');
    expect(enviar).toHaveBeenCalledWith({ acao: 'ptt', pressionado: true });
    await atalhos.pronto();
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it('pausa durante a captura: solta o que estava apertado e ignora teclas', () => {
    const { carregar } = ganchoFalso();
    const enviar = vi.fn();
    const atalhos = criarAtalhos(enviar, carregar);
    atalhos.definir(comPtt);
    atalhos.tratarCodigo('down', 'Backquote');
    atalhos.pausar(true);
    expect(enviar).toHaveBeenLastCalledWith({ acao: 'ptt', pressionado: false });
    enviar.mockClear();
    atalhos.tratarCodigo('down', 'KeyM', { ctrl: true, shift: true });
    expect(enviar).not.toHaveBeenCalled();
    atalhos.pausar(false);
    atalhos.tratarCodigo('down', 'KeyM', { ctrl: true, shift: true });
    expect(enviar).toHaveBeenCalledWith({ acao: 'mudo', pressionado: true });
  });

  it('sem atalho não carrega o gancho; binário que não carrega ou start que falha é avisado sem derrubar', async () => {
    const { carregar } = ganchoFalso();
    criarAtalhos(vi.fn(), carregar).definir({ ptt: null, mudo: null, surdo: null });
    expect(carregar).not.toHaveBeenCalled();

    const aoFalhar = vi.fn();
    const semBinario = criarAtalhos(vi.fn(), async () => Promise.reject(new Error('sem binário')), aoFalhar);
    semBinario.definir(comPtt);
    await semBinario.pronto();
    expect(aoFalhar).toHaveBeenCalledTimes(1);

    const falso = ganchoFalso();
    falso.uIOhook.start.mockImplementation(() => {
      throw new Error('sem X');
    });
    const semX = criarAtalhos(vi.fn(), falso.carregar, aoFalhar);
    semX.definir(comPtt);
    await semX.pronto();
    expect(aoFalhar).toHaveBeenCalledTimes(2);
  });
});
