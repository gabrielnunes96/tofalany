import type { FastifyInstance } from 'fastify';
import { AVATAR_MAX_BYTES, caminhoComunidade, type ComunidadeDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { exigirAdmin, exigirSessao } from '../auth/sessao-http.js';
import {
  adicionarMembro,
  comunidadeDoConvite,
  criarComunidade,
  ehAdminDaInstalacao,
  excluirComunidade,
  iconeComunidade,
  listarComunidadesDe,
  membroDe,
  nomeComunidade,
  sairDaComunidade,
  validarNomeComunidade,
} from '../dominio/comunidades.js';
import { buscarNa, paraDto } from '../dominio/usuarios.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import type { TempoReal } from '../realtime/tempo-real.js';
import { salaComunidade } from '../realtime/salas.js';
import type { Armazem } from '../arquivos/armazem.js';
import { baseServidor } from './convite.js';
import { arquivosDoCanal } from '../dominio/anexos.js';
import { processarAvatar } from './perfil.js';
import { estaBanido } from '../dominio/moderacao.js';

/**
 * Vários servidores na mesma instalação: listar os meus, criar um, entrar com convite, sair e
 * excluir. Criar e entrar valem de qualquer servidor (são da conta); sair e excluir valem para o do endereço.
 */
export function registrarRotasComunidades(app: FastifyInstance, banco: Banco, config: Config, tempoReal: TempoReal, armazem: Armazem): void {
  const daConta = exigirSessao(banco, { daConta: true });
  const dto = (id: number, base: string): ComunidadeDto => ({
    id,
    nome: nomeComunidade(banco, id, config.nomeServidor) ?? '',
    url: `${base}${caminhoComunidade(id)}`,
    iconeUrl: iconeComunidade(banco, id),
  });
  /** Avisa quem está no servidor que o nome ou a imagem mudou. */
  const avisar = (id: number) =>
    tempoReal.io.to(salaComunidade(id)).emit('servidor:atualizado', { nome: nomeComunidade(banco, id, config.nomeServidor) ?? '', iconeUrl: iconeComunidade(banco, id) });

  app.get('/api/comunidades', { preHandler: daConta }, async (req): Promise<ComunidadeDto[]> =>
    listarComunidadesDe(banco, req.usuarioId!, baseServidor(config, req), config.nomeServidor),
  );

  // Só o administrador da instalação cria servidores (os outros entram pelos convites).
  app.post('/api/comunidades', { preHandler: daConta }, async (req, reply): Promise<ComunidadeDto> => {
    if (!ehAdminDaInstalacao(banco, req.usuarioId!)) throw new ErroHttp(403, 'sem_permissao', 'Só o administrador do servidor principal cria servidores.');
    const nome = validarNomeComunidade((req.body as { nome?: unknown } | undefined)?.nome);
    const id = criarComunidade(banco, nome, req.usuarioId!);
    registrarAuditoria(banco, { tipo: 'servidor_criado', atorId: req.usuarioId!, comunidadeId: id, detalhes: { nome } });
    reply.code(201);
    return dto(id, baseServidor(config, req));
  });

  app.post(
    '/api/comunidades/entrar',
    { preHandler: daConta, schema: { body: { type: 'object', required: ['codigo'], properties: { codigo: { type: 'string', maxLength: 256 } } } } },
    async (req): Promise<ComunidadeDto> => {
      const id = comunidadeDoConvite(banco, (req.body as { codigo: string }).codigo);
      if (id === undefined) throw new ErroHttp(403, 'convite_invalido', 'Código de convite inválido.');
      if (estaBanido(banco, id, req.usuarioId!)) throw new ErroHttp(403, 'sem_permissao', 'Você foi banido deste servidor.');
      if (!membroDe(banco, id, req.usuarioId!)) {
        adicionarMembro(banco, id, req.usuarioId!, 'membro');
        registrarAuditoria(banco, { tipo: 'entrou_no_servidor', atorId: req.usuarioId!, comunidadeId: id });
        const linha = buscarNa(banco, req.usuarioId!, id);
        if (linha) tempoReal.io.to(salaComunidade(id)).emit('usuario:criado', paraDto(linha));
      }
      return dto(id, baseServidor(config, req));
    },
  );

  app.post('/api/comunidade/sair', { preHandler: exigirSessao(banco) }, async (req, reply) => {
    const id = req.comunidadeId;
    sairDaComunidade(banco, id, req.usuarioId!);
    registrarAuditoria(banco, { tipo: 'saiu_do_servidor', atorId: req.usuarioId!, comunidadeId: id });
    tempoReal.tirarDaComunidade(req.usuarioId!, id);
    tempoReal.io.to(salaComunidade(id)).emit('usuario:removido', { id: req.usuarioId! });
    reply.code(204);
  });

  // Administrador do servidor renomeia (o principal também: o nome do app passa a valer sobre NOME_SERVIDOR).
  app.patch('/api/comunidade', { preHandler: [exigirSessao(banco), exigirAdmin(banco)] }, async (req): Promise<ComunidadeDto> => {
    const nome = validarNomeComunidade((req.body as { nome?: unknown } | undefined)?.nome);
    banco.prepare('UPDATE comunidades SET nome = ? WHERE id = ?').run(nome, req.comunidadeId);
    registrarAuditoria(banco, { tipo: 'servidor_editado', atorId: req.usuarioId!, comunidadeId: req.comunidadeId, detalhes: { nome } });
    avisar(req.comunidadeId);
    return dto(req.comunidadeId, baseServidor(config, req));
  });

  // Imagem do servidor: como o avatar (conferida pelo conteúdo, regravada em 256×256 WebP sem metadados).
  app.put('/api/comunidade/icone', { preHandler: [exigirSessao(banco), exigirAdmin(banco)] }, async (req): Promise<ComunidadeDto> => {
    if (!req.isMultipart()) throw new ErroHttp(400, 'dados_invalidos', 'Envie a imagem como multipart/form-data.');
    const parte = await req.file({ limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });
    if (!parte || parte.fieldname !== 'arquivo') throw new ErroHttp(400, 'dados_invalidos', 'Envie a imagem no campo "arquivo".');
    const dados = await parte.toBuffer().catch((erro: { code?: string }) => {
      if (erro.code === 'FST_REQ_FILE_TOO_LARGE') throw new ErroHttp(413, 'arquivo_grande', 'A imagem deve ter no máximo 8 MB.');
      throw erro;
    });
    const id = armazem.gravar(await processarAvatar(dados), 'webp');
    let anterior: string | null | undefined;
    try {
      anterior = banco.transaction(() => {
        const atual = (banco.prepare('SELECT icone_arquivo FROM comunidades WHERE id = ?').get(req.comunidadeId) as { icone_arquivo: string | null } | undefined)?.icone_arquivo;
        banco.prepare('UPDATE comunidades SET icone_arquivo = ? WHERE id = ?').run(id, req.comunidadeId);
        return atual;
      })();
    } catch (erro) {
      armazem.apagar(id);
      throw erro;
    }
    armazem.apagar(anterior);
    registrarAuditoria(banco, { tipo: 'servidor_editado', atorId: req.usuarioId!, comunidadeId: req.comunidadeId, detalhes: { imagem: 'trocada' } });
    avisar(req.comunidadeId);
    return dto(req.comunidadeId, baseServidor(config, req));
  });

  app.delete('/api/comunidade/icone', { preHandler: [exigirSessao(banco), exigirAdmin(banco)] }, async (req): Promise<ComunidadeDto> => {
    const anterior = (banco.prepare('SELECT icone_arquivo FROM comunidades WHERE id = ?').get(req.comunidadeId) as { icone_arquivo: string | null } | undefined)?.icone_arquivo;
    banco.prepare('UPDATE comunidades SET icone_arquivo = NULL WHERE id = ?').run(req.comunidadeId);
    armazem.apagar(anterior);
    if (anterior) {
      registrarAuditoria(banco, { tipo: 'servidor_editado', atorId: req.usuarioId!, comunidadeId: req.comunidadeId, detalhes: { imagem: 'removida' } });
      avisar(req.comunidadeId);
    }
    return dto(req.comunidadeId, baseServidor(config, req));
  });

  app.delete('/api/comunidade', { preHandler: exigirSessao(banco) }, async (req, reply) => {
    const id = req.comunidadeId;
    // Anexos das mensagens dos canais (as mensagens saem em cascata com os canais) e os sons.
    const canais = (banco.prepare('SELECT id FROM canais WHERE comunidade_id = ?').all(id) as { id: number }[]).map((c) => c.id);
    const anexos = id === 1 ? [] : canais.flatMap((c) => arquivosDoCanal(banco, c));
    const arquivos = excluirComunidade(banco, id, req.usuarioId!);
    for (const a of [...arquivos, ...anexos]) armazem.apagar(a);
    tempoReal.fecharComunidade(id);
    reply.code(204);
  });
}
