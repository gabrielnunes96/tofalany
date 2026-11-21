import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ipc = vi.hoisted(() => new Map<string, (...a: unknown[]) => unknown>());
const atualizador = vi.hoisted(() => ({ atual: null as null | (EventEmitter & { checkForUpdates: ReturnType<typeof vi.fn> }) }));
const eletron = vi.hoisted(() => ({ empacotado: false }));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return eletron.empacotado;
    },
    on: () => undefined,
  },
  ipcMain: { handle: (canal: string, fn: (...a: unknown[]) => unknown) => ipc.set(canal, fn) },
  shell: { openExternal: async () => undefined },
}));
vi.mock('electron-updater', () => ({
  get autoUpdater() {
    return atualizador.atual;
  },
}));
vi.mock('./espera-atualizacao', () => ({ abrirEsperaAtualizacao: () => undefined }));
vi.mock('./bandeja', () => ({ caminhoIcone: () => '' }));

const { podeAtualizarSozinho, iniciarAtualizacao } = await import('./atualizacao');

describe('podeAtualizarSozinho (backlog v2, item 1d)', () => {
  it('Windows, AppImage e .deb se atualizam sozinhos; outros pacotes só avisam', () => {
    expect(podeAtualizarSozinho('win32', undefined)).toBe(true);
    expect(podeAtualizarSozinho('linux', '/home/x/ToFalany.AppImage')).toBe(true);
    expect(podeAtualizarSozinho('linux', undefined, 'deb')).toBe(true);
    expect(podeAtualizarSozinho('linux', undefined, 'rpm')).toBe(false);
    expect(podeAtualizarSozinho('linux', undefined)).toBe(false);
  });
});

const plataformaOriginal = Object.getOwnPropertyDescriptor(process, 'platform')!;
const plataforma = (p: NodeJS.Platform) => Object.defineProperty(process, 'platform', { ...plataformaOriginal, value: p });

