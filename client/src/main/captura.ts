import { app, BrowserWindow, desktopCapturer, ipcMain, MessageChannelMain, screen, session, webContents, type DesktopCapturerSource, type MessagePortMain } from 'electron';
import { criarSomSistema } from './som-sistema';
import { criarSomWindows, type MotivoSemSom } from './som-windows';

/** Como o som do sistema chega à janela: nada, microfone virtual (Linux), porta com PCM (Windows) ou falhou ao começar. */
export type FonteSomEscolhida = 'nenhum' | 'microfone-virtual' | 'porta' | 'falhou';
/** De quanto em quanto tempo o principal confere se a captura do Windows caiu (troca da saída de áudio, por exemplo). */
const CONFERIR_CAPTURA_MS = 2000;

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
 * RF-29: áudio do sistema sem o som do próprio app. No Linux (backlog v2, item 13), por um microfone virtual do
 * PipeWire (som-sistema.ts) que a janela captura; no Windows 11 (som-sistema-windows), por uma captura que exclui o
 * processo do app (som-windows.ts), com o PCM entregue à janela por uma MessagePort. O loopback do Chromium não é
 * mais usado: ele levava junto as vozes da chamada.
 */
export function registrarCaptura(
  listar: typeof desktopCapturer.getSources = (o) => desktopCapturer.getSources(o),
  som: Pick<ReturnType<typeof criarSomSistema>, 'disponivel' | 'ligar' | 'desligar'> = criarSomSistema(),
  /** Ids de captura das janelas próprias do app (câmeras e transmissão), que não entram na lista (A7). */
  excluidas: () => string[] = () => [],
  /** A3: só a página do app lista, escolhe e mexe no som da captura. */
  confiavel: (e: { sender: Electron.WebContents; senderFrame: Electron.WebFrameMain | null }) => boolean = () => true,
  somWindows: Pick<ReturnType<typeof criarSomWindows>, 'motivo' | 'ligar' | 'desligar' | 'erro' | 'ativo'> = criarSomWindows(),
  plataforma: NodeJS.Platform = process.platform,
) {
  const exigir = (e: { sender: Electron.WebContents; senderFrame: Electron.WebFrameMain | null }) => {
    if (!confiavel(e)) throw new Error('Pedido recusado.');
  };
  let escolhida: { fonteId: string; janelaId: number; em: number } | undefined;
  /** A última fonte escolhida (para saber se a prévia apareceria na própria tela transmitida). */
  let ultimaEscolhida: string | undefined;
  let ultimas: DesktopCapturerSource[] = [];

  ipcMain.handle('captura:fontes', async (e): Promise<FonteCaptura[]> => {
    exigir(e);
    const fora = new Set(excluidas());
    ultimas = (await listar({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false })).filter((f) => !fora.has(f.id));
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
    exigir(e);
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

  // som-sistema-windows: a porta da captura do Windows em andamento e a conferência de falha.
  let porta: MessagePortMain | undefined;
  let linuxAtivo = false;
  let conferindo: ReturnType<typeof setInterval> | undefined;
  /** Tira os ouvintes da janela da captura em andamento (não acumulam a cada transmissão). */
  let soltarJanela: (() => void) | undefined;
  /** Para tudo (RN-7): microfone virtual, captura do Windows e a porta. */
  const pararSom = () => {
    linuxAtivo = false;
    som.desligar();
    somWindows.desligar();
    clearInterval(conferindo);
    conferindo = undefined;
    soltarJanela?.();
    soltarJanela = undefined;
    const p = porta;
    porta = undefined;
    p?.close();
  };
  app.on('will-quit', pararSom);

  // Lido uma vez pela ponte, ao abrir a janela: a opção "Incluir o áudio do sistema" aparece ligada ou desligada (com o motivo).
  ipcMain.on('captura:som-disponivel', (e) => {
    const motivo: MotivoSemSom | undefined = plataforma === 'win32' ? somWindows.motivo() : som.disponivel() ? undefined : 'sem-pipewire';
    e.returnValue = { disponivel: !motivo, ...(motivo ? { motivo } : {}) };
  });
  ipcMain.handle('captura:som-parar', (e) => {
    exigir(e);
    pararSom();
  });

  /** Windows: liga a captura e entrega a porta à janela que pediu (só a ela). */
  function ligarWindows(janela: Electron.WebContents): FonteSomEscolhida {
    const { port1, port2 } = new MessageChannelMain();
    const ligou = somWindows.ligar((pedaco) => port1.postMessage(pedaco));
    if (!ligou) {
      port1.close();
      port2.close();
      return 'falhou';
    }
    porta = port1;
    // A página fechou a ponta dela (a transmissão acabou por qualquer caminho, ou a porta não foi usada): para (RN-7).
    port1.on('close', () => {
      if (porta === port1) pararSom();
    });
    port1.start();
    janela.postMessage('captura:porta-som', null, [port2]);
    // A janela fechou, caiu ou recarregou: a captura não pode continuar sozinha (RN-7).
    const aoSumir = () => pararSom();
    const aoNavegar = (d: { isMainFrame: boolean; isSameDocument: boolean }) => {
      if (d.isMainFrame && !d.isSameDocument) pararSom();
    };
    janela.once('destroyed', aoSumir);
    janela.once('render-process-gone', aoSumir);
    janela.on('did-start-navigation', aoNavegar);
    soltarJanela = () => {
      janela.removeListener('destroyed', aoSumir);
      janela.removeListener('render-process-gone', aoSumir);
      janela.removeListener('did-start-navigation', aoNavegar);
    };
    conferindo = setInterval(() => {
      const erro = somWindows.erro();
      if (!erro) return;
      console.warn('A captura do som do sistema caiu:', erro);
      porta?.postMessage({ erro: 'captura-caiu' });
      // Um instante para o aviso chegar antes de a porta fechar (RN-4).
      const p = porta;
      porta = undefined;
      const fecharDepois = setTimeout(() => p?.close(), 200);
      fecharDepois.unref?.();
      pararSom();
    }, CONFERIR_CAPTURA_MS);
    conferindo.unref?.();
    return 'porta';
  }

  ipcMain.handle('captura:escolher', (e, pedido: unknown) => {
    exigir(e);
    const p = pedido as { fonteId?: unknown; audio?: unknown } | null;
    // Só uma fonte que o seletor acabou de mostrar.
    if (!p || typeof p.fonteId !== 'string' || !ultimas.some((f) => f.id === p.fonteId)) throw new Error('Fonte inválida.');
    escolhida = { fonteId: p.fonteId, janelaId: e.sender.id, em: Date.now() };
    ultimaEscolhida = p.fonteId;
    // Uma escolha nova desfaz a captura anterior.
    pararSom();
    if (p.audio !== true) return 'nenhum' satisfies FonteSomEscolhida;
    // Linux: o som vai pelo microfone virtual, que a janela captura.
    if (plataforma === 'linux') {
      linuxAtivo = som.ligar();
      return (linuxAtivo ? 'microfone-virtual' : 'falhou') satisfies FonteSomEscolhida;
    }
    if (plataforma === 'win32') return ligarWindows(e.sender);
    return 'falhou' satisfies FonteSomEscolhida;
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
      // Só o vídeo: o som do sistema vem pela captura sem o app (som-sistema-windows), nunca pelo loopback.
      responder({ video: fonte });
    },
    { useSystemPicker: false },
  );

  /** som-sistema-windows (RN-8): há som do sistema sendo capturado agora. */
  return { somAtivo: () => linuxAtivo || somWindows.ativo() || porta !== undefined };
}
