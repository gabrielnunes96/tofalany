import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { criarArmazemConfiguracoes } from './configuracoes';
import { registrarIpc } from './ipc';

// Testes E2E isolam as configurações numa pasta própria (só fora do app empacotado).
const pastaDados = process.env.TOFALANDO_USER_DATA;
if (pastaDados && !app.isPackaged) app.setPath('userData', pastaDados);

function criarJanela(): BrowserWindow {
  const janela = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'Tô Falando',
    backgroundColor: '#1e1f24',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // O corretor do Chromium baixa dicionários de servidores de terceiros (RNF de privacidade).
      spellcheck: false,
    },
  });

  janela.once('ready-to-show', () => janela.show());

  // Links externos abrem no navegador do sistema, nunca dentro do app.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const urlDev = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;

  // Link ou arquivo arrastado não pode levar a janela para fora do app.
  janela.webContents.on('will-navigate', (evento, url) => {
    if (!(urlDev && url.startsWith(urlDev))) evento.preventDefault();
  });

  if (urlDev) void janela.loadURL(urlDev);
  else void janela.loadFile(join(__dirname, '../renderer/index.html'));

  return janela;
}

void app.whenReady().then(() => {
  registrarIpc(criarArmazemConfiguracoes(join(app.getPath('userData'), 'configuracoes.json')));
  criarJanela();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
