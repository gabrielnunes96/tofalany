import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...a: unknown[]) => unknown>();
let handlerTela: ((pedido: unknown, responder: (r: unknown) => void) => void) | undefined;
vi.mock('electron', () => ({
  desktopCapturer: { getSources: vi.fn() },
  ipcMain: { handle: (canal: string, fn: (...a: unknown[]) => unknown) => handlers.set(canal, fn), on: (canal: string, fn: (...a: unknown[]) => unknown) => handlers.set(canal, fn) },
  session: { defaultSession: { setDisplayMediaRequestHandler: (fn: typeof handlerTela) => (handlerTela = fn) } },
  webContents: { fromFrame: (frame: { janela: number }) => ({ id: frame.janela }) },
}));

const { registrarCaptura } = await import('./captura');

const som = { disponivel: vi.fn(() => true), ligar: vi.fn(() => true), desligar: vi.fn() };
const fonte = (id: string, name: string) => ({ id, name, thumbnail: { toDataURL: () => 'data:,' } });

describe('captura de tela (RF-26)', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registrarCaptura(vi.fn(async () => [fonte('screen:1', 'Tela 1'), fonte('window:2', 'Jogo')]) as never, som);
  });
  const pedirTela = (janela: number) => new Promise((r) => handlerTela!({ frame: { janela } }, r));

  it('lista telas e janelas; a escolha vale uma vez, só para a mesma janela', async () => {
    expect(await handlers.get('captura:fontes')!()).toEqual([
      { id: 'screen:1', nome: 'Tela 1', tipo: 'tela', miniatura: 'data:,' },
      { id: 'window:2', nome: 'Jogo', tipo: 'janela', miniatura: 'data:,' },
    ]);
    await handlers.get('captura:escolher')!({ sender: { id: 7 } }, { fonteId: 'window:2', audio: true });
    expect(await pedirTela(7)).toMatchObject({ video: { id: 'window:2' } });
    // Consumida: o próximo pedido não captura nada.
    expect(await pedirTela(7)).toEqual({});
    // Outra janela não usa a escolha.
    await handlers.get('captura:escolher')!({ sender: { id: 7 } }, { fonteId: 'screen:1' });
    expect(await pedirTela(8)).toEqual({});
  });

  it('recusa fonte que o seletor não mostrou; sem escolha não captura', async () => {
    await handlers.get('captura:fontes')!();
    expect(() => handlers.get('captura:escolher')!({ sender: { id: 7 } }, { fonteId: 'screen:99' })).toThrow('Fonte inválida.');
    expect(await pedirTela(7)).toEqual({});
  });

  it.runIf(process.platform === 'linux')('Linux (backlog v2, item 13): áudio pedido liga o microfone virtual; sem áudio, desliga', async () => {
    const disponivel = { returnValue: undefined as unknown };
    handlers.get('captura:som-disponivel')!(disponivel);
    expect(disponivel.returnValue).toBe(true);
    await handlers.get('captura:fontes')!();
    expect(await handlers.get('captura:escolher')!({ sender: { id: 7 } }, { fonteId: 'screen:1', audio: true })).toBe(true);
    expect(som.ligar).toHaveBeenCalledOnce();
    // No Linux o pedido de captura não leva o loopback (o som vai pelo microfone virtual).
    expect(await pedirTela(7)).toEqual({ video: expect.objectContaining({ id: 'screen:1' }) });
    expect(await handlers.get('captura:escolher')!({ sender: { id: 7 } }, { fonteId: 'screen:1', audio: false })).toBe(false);
    expect(som.desligar).toHaveBeenCalled();
    await handlers.get('captura:som-parar')!();
    expect(som.desligar).toHaveBeenCalledTimes(2);
  });

  it('a escolha vence em 15 s', async () => {
    vi.useFakeTimers();
    await handlers.get('captura:fontes')!();
    await handlers.get('captura:escolher')!({ sender: { id: 7 } }, { fonteId: 'screen:1' });
    vi.setSystemTime(Date.now() + 16_000);
    expect(await pedirTela(7)).toEqual({});
    vi.useRealTimers();
  });
});
