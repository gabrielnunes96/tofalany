import { readFileSync, writeFileSync } from 'node:fs';
import type { BrowserWindow, BrowserWindowConstructorOptions, Rectangle } from 'electron';

/**
 * video-teatro-cameras-e-sons (R-1): câmeras e transmissão em "janela própria". A janela principal abre
 * `window.open('about:blank', nome)`; a filha é do mesmo processo e da mesma origem e o React da principal desenha nela
 * (portal), com a mesma faixa de vídeo (sem nova conexão). Aqui fica só o que o processo principal decide.
 */

/** Nomes aceitos (A1): câmeras e uma transmissão por id. */
export const NOME_JANELA_PROPRIA = /^tofalany-(cameras|transmissao-[1-9]\d{0,8})$/;
/** No máximo 5 janelas próprias ao mesmo tempo (A9). */
export const MAX_JANELAS_PROPRIAS = 5;
/** Parte mínima visível (barra de título) para a posição salva valer (A5). */
const VISIVEL_MIN = { largura: 100, altura: 40 };
export const TAMANHO_PADRAO = { width: 640, height: 400 };
const TAMANHO_MIN = { width: 320, height: 180 };

export type Decisao = 'propria' | 'externo' | 'negar';

/** O que fazer com um window.open (A1): só about:blank com nome conhecido, pedido pelo frame principal da janela. */
export function decidirAbertura(p: { url: string; nome: string; doFramePrincipal: boolean }): Decisao {
  if (p.url === 'about:blank' && NOME_JANELA_PROPRIA.test(p.nome) && p.doFramePrincipal) return 'propria';
  if (p.url.startsWith('https://') || p.url.startsWith('http://')) return 'externo';
  return 'negar';
}

/** Tipo da janela (câmeras ou transmissão): a posição e o tamanho ficam guardados por tipo. */
export const tipoDaJanela = (nome: string): 'cameras' | 'transmissao' => (nome === 'tofalany-cameras' ? 'cameras' : 'transmissao');

/** Interseção de dois retângulos (área). */
function intersecao(a: Rectangle, b: Rectangle): { largura: number; altura: number } {
  const largura = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const altura = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { largura: Math.max(0, largura), altura: Math.max(0, altura) };
}

/**
 * Onde abrir (A5): a posição salva vale se pelo menos a barra de título cabe em alguma área de trabalho; senão (monitor
 * que sumiu, arquivo editado), centraliza na área do monitor da janela principal. O tamanho cabe na área.
 */
export function limitesSeguros(salvo: Rectangle | undefined, areas: Rectangle[], areaDaPrincipal: Rectangle): Rectangle {
  const valido =
    salvo &&
    [salvo.x, salvo.y, salvo.width, salvo.height].every(Number.isFinite) &&
    salvo.width >= TAMANHO_MIN.width &&
    salvo.height >= TAMANHO_MIN.height &&
    areas.some((a) => {
      const i = intersecao({ x: salvo.x, y: salvo.y, width: salvo.width, height: VISIVEL_MIN.altura }, a);
      return i.largura >= VISIVEL_MIN.largura && i.altura >= VISIVEL_MIN.altura;
    });
  if (valido) return { x: Math.round(salvo.x), y: Math.round(salvo.y), width: Math.round(salvo.width), height: Math.round(salvo.height) };
  const width = Math.min(salvo?.width && Number.isFinite(salvo.width) ? salvo.width : TAMANHO_PADRAO.width, areaDaPrincipal.width);
  const height = Math.min(salvo?.height && Number.isFinite(salvo.height) ? salvo.height : TAMANHO_PADRAO.height, areaDaPrincipal.height);
  const w = Math.max(TAMANHO_MIN.width, Math.round(width));
  const h = Math.max(TAMANHO_MIN.height, Math.round(height));
  return {
    x: Math.round(areaDaPrincipal.x + (areaDaPrincipal.width - w) / 2),
    y: Math.round(areaDaPrincipal.y + (areaDaPrincipal.height - h) / 2),
    width: w,
    height: h,
  };
}

