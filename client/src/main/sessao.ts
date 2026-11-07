import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SessaoLocal } from '../preload/api';

/** Cifra do sistema (Electron safeStorage); injetável para teste. */
export interface Cifra {
  disponivel(): boolean;
  cifrar(texto: string): Buffer;
  decifrar(dados: Buffer): string;
}

export interface ArmazemSessao {
  /** Sessão de um servidor; sem servidor, a do último em que a pessoa entrou. */
  ler(servidorUrl?: string): SessaoLocal | null;
  gravar(sessao: SessaoLocal): void;
  /** Apaga a sessão de um servidor; sem servidor, apaga todas. */
  apagar(servidorUrl?: string): void;
}

function ehSessao(v: unknown): v is SessaoLocal {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.servidorUrl === 'string' && typeof o.token === 'string' && o.token.length > 0;
}

/** Conteúdo (decifrado): um token por servidor e qual foi o último (backlog v2, item 7). */
interface Conteudo {
  sessoes: Record<string, string>;
  ultima: string | null;
}

/** Lê o formato atual e o antigo (uma sessão só: { servidorUrl, token }). */
function lerConteudo(texto: string): Conteudo {
  const bruto: unknown = JSON.parse(texto);
  if (ehSessao(bruto)) return { sessoes: { [bruto.servidorUrl]: bruto.token }, ultima: bruto.servidorUrl };
  const o = (bruto ?? {}) as { sessoes?: unknown; ultima?: unknown };
  const sessoes: Record<string, string> = {};
  if (o.sessoes && typeof o.sessoes === 'object') {
    for (const [url, token] of Object.entries(o.sessoes as Record<string, unknown>)) if (typeof token === 'string' && token) sessoes[url] = token;
  }
  const ultima = typeof o.ultima === 'string' && sessoes[o.ultima] ? o.ultima : null;
  return { sessoes, ultima };
}

/**
 * Sessões (RF-3) em userData, cifradas com o cofre do sistema quando houver; uma por servidor (backlog v2,
 * item 7). Sem cofre (Linux sem keyring), grava em texto com permissão 600.
 */
export function criarArmazemSessao(arquivo: string, cifra: Cifra): ArmazemSessao {
  function carregar(): Conteudo {
    try {
      const bruto = JSON.parse(readFileSync(arquivo, 'utf8')) as { cifrado: boolean; dados: string };
      const texto = bruto.cifrado ? cifra.decifrar(Buffer.from(bruto.dados, 'base64')) : Buffer.from(bruto.dados, 'base64').toString('utf8');
      return lerConteudo(texto);
    } catch {
      return { sessoes: {}, ultima: null };
    }
  }

  function salvar(conteudo: Conteudo) {
    if (Object.keys(conteudo.sessoes).length === 0) {
      rmSync(arquivo, { force: true });
      return;
    }
    const texto = JSON.stringify(conteudo);
    const cifrado = cifra.disponivel();
    const dados = (cifrado ? cifra.cifrar(texto) : Buffer.from(texto, 'utf8')).toString('base64');
    mkdirSync(dirname(arquivo), { recursive: true });
    const tmp = `${arquivo}.tmp`;
    rmSync(tmp, { force: true });
    writeFileSync(tmp, JSON.stringify({ cifrado, dados }), { encoding: 'utf8', mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, arquivo);
  }

  return {
    ler(servidorUrl) {
      const c = carregar();
      const url = servidorUrl ?? c.ultima;
      if (!url) return null;
      const token = c.sessoes[url];
      return token ? { servidorUrl: url, token } : null;
    },
    gravar(sessao) {
      if (!ehSessao(sessao)) throw new Error('Sessão inválida.');
      const c = carregar();
      c.sessoes[sessao.servidorUrl] = sessao.token;
      c.ultima = sessao.servidorUrl;
      salvar(c);
    },
    apagar(servidorUrl) {
      if (servidorUrl === undefined) {
        rmSync(arquivo, { force: true });
        return;
      }
      const c = carregar();
      delete c.sessoes[servidorUrl];
      if (c.ultima === servidorUrl) c.ultima = null;
      salvar(c);
    },
  };
}
