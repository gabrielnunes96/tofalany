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
  ler(): SessaoLocal | null;
  gravar(sessao: SessaoLocal): void;
  apagar(): void;
}

function ehSessao(v: unknown): v is SessaoLocal {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.servidorUrl === 'string' && typeof o.token === 'string' && o.token.length > 0;
}

/**
 * Sessão (RF-3) em userData, cifrada com o cofre do sistema quando houver.
 * Sem cofre (Linux sem keyring), grava em texto com permissão 600.
 */
export function criarArmazemSessao(arquivo: string, cifra: Cifra): ArmazemSessao {
  return {
    ler() {
      try {
        const bruto = JSON.parse(readFileSync(arquivo, 'utf8')) as { cifrado: boolean; dados: string };
        const texto = bruto.cifrado ? cifra.decifrar(Buffer.from(bruto.dados, 'base64')) : Buffer.from(bruto.dados, 'base64').toString('utf8');
        const sessao: unknown = JSON.parse(texto);
        return ehSessao(sessao) ? { servidorUrl: sessao.servidorUrl, token: sessao.token } : null;
      } catch {
        return null;
      }
    },
    gravar(sessao) {
      if (!ehSessao(sessao)) throw new Error('Sessão inválida.');
      const texto = JSON.stringify({ servidorUrl: sessao.servidorUrl, token: sessao.token });
      const cifrado = cifra.disponivel();
      const dados = (cifrado ? cifra.cifrar(texto) : Buffer.from(texto, 'utf8')).toString('base64');
      mkdirSync(dirname(arquivo), { recursive: true });
      const tmp = `${arquivo}.tmp`;
      rmSync(tmp, { force: true });
      writeFileSync(tmp, JSON.stringify({ cifrado, dados }), { encoding: 'utf8', mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, arquivo);
    },
    apagar() {
      rmSync(arquivo, { force: true });
    },
  };
}
