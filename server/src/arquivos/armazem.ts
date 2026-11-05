import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Tipos servidos em /files/:id (o conteúdo é conferido antes de gravar). */
export const TIPOS_ARQUIVO: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  pdf: 'application/pdf',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

export const PADRAO_ID_ARQUIVO = /^[0-9a-f]{32}\.([a-z0-9]{2,4})$/;

/** Arquivos com nome aleatório de 128 bits numa pasta só, sem listagem (técnica §6). */
export function criarArmazem(pasta: string) {
  mkdirSync(pasta, { recursive: true });
  return {
    pasta,
    gravar(dados: Buffer, extensao: string): string {
      if (!TIPOS_ARQUIVO[extensao]) throw new Error(`Extensão não permitida: ${extensao}`);
      const id = `${randomBytes(16).toString('hex')}.${extensao}`;
      writeFileSync(join(pasta, id), dados, { flag: 'wx' });
      return id;
    },
    apagar(id: string | null | undefined): void {
      if (id && PADRAO_ID_ARQUIVO.test(id)) rmSync(join(pasta, id), { force: true });
    },
    caminho(id: string): string | undefined {
      return PADRAO_ID_ARQUIVO.test(id) ? join(pasta, id) : undefined;
    },
  };
}

export type Armazem = ReturnType<typeof criarArmazem>;
