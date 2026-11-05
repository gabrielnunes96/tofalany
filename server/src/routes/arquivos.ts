import { createReadStream, statSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { ErroHttp } from '../erros.js';
import { PADRAO_ID_ARQUIVO, TIPOS_ARQUIVO, type Armazem } from '../arquivos/armazem.js';

/** GET /files/:id — público pelo id aleatório (para <img>); documentos sempre como download. */
export function registrarRotasArquivos(app: FastifyInstance, armazem: Armazem): void {
  app.get('/files/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const m = PADRAO_ID_ARQUIVO.exec(id);
    const caminho = armazem.caminho(id);
    const tipo = m ? TIPOS_ARQUIVO[m[1]!] : undefined;
    let tamanho: number | undefined;
    try {
      tamanho = caminho ? statSync(caminho).size : undefined;
    } catch {
      tamanho = undefined;
    }
    if (!caminho || !tipo || tamanho === undefined) throw new ErroHttp(404, 'nao_encontrado', 'Arquivo não encontrado.');
    reply
      .header('content-type', tipo)
      .header('content-length', tamanho)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff');
    if (!tipo.startsWith('image/') && !tipo.startsWith('audio/')) reply.header('content-disposition', 'attachment');
    return reply.send(createReadStream(caminho));
  });
}