describe('Atualizar o app na hora (qualidade-de-vida, RF-5, T-6)', () => {
  let enviados: [string, unknown][];
  const quadro = {};
  const evento = { senderFrame: quadro };
  const janela = () => ({ isDestroyed: () => false, webContents: { mainFrame: quadro, send: (canal: string, v: unknown) => enviados.push([canal, v]) } });

  beforeEach(() => {
    vi.useFakeTimers();
    ipc.clear();
    enviados = [];
    eletron.empacotado = true;
    plataforma('win32');
    const u = Object.assign(new EventEmitter(), { checkForUpdates: vi.fn() });
    atualizador.atual = u;
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(process, 'platform', plataformaOriginal);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('CA-10: fora do app instalado, "indisponível"', async () => {
    eletron.empacotado = false;
    iniciarAtualizacao(janela as never);
    expect(await ipc.get('atualizacao:agora')!(evento)).toEqual({ situacao: 'indisponivel' });
  });

  it('CA-9: já na mais nova, "atualizado" e sem pedido pendente', async () => {
    iniciarAtualizacao(janela as never);
    atualizador.atual!.checkForUpdates.mockResolvedValue({ isUpdateAvailable: false });
    expect(await ipc.get('atualizacao:agora')!(evento)).toEqual({ situacao: 'atualizado' });
    atualizador.atual!.emit('download-progress', { percent: 50 });
    expect(enviados).toEqual([]);
  });

  it('CA-8: baixando, o progresso vai para a janela; pronta chega com pedido; recusar volta o aviso', async () => {
    iniciarAtualizacao(janela as never);
    atualizador.atual!.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '0.18.0' } });
    expect(await ipc.get('atualizacao:agora')!(evento)).toEqual({ situacao: 'baixando', versao: '0.18.0' });
    atualizador.atual!.emit('download-progress', { percent: 41.6 });
    atualizador.atual!.emit('update-downloaded', { version: '0.18.0' });
    expect(enviados).toEqual([
      ['atualizacao:progresso', 42],
      ['atualizacao:estado', { versao: '0.18.0', modo: 'reiniciar', pedido: true }],
    ]);
    await ipc.get('atualizacao:recusar')!(evento);
    expect(enviados.at(-1)).toEqual(['atualizacao:estado', { versao: '0.18.0', modo: 'reiniciar', pedido: false }]);
  });

  it('versão já baixada: "Atualizar o app" a entrega de novo com pedido', async () => {
    iniciarAtualizacao(janela as never);
    atualizador.atual!.emit('update-downloaded', { version: '0.18.0' });
    expect(await ipc.get('atualizacao:agora')!(evento)).toEqual({ situacao: 'pronta', versao: '0.18.0' });
    expect(enviados.at(-1)).toEqual(['atualizacao:estado', { versao: '0.18.0', modo: 'reiniciar', pedido: true }]);
  });

  it('download que falha: a janela fica sabendo e o log recebe um motivo fixo', async () => {
    const registrar = vi.fn();
    iniciarAtualizacao(janela as never, registrar);
    let falhar: (e: Error) => void = () => undefined;
    const downloadPromise = new Promise((_r, rej) => (falhar = rej));
    atualizador.atual!.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '0.18.0' }, downloadPromise });
    await ipc.get('atualizacao:agora')!(evento);
    falhar(new Error('rede caiu em https://x'));
    await vi.waitFor(() => expect(enviados.at(-1)).toEqual(['atualizacao:falhou', null]));
    expect(registrar).toHaveBeenCalledWith('atualizacao', 'download: erro');
  });

  it('erro de uma conferência (automática ou não) não cancela o pedido nem avisa a janela', async () => {
    iniciarAtualizacao(janela as never);
    atualizador.atual!.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '0.18.0' }, downloadPromise: new Promise(() => undefined) });
    await ipc.get('atualizacao:agora')!(evento);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    atualizador.atual!.emit('error', new Error('soluço de rede'));
    atualizador.atual!.emit('download-progress', { percent: 80 });
    expect(enviados).toEqual([['atualizacao:progresso', 80]]);
  });

  it('procura que falha: devolve "erro" e o log diz que foi a procura', async () => {
    const registrar = vi.fn();
    iniciarAtualizacao(janela as never, registrar);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    atualizador.atual!.checkForUpdates.mockImplementation(async () => {
      // Como a biblioteca: emite 'error' antes de rejeitar.
      atualizador.atual!.emit('error', new Error('sem rede'));
      throw new Error('sem rede');
    });
    expect(await ipc.get('atualizacao:agora')!(evento)).toEqual({ situacao: 'erro' });
    expect(enviados).toEqual([]);
    expect(registrar.mock.calls).toEqual([['atualizacao', 'procura: erro']]);
  });

  it('pacote que não se instala sozinho: "nova"; o estado vai com pedido e depois sem (a página abriu; o aviso do canto volta a valer)', async () => {
    plataforma('linux');
    vi.stubEnv('APPIMAGE', '');
    iniciarAtualizacao(janela as never);
    atualizador.atual!.checkForUpdates.mockImplementation(async () => {
      atualizador.atual!.emit('update-available', { version: '0.18.0' });
      return { isUpdateAvailable: true, updateInfo: { version: '0.18.0' } };
    });
    expect(await ipc.get('atualizacao:agora')!(evento)).toEqual({ situacao: 'nova', versao: '0.18.0' });
    expect(enviados).toEqual([
      ['atualizacao:estado', { versao: '0.18.0', modo: 'pagina', pedido: true }],
      ['atualizacao:estado', { versao: '0.18.0', modo: 'pagina', pedido: false }],
    ]);
  });

  it('segurança: pedido de outro quadro (não a janela principal) é ignorado', async () => {
    iniciarAtualizacao(janela as never);
    atualizador.atual!.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '0.18.0' } });
    expect(await ipc.get('atualizacao:agora')!({ senderFrame: {} })).toEqual({ situacao: 'erro' });
    expect(atualizador.atual!.checkForUpdates).not.toHaveBeenCalled();
  });

  it('a marca de pedido vale só para a versão entregue: a próxima vem sem ela', async () => {
    iniciarAtualizacao(janela as never);
    atualizador.atual!.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: { version: '0.18.0' } });
    await ipc.get('atualizacao:agora')!(evento);
    atualizador.atual!.emit('update-downloaded', { version: '0.18.0' });
    atualizador.atual!.emit('update-downloaded', { version: '0.18.1' });
    expect(enviados.at(-1)).toEqual(['atualizacao:estado', { versao: '0.18.1', modo: 'reiniciar' }]);
  });
});
