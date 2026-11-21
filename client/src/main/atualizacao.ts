import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import { abrirEsperaAtualizacao } from './espera-atualizacao';
import { caminhoIcone } from './bandeja';

/** Página das versões, para quem não se atualiza sozinho (ex.: .rpm ou sem permissão). */
export const PAGINA_VERSOES = 'https://github.com/gabrielnunes96/tofalany/releases/latest';
const INTERVALO_MS = 60 * 60 * 1000;
/** Ao voltar da bandeja confere de novo, mas não mais que uma vez a cada 10 min. */
const INTERVALO_MINIMO_MS = 10 * 60 * 1000;

/** O que a janela mostra: versão nova baixada (reiniciar) ou só disponível (baixar pela página). */
export interface EstadoAtualizacao {
  versao: string;
  modo: 'reiniciar' | 'pagina';
  /** qualidade-de-vida, RF-5: pedida pelo "Atualizar o app": quem conduz é a janela (o aviso do canto não aparece). */
  pedido?: boolean;
}

/**
 * Backlog v2, item 1d: o app confere as releases do GitHub ao abrir, a cada hora e quando a janela volta da
 * bandeja (quem só fecha para a bandeja nunca reabre o app).
 * - Windows (NSIS) e AppImage: baixa em segundo plano e avisa "reiniciar para atualizar".
 * - .deb: baixa em segundo plano; ao reiniciar, o sistema pede a senha (pkexec) e instala com dpkg.
 * - Outro pacote do sistema: só avisa e abre a página da versão.
 * Só no app empacotado (em desenvolvimento e nos testes não há o que atualizar).
 */
/** Resposta do "Procurar atualização". */
export type ResultadoProcura = { situacao: 'atualizado' | 'nova' | 'baixando' | 'pronta' | 'erro' | 'indisponivel'; versao?: string };

export function podeAtualizarSozinho(plataforma: NodeJS.Platform, appImage: string | undefined, tipoPacote?: string): boolean {
  return plataforma === 'win32' || (plataforma === 'linux' && (!!appImage || tipoPacote === 'deb'));
}

/** O electron-builder grava "deb" em resources/package-type no pacote .deb. */
function lerTipoPacote(): string | undefined {
  try {
    return readFileSync(join(process.resourcesPath, 'package-type'), 'utf8').trim();
  } catch {
    return undefined;
  }
}

