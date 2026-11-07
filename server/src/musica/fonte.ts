import { spawn } from 'node:child_process';
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
export function criarFonteYtDlp(opcoes: { ytdlp?: string; ffmpeg?: string; extras?: string[]; registrarErro?: (e: unknown) => void } = {}): FonteMusica {
  const ytdlp = opcoes.ytdlp ?? 'yt-dlp';
  const ffmpeg = opcoes.ffmpeg ?? 'ffmpeg';
  const extras = opcoes.extras ?? [];
  return {
    async buscar(busca) {
      const alvo = alvoDaBusca(busca);
      let saida: string;
      try {
        saida = await rodar(ytdlp, [...extras, '--no-playlist', '--no-warnings', '--skip-download', '-j', alvo], 45_000);
      } catch (erro) {
        opcoes.registrarErro?.(erro);
        throw new ErroHttp(502, 'musica_indisponivel', 'Não consegui abrir essa música agora (o YouTube recusou ou está fora).');
      }
      return lerInfo(saida);
    },
    abrir(url) {
      const baixar = spawn(ytdlp, [...extras, '--no-playlist', '--no-warnings', '-q', '-f', 'bestaudio/best', '-o', '-', url], { stdio: ['ignore', 'pipe', 'pipe'] });
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
