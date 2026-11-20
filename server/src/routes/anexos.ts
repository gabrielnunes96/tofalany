import type { FastifyInstance } from 'fastify';
import { ANEXO_MAX_BYTES, type AnexoDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import type { Armazem } from '../arquivos/armazem.js';
import { nomeComExtensao, processarAnexo, registrarAnexo, sanearNome } from '../dominio/anexos.js';

/** RF-9: envia um anexo (imagem, PDF ou ZIP, até 25 MB); ele fica solto até entrar numa mensagem. */
export function registrarRotasAnexos(app: FastifyInstance, banco: Banco, armazem: Armazem): void {
  app.post('/api/anexos', { preHandler: exigirSessao(banco) }, async (req, reply): Promise<AnexoDto> => {
    if (!req.isMultipart()) throw new ErroHttp(400, 'dados_invalidos', 'Envie o arquivo como multipart/form-data.');
    const parte = await req.file({ limits: { fileSize: ANEXO_MAX_BYTES, files: 1 } });
    if (!parte || parte.fieldname !== 'arquivo') throw new ErroHttp(400, 'dados_invalidos', 'Envie o arquivo no campo "arquivo".');
    const dados = await parte.toBuffer().catch((erro: { code?: string }) => {
      if (erro.code === 'FST_REQ_FILE_TOO_LARGE') throw new ErroHttp(413, 'arquivo_grande', 'O arquivo deve ter no máximo 25 MB.');
      throw erro;
    });
    const processado = await processarAnexo(dados);
    reply.code(201);
    const nome = nomeComExtensao(sanearNome(parte.filename, `anexo.${processado.ext}`), processado.ext);
    return registrarAnexo(banco, armazem, req.usuarioId!, nome, processado);
  });
}