export function iniciarAtualizacao(
  obterJanela: () => BrowserWindow | undefined,
  registrar: (area: string, motivo: string) => void = () => undefined,
): { conferir(): void } {
  let estado: EstadoAtualizacao | null = null;
  // RF-5: "Atualizar o app" em andamento (do clique até a pessoa instalar ou recusar).
  let pedido = false;
  const paraJanela = (canal: string, valor: unknown) => {
    const j = obterJanela();
    if (j && !j.isDestroyed()) j.webContents.send(canal, valor);
  };
  const enviar = (e: EstadoAtualizacao) => {
    estado = e;
    paraJanela('atualizacao:estado', e);
  };
  /** Só a janela principal (o quadro dela, não um embutido) pede para instalar ou atualizar (defesa em profundidade). */
  const daJanela = (e: IpcMainInvokeEvent) => {
    const j = obterJanela();
    return !!j && !j.isDestroyed() && e.senderFrame === j.webContents.mainFrame;
  };

  ipcMain.handle('atualizacao:estado', () => estado);
  ipcMain.handle('atualizacao:pagina', () => shell.openExternal(PAGINA_VERSOES));
  ipcMain.handle('atualizacao:instalar', (e) => {
    if (!daJanela(e) || estado?.modo !== 'reiniciar') return;
    // Backlog 18 e 21: a janela de espera cobre o tempo do instalador (Windows) ou da senha e do dpkg (.deb).
    abrirEsperaAtualizacao({ plataforma: process.platform, icone: caminhoIcone(), pacote: lerTipoPacote() });
    autoUpdater.quitAndInstall(true, true);
  });

  // Backlog 27: "Procurar atualização" pergunta na hora, sem esperar o intervalo da conferência automática.
  let procurar: (aoFalharDownload?: () => void) => Promise<ResultadoProcura> = async () => ({ situacao: 'indisponivel' });
  ipcMain.handle('atualizacao:procurar', () => procurar());
  // qualidade-de-vida, RF-5: procura já marcando o pedido; baixando, o progresso vai para a janela, e a versão pronta
  // chega com `pedido` (a janela instala, ou pergunta se a pessoa está numa chamada).
  ipcMain.handle('atualizacao:agora', async (e): Promise<ResultadoProcura> => {
    if (!daJanela(e)) return { situacao: 'erro' };
    pedido = true;
    const r = await procurar(() => {
      // Só a falha do download deste pedido (a promessa do próprio download), não a de uma conferência qualquer.
      if (!pedido) return;
      pedido = false;
      registrar('atualizacao', 'download: erro');
      paraJanela('atualizacao:falhou', null);
    });
    if (r.situacao === 'pronta' && estado) {
      // Entregue com o pedido: o próximo download (outra versão, mais tarde) não herda a marca.
      pedido = false;
      enviar({ ...estado, pedido: true });
    } else if (r.situacao !== 'baixando') {
      pedido = false;
      // Pacote que não se instala sozinho: a página já abriu; o aviso do canto volta a valer.
      if (estado?.pedido) enviar({ ...estado, pedido: false });
    }
    if (r.situacao === 'erro') registrar('atualizacao', 'procura: erro');
    return r;
  });
  // Recusou reiniciar agora (em chamada): volta o aviso do canto.
  ipcMain.handle('atualizacao:recusar', (e) => {
    if (!daJanela(e)) return;
    pedido = false;
    if (estado) enviar({ ...estado, pedido: false });
  });

  if (!app.isPackaged) return { conferir: () => undefined };
  const sozinho = podeAtualizarSozinho(process.platform, process.env.APPIMAGE, lerTipoPacote());
  autoUpdater.autoDownload = sozinho;
  autoUpdater.autoInstallOnAppQuit = sozinho;
  autoUpdater.logger = null;
  autoUpdater.on('update-available', (info) => {
    if (!sozinho) enviar({ versao: info.version, modo: 'pagina', ...(pedido ? { pedido: true } : {}) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    // A marca vale para esta versão só: zera ao entregar.
    const doPedido = pedido;
    pedido = false;
    enviar({ versao: info.version, modo: 'reiniciar', ...(doPedido ? { pedido: true } : {}) });
  });
  autoUpdater.on('download-progress', (p: { percent?: number }) => {
    if (pedido) paraJanela('atualizacao:progresso', Math.max(0, Math.min(100, Math.round(p.percent ?? 0))));
  });
  // Sem internet ou GitHub fora: tenta de novo na próxima rodada, sem incomodar. A falha do pedido do botão chega
  // pela promessa do download (em `procurar`), não por aqui.
  autoUpdater.on('error', (erro) => console.warn('Atualização: não foi possível conferir agora.', erro?.message ?? erro));

  let ultima = 0;
  const conferir = () => {
    // Já baixada: nada a conferir (o aviso de reiniciar já está na janela).
    if (estado?.modo === 'reiniciar' || Date.now() - ultima < INTERVALO_MINIMO_MS) return;
    ultima = Date.now();
    void autoUpdater.checkForUpdates().catch(() => undefined);
  };
  procurar = async (aoFalharDownload) => {
    if (estado?.modo === 'reiniciar') return { situacao: 'pronta', versao: estado.versao };
    ultima = Date.now();
    try {
      const r = await autoUpdater.checkForUpdates();
      if (!r?.isUpdateAvailable) return { situacao: 'atualizado' };
      r.downloadPromise?.catch(() => aoFalharDownload?.());
      // Onde instala sozinho, o download já começou: o aviso de reiniciar aparece quando terminar.
      return { situacao: sozinho ? 'baixando' : 'nova', versao: r.updateInfo.version };
    } catch {
      return { situacao: 'erro' };
    }
  };
  setTimeout(conferir, 10_000);
  const relogio = setInterval(conferir, INTERVALO_MS);
  app.on('will-quit', () => clearInterval(relogio));
  return { conferir };
}
