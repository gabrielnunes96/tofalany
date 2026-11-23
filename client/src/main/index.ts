import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, powerMonitor, safeStorage, screen, shell } from 'electron';
import { acaoAoFechar } from '@tofalando/shared';
import { criarArmazemConfiguracoes } from './configuracoes';
import { criarArmazemSessao } from './sessao';
import { registrarIpc } from './ipc';
import { prepararLinks } from './deeplink';
import { criarArquivos } from './arquivos';
import { criarNotificacoes } from './notificacoes';
import { criarAtalhos, type Modificadores } from './atalhos';
import { criarOciosidade } from './ociosidade';
import { criarAtividade, lerAtividadeDoSistema } from './atividade';
import { criarRegistro } from './registro';
import { registrarCaptura } from './captura';
import { criarEstadoGif, filtrarRede } from './rede';
import { integrarSistema } from './integracao';
import { iniciarAtualizacao } from './atualizacao';
import { avisarAtualizacaoPronta } from './espera-atualizacao';
import { caminhoIcone, criarBandeja } from './bandeja';
import { criarJanelasProprias, decidirAbertura, limitesSeguros, opcoesDaJanela } from './janelas-proprias';
import { ATIVIDADE_PADRAO, normalizarUrlServidor } from '@tofalando/shared';

// Testes E2E isolam as configurações numa pasta própria (só fora do app empacotado).
// Vem antes da trava de instância única, que é por pasta de dados.
const pastaDados = process.env.TOFALANDO_USER_DATA;
if (pastaDados && !app.isPackaged) app.setPath('userData', pastaDados);

// T24: notificações no Windows instalado e o link tofalany:// no AppImage.
// Backlog 20: no AppImage, também os ícones no tema do usuário (o painel do Linux mostra o ícone certo, sem sudo).
integrarSistema({
  empacotado: app.isPackaged,
  plataforma: process.platform,
  appImage: process.env.APPIMAGE,
  definirId: (id) => app.setAppUserModelId(id),
  icone: (tamanho) => {
    const imagem = nativeImage.createFromPath(caminhoIcone());
    return imagem.isEmpty() ? null : imagem.resize({ width: tamanho, height: tamanho, quality: 'best' }).toPNG();
  },
});

// E2E de voz: microfone e câmera falsos do Chromium, sem pedir permissão (só fora do app empacotado).
if (process.env.TOFALANDO_MIDIA_FALSA === '1' && !app.isPackaged) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

// Testes E2E: a janela abre sem roubar o foco de quem está usando o PC (o som vai para uma saída falsa: e2e/silencio.ts).
const testeDiscreto = process.env.TOFALANDO_E2E === '1' && !app.isPackaged;
// E o app de teste não toca som nenhum para fora (o retorno do teste de som e o apito do microfone falso chegavam aos
// fones de quem estava usando o PC): o Chromium muta a saída; os níveis de áudio continuam medidos por dentro.
if (testeDiscreto) app.commandLine.appendSwitch('mute-audio');

