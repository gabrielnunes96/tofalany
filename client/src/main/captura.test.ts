import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...a: unknown[]) => unknown>();
let handlerTela: ((pedido: unknown, responder: (r: unknown) => void) => void) | undefined;
const aoSairDoApp: (() => void)[] = [];
/** Portas criadas pelo principal (som-sistema-windows): a 1 fica no principal, a 2 vai para a janela. */
const portas: { port1: { postMessage: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }; port2: { close: ReturnType<typeof vi.fn> } }[] = [];
vi.mock('electron', () => ({
  app: { on: (evento: string, fn: () => void) => evento === 'will-quit' && aoSairDoApp.push(fn) },
  MessageChannelMain: class {
    port1 = { postMessage: vi.fn(), start: vi.fn(), close: vi.fn() };
    port2 = { close: vi.fn() };
    constructor() {
      portas.push(this);
    }
  },
  desktopCapturer: { getSources: vi.fn() },
  ipcMain: {
    handle: (canal: string, fn: (...a: unknown[]) => unknown) => handlers.set(canal, fn),
    on: (canal: string, fn: (...a: unknown[]) => unknown) => handlers.set(canal, fn),
  },
  session: { defaultSession: { setDisplayMediaRequestHandler: (fn: typeof handlerTela) => (handlerTela = fn) } },
  webContents: { fromFrame: (frame: { janela: number }) => ({ id: frame.janela }) },
  screen: { getAllDisplays: () => [{ id: 1, size: { width: 1920, height: 1080 }, scaleFactor: 1 }], getDisplayMatching: () => ({ id: 1 }) },
  BrowserWindow: { fromWebContents: () => ({ getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }) }) },
}));

const { registrarCaptura } = await import('./captura');

