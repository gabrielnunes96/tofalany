import { chmodSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { exigirAdmin, exigirPrincipal, exigirSessao } from '../auth/sessao-http.js';

/** Situação dos cookies do YouTube do ToOuvini (o administrador vê no app). */
export interface SituacaoMusica {
  cookies: boolean;
  atualizadoEm: number | null;
}

/** Arquivo de cookies no formato do Netscape (o que as extensões "cookies.txt" exportam), com algum do YouTube. */
export function conferirCookies(conteudo: unknown): string {
  if (typeof conteudo !== 'string' || conteudo.length > 1_000_000) throw new ErroHttp(400, 'dados_invalidos', 'Envie o arquivo cookies.txt (até 1 MB).');
  const linhas = conteudo.split(/\r?\n/).filter((l) => (l.trim() && !l.startsWith('#')) || l.startsWith('#HttpOnly_'));
  const doYoutube = linhas.filter((l) => /^(#HttpOnly_)?\.?([\w-]+\.)*youtube\.com\t/.test(l) && l.split('\t').length >= 7);
  if (doYoutube.length === 0) throw new ErroHttp(400, 'dados_invalidos', 'Esse arquivo não tem cookies do youtube.com. Exporte com a extensão "Get cookies.txt LOCALLY" estando no youtube.com com a conta logada.');
  return conteudo.endsWith('\n') ? conteudo : `${conteudo}\n`;
}

/**
 * ToOuvini: o YouTube recusa o IP de datacenter sem login ("confirme que você não é um robô"). O administrador do
 * servidor principal envia os cookies de uma conta do YouTube (de preferência uma conta secundária) pelo app.
 */
export function registrarRotasMusica(app: FastifyInstance, banco: Banco, config: Config): void {
  const soAdminDaInstalacao = [exigirSessao(banco), exigirAdmin(banco), exigirPrincipal()];
  const arquivo = config.musica.cookies;
  const situacao = (): SituacaoMusica => {
    if (!arquivo || !existsSync(arquivo)) return { cookies: false, atualizadoEm: null };
    return { cookies: true, atualizadoEm: Math.round(statSync(arquivo).mtimeMs) };
  };

  app.get('/api/admin/musica', { preHandler: soAdminDaInstalacao }, async (): Promise<SituacaoMusica> => situacao());

  app.put('/api/admin/musica/cookies', { preHandler: soAdminDaInstalacao, bodyLimit: 1_100_000 }, async (req): Promise<SituacaoMusica> => {
    if (!arquivo) throw new ErroHttp(400, 'dados_invalidos', 'Este servidor não guarda arquivos (banco em memória).');
    const conteudo = conferirCookies((req.body as { conteudo?: unknown } | undefined)?.conteudo);
    mkdirSync(dirname(arquivo), { recursive: true });
    // Só o servidor lê (são credenciais de uma conta).
    writeFileSync(arquivo, conteudo, { mode: 0o600 });
    chmodSync(arquivo, 0o600);
    return situacao();
  });

  app.delete('/api/admin/musica/cookies', { preHandler: soAdminDaInstalacao }, async (_req, reply) => {
    if (arquivo) rmSync(arquivo, { force: true });
    reply.code(204);
  });
}
