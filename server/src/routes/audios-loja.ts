import type { FastifyInstance } from 'fastify';
import { AUDIOS_LOJA_MAX, validarNomeSom, type AudioLojaAdminDto, type AudioLojaDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { exigirAdmin, exigirPrincipal, exigirSessao } from '../auth/sessao-http.js';
import type { Armazem } from '../arquivos/armazem.js';
import type { TempoReal } from '../realtime/tempo-real.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { conferirAudio } from '../dominio/sons.js';
import { audiosParaAdmin, buscarAudio, ehRaridade, inserirAudio, retirarAudio, totalDeAudios } from '../dominio/audios-loja.js';
import { lerFormulario } from './sons.js';

const paramId = { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } as const;
const corpoAlterar = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: { nome: { type: 'string' }, raridade: { type: 'string', enum: ['comum', 'raro', 'epico', 'lendario'] } },
} as const;

/**
 * audios-na-loja (RF-1, RN-1, A8): só o administrador da instalação (admin do servidor principal, pedido pelo
 * principal) cadastra, altera e tira áudios da loja. O arquivo é gravado só pelo armazém (nome aleatório, A11).
 */
export function registrarRotasAudiosLoja(app: FastifyInstance, banco: Banco, armazem: Armazem, tempoReal: TempoReal): void {
  const soAdminDaInstalacao = [exigirSessao(banco), exigirAdmin(banco), exigirPrincipal()];

  app.get('/api/admin/loja/audios', { preHandler: soAdminDaInstalacao }, async (): Promise<AudioLojaAdminDto[]> => audiosParaAdmin(banco));

  app.post('/api/admin/loja/audios', { preHandler: soAdminDaInstalacao }, async (req, reply): Promise<AudioLojaDto> => {
    // Já cheia: recusa antes de ler o upload (a conferência definitiva fica na transação).
    if (totalDeAudios(banco) >= AUDIOS_LOJA_MAX) throw new ErroHttp(409, 'limite_sons', `A loja já tem ${AUDIOS_LOJA_MAX} áudios.`);
    const { campos, dados } = await lerFormulario(req, ['nome', 'raridade']);
    const n = validarNomeSom(campos.nome ?? '');
    if (!n.ok) throw new ErroHttp(400, 'dados_invalidos', n.erro);
    if (!ehRaridade(campos.raridade)) throw new ErroHttp(400, 'dados_invalidos', 'Escolha a raridade: comum, raro, épico ou lendário.');
    const raridade = campos.raridade;
    if (!dados) throw new ErroHttp(400, 'dados_invalidos', 'Envie o arquivo de áudio.');
    const { ext, duracaoMs } = await conferirAudio(dados);
    const arquivo = armazem.gravar(dados, ext);
    let audio: AudioLojaDto;
    try {
      audio = banco.transaction(() => {
        const novo = inserirAudio(banco, { nome: n.valor, arquivo, duracaoMs, raridade, criadoPor: req.usuarioId! });
        registrarAuditoria(banco, { tipo: 'loja_audio_cadastrado', atorId: req.usuarioId!, detalhes: { audio: n.valor, raridade } });
        return novo;
      })();
    } catch (erro) {
      armazem.apagar(arquivo);
      throw erro;
    }
    tempoReal.avisarAudiosLoja();
    reply.code(201);
    return audio;
  });

  // Nome e raridade; o arquivo não muda (quem comprou nunca perde o áudio, A12). Mudar a raridade não mexe em quem já comprou (RN-4).
  app.patch('/api/admin/loja/audios/:id', { preHandler: soAdminDaInstalacao, schema: { params: paramId, body: corpoAlterar } }, async (req): Promise<AudioLojaDto> => {
    const { id } = req.params as { id: number };
    const corpo = req.body as { nome?: string; raridade?: 'comum' | 'raro' | 'epico' | 'lendario' };
    const novoNome = corpo.nome === undefined ? undefined : validarNomeSom(corpo.nome);
    if (novoNome && !novoNome.ok) throw new ErroHttp(400, 'dados_invalidos', novoNome.erro);
    const audio = banco.transaction(() => {
      const atual = buscarAudio(banco, id);
      if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Áudio não encontrado na loja.');
      const nome = novoNome?.ok ? novoNome.valor : atual.nome;
      const raridade = corpo.raridade ?? atual.raridade;
      // Nada mudou: sem gravar nem auditar.
      if (nome === atual.nome && raridade === atual.raridade) return { audio: atual.dto, mudou: false };
      banco.prepare('UPDATE loja_audios SET nome = ?, raridade = ? WHERE id = ?').run(nome, raridade, id);
      const detalhes: Record<string, string> = { audio: nome };
      if (nome !== atual.nome) detalhes.nomeAntes = atual.nome;
      if (raridade !== atual.raridade) {
        detalhes.de = atual.raridade;
        detalhes.para = raridade;
      }
      registrarAuditoria(banco, { tipo: 'loja_audio_alterado', atorId: req.usuarioId!, detalhes });
      return { audio: buscarAudio(banco, id)!.dto, mudou: true };
    })();
    if (audio.mudou) tempoReal.avisarAudiosLoja();
    return audio.audio;
  });

  app.delete('/api/admin/loja/audios/:id', { preHandler: soAdminDaInstalacao, schema: { params: paramId } }, async (req, reply) => {
    const { id } = req.params as { id: number };
    const { audio, apagar } = banco.transaction(() => {
      const r = retirarAudio(banco, id);
      registrarAuditoria(banco, { tipo: 'loja_audio_retirado', atorId: req.usuarioId!, detalhes: { audio: r.audio.nome, raridade: r.audio.raridade } });
      return r;
    })();
    if (apagar) {
      armazem.apagar(apagar);
      req.log.info({ audioId: audio.id }, 'áudio da loja sem compradores apagado');
    }
    tempoReal.avisarAudiosLoja();
    reply.code(204);
  });
}
