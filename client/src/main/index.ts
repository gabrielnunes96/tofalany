import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, Notification, powerMonitor, safeStorage, shell } from 'electron';
import { criarArmazemConfiguracoes } from './configuracoes';
import { criarArmazemSessao } from './sessao';
import { registrarIpc } from './ipc';
import { prepararLinks } from './deeplink';
import { criarArquivos } from './arquivos';
import { criarNotificacoes } from './notificacoes';
import { criarAtalhos, type Modificadores } from './atalhos';
import { criarOciosidade } from './ociosidade';
import { registrarCaptura } from './captura';
import { filtrarRede } from './rede';
import { integrarSistema } from './integracao';
import { iniciarAtualizacao } from './atualizacao';
import { criarBandeja } from './bandeja';
import { normalizarUrlServidor } from '@tofalando/shared';

// Testes E2E isolam as configurações numa pasta própria (só fora do app empacotado).
// Vem antes da trava de instância única, que é por pasta de dados.
const pastaDados = process.env.TOFALANDO_USER_DATA;
if (pastaDados && !app.isPackaged) app.setPath('userData', pastaDados);

// T24: notificações no Windows instalado e o link tofalany:// no AppImage.
integrarSistema({ empacotado: app.isPackaged, plataforma: process.platform, appImage: process.env.APPIMAGE, definirId: (id) => app.setAppUserModelId(id) });

// E2E de voz: microfone e câmera falsos do Chromium, sem pedir permissão (só fora do app empacotado).
if (process.env.TOFALANDO_MIDIA_FALSA === '1' && !app.isPackaged) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

// Testes E2E: a janela abre sem roubar o foco de quem está usando o PC (o som vai para uma saída falsa: e2e/silencio.ts).
const testeDiscreto = process.env.TOFALANDO_E2E === '1' && !app.isPackaged;

let janelaPrincipal: BrowserWindow | undefined;
/** Backlog v2, 1e: com a bandeja ativa e a opção ligada, fechar a janela só a esconde. */
let saindo = false;
let fecharParaBandeja = (): boolean => false;
/** Na primeira vez que a janela vai para a bandeja (por execução), avisa onde o app ficou e como sair. */
let avisouBandeja = false;
/** Conferir versão nova (a janela voltando da bandeja é um bom momento). */
let conferirAtualizacao = (): void => undefined;
app.on('before-quit', () => (saindo = true));

function mostrarJanela() {
  if (!janelaPrincipal || janelaPrincipal.isDestroyed()) return;
  if (janelaPrincipal.isMinimized()) janelaPrincipal.restore();
  janelaPrincipal.show();
  janelaPrincipal.focus();
  conferirAtualizacao();
}

const links = prepararLinks(
  () => mostrarJanela(),
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

  janela.once('ready-to-show', () => (testeDiscreto ? janela.showInactive() : janela.show()));
  janela.on('close', (evento) => {
    if (saindo || !fecharParaBandeja()) return;
    evento.preventDefault();
    janela.hide();
    if (!avisouBandeja && !testeDiscreto && Notification.isSupported()) {
      avisouBandeja = true;
      new Notification({
        title: 'O ToFalany continua aberto',
        body: 'Ficou na bandeja (ícone perto do relógio), com a voz e as notificações. Para fechar de vez: clique direito no ícone → Sair, ou desligue em Configurações → Janela.',
        silent: true,
      }).show();
    }
  });
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
    // CA-46: a janela só fala com o servidor configurado.
    const redeVista: { url: string; ok: boolean }[] = [];
    const registrarRede = process.env.TOFALANDO_MIDIA_FALSA === '1' && !app.isPackaged ? (url: string, ok: boolean) => void redeVista.push({ url, ok }) : undefined;
    if (registrarRede) (globalThis as { __redeVista?: unknown }).__redeVista = redeVista;
    // Servidor de um convite em andamento (a janela o define depois de testá-lo; vale até virar o salvo).
    let servidorPendente: string | null = null;
    ipcMain.handle('rede:pendente', (_e, url: unknown) => {
      const n = typeof url === 'string' ? normalizarUrlServidor(url) : undefined;
      servidorPendente = n?.ok ? n.valor : null;
    });
    // Backlog v2, item 10b: players do YouTube abertos (o filtro só libera o YouTube enquanto houver algum).
    let videosAbertos = 0;
    ipcMain.handle('rede:video', (_e, aberto: unknown) => {
      videosAbertos = Math.max(0, videosAbertos + (aberto === true ? 1 : -1));
    });
    filtrarRede(() => configuracoes.ler().servidorUrl, app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL, registrarRede, () => servidorPendente, () => videosAbertos > 0, () => (configuracoes.ler().servidores ?? []).map((s) => s.url));
    // RF-15: atalhos globais mandam aperto/soltura para a janela (funcionam com ela em segundo plano).
    const atalhos = criarAtalhos(
      (e) => {
        if (janelaPrincipal && !janelaPrincipal.isDestroyed()) janelaPrincipal.webContents.send('atalhos:evento', e);
      },
      undefined,
      (erro) => console.error('Atalhos globais indisponíveis:', erro),
    );
    atalhos.definir(configuracoes.ler().atalhos);
    // Backlog v2, 1d: confere as releases do GitHub e avisa a janela (só no app empacotado).
    conferirAtualizacao = iniciarAtualizacao(() => janelaPrincipal).conferir;
    app.on('will-quit', () => atalhos.parar());
    // RN-25: ocioso há 10 min → ausente (o renderer avisa o servidor).
    let ociosoForcado: number | undefined;
    const ociosidade = criarOciosidade(
      () => ociosoForcado ?? powerMonitor.getSystemIdleTime(),
      (ausente) => {
        if (janelaPrincipal && !janelaPrincipal.isDestroyed()) janelaPrincipal.webContents.send('presenca:ociosidade', ausente);
      },
    );
    app.on('will-quit', () => ociosidade.parar());
    ipcMain.handle('presenca:ausente', () => ociosidade.ausente());
    // E2E: o Playwright não gera teclas do sistema nem ociosidade; simula o que o sistema entregaria (só fora do empacotado).
    if (process.env.TOFALANDO_MIDIA_FALSA === '1' && !app.isPackaged) {
      (globalThis as { __teclaGlobal?: unknown }).__teclaGlobal = (tipo: 'down' | 'up', codigo: string, mods: Modificadores = {}) => atalhos.tratarCodigo(tipo, codigo, mods);
      (globalThis as { __ociosoSegundos?: unknown }).__ociosoSegundos = (s: number | undefined) => {
        ociosoForcado = s;
        ociosidade.verificar();
      };
    }
    ipcMain.handle('atalhos:pausar', (_e, sim: unknown) => atalhos.pausar(sim === true));
    // RF-26: seletor próprio de tela/janela para a transmissão.
    registrarCaptura();
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

    // Backlog v2, 1e: bandeja (fora dos testes, que não podem deixar ícone no desktop de quem roda).
    if (!testeDiscreto) {
      const bandeja = criarBandeja({
        abrir: mostrarJanela,
        mutar: () => {
          if (!janelaPrincipal || janelaPrincipal.isDestroyed()) return;
          janelaPrincipal.webContents.send('atalhos:evento', { acao: 'mudo', pressionado: true });
          janelaPrincipal.webContents.send('atalhos:evento', { acao: 'mudo', pressionado: false });
        },
        sair: () => app.quit(),
      });
      if (bandeja) fecharParaBandeja = () => configuracoes.ler().fecharParaBandeja !== false;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