let janelaPrincipal: BrowserWindow | undefined;
/** video-teatro-cameras-e-sons: câmeras e transmissão em janela própria (criado quando o app fica pronto). */
let janelasProprias: ReturnType<typeof criarJanelasProprias> | undefined;
/** Backlog v2, 1e: com a bandeja ativa, fechar a janela pergunta (ou faz o que a pessoa escolheu): bandeja ou sair. */
let saindo = false;
let comBandeja = false;
let perguntando = false;
/** Configurações deste computador (criadas quando o app fica pronto; a janela fecha depois disso). */
let armazem: ReturnType<typeof criarArmazemConfiguracoes> | undefined;
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
    // Backlog 21: no Linux a janela declara o próprio ícone (o painel usa esse, seja .deb ou AppImage).
    ...(process.platform === 'linux' ? { icon: caminhoIcone() } : {}),
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
    if (saindo || !comBandeja) return;
    const acao = acaoAoFechar(armazem?.ler() ?? {});
    if (acao === 'sair') return;
    evento.preventDefault();
    if (acao === 'bandeja') {
      janela.hide();
      return;
    }
    if (perguntando) return;
    perguntando = true;
    void dialog
      .showMessageBox(janela, {
        type: 'question',
        title: 'Fechar o ToFalany',
        message: 'Minimizar para a bandeja ou fechar o ToFalany?',
        detail: 'Na bandeja (ícone perto do relógio), a voz e as notificações continuam.',
        buttons: ['Minimizar para a bandeja', 'Fechar o ToFalany', 'Cancelar'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        checkboxLabel: 'Não perguntar novamente (dá para mudar em Configurações → Janela)',
      })
      .then(({ response, checkboxChecked }) => {
        perguntando = false;
        if (response === 2) return;
        const escolha = response === 0 ? 'bandeja' : 'sair';
        if (checkboxChecked) armazem?.gravar({ aoFechar: escolha });
        if (escolha === 'bandeja') janela.hide();
        else app.quit();
      })
      .catch(() => (perguntando = false));
  });
  janela.on('closed', () => {
    if (janelaPrincipal === janela) janelaPrincipal = undefined;
    links.rendererSaiu();
  });
  // Recarregar a página recria o renderer: até ele pedir de novo, os links ficam guardados.
  janela.webContents.on('did-start-loading', () => links.rendererSaiu());
  // A6: a página do app recarregou ou o renderer caiu — as janelas próprias (do React de antes) fecham.
  janela.webContents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (isMainFrame && !isSameDocument) janelasProprias?.fecharTodas();
  });
  janela.webContents.on('render-process-gone', () => janelasProprias?.fecharTodas());

  const urlDev = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;

  // Links externos abrem no navegador do sistema, nunca dentro do app. A única janela que o app abre é a "janela
  // própria" (câmeras ou transmissão): about:blank com nome conhecido. Quem pediu (o frame) é conferido quando a janela
  // nasce (did-create-window): o handler não diz o frame, e o referrer pode ser escondido por um iframe (A1).
  janela.webContents.setWindowOpenHandler(({ url, frameName }) => {
    const decisao = decidirAbertura({ url, nome: frameName, doFramePrincipal: true });
    if (decisao === 'externo') void shell.openExternal(url);
    if (decisao !== 'propria' || !janelasProprias?.podeAbrir(frameName)) return { action: 'deny' };
    const area = screen.getDisplayMatching(janela.getBounds()).workArea;
    const limites = limitesSeguros(
      janelasProprias.limitesSalvos(frameName),
      screen.getAllDisplays().map((d) => d.workArea),
      area,
    );
    return {
      action: 'allow',
      // A filha fecha junto com a principal (A6).
      outlivesOpener: false,
      overrideBrowserWindowOptions: opcoesDaJanela(frameName, limites, process.platform === 'linux' ? caminhoIcone() : undefined),
    };
  });
  janela.webContents.on('did-create-window', (filha, { frameName }) => {
    // A1: só a página do app (frame principal da janela principal) abre janela própria; de um iframe, fecha na hora.
    if (filha.webContents.opener !== janela.webContents.mainFrame) {
      filha.destroy();
      return;
    }
    filha.setMenuBarVisibility(false);
    // A10: o título fica o fixo (o documento não troca).
    filha.on('page-title-updated', (e) => e.preventDefault());
    janelasProprias?.registrar(frameName, filha);
  });

  // Link ou arquivo arrastado não pode levar a janela para fora do app.
  janela.webContents.on('will-navigate', (evento, url) => {
    if (!(urlDev && url.startsWith(urlDev))) evento.preventDefault();
  });

  if (urlDev) void janela.loadURL(urlDev);
  else void janela.loadFile(join(__dirname, '../renderer/index.html'));

  janelaPrincipal = janela;
  return janela;
}

/** A3: pedido da página do app (frame principal da janela principal), não de uma janela própria nem de um iframe. */
function daPaginaDoApp(e: { sender: Electron.WebContents; senderFrame: Electron.WebFrameMain | null }): boolean {
  return !!janelaPrincipal && !janelaPrincipal.isDestroyed() && e.sender === janelaPrincipal.webContents && !!e.senderFrame && e.senderFrame.parent === null;
}

// Toda janela do app (inclusive a janela própria) nasce sem navegar para fora e sem abrir outras janelas (A2). A
// principal troca o handler de abrir pelo dela logo em seguida (links externos e a janela própria).
app.on('web-contents-created', (_e, conteudo) => {
  conteudo.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const urlDev = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
  const bloquear = (evento: { preventDefault(): void }, url: string) => {
    if (!(urlDev && url.startsWith(urlDev))) evento.preventDefault();
  };
  conteudo.on('will-navigate', bloquear);
  // O redirecionamento também chega dos iframes (o do YouTube): só o do frame principal é bloqueado.
  conteudo.on('will-redirect', (evento) => {
    if (evento.isMainFrame) bloquear(evento, evento.url);
  });
});

