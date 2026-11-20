import { readdirSync, statSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { caminhoComunidade, montarLinkApp } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { comunidadeDoConvite, nomeComunidade } from '../dominio/comunidades.js';
import { baseDoServidor } from '../dominio/convite.js';
import { criarLimitador } from '../auth/limitador.js';

/** Instaladores aceitos na pasta de downloads (o host coloca os arquivos gerados pelo dist). */
const PADRAO_INSTALADOR = /^[\w.-]+\.(exe|AppImage|deb)$/;
const TIPOS: Record<string, string> = {
  exe: 'application/vnd.microsoft.portable-executable',
  AppImage: 'application/octet-stream',
  deb: 'application/vnd.debian.binary-package',
};
const PLATAFORMA: Record<string, string> = { exe: 'Windows (instalador .exe)', AppImage: 'Linux (.AppImage)', deb: 'Linux Debian/Ubuntu (.deb)' };

export function baseServidor(config: Config, req: FastifyRequest): string {
  return baseDoServidor(config, req.headers, req.protocol === 'https');
}

/** Só arquivos comuns (uma pasta chamada "x.exe" não conta). */
function ehArquivo(caminho: string): boolean {
  try {
    return statSync(caminho).isFile();
  } catch {
    return false;
  }
}

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function listarInstaladores(pasta: string | undefined): string[] {
  if (!pasta) return [];
  try {
    return readdirSync(pasta)
      .filter((n) => PADRAO_INSTALADOR.test(n) && ehArquivo(join(pasta, n)))
      .sort();
  } catch {
    return [];
  }
}

function pagina(titulo: string, corpo: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(900px 500px at 100% 0%, rgba(255,42,109,.1), transparent 60%), #0a0a12; color: #ece8ff; font-family: system-ui, sans-serif; padding: 16px; box-sizing: border-box; }
  main { width: min(480px, 100%); background: #14111f; border: 1px solid #3a2f5c; border-top: 2px solid #ff2a6d; border-radius: 10px; padding: 28px; }
  h1 { margin: 0 0 8px; font-size: 1.5rem; }
  h1 { text-shadow: 0 0 18px rgba(255,42,109,.35); }
  p, li { color: #a8a1d1; line-height: 1.5; }
  a.botao { display: block; text-align: center; background: #00f0ff; color: #07060d; box-shadow: 0 0 14px rgba(0,240,255,.35); text-decoration: none; padding: 12px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
  a.botao:focus-visible, a:focus-visible { outline: 2px solid #ff2a6d; outline-offset: 2px; }
  ul { padding-left: 20px; }
  a { color: #00f0ff; }
  code { background: #0d0b17; padding: 2px 6px; border-radius: 4px; color: #fcee0a; word-break: break-all; }
</style>
</head>
<body><main>${corpo}</main></body>
</html>`;
}

/** RF-1a: página do convite e download dos instaladores. */
export function registrarRotasConvite(app: FastifyInstance, banco: Banco, config: Config, pastaDownloads: string | undefined): void {
  // A página diz se o código vale: o mesmo limite do cadastro, para não virar atalho de força bruta.
  const limite = criarLimitador(config.tentativasPorMinuto, 60_000);

  app.get('/convite/:codigo', async (req, reply) => {
    const { codigo } = req.params as { codigo: string };
    reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'no-referrer')
      .header('cache-control', 'no-store');
    if (!limite.permitir(req.ip)) {
      reply.code(429);
      return pagina('Muitas tentativas', '<h1>Muitas tentativas</h1><p>Aguarde um minuto e abra o link de novo.</p>');
    }
    // O código vale no servidor do endereço (https://x/c/<id>/convite/<código> para os criados depois).
    if (comunidadeDoConvite(banco, codigo) !== req.comunidadeId) {
      reply.code(404);
      return pagina('Convite inválido', '<h1>Convite inválido</h1><p>Este link de convite não vale mais. Peça um link novo para quem te convidou.</p>');
    }
    const base = baseServidor(config, req) + caminhoComunidade(req.comunidadeId);
    const nomeServidor = nomeComunidade(banco, req.comunidadeId, config.nomeServidor) ?? config.nomeServidor;
    const linkApp = montarLinkApp(base, codigo);
    const instaladores = listarInstaladores(pastaDownloads);
    const downloads = instaladores.length
      ? `<ul>${instaladores
          .map((n) => `<li><a href="/downloads/${encodeURIComponent(n)}" download>${escapar(PLATAFORMA[n.split('.').pop()!] ?? n)}</a></li>`)
          .join('')}</ul>`
      : '<p>Os instaladores ainda não estão neste servidor. Peça o instalador para quem te convidou.</p>';
    return pagina(
      `Convite para ${nomeServidor}`,
      `<h1>Você foi convidado para ${escapar(nomeServidor)}</h1>
<p>1. Instale o ToFalany:</p>
${downloads}
<p>2. Com o app instalado, abra o convite:</p>
<a class="botao" href="${escapar(linkApp)}">Abrir no ToFalany</a>
<p>Se o botão não abrir o app, abra o ToFalany e informe:</p>
<ul><li>Servidor: <code>${escapar(base)}</code></li><li>Código de convite: <code>${escapar(codigo)}</code></li></ul>`,
    );
  });

  app.get('/downloads/:arquivo', async (req, reply) => {
    const { arquivo } = req.params as { arquivo: string };
    if (!pastaDownloads || !PADRAO_INSTALADOR.test(arquivo)) throw new ErroHttp(404, 'nao_encontrado', 'Arquivo não encontrado.');
    const caminho = join(pastaDownloads, arquivo);
    if (!ehArquivo(caminho)) throw new ErroHttp(404, 'nao_encontrado', 'Arquivo não encontrado.');
    const tamanho = statSync(caminho).size;
    return reply
      .header('content-type', TIPOS[arquivo.split('.').pop()!] ?? 'application/octet-stream')
      .header('content-length', tamanho)
      .header('content-disposition', `attachment; filename="${arquivo}"`)
      .send(createReadStream(caminho));
  });
}
