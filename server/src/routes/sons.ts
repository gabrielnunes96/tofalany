import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SOM_MAX_BYTES, SONS_MAX, validarNomeSom, type SomDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirPermissao, exigirSessao } from '../auth/sessao-http.js';
import type { Armazem } from '../arquivos/armazem.js';
import type { TempoReal } from '../realtime/tempo-real.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { buscarSom, conferirAudio, inserirSom, listarSons } from '../dominio/sons.js';

const paramId = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } as const;

/** Lê o multipart: campo "nome" (texto) e/ou campo "arquivo" (áudio até 2 MB). */
async function lerFormulario(req: FastifyRequest): Promise<{ nome?: string; dados?: Buffer }> {
  if (!req.isMultipart()) throw new ErroHttp(400, 'dados_invalidos', 'Envie como multipart/form-data.');
  const resultado: { nome?: string; dados?: Buffer } = {};
  for await (const parte of req.parts({ limits: { fileSize: SOM_MAX_BYTES, files: 1, fields: 2 } })) {
    if (parte.type === 'file') {
      if (parte.fieldname !== 'arquivo') throw new ErroHttp(400, 'dados_invalidos', 'Envie o áudio no campo "arquivo".');
      resultado.dados = await parte.toBuffer().catch((erro: { code?: string }) => {
        if (erro.code === 'FST_REQ_FILE_TOO_LARGE') throw new ErroHttp(413, 'arquivo_grande', 'O áudio deve ter no máximo 2 MB.');
        throw erro;
      });
    } else if (parte.fieldname === 'nome' && typeof parte.value === 'string') {
      resultado.nome = parte.value;
    }
  }
  return resultado;
}

/** RF-22, RN-6, RN-11: soundboard do servidor; só administrador cadastra, troca e remove. */
export function registrarRotasSons(app: FastifyInstance, banco: Banco, armazem: Armazem, tempoReal: TempoReal): void {
  // Backlog v2, item 10c: quem tem "Gerenciar sons" (administrador sempre).
  const soAdmin = [exigirSessao(banco), exigirPermissao(banco, 'gerenciar_sons')];
  const avisar = () => tempoReal.io.emit('sons:atualizados', listarSons(banco));

  app.get('/api/sons', { preHandler: exigirSessao(banco) }, async (): Promise<SomDto[]> => listarSons(banco));

  app.post('/api/admin/sons', { preHandler: soAdmin }, async (req, reply): Promise<SomDto> => {
    // Já cheio: recusa antes de ler o upload (a checagem definitiva fica na transação).
    if (listarSons(banco).length >= SONS_MAX) throw new ErroHttp(409, 'limite_sons', `O soundboard já tem ${SONS_MAX} sons. Remova um para cadastrar outro.`);
    const { nome, dados } = await lerFormulario(req);
    const n = validarNomeSom(nome ?? '');
    if (!n.ok) throw new ErroHttp(400, 'dados_invalidos', n.erro);
    if (!dados) throw new ErroHttp(400, 'dados_invalidos', 'Envie o arquivo de áudio.');
    const { ext, duracaoMs } = await conferirAudio(dados);
    const arquivo = armazem.gravar(dados, ext);
    let som: SomDto;
    try {
      som = banco.transaction(() => {
        const novo = inserirSom(banco, n.valor, arquivo, duracaoMs, req.usuarioId!);
        registrarAuditoria(banco, { tipo: 'som_cadastrado', atorId: req.usuarioId!, detalhes: { som: n.valor } });
        return novo;
      })();
    } catch (erro) {
      armazem.apagar(arquivo);
      throw erro;
    }
    avisar();
    reply.code(201);
    return som;
  });

  app.put('/api/admin/sons/:id', { preHandler: soAdmin, schema: { params: paramId } }, async (req): Promise<SomDto> => {
    const { id } = req.params as { id: number };
    const { nome, dados } = await lerFormulario(req);
    if (nome === undefined && !dados) throw new ErroHttp(400, 'dados_invalidos', 'Envie o novo nome e/ou o novo áudio.');
    const novoNome = nome === undefined ? undefined : validarNomeSom(nome);
    if (novoNome && !novoNome.ok) throw new ErroHttp(400, 'dados_invalidos', novoNome.erro);
    const audio = dados ? await conferirAudio(dados) : undefined;
    const arquivoNovo = dados && audio ? armazem.gravar(dados, audio.ext) : undefined;
    let anterior: string | undefined;
    let som: SomDto;
    try {
      som = banco.transaction(() => {
        const atual = buscarSom(banco, id);
        if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Som não encontrado.');
        const nomeFinal = novoNome?.ok ? novoNome.valor : atual.nome;
        if (arquivoNovo && audio) {
          anterior = atual.arquivo;
          banco.prepare('UPDATE sons SET nome = ?, arquivo = ?, duracao_ms = ? WHERE id = ?').run(nomeFinal, arquivoNovo, audio.duracaoMs, id);
        } else banco.prepare('UPDATE sons SET nome = ? WHERE id = ?').run(nomeFinal, id);
        registrarAuditoria(banco, { tipo: 'som_trocado', atorId: req.usuarioId!, detalhes: { som: nomeFinal } });
        return buscarSom(banco, id)!;
      })();
    } catch (erro) {
      armazem.apagar(arquivoNovo);
      throw erro;
    }
    armazem.apagar(anterior);
    avisar();
    return { id: som.id, nome: som.nome, url: som.url, duracaoMs: som.duracaoMs };
  });

  app.delete('/api/admin/sons/:id', { preHandler: soAdmin, schema: { params: paramId } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const arquivo = banco.transaction(() => {
      const atual = buscarSom(banco, id);
      if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Som não encontrado.');
      banco.prepare('DELETE FROM sons WHERE id = ?').run(id);
      registrarAuditoria(banco, { tipo: 'som_removido', atorId: req.usuarioId!, detalhes: { som: atual.nome } });
      return atual.arquivo;
    })();
    armazem.apagar(arquivo);
    avisar();
    reply.code(204);
  });
}
