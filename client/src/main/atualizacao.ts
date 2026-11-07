import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

/** Página das versões, para quem não se atualiza sozinho (.deb). */
export const PAGINA_VERSOES = 'https://github.com/gabrielnunes96/tofalany/releases/latest';
const INTERVALO_MS = 4 * 60 * 60 * 1000;

/** O que a janela mostra: versão nova baixada (reiniciar) ou só disponível (baixar pela página). */
export interface EstadoAtualizacao {
  versao: string;
  modo: 'reiniciar' | 'pagina';
}

/**
 * Backlog v2, item 1d: o app confere as releases do GitHub ao abrir e a cada 4 h.
 * - Windows (NSIS) e AppImage: baixa em segundo plano e avisa "reiniciar para atualizar".
 * - .deb: o pacote do sistema não se troca sozinho; só avisa e abre a página da versão.
 * Só no app empacotado (em desenvolvimento e nos testes não há o que atualizar).
 */
export function podeAtualizarSozinho(plataforma: NodeJS.Platform, appImage: string | undefined): boolean {
  return plataforma === 'win32' || (plataforma === 'linux' && !!appImage);
}

export function iniciarAtualizacao(obterJanela: () => BrowserWindow | undefined) {
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

  if (!app.isPackaged) return;
  const sozinho = podeAtualizarSozinho(process.platform, process.env.APPIMAGE);
  autoUpdater.autoDownload = sozinho;
  autoUpdater.autoInstallOnAppQuit = sozinho;
  autoUpdater.logger = null;
  autoUpdater.on('update-available', (info) => {
    if (!sozinho) enviar({ versao: info.version, modo: 'pagina' });
  });
  autoUpdater.on('update-downloaded', (info) => enviar({ versao: info.version, modo: 'reiniciar' }));
  // Sem internet ou GitHub fora: tenta de novo na próxima rodada, sem incomodar.
  autoUpdater.on('error', (erro) => console.warn('Atualização: não foi possível conferir agora.', erro?.message ?? erro));

  const conferir = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(conferir, 10_000);
  const relogio = setInterval(conferir, INTERVALO_MS);
  app.on('will-quit', () => clearInterval(relogio));
}
