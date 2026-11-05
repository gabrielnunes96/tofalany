import type { FastifyInstance } from 'fastify';
import sharp, { type Metadata } from 'sharp';
import {
  AVATAR_LADO,
  AVATAR_MAX_BYTES,
  FORMATOS_AVATAR,
  IMAGEM_MAX_PIXELS,
  validarCor,
  validarNomeExibicao,
  type AtualizarPerfilRequest,
  type UsuarioDto,
} from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { buscarPorId, paraDto } from '../dominio/usuarios.js';
import type { Armazem } from '../arquivos/armazem.js';
import type { TempoReal } from '../realtime/tempo-real.js';

const corpoPerfil = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: { nomeExibicao: { type: 'string', maxLength: 256 }, cor: { type: 'string', maxLength: 16 } },
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

export function registrarRotasPerfil(app: FastifyInstance, banco: Banco, armazem: Armazem, tempoReal: TempoReal): void {
  const avisar = (id: number): UsuarioDto => {
    const dto = paraDto(buscarPorId(banco, id)!);
    tempoReal.io.emit('usuario:atualizado', dto);
    return dto;
  };

  app.patch('/api/eu', { schema: { body: corpoPerfil }, preHandler: exigirSessao(banco) }, async (req): Promise<UsuarioDto> => {
    const corpo = req.body as AtualizarPerfilRequest;
    const mudancas: Record<string, string> = {};
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
    const colunas = Object.keys(mudancas);
    // O schema descarta campos desconhecidos (ex.: "cargo"); se nada sobrou, não há o que mudar.
    if (colunas.length === 0) throw new ErroHttp(400, 'dados_invalidos', 'Informe o nome de exibição ou a cor.');
    banco
      .prepare(`UPDATE usuarios SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...colunas.map((c) => mudancas[c]!), req.usuarioId!);
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
}
