import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

/** Página das versões, para quem não se atualiza sozinho (ex.: .rpm ou sem permissão). */
export const PAGINA_VERSOES = 'https://github.com/gabrielnunes96/tofalany/releases/latest';
const INTERVALO_MS = 60 * 60 * 1000;
/** Ao voltar da bandeja confere de novo, mas não mais que uma vez a cada 10 min. */
const INTERVALO_MINIMO_MS = 10 * 60 * 1000;

/** O que a janela mostra: versão nova baixada (reiniciar) ou só disponível (baixar pela página). */
export interface EstadoAtualizacao {
  versao: string;
  modo: 'reiniciar' | 'pagina';
}

/**
 * Backlog v2, item 1d: o app confere as releases do GitHub ao abrir, a cada hora e quando a janela volta da
 * bandeja (quem só fecha para a bandeja nunca reabre o app).
 * - Windows (NSIS) e AppImage: baixa em segundo plano e avisa "reiniciar para atualizar".
 * - .deb: baixa em segundo plano; ao reiniciar, o sistema pede a senha (pkexec) e instala com dpkg.
 * - Outro pacote do sistema: só avisa e abre a página da versão.
 * Só no app empacotado (em desenvolvimento e nos testes não há o que atualizar).
 */
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

export function iniciarAtualizacao(obterJanela: () => BrowserWindow | undefined): { conferir(): void } {
  let estado: EstadoAtualizacao | null = null;
  const enviar = (e: EstadoAtualizacao) => {
    estado = e;
    const j = obterJanela();
    if (j && !j.isDestroyed()) j.webContents.send('atualizacao:estado', e);
  };

  ipcMain.handle('atualizacao:estado', () => estado);
  ipcMain.handle('atualizacao:pagina', () => shell.openExternal(PAGINA_VERSOES));
  ipcMain.handle('atualizacao:instalar', () => {
    if (estado?.modo === 'reiniciar') autoUpdater.quitAndInstall(true, true);
  });

  if (!app.isPackaged) return { conferir: () => undefined };
  const sozinho = podeAtualizarSozinho(process.platform, process.env.APPIMAGE, lerTipoPacote());
  autoUpdater.autoDownload = sozinho;
  autoUpdater.autoInstallOnAppQuit = sozinho;
  autoUpdater.logger = null;
  autoUpdater.on('update-available', (info) => {
    if (!sozinho) enviar({ versao: info.version, modo: 'pagina' });
  });
  autoUpdater.on('update-downloaded', (info) => enviar({ versao: info.version, modo: 'reiniciar' }));
  // Sem internet ou GitHub fora: tenta de novo na próxima rodada, sem incomodar.
  autoUpdater.on('error', (erro) => console.warn('Atualização: não foi possível conferir agora.', erro?.message ?? erro));

  let ultima = 0;
  const conferir = () => {
    // Já baixada: nada a conferir (o aviso de reiniciar já está na janela).
    if (estado?.modo === 'reiniciar' || Date.now() - ultima < INTERVALO_MINIMO_MS) return;
    ultima = Date.now();
    void autoUpdater.checkForUpdates().catch(() => undefined);
  };
  setTimeout(conferir, 10_000);
  const relogio = setInterval(conferir, INTERVALO_MS);
  app.on('will-quit', () => clearInterval(relogio));
  return { conferir };
}
