import { BrowserWindow, desktopCapturer, ipcMain, screen, session, webContents, type DesktopCapturerSource } from 'electron';
import { criarSomSistema } from './som-sistema';

/** A escolha do seletor vale só para a captura logo em seguida. */
const VALIDADE_ESCOLHA_MS = 15_000;

/** Fonte que o seletor próprio mostra (RF-26). */
export interface FonteCaptura {
  id: string;
  nome: string;
  tipo: 'tela' | 'janela';
  /** Miniatura como data URL (PNG). */
  miniatura: string;
  /** Resolução em pixels reais (monitor da tela; numa janela, o maior monitor). Sem valor: desconhecida. */
  largura?: number;
  altura?: number;
}

/** Monitores em pixels reais (tamanho lógico × escala). */
function monitores(): { id: string; largura: number; altura: number }[] {
  try {
    return screen.getAllDisplays().map((d) => ({ id: String(d.id), largura: Math.round(d.size.width * d.scaleFactor), altura: Math.round(d.size.height * d.scaleFactor) }));
  } catch {
    return [];
  }
}

/**
 * RF-26: o renderer lista as fontes com miniaturas, a pessoa escolhe, e o pedido de captura
 * (getDisplayMedia, feito pelo LiveKit) recebe exatamente a fonte escolhida.
 * RF-29: áudio do sistema no Windows pelo loopback do Chromium; no Linux (backlog v2, item 13) por um microfone
 * virtual do PipeWire sem o som do próprio app (som-sistema.ts), que a janela captura e publica junto da tela.
 */
export function registrarCaptura(
  listar: typeof desktopCapturer.getSources = (o) => desktopCapturer.getSources(o),
  som: Pick<ReturnType<typeof criarSomSistema>, 'disponivel' | 'ligar' | 'desligar'> = criarSomSistema(),
) {
  let escolhida: { fonteId: string; audio: boolean; janelaId: number; em: number } | undefined;
  /** A última fonte escolhida (para saber se a prévia apareceria na própria tela transmitida). */
  let ultimaEscolhida: string | undefined;
  let ultimas: DesktopCapturerSource[] = [];

  ipcMain.handle('captura:fontes', async (): Promise<FonteCaptura[]> => {
    ultimas = await listar({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false });
    const telas = monitores();
    const maior = telas.reduce<{ largura: number; altura: number } | undefined>((m, t) => (!m || t.altura > m.altura ? t : m), undefined);
    return ultimas.map((f) => {
      const tela = f.id.startsWith('screen:');
      const monitor = tela ? (telas.find((t) => t.id === f.display_id) ?? (telas.length === 1 ? telas[0] : undefined)) : maior;
      return { id: f.id, nome: f.name, tipo: tela ? 'tela' : 'janela', miniatura: f.thumbnail.toDataURL(), ...(monitor ? { largura: monitor.largura, altura: monitor.altura } : {}) };
    });
  });

  // A prévia da minha transmissão apareceria dentro dela mesma (espelho infinito) se eu transmito a tela inteira em
  // que o app está. Com uma janela ou outro monitor, não.
  ipcMain.handle('captura:mesma-tela', (e): boolean => {
    const fonte = ultimas.find((f) => f.id === ultimaEscolhida);
    if (!fonte || !fonte.id.startsWith('screen:')) return false;
    const telas = monitores();
    if (telas.length <= 1) return true;
    if (!fonte.display_id) return true;
    try {
      const janela = BrowserWindow.fromWebContents(e.sender);
      return !!janela && String(screen.getDisplayMatching(janela.getBounds()).id) === fonte.display_id;
    } catch {
      return true;
    }
  });

  // Lido uma vez pela ponte, ao abrir a janela: a opção "Incluir o áudio do sistema" aparece ou não.
  ipcMain.on('captura:som-disponivel', (e) => {
    e.returnValue = process.platform === 'win32' || som.disponivel();
  });
  ipcMain.handle('captura:som-parar', () => som.desligar());

  ipcMain.handle('captura:escolher', (e, pedido: unknown) => {
    const p = pedido as { fonteId?: unknown; audio?: unknown } | null;
    // Só uma fonte que o seletor acabou de mostrar.
    if (!p || typeof p.fonteId !== 'string' || !ultimas.some((f) => f.id === p.fonteId)) throw new Error('Fonte inválida.');
    escolhida = { fonteId: p.fonteId, audio: p.audio === true && process.platform === 'win32', janelaId: e.sender.id, em: Date.now() };
    ultimaEscolhida = p.fonteId;
    // Linux: o som vai pelo microfone virtual; a janela o captura se a resposta for true.
    if (p.audio === true && process.platform === 'linux') return som.ligar();
    som.desligar();
    return false;
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
