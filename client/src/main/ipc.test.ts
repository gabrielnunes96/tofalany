import { describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...a: unknown[]) => unknown>();
vi.mock('electron', () => ({
  clipboard: { writeText: vi.fn() },
  ipcMain: { handle: (canal: string, fn: (...a: unknown[]) => unknown) => handlers.set(canal, fn) },
}));
const { registrarIpc } = await import('./ipc');

/** video-teatro-cameras-e-sons, A3: sessão, arquivos e configurações só para a página do app. */
describe('IPC sensível só do frame principal da janela principal', () => {
  it('outra janela (ou frame) é recusada; a página do app passa', async () => {
    const principal = { frame: 'principal' };
    const sessao = { ler: vi.fn(() => ({ token: 't' })), gravar: vi.fn(), apagar: vi.fn() };
    const config = { ler: vi.fn(() => ({})), gravar: vi.fn(() => ({})) };
    const arquivos = { baixar: vi.fn(), abrir: vi.fn() };
    registrarIpc(
      config as never,
      sessao as never,
      () => undefined,
      arquivos as never,
      { mostrar: vi.fn() } as never,
      undefined,
      (e) => e.senderFrame === (principal as never),
    );
    const de = (frame: unknown) => ({ senderFrame: frame });
    for (const canal of ['sessao:ler', 'sessao:gravar', 'sessao:apagar', 'config:gravar', 'arquivo:abrir', 'arquivo:baixar']) {
      expect(() => handlers.get(canal)!(de({ frame: 'filha' }), 'x', 'y'), canal).toThrow('Pedido recusado.');
    }
    expect(sessao.ler).not.toHaveBeenCalled();
    expect(handlers.get('sessao:ler')!(de(principal), 'http://s')).toEqual({ token: 't' });
  });
});
