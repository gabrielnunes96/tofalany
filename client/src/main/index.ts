import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import { criarArmazemConfiguracoes } from './configuracoes';
import { criarArmazemSessao } from './sessao';
import { registrarIpc } from './ipc';
import { prepararLinks } from './deeplink';
import { criarArquivos } from './arquivos';
import { criarNotificacoes } from './notificacoes';
import { criarAtalhos, type Modificadores } from './atalhos';

// Testes E2E isolam as configurações numa pasta própria (só fora do app empacotado).
// Vem antes da trava de instância única, que é por pasta de dados.
const pastaDados = process.env.TOFALANDO_USER_DATA;
if (pastaDados && !app.isPackaged) app.setPath('userData', pastaDados);

// E2E de voz: microfone e câmera falsos do Chromium, sem pedir permissão (só fora do app empacotado).
if (process.env.TOFALANDO_MIDIA_FALSA === '1' && !app.isPackaged) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

let janelaPrincipal: BrowserWindow | undefined;

const links = prepararLinks(
  () => {
    if (!janelaPrincipal) return;
    if (janelaPrincipal.isMinimized()) janelaPrincipal.restore();
    janelaPrincipal.focus();
  },
  (convite) => {
    if (!janelaPrincipal || janelaPrincipal.isDestroyed()) return false;
    janelaPrincipal.webContents.send('deeplink:convite', convite);
    return true;
  },
);

function criarJanela(): BrowserWindow {
  const janela = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'ToFalany',
    backgroundColor: '#0a0a12',
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
  janela.on('closed', () => {
    if (janelaPrincipal === janela) janelaPrincipal = undefined;
    links.rendererSaiu();
  });
  // Recarregar a página recria o renderer: até ele pedir de novo, os links ficam guardados.
  janela.webContents.on('did-start-loading', () => links.rendererSaiu());

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

  janelaPrincipal = janela;
  return janela;
}

// Instância secundária só repassou o link e está saindo: não registra nada nem abre janela.
if (links.principal) {
  void app.whenReady().then(() => {
    const dados = app.getPath('userData');
    const configuracoes = criarArmazemConfiguracoes(join(dados, 'configuracoes.json'));
    // RF-15: atalhos globais mandam aperto/soltura para a janela (funcionam com ela em segundo plano).
    const atalhos = criarAtalhos(
      (e) => {
        if (janelaPrincipal && !janelaPrincipal.isDestroyed()) janelaPrincipal.webContents.send('atalhos:evento', e);
      },
      undefined,
      (erro) => console.error('Atalhos globais indisponíveis:', erro),
    );
    atalhos.definir(configuracoes.ler().atalhos);
    app.on('will-quit', () => atalhos.parar());
    // E2E: o Playwright não gera teclas do sistema; simula o que o uiohook entregaria (só fora do empacotado).
    if (process.env.TOFALANDO_MIDIA_FALSA === '1' && !app.isPackaged) {
      (globalThis as { __teclaGlobal?: unknown }).__teclaGlobal = (tipo: 'down' | 'up', codigo: string, mods: Modificadores = {}) => atalhos.tratarCodigo(tipo, codigo, mods);
    }
    ipcMain.handle('atalhos:pausar', (_e, sim: unknown) => atalhos.pausar(sim === true));
    registrarIpc(
      configuracoes,
      criarArmazemSessao(join(dados, 'sessao.json'), {
        disponivel: () => safeStorage.isEncryptionAvailable(),
        cifrar: (texto) => safeStorage.encryptString(texto),
        decifrar: (bytes) => safeStorage.decryptString(bytes),
      }),
      links.pegarPendente,
      criarArquivos(
        () => janelaPrincipal,
        () => configuracoes.ler().servidorUrl,
      ),
      criarNotificacoes(() => janelaPrincipal),
      (c) => atalhos.definir(c.atalhos),
    );
    criarJanela();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
