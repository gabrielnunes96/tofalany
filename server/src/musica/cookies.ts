import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * infra-e-atualizacao, RF-8 (T-9): os cookies do YouTube do ToOuvini.
 * - Cada execução do yt-dlp usa uma cópia própria (pasta 0700, arquivo 0600): o yt-dlp regrava o arquivo que recebe,
 *   e várias execuções no mesmo arquivo punham cookies velhos por cima.
 * - Só uma execução que terminou bem promove a cópia (troca atômica), uma de cada vez, e só se os cookies guardados não
 *   mudaram desde a cópia (envio ou exclusão do administrador vence, RN-7).
 * - A cópia é apagada sempre (sucesso, erro, tempo esgotado ou kill).
 */
export interface UsoCookies {
  /** Argumentos do yt-dlp (`--cookies <cópia>`), ou nenhum se não há cookies guardados. */
  args: string[];
  /** Fim da execução: `ok` só com saída 0. Promove ou descarta a cópia e a apaga. */
  terminar(ok: boolean): Promise<void>;
}

export interface CookiesMusica {
  usar(): UsoCookies;
  /** Envio do administrador (já conferido): troca atômica, 0600. */
  gravar(conteudo: string): void;
  /** Exclusão pelo administrador. */
  apagar(): void;
  /** Conferência do conteúdo antes de promover uma cópia (a rota do administrador define). */
  conferirCom(conferir: (conteudo: string) => boolean): void;
}

const PREFIXO = 'tofalany-cookies-';

export function criarCookies(arquivo: string | undefined, opcoes: { pasta?: string; conferir?: (conteudo: string) => boolean } = {}): CookiesMusica {
  const pasta = opcoes.pasta ?? tmpdir();
  // Sobras de uma execução anterior (processo derrubado no meio).
  try {
    for (const n of readdirSync(pasta)) if (n.startsWith(PREFIXO)) rmSync(join(pasta, n), { recursive: true, force: true });
  } catch {
    // Pasta temporária ilegível: segue sem limpar.
  }
  /** Muda a cada envio ou exclusão do administrador. */
  let geracao = 0;
  let conferir = opcoes.conferir;
  let fila: Promise<void> = Promise.resolve();

  const trocarAtomico = (conteudo: string) => {
    if (!arquivo) return;
    const tmp = join(dirname(arquivo), `.cookies-${randomBytes(6).toString('hex')}`);
    writeFileSync(tmp, conteudo, { flag: 'wx', mode: 0o600 });
    renameSync(tmp, arquivo);
  };

  return {
    usar() {
      if (!arquivo || !existsSync(arquivo)) return { args: [], terminar: async () => undefined };
      const dir = mkdtempSync(join(pasta, PREFIXO));
      const copia = join(dir, 'cookies.txt');
      const daGeracao = geracao;
      try {
        writeFileSync(copia, readFileSync(arquivo), { flag: 'wx', mode: 0o600 });
      } catch {
        rmSync(dir, { recursive: true, force: true });
        return { args: [], terminar: async () => undefined };
      }
      let terminado = false;
      return {
        args: ['--cookies', copia],
        terminar(ok) {
          if (terminado) return fila;
          terminado = true;
          fila = fila.then(() => {
            try {
              if (!ok || geracao !== daGeracao || !existsSync(arquivo)) return;
              const conteudo = readFileSync(copia, 'utf8');
              if (conferir && !conferir(conteudo)) return;
              trocarAtomico(conteudo);
            } catch {
              // Falhou ao promover: os cookies guardados continuam os de antes.
            } finally {
              rmSync(dir, { recursive: true, force: true });
            }
          });
          return fila;
        },
      };
    },
    gravar(conteudo) {
      geracao++;
      trocarAtomico(conteudo);
    },
    apagar() {
      geracao++;
      if (arquivo) rmSync(arquivo, { force: true });
    },
    conferirCom(fn) {
      conferir = fn;
    },
  };
}

/** Uma instância por arquivo no processo: a rota do administrador e o ToOuvini enxergam a mesma geração. */
const porArquivo = new Map<string, CookiesMusica>();
export function cookiesDe(arquivo: string | undefined, conferir?: (conteudo: string) => boolean): CookiesMusica {
  if (!arquivo) return criarCookies(undefined);
  let c = porArquivo.get(arquivo);
  if (!c) {
    c = criarCookies(arquivo);
    porArquivo.set(arquivo, c);
  }
  if (conferir) c.conferirCom(conferir);
  return c;
}

/** Linhas de cabeçalho com credenciais (o yt-dlp verboso as imprime) viram "[mascarado]" antes de ir para log (A15). */
export function mascarar(texto: string): string {
  return texto.replace(/((?:^|\n)[^\n]*?\b(?:cookie|set-cookie|authorization)\s*:)[^\n]*/gi, '$1 [mascarado]');
}

/** Ambiente mínimo para o yt-dlp e o ffmpeg: nada dos segredos do servidor (A16). */
export function ambienteMinimo(origem: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const r: NodeJS.ProcessEnv = {};
  for (const chave of ['PATH', 'HOME', 'LANG', 'TMPDIR']) if (origem[chave] !== undefined) r[chave] = origem[chave];
  return r;
}
