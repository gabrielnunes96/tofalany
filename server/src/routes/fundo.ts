import type { FastifyInstance } from 'fastify';
import { AVATAR_MAX_BYTES, type UsuarioDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { criarLimitador } from '../auth/limitador.js';
import { buscarPorId, paraDto } from '../dominio/usuarios.js';
import { processarFundo } from '../dominio/fundo.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import type { Armazem } from '../arquivos/armazem.js';

/**
 * Mini perfil: PUT /api/eu/fundo (imagem ou GIF enviado) e DELETE /api/eu/fundo. O fundo novo e a miniatura trocam
 * na mesma transação; os anteriores são apagados depois (fundo trocado não fica público no armazém).
 * `avisar` manda o perfil novo aos servidores e aos conhecidos da pessoa.
 */
export function registrarRotasFundo(app: FastifyInstance, banco: Banco, armazem: Armazem, avisar: (id: number) => UsuarioDto, limite = criarLimitador(6, 10 * 60_000)): void {
  /** Troca o fundo enviado (ou tira tudo, com null) e devolve os arquivos que saíram. */
  const trocar = (usuarioId: number, arquivo: string | null, mini: string | null): (string | null)[] =>
    banco.transaction(() => {
      const atual = buscarPorId(banco, usuarioId);
      // Conta removida no meio do envio: nada a trocar (quem chamou apaga os arquivos novos).
      if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Conta não encontrada.');
      // "Tirar fundo" volta ao padrão: sem imagem e sem cores.
      if (arquivo === null) banco.prepare('UPDATE usuarios SET fundo_arquivo = NULL, fundo_mini = NULL, fundo_cores = NULL WHERE id = ?').run(usuarioId);
      else banco.prepare('UPDATE usuarios SET fundo_arquivo = ?, fundo_mini = ? WHERE id = ?').run(arquivo, mini, usuarioId);
      registrarAuditoria(banco, { tipo: 'perfil_alterado', atorId: usuarioId });
      return [atual?.fundo_arquivo ?? null, atual?.fundo_mini ?? null];
    })();

  app.put('/api/eu/fundo', { preHandler: exigirSessao(banco) }, async (req): Promise<UsuarioDto> => {
    if (!limite.permitir(String(req.usuarioId))) throw new ErroHttp(429, 'muitas_tentativas', 'Muitas trocas de fundo seguidas. Espere alguns minutos.');
    if (!req.isMultipart()) throw new ErroHttp(400, 'dados_invalidos', 'Envie a imagem como multipart/form-data.');
    // Campos de texto a mais são ignorados (não são lidos nem guardados).
    const parte = await req.file({ limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });
    if (!parte || parte.fieldname !== 'arquivo') throw new ErroHttp(400, 'dados_invalidos', 'Envie a imagem no campo "arquivo".');
    const dados = await parte.toBuffer().catch((erro: { code?: string }) => {
      if (erro.code === 'FST_REQ_FILE_TOO_LARGE') throw new ErroHttp(413, 'arquivo_grande', 'A imagem deve ter no máximo 8 MB.');
      throw erro;
    });
    const { imagem, miniatura } = await processarFundo(dados);
    // Qualquer falha daqui até a troca apaga o que já foi gravado (nada fica órfão e público no armazém).
    const gravados: string[] = [];
    let anteriores: (string | null)[];
    try {
      const arquivo = armazem.gravar(imagem, 'webp');
      gravados.push(arquivo);
      const mini = armazem.gravar(miniatura, 'webp');
      gravados.push(mini);
      anteriores = trocar(req.usuarioId!, arquivo, mini);
    } catch (erro) {
      for (const g of gravados) armazem.apagar(g);
      throw erro;
    }
    for (const a of anteriores) armazem.apagar(a);
    return avisar(req.usuarioId!);
  });

  app.delete('/api/eu/fundo', { preHandler: exigirSessao(banco) }, async (req): Promise<UsuarioDto> => {
    const atual = buscarPorId(banco, req.usuarioId!);
    // Sem fundo nenhum: nada a tirar, sem auditoria nem aviso (repetir em laço não enche nada).
    if (atual && !atual.fundo_arquivo && !atual.fundo_cores) return paraDto(atual);
    for (const a of trocar(req.usuarioId!, null, null)) armazem.apagar(a);
    return avisar(req.usuarioId!);
  });
}