const som = { disponivel: vi.fn(() => true), ligar: vi.fn(() => true), desligar: vi.fn() };
const somWindows = { motivo: vi.fn((): 'windows-antigo' | 'sem-modulo' | undefined => undefined), ligar: vi.fn((_cb: (b: Buffer) => void) => true), desligar: vi.fn(), erro: vi.fn((): string | null => null), ativo: vi.fn(() => true) };
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
      { id: 'screen:1', nome: 'Tela 1', tipo: 'tela', miniatura: 'data:,', largura: 1920, altura: 1080 },
      { id: 'window:2', nome: 'Jogo', tipo: 'janela', miniatura: 'data:,', largura: 1920, altura: 1080 },
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
    expect(disponivel.returnValue).toEqual({ disponivel: true });
    await handlers.get('captura:fontes')!();
    expect(await handlers.get('captura:escolher')!({ sender: { id: 7 } }, { fonteId: 'screen:1', audio: true })).toBe('microfone-virtual');
    expect(som.ligar).toHaveBeenCalledOnce();
    // No Linux o pedido de captura não leva o loopback (o som vai pelo microfone virtual).
    expect(await pedirTela(7)).toEqual({ video: expect.objectContaining({ id: 'screen:1' }) });
    expect(await handlers.get('captura:escolher')!({ sender: { id: 7 } }, { fonteId: 'screen:1', audio: false })).toBe('nenhum');
    expect(som.desligar).toHaveBeenCalled();
    const antes = som.desligar.mock.calls.length;
    await handlers.get('captura:som-parar')!();
    expect(som.desligar).toHaveBeenCalledTimes(antes + 1);
  });

  it('a escolha vence em 15 s', async () => {
    vi.useFakeTimers();
    await handlers.get('captura:fontes')!();
    await handlers.get('captura:escolher')!({ sender: { id: 7 } }, { fonteId: 'screen:1' });
    vi.setSystemTime(Date.now() + 16_000);
    expect(await pedirTela(7)).toEqual({});
    vi.useRealTimers();
  });

  it('A7: as janelas próprias do app não aparecem para transmitir e não podem ser escolhidas', async () => {
    handlers.clear();
    registrarCaptura(vi.fn(async () => [fonte('screen:1', 'Tela 1'), fonte('window:9', 'ToFalany – Câmeras')]) as never, som, () => ['window:9']);
    const lista = (await handlers.get('captura:fontes')!()) as { id: string }[];
    expect(lista.map((f) => f.id)).toEqual(['screen:1']);
    expect(() => handlers.get('captura:escolher')!({ sender: { id: 7 } }, { fonteId: 'window:9' })).toThrow('Fonte inválida.');
  });

  describe('Windows (som-sistema-windows)', () => {
    const janela = () => {
      const eventos = new Map<string, () => void>();
      return { id: 7, postMessage: vi.fn(), once: (ev: string, fn: () => void) => eventos.set(ev, fn), eventos };
    };
    let api: { somAtivo: () => boolean };
    beforeEach(() => {
      handlers.clear();
      portas.length = 0;
      aoSairDoApp.length = 0;
      api = registrarCaptura(vi.fn(async () => [fonte('screen:1', 'Tela 1')]) as never, som, undefined, undefined, somWindows, 'win32');
    });

    it('CA-3/CA-7: disponibilidade com o motivo (Windows 10, módulo que não carrega)', () => {
      const r = { returnValue: undefined as unknown };
      handlers.get('captura:som-disponivel')!(r);
      expect(r.returnValue).toEqual({ disponivel: true });
      somWindows.motivo.mockReturnValueOnce('windows-antigo');
      handlers.get('captura:som-disponivel')!(r);
      expect(r.returnValue).toEqual({ disponivel: false, motivo: 'windows-antigo' });
      somWindows.motivo.mockReturnValueOnce('sem-modulo');
      handlers.get('captura:som-disponivel')!(r);
      expect(r.returnValue).toEqual({ disponivel: false, motivo: 'sem-modulo' });
    });

    it('CA-1: com som, liga a captura sem o app, entrega a porta só a quem pediu e o pedido de tela não leva o loopback', async () => {
      await handlers.get('captura:fontes')!();
      const j = janela();
      expect(await handlers.get('captura:escolher')!({ sender: j }, { fonteId: 'screen:1', audio: true })).toBe('porta');
      expect(somWindows.ligar).toHaveBeenCalledOnce();
      expect(j.postMessage).toHaveBeenCalledWith('captura:porta-som', null, [portas[0]!.port2]);
      // O PCM vai pela porta.
      somWindows.ligar.mock.calls[0]![0](Buffer.from([1, 2]));
      expect(portas[0]!.port1.postMessage).toHaveBeenCalledWith(Buffer.from([1, 2]));
      expect(await pedirTela(7)).toEqual({ video: expect.objectContaining({ id: 'screen:1' }) });
      expect(api.somAtivo()).toBe(true);
    });

    it('CA-4: falha ao começar → "falhou", nenhuma porta entregue', async () => {
      await handlers.get('captura:fontes')!();
      somWindows.ligar.mockReturnValueOnce(false);
      const j = janela();
      expect(await handlers.get('captura:escolher')!({ sender: j }, { fonteId: 'screen:1', audio: true })).toBe('falhou');
      expect(j.postMessage).not.toHaveBeenCalled();
    });

    it('CA-5/RN-7: para ao pedir, ao fechar ou cair a janela, ao sair do app e numa nova escolha', async () => {
      await handlers.get('captura:fontes')!();
      const j = janela();
      await handlers.get('captura:escolher')!({ sender: j }, { fonteId: 'screen:1', audio: true });
      somWindows.desligar.mockClear();
      await handlers.get('captura:som-parar')!({ sender: j });
      expect(somWindows.desligar).toHaveBeenCalled();
      expect(portas[0]!.port1.close).toHaveBeenCalled();
      for (const gatilho of [() => j.eventos.get('destroyed')!(), () => j.eventos.get('render-process-gone')!(), () => aoSairDoApp[0]!()]) {
        await handlers.get('captura:escolher')!({ sender: j }, { fonteId: 'screen:1', audio: true });
        somWindows.desligar.mockClear();
        gatilho();
        expect(somWindows.desligar).toHaveBeenCalled();
      }
      await handlers.get('captura:escolher')!({ sender: j }, { fonteId: 'screen:1', audio: true });
      somWindows.desligar.mockClear();
      await handlers.get('captura:escolher')!({ sender: j }, { fonteId: 'screen:1', audio: false });
      expect(somWindows.desligar).toHaveBeenCalled();
    });

    it('RN-4: a captura caiu no meio → avisa pela porta e para', async () => {
      vi.useFakeTimers();
      await handlers.get('captura:fontes')!();
      await handlers.get('captura:escolher')!({ sender: janela() }, { fonteId: 'screen:1', audio: true });
      somWindows.erro.mockReturnValueOnce('device invalidated');
      somWindows.desligar.mockClear();
      vi.advanceTimersByTime(2100);
      expect(portas[0]!.port1.postMessage).toHaveBeenCalledWith({ erro: 'captura-caiu' });
      expect(somWindows.desligar).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