/** Lê e confere o arquivo de posições (só o main lê e grava; o renderer nunca manda geometria, A4). */
export function lerLimites(arquivo: string): Partial<Record<'cameras' | 'transmissao', Rectangle>> {
  try {
    const bruto = JSON.parse(readFileSync(arquivo, 'utf8')) as unknown;
    const r: Partial<Record<'cameras' | 'transmissao', Rectangle>> = {};
    if (typeof bruto !== 'object' || bruto === null) return r;
    for (const tipo of ['cameras', 'transmissao'] as const) {
      const v = (bruto as Record<string, unknown>)[tipo] as Record<string, unknown> | undefined;
      if (!v || typeof v !== 'object') continue;
      const n = [v.x, v.y, v.width, v.height];
      if (n.every((x) => typeof x === 'number' && Number.isInteger(x) && Math.abs(x) < 100_000) && (v.width as number) > 0 && (v.height as number) > 0) {
        r[tipo] = { x: v.x as number, y: v.y as number, width: v.width as number, height: v.height as number };
      }
    }
    return r;
  } catch {
    return {};
  }
}

/** Opções fixas da janela filha (A2, A3, A10): sem ponte, com as travas e título fixo. */
export function opcoesDaJanela(nome: string, limites: Rectangle, icone?: string): BrowserWindowConstructorOptions {
  return {
    ...limites,
    minWidth: TAMANHO_MIN.width,
    minHeight: TAMANHO_MIN.height,
    title: tipoDaJanela(nome) === 'cameras' ? 'ToFalany – Câmeras' : 'ToFalany – Transmissão',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    ...(icone ? { icon: icone } : {}),
    webPreferences: {
      // Sem a ponte do app (sessão, arquivos, configurações): a filha só mostra vídeo, quem controla é a principal.
      preload: undefined,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      spellcheck: false,
    },
  };
}

/**
 * Registro das janelas próprias abertas: uma por nome, no máximo 5; guarda posição e tamanho ao mover e ao fechar
 * (com atraso, para não reescrever o arquivo a cada pixel).
 */
export function criarJanelasProprias(arquivo: string) {
  const abertas = new Map<string, BrowserWindow>();
  let limites = lerLimites(arquivo);
  let gravacao: ReturnType<typeof setTimeout> | undefined;
  const gravar = () => {
    clearTimeout(gravacao);
    gravacao = setTimeout(() => {
      try {
        writeFileSync(arquivo, JSON.stringify(limites), { mode: 0o600 });
      } catch {
        // Sem gravar: a próxima abertura usa o padrão.
      }
    }, 500);
  };
  return {
    /** Já aberta com esse nome (a nova chamada só foca) ou no limite: não abre outra. */
    podeAbrir(nome: string): boolean {
      const atual = abertas.get(nome);
      if (atual && !atual.isDestroyed()) {
        atual.focus();
        return false;
      }
      return abertas.size < MAX_JANELAS_PROPRIAS;
    },
    limitesSalvos: (nome: string) => limites[tipoDaJanela(nome)],
    registrar(nome: string, janela: BrowserWindow) {
      abertas.set(nome, janela);
      const guardar = () => {
        if (janela.isDestroyed() || janela.isMinimized() || janela.isFullScreen()) return;
        limites = { ...limites, [tipoDaJanela(nome)]: janela.getBounds() };
        gravar();
      };
      janela.on('moved', guardar);
      janela.on('resized', guardar);
      janela.on('close', guardar);
      janela.on('closed', () => abertas.delete(nome));
    },
    /** Ids de captura das janelas próprias (A7: ficam fora do seletor de transmissão). */
    idsDeCaptura: () => [...abertas.values()].filter((j) => !j.isDestroyed()).map((j) => j.getMediaSourceId()),
    todas: () => [...abertas.values()].filter((j) => !j.isDestroyed()),
  };
}
