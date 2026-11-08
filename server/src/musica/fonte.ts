import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { DURACAO_MAXIMA_MUSICA_S } from '@tofalando/shared';
import { ErroHttp } from '../erros.js';

/** Backlog v2, item 14: de onde vem o áudio do bot de música. */
export interface InfoMusica {
  titulo: string;
  url: string;
  duracao: number;
}

export interface FluxoAudio {
  /** PCM s16le, 48 kHz, estéreo. */
  audio: Readable;
  parar(): void;
}

export interface FonteMusica {
  buscar(busca: string): Promise<InfoMusica>;
  /** Uma música ou, para link de playlist, as primeiras `limite` dela. */
  buscarVarias?(busca: string, limite: number): Promise<InfoMusica[]>;
  abrir(url: string): FluxoAudio;
}

const HOSTS_YOUTUBE = /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)$/i;

/**
 * O que o yt-dlp recebe: um link do YouTube (só YouTube: o servidor não sai buscando links quaisquer) ou,
 * para texto comum, a primeira busca do YouTube.
 */
export function alvoDaBusca(busca: string): string {
  const texto = busca.trim();
  if (/^https?:\/\//i.test(texto)) {
    let u: URL;
    try {
      u = new URL(texto);
    } catch {
      throw new ErroHttp(400, 'dados_invalidos', 'Link inválido.');
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ErroHttp(400, 'dados_invalidos', 'Link inválido.');
    if (!HOSTS_YOUTUBE.test(u.hostname)) throw new ErroHttp(400, 'dados_invalidos', 'Por enquanto o bot só toca links do YouTube.');
    return u.toString();
  }
  return `ytsearch1:${texto}`;
}

/** Link do YouTube com playlist (list=...): toca a playlist inteira (até o limite da fila). */
export function ehPlaylist(busca: string): boolean {
  try {
    const u = new URL(busca.trim());
    return HOSTS_YOUTUBE.test(u.hostname) && !!u.searchParams.get('list');
  } catch {
    return false;
  }
}

/** JSON de playlist do yt-dlp (--flat-playlist -J) → músicas (vídeos privados ou apagados ficam de fora). */
export function lerPlaylist(saida: string, limite: number): InfoMusica[] {
  const j = JSON.parse(saida) as { entries?: { id?: unknown; title?: unknown; duration?: unknown; url?: unknown }[] };
  const lista: InfoMusica[] = [];
  for (const e of j.entries ?? []) {
    if (lista.length >= limite) break;
    if (typeof e.id !== 'string' || typeof e.title !== 'string' || /^\[(private|deleted)/i.test(e.title)) continue;
    const duracao = typeof e.duration === 'number' && Number.isFinite(e.duration) ? Math.round(e.duration) : 0;
    if (duracao > DURACAO_MAXIMA_MUSICA_S) continue;
    lista.push({ titulo: e.title.slice(0, 200), url: `https://www.youtube.com/watch?v=${e.id}`, duracao });
  }
  return lista;
}

/** Id do vídeo de um link do YouTube (watch?v=, youtu.be/, shorts/, music.youtube.com); undefined se não for de vídeo. */
export function idDoVideo(link: string): string | undefined {
  try {
    const u = new URL(link);
    if (!HOSTS_YOUTUBE.test(u.hostname)) return undefined;
    const id = /youtu\.be$/i.test(u.hostname) ? u.pathname.slice(1) : (u.searchParams.get('v') ?? /^\/(shorts|live|embed)\/([\w-]+)/.exec(u.pathname)?.[2]);
    return id && /^[\w-]{6,20}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Título pelo oEmbed do YouTube: responde em menos de um segundo (o yt-dlp completo leva uns 20 s numa VPS pequena,
 * porque resolve o desafio de JavaScript do player). A duração fica desconhecida (0).
 */
export async function infoPorOembed(id: string, buscar: typeof fetch = fetch): Promise<InfoMusica | undefined> {
  const url = `https://www.youtube.com/watch?v=${id}`;
  try {
    const r = await buscar(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { title?: unknown };
    return typeof j.title === 'string' && j.title.trim() ? { titulo: j.title.trim().slice(0, 200), url, duracao: 0 } : undefined;
  } catch {
    return undefined;
  }
}

/** Primeira linha JSON do yt-dlp (-j) → título, página e duração. */
export function lerInfo(saida: string): InfoMusica {
  const linha = saida.split('\n').find((l) => l.trim().startsWith('{'));
  if (!linha) throw new ErroHttp(404, 'nao_encontrado', 'Não achei essa música.');
  const j = JSON.parse(linha) as { title?: unknown; webpage_url?: unknown; original_url?: unknown; duration?: unknown; is_live?: unknown };
  const url = typeof j.webpage_url === 'string' ? j.webpage_url : typeof j.original_url === 'string' ? j.original_url : '';
  if (!url) throw new ErroHttp(404, 'nao_encontrado', 'Não achei essa música.');
  const duracao = typeof j.duration === 'number' && Number.isFinite(j.duration) ? Math.round(j.duration) : 0;
  if (duracao > DURACAO_MAXIMA_MUSICA_S) throw new ErroHttp(400, 'dados_invalidos', 'Música longa demais (máximo de 3 horas).');
  return { titulo: typeof j.title === 'string' && j.title.trim() ? j.title.trim().slice(0, 200) : url, url, duracao };
}

function rodar(bin: string, args: string[], tempoMs: number): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = '';
    let erro = '';
    const relogio = setTimeout(() => p.kill('SIGKILL'), tempoMs);
    p.stdout.setEncoding('utf8').on('data', (d: string) => {
      if (saida.length < 2_000_000) saida += d;
    });
    p.stderr.setEncoding('utf8').on('data', (d: string) => {
      if (erro.length < 20_000) erro += d;
    });
    p.on('error', (e) => {
      clearTimeout(relogio);
      rejeitar(e);
    });
    p.on('close', (codigo) => {
      clearTimeout(relogio);
      if (codigo === 0) resolver(saida);
      else rejeitar(new Error(`${bin} saiu com ${codigo}: ${erro.trim().split('\n').slice(-3).join(' | ')}`));
    });
  });
}

/**
 * yt-dlp descobre e baixa o áudio; o ffmpeg converte para PCM (48 kHz estéreo, volume a 50% para não estourar
 * por cima das vozes). `extras`: argumentos a mais do yt-dlp (na imagem Docker, o runtime de JavaScript).
 */
export function criarFonteYtDlp(opcoes: { ytdlp?: string; ffmpeg?: string; extras?: string[]; cookies?: string; registrarErro?: (e: unknown) => void } = {}): FonteMusica {
  const ytdlp = opcoes.ytdlp ?? 'yt-dlp';
  const ffmpeg = opcoes.ffmpeg ?? 'ffmpeg';
  // Os cookies valem a partir do momento em que o arquivo existe (o administrador envia pelo app, sem reiniciar).
  const extrasBase = opcoes.extras ?? [];
  const argsCookies = () => (opcoes.cookies && existsSync(opcoes.cookies) ? ['--cookies', opcoes.cookies] : []);
  return {
    async buscar(busca) {
      const alvo = alvoDaBusca(busca);
      // Link de vídeo: o título vem rápido pelo oEmbed; o áudio é resolvido só na hora de tocar.
      const id = idDoVideo(alvo);
      if (id) {
        const rapido = await infoPorOembed(id);
        if (rapido) return rapido;
      }
      // Texto: busca "rasa" (só a lista de resultados, sem extrair o vídeo).
      const raso = alvo.startsWith('ytsearch');
      let saida: string;
      try {
        saida = await rodar(
          ytdlp,
          raso ? [...extrasBase, ...argsCookies(), '--flat-playlist', '--no-warnings', '-J', alvo] : [...extrasBase, ...argsCookies(), '--no-playlist', '--no-warnings', '--skip-download', '-j', alvo],
          90_000,
        );
      } catch (erro) {
        opcoes.registrarErro?.(erro);
        const recusa = /not a bot|sign in to confirm/i.test(String((erro as Error)?.message));
        throw new ErroHttp(
          502,
          'musica_indisponivel',
          recusa
            ? 'O YouTube pediu login para este servidor. O administrador precisa enviar os cookies do YouTube (menu → Bot de música).'
            : 'Não consegui abrir essa música agora (o YouTube recusou ou está fora).',
        );
      }
      if (!raso) return lerInfo(saida);
      const achada = lerPlaylist(saida, 1)[0];
      if (!achada) throw new ErroHttp(404, 'nao_encontrado', 'Não achei essa música.');
      return achada;
    },
    async buscarVarias(busca, limite) {
      if (!ehPlaylist(busca)) return [await this.buscar(busca)];
      let saida: string;
      try {
        saida = await rodar(ytdlp, [...extrasBase, ...argsCookies(), '--yes-playlist', '--flat-playlist', '--no-warnings', '--playlist-end', String(limite), '-J', alvoDaBusca(busca)], 60_000);
      } catch (erro) {
        opcoes.registrarErro?.(erro);
        throw new ErroHttp(502, 'musica_indisponivel', 'Não consegui abrir essa playlist agora (o YouTube recusou ou ela é privada).');
      }
      return lerPlaylist(saida, limite);
    },
    abrir(url) {
      const baixar = spawn(ytdlp, [...extrasBase, ...argsCookies(), '--no-playlist', '--no-warnings', '-q', '-f', 'bestaudio/best', '-o', '-', url], { stdio: ['ignore', 'pipe', 'pipe'] });
      const converter = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-af', 'volume=0.5', '-f', 's16le', '-ac', '2', '-ar', '48000', 'pipe:1'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      baixar.stdout.pipe(converter.stdin);
      // Fim antecipado (pular): o pipe quebra; não é erro.
      converter.stdin.on('error', () => undefined);
      baixar.stderr.resume();
      converter.stderr.resume();
      baixar.on('error', (e) => opcoes.registrarErro?.(e));
      converter.on('error', (e) => opcoes.registrarErro?.(e));
      return {
        audio: converter.stdout,
        parar() {
          baixar.kill('SIGKILL');
          converter.kill('SIGKILL');
        },
      };
    },
  };
}

/**
 * O YouTube muda e quebra versões antigas do yt-dlp: na imagem Docker o binário é do usuário do servidor,
 * que o atualiza (yt-dlp -U). Fora dela (pacote do sistema) o comando falha sem efeito.
 */
export async function atualizarYtDlp(ytdlp = 'yt-dlp'): Promise<string> {
  return (await rodar(ytdlp, ['-U'], 120_000)).trim().split('\n').at(-1) ?? '';
}

/** O bot só liga se o yt-dlp e o ffmpeg existem nesta máquina. */
export async function fonteDisponivel(opcoes: { ytdlp?: string; ffmpeg?: string } = {}): Promise<boolean> {
  try {
    await rodar(opcoes.ytdlp ?? 'yt-dlp', ['--version'], 10_000);
    await rodar(opcoes.ffmpeg ?? 'ffmpeg', ['-version'], 10_000);
    return true;
  } catch {
    return false;
  }
}
