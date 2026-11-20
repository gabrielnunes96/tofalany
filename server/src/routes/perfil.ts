import type { FastifyInstance } from 'fastify';
import sharp, { type Metadata } from 'sharp';
import {
  AVATAR_LADO,
  AVATAR_MAX_BYTES,
  FORMATOS_AVATAR,
  IMAGEM_MAX_PIXELS,
  validarCor,
  validarCoresFundo,
  validarNomeExibicao,
  validarSobreMim,
  type AtualizarPerfilRequest,
  type UsuarioDto,
} from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { buscarPorId, paraDto, buscarNa } from '../dominio/usuarios.js';
import { comunidadesDe } from '../dominio/comunidades.js';
import { salaComunidade } from '../realtime/salas.js';
import { salaUsuario } from '../realtime/tempo-real.js';
import { listarAmizades } from '../dominio/amizades.js';
import { listarDms } from '../dominio/dms.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import type { Armazem } from '../arquivos/armazem.js';
import type { TempoReal } from '../realtime/tempo-real.js';

const corpoPerfil = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nomeExibicao: { type: 'string', maxLength: 256 },
    cor: { type: 'string', maxLength: 16 },
    // Mini perfil: o tamanho bruto barra o abuso antes do validador (que conta caracteres e linhas).
    sobreMim: { type: 'string', maxLength: 1024 },
    fundoCores: { anyOf: [{ type: 'null' }, { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', maxLength: 16 } }] },
  },
} as const;

/** Lê, confere pelo conteúdo e regrava o avatar em 256×256 sem metadados (RN-15). */
export async function processarAvatar(dados: Buffer): Promise<Buffer> {
  let meta: Metadata | undefined;
  try {
    meta = await sharp(dados).metadata();
  } catch {
    meta = undefined;
  }
  if (!meta?.format || !(FORMATOS_AVATAR as readonly string[]).includes(meta.format)) {
    throw new ErroHttp(415, 'formato_invalido', 'Use uma imagem PNG, JPEG, GIF ou WebP.');
  }
  // Confere a resolução pelo cabeçalho antes de decodificar (poucos KB podem virar centenas de MB).
  if ((meta.width ?? 0) * (meta.height ?? 0) > IMAGEM_MAX_PIXELS) {
    throw new ErroHttp(413, 'arquivo_grande', 'A imagem tem resolução grande demais (máximo 4096×4096).');
  }
  return sharp(dados, { animated: false, limitInputPixels: IMAGEM_MAX_PIXELS })
    .rotate()
    .resize(AVATAR_LADO, AVATAR_LADO, { fit: 'cover', position: 'attention' })
    .webp({ quality: 85 })
    .toBuffer();
}

/** Registra as rotas e devolve o aviso de perfil alterado (usado também pelas rotas do fundo). */
export function registrarRotasPerfil(app: FastifyInstance, banco: Banco, armazem: Armazem, tempoReal: TempoReal): (id: number) => UsuarioDto {
  /**
   * Cada servidor da pessoa recebe o perfil com o cargo de lá. Amigos e quem conversa com ela por DM, conectados num
   * servidor que não é dela, recebem "conhecido:atualizado" (T-8): evento à parte, para não trocar o cargo de quem
   * está no mesmo servidor nem pôr ninguém na lista de membros (os apps 0.16 ignoram o evento novo).
   */
  const avisar = (id: number): UsuarioDto => {
    const comunidades = comunidadesDe(banco, id);
    for (const c of comunidades) {
      const linha = buscarNa(banco, id, c);
      if (linha) tempoReal.io.to(salaComunidade(c)).emit('usuario:atualizado', paraDto(linha));
    }
    const dto = paraDto(buscarPorId(banco, id)!);
    const amigos = listarAmizades(banco, id).filter((a) => a.situacao === 'amigo').map((a) => a.usuarioId);
    const conhecidos = new Set<number>([...amigos, ...listarDms(banco, id).map((d) => d.outroId)]);
    if (conhecidos.size > 0) {
      tempoReal.io
        .to([...conhecidos].map(salaUsuario))
        .except(comunidades.map(salaComunidade))
        .emit('conhecido:atualizado', { ...dto, cargo: 'membro', funcaoId: null });
    }
    return dto;
  };

  app.patch('/api/eu', { schema: { body: corpoPerfil }, preHandler: exigirSessao(banco) }, async (req): Promise<UsuarioDto> => {
    const corpo = req.body as AtualizarPerfilRequest;
    const mudancas: Record<string, string | null> = {};
    if (corpo.nomeExibicao !== undefined) {
      const nome = validarNomeExibicao(corpo.nomeExibicao);
      if (!nome.ok) throw new ErroHttp(400, 'dados_invalidos', nome.erro);
      mudancas.nome_exibicao = nome.valor;
    }
    if (corpo.cor !== undefined) {
      const cor = validarCor(corpo.cor);
      if (!cor.ok) throw new ErroHttp(400, 'dados_invalidos', cor.erro);
      mudancas.cor = cor.valor;
    }
    if (corpo.sobreMim !== undefined) {
      const sobre = validarSobreMim(corpo.sobreMim);
      if (!sobre.ok) throw new ErroHttp(400, 'dados_invalidos', sobre.erro);
      mudancas.sobre_mim = sobre.valor || null;
    }
    if (corpo.fundoCores !== undefined) {
      if (corpo.fundoCores === null) mudancas.fundo_cores = null;
      else {
        const cores = validarCoresFundo(corpo.fundoCores);
        if (!cores.ok) throw new ErroHttp(400, 'dados_invalidos', cores.erro);
        mudancas.fundo_cores = JSON.stringify(cores.valor);
      }
    }
    const colunas = Object.keys(mudancas);
    // O schema descarta campos desconhecidos (ex.: "cargo"); se nada sobrou, não há o que mudar.
    if (colunas.length === 0) throw new ErroHttp(400, 'dados_invalidos', 'Informe o que mudar no perfil.');
    banco
      .prepare(`UPDATE usuarios SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...colunas.map((c) => mudancas[c] ?? null), req.usuarioId!);
    // Rastro de quem mudou o fundo ou o "sobre mim" (sem o conteúdo), para a moderação.
    if ('sobre_mim' in mudancas || 'fundo_cores' in mudancas) registrarAuditoria(banco, { tipo: 'perfil_alterado', atorId: req.usuarioId! });
    return avisar(req.usuarioId!);
  });

  app.put('/api/eu/avatar', { preHandler: exigirSessao(banco) }, async (req): Promise<{ avatarUrl: string }> => {
    if (!req.isMultipart()) throw new ErroHttp(400, 'dados_invalidos', 'Envie a imagem como multipart/form-data.');
    const parte = await req.file({ limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });
    if (!parte || parte.fieldname !== 'arquivo') throw new ErroHttp(400, 'dados_invalidos', 'Envie a imagem no campo "arquivo".');
    const dados = await parte.toBuffer().catch((erro: { code?: string }) => {
      if (erro.code === 'FST_REQ_FILE_TOO_LARGE') throw new ErroHttp(413, 'arquivo_grande', 'A imagem deve ter no máximo 8 MB.');
      throw erro;
    });
    const imagem = await processarAvatar(dados);
    const id = armazem.gravar(imagem, 'webp');
    let anterior: string | null | undefined;
    try {
      // Ler o anterior e trocar na mesma transação: envios simultâneos não deixam arquivo órfão.
      anterior = banco.transaction(() => {
        const atual = buscarPorId(banco, req.usuarioId!)?.avatar_arquivo;
        banco.prepare('UPDATE usuarios SET avatar_arquivo = ? WHERE id = ?').run(id, req.usuarioId!);
        return atual;
      })();
    } catch (erro) {
      armazem.apagar(id);
      throw erro;
    }
    armazem.apagar(anterior);
    return { avatarUrl: avisar(req.usuarioId!).avatarUrl! };
  });
  return avisar;
}
