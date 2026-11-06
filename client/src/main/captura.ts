import { desktopCapturer, ipcMain, session, webContents, type DesktopCapturerSource } from 'electron';

/** A escolha do seletor vale só para a captura logo em seguida. */
const VALIDADE_ESCOLHA_MS = 15_000;

/** Fonte que o seletor próprio mostra (RF-26). */
export interface FonteCaptura {
  id: string;
  nome: string;
  tipo: 'tela' | 'janela';
  /** Miniatura como data URL (PNG). */
  miniatura: string;
}

/**
 * RF-26: o renderer lista as fontes com miniaturas, a pessoa escolhe, e o pedido de captura
 * (getDisplayMedia, feito pelo LiveKit) recebe exatamente a fonte escolhida.
 * RF-29: áudio do sistema só no Windows (loopback); no Linux não há.
 */
export function registrarCaptura(listar: typeof desktopCapturer.getSources = (o) => desktopCapturer.getSources(o)) {
  let escolhida: { fonteId: string; audio: boolean; janelaId: number; em: number } | undefined;
  let ultimas: DesktopCapturerSource[] = [];

  ipcMain.handle('captura:fontes', async (): Promise<FonteCaptura[]> => {
    ultimas = await listar({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false });
    return ultimas.map((f) => ({ id: f.id, nome: f.name, tipo: f.id.startsWith('screen:') ? 'tela' : 'janela', miniatura: f.thumbnail.toDataURL() }));
  });

  ipcMain.handle('captura:escolher', (e, pedido: unknown) => {
    const p = pedido as { fonteId?: unknown; audio?: unknown } | null;
    // Só uma fonte que o seletor acabou de mostrar.
    if (!p || typeof p.fonteId !== 'string' || !ultimas.some((f) => f.id === p.fonteId)) throw new Error('Fonte inválida.');
    escolhida = { fonteId: p.fonteId, audio: p.audio === true && process.platform === 'win32', janelaId: e.sender.id, em: Date.now() };
  });

  session.defaultSession.setDisplayMediaRequestHandler(
    (pedido, responder) => {
      const e = escolhida;
      escolhida = undefined;
      // Só a janela que escolheu, e logo depois de escolher; sem escolha pelo seletor do app, nada é capturado.
      // (Este handler vale para todo getDisplayMedia do app: de propósito, nenhum outro caminho captura a tela.)
      const quem = pedido.frame ? webContents.fromFrame(pedido.frame)?.id : undefined;
      const valida = e && quem === e.janelaId && Date.now() - e.em < VALIDADE_ESCOLHA_MS;
      const fonte = valida ? ultimas.find((f) => f.id === e.fonteId) : undefined;
      if (!e || !fonte) return responder({});
      responder({ video: fonte, ...(e.audio ? { audio: 'loopback' as const } : {}) });
    },
    { useSystemPicker: false },
  );
}