// Instância secundária só repassou o link e está saindo: não registra nada nem abre janela.
if (links.principal) {
  void app.whenReady().then(() => {
    // Backlog 18: se esta abertura veio de uma atualização, a janela de espera pode fechar.
    avisarAtualizacaoPronta();
    const dados = app.getPath('userData');
    const configuracoes = criarArmazemConfiguracoes(join(dados, 'configuracoes.json'));
    armazem = configuracoes;
    janelasProprias = criarJanelasProprias(join(dados, 'janelas-proprias.json'));
    // CA-46: a janela só fala com o servidor configurado.
    const redeVista: { url: string; ok: boolean }[] = [];
    const registrarRede =
      process.env.TOFALANDO_MIDIA_FALSA === '1' && !app.isPackaged ? (url: string, ok: boolean) => void redeVista.push({ url, ok }) : undefined;
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
    // Busca de GIF: servidores com a busca ligada (o filtro libera a Klipy só quando o servidor atual é um deles).
    const estadoGif = criarEstadoGif();
    ipcMain.handle('rede:gif', (e, servidor: unknown, ligado: unknown) => {
      // Só a página do app (frame principal da janela principal) liga ou desliga.
      if (!janelaPrincipal || janelaPrincipal.isDestroyed() || e.senderFrame !== janelaPrincipal.webContents.mainFrame) return;
      estadoGif.marcar(servidor, ligado);
    });
    const gifLigado = () => estadoGif.ligado(configuracoes.ler().servidorUrl);
    filtrarRede(
      () => configuracoes.ler().servidorUrl,
      app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
      registrarRede,
      () => servidorPendente,
      () => videosAbertos > 0,
      () => (configuracoes.ler().servidores ?? []).map((s) => s.url),
      gifLigado,
    );
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
    // Log do app (tofalany.log na pasta de logs): falhas da atividade e da atualização, sem nomes de processo nem músicas.
    const registrar = criarRegistro(app.getPath('logs'));
    conferirAtualizacao = iniciarAtualizacao(() => janelaPrincipal, registrar).conferir;
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
    // mover-e-afk: segundos sem teclado e mouse (com o mesmo gancho dos testes de ponta a ponta).
    ipcMain.handle('presenca:ocioso-segundos', () => ociosoForcado ?? powerMonitor.getSystemIdleTime());
    // Atividade (jogo da Steam, música do Spotify): só o que a pessoa ligou nas configurações.
    const atividade = criarAtividade(
      () => configuracoes.ler().atividade ?? ATIVIDADE_PADRAO,
      (a) => {
        if (janelaPrincipal && !janelaPrincipal.isDestroyed()) janelaPrincipal.webContents.send('atividade:mudou', a);
      },
      (p) => lerAtividadeDoSistema(p, process.platform, { registrar }),
    );
    app.on('will-quit', () => atividade.parar());
    let ultimasPrefsAtividade = JSON.stringify(configuracoes.ler().atividade ?? ATIVIDADE_PADRAO);
    ipcMain.handle('atividade:atual', () => atividade.atual());
    // E2E: o Playwright não gera teclas do sistema nem ociosidade; simula o que o sistema entregaria (só fora do empacotado).
    if (process.env.TOFALANDO_MIDIA_FALSA === '1' && !app.isPackaged) {
      (globalThis as { __teclaGlobal?: unknown }).__teclaGlobal = (tipo: 'down' | 'up', codigo: string, mods: Modificadores = {}) =>
        atalhos.tratarCodigo(tipo, codigo, mods);
      (globalThis as { __ociosoSegundos?: unknown }).__ociosoSegundos = (s: number | undefined) => {
        ociosoForcado = s;
        ociosidade.verificar();
      };
    }
    ipcMain.handle('atalhos:pausar', (_e, sim: unknown) => atalhos.pausar(sim === true));
    // RF-26: seletor próprio de tela/janela para a transmissão.
    // Versão do app para o rodapé do menu e as configurações (lida uma vez pela ponte).
    ipcMain.on('app:versao', (e) => {
      e.returnValue = versaoDoApp();
    });
    // E2E: a janela liga os ganchos de medição só no modo de teste e fora do app empacotado.
    ipcMain.on('app:modo-teste', (e) => {
      e.returnValue = process.env.TOFALANDO_MIDIA_FALSA === '1' && !app.isPackaged;
    });
    // As janelas próprias ficam fora da lista de janelas para transmitir (A7); só a página do app captura (A3).
    const captura = registrarCaptura(undefined, undefined, () => janelasProprias?.idsDeCaptura() ?? [], daPaginaDoApp);
    // A5: um monitor saiu — janela própria que ficou fora volta para o monitor da principal.
    screen.on('display-removed', () => {
      if (!janelaPrincipal || janelaPrincipal.isDestroyed()) return;
      janelasProprias?.reposicionar(
        screen.getAllDisplays().map((d) => d.workArea),
        screen.getDisplayMatching(janelaPrincipal.getBounds()).workArea,
      );
    });
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
      criarNotificacoes(() => janelaPrincipal, () => captura.somAtivo()),
      (c) => {
        atalhos.definir(c.atalhos);
        // Ligou ou desligou a atividade: confere na hora (desligar apaga o que aparecia). Só quando ela mudou: o volume
        // ou o tema gravados em rajada não disparam leituras.
        const prefsAtividade = JSON.stringify(c.atividade ?? ATIVIDADE_PADRAO);
        if (prefsAtividade !== ultimasPrefsAtividade) {
          ultimasPrefsAtividade = prefsAtividade;
          void atividade.verificar();
        }
      },
      // A3: a janela própria não tem a ponte; mesmo assim, só a página do app mexe em sessão, arquivos e configurações.
      daPaginaDoApp,
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
      comBandeja = !!bandeja;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

/** Empacotado: a versão do app. Em desenvolvimento (electron out/main/index.js), a do package.json do client. */
function versaoDoApp(): string {
  if (app.isPackaged) return app.getVersion();
  try {
    return (JSON.parse(readFileSync(join(app.getAppPath(), '..', '..', 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return app.getVersion();
  }
}
