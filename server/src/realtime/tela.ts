import { temPermissao } from '../dominio/funcoes.js';
import { comunidadeDoCanal } from '../dominio/canais.js';
import { membroDe } from '../dominio/comunidades.js';
import { salaComunidade } from './salas.js';
import { DIMENSOES_TELA, QUALIDADES_TELA, qualidadesPermitidas, type QualidadeTela, type TransmissaoDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarCanal } from '../dominio/canais.js';
import { buscarPorId } from '../dominio/usuarios.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { comAck } from './acoes.js';
import type { ServidorTempoReal, SocketTofalando } from './tempo-real.js';
import type { Voz } from './voz.js';

/**
 * RF-26/RN-10: uma transmissão de tela por canal de voz. Quem quer transmitir pede a trava (`tela:pedir`);
 * ela é liberada ao parar, ao sair da voz (queda, troca de canal, conta removida) ou com o canal removido.
 */
export function criarTela(io: ServidorTempoReal, banco: Banco, voz: Pick<Voz, 'presenca'>, registrarErro: (e: unknown) => void) {
  const ativas = new Map<number, TransmissaoDto>();

  function auditar(tipo: 'tela_iniciou' | 'tela_parou', t: TransmissaoDto, motivo?: string) {
    try {
      const canal = buscarCanal(banco, t.canalVozId);
      registrarAuditoria(banco, {
        tipo,
        atorId: t.usuarioId,
        canal: canal ? { id: canal.id, nome: canal.nome } : undefined,
        detalhes: { qualidade: t.qualidade, ...(motivo ? { motivo } : {}) },
      });
    } catch (erro) {
      registrarErro(erro);
    }
  }

  /** Cargo e permissão de transmitir em alta no servidor do canal (cada servidor tem os seus cargos). */
  function papel(usuarioId: number, canalVozId: number) {
    const c = comunidadeDoCanal(banco, canalVozId) ?? 1;
    return { cargo: membroDe(banco, c, usuarioId)?.cargo ?? 'membro', alta: temPermissao(banco, usuarioId, 'transmitir_alta', c), c };
  }
  const paraCanal = (canalVozId: number) => io.to(salaComunidade(comunidadeDoCanal(banco, canalVozId) ?? 1));

  function liberar(canalVozId: number, motivo?: string) {
    const t = ativas.get(canalVozId);
    if (!t) return;
    // Servidor fechando: nada a gravar nem a avisar.
    if (!banco.open) {
      ativas.delete(canalVozId);
      return;
    }
    ativas.delete(canalVozId);
    auditar('tela_parou', t, motivo);
    paraCanal(canalVozId).emit('tela:parada', { canalVozId, usuarioId: t.usuarioId });
  }

  return {
    transmissoes: () => [...ativas.values()],
    registrar(socket: SocketTofalando) {
      const usuarioId = socket.data.usuarioId;
      socket.on(
        'tela:pedir',
        comAck(registrarErro, (dados: unknown) => {
          const { canalVozId, qualidade } = (typeof dados === 'object' && dados !== null ? dados : {}) as { canalVozId?: unknown; qualidade?: unknown };
          if (typeof canalVozId !== 'number' || !Number.isInteger(canalVozId)) throw new ErroHttp(400, 'dados_invalidos', 'Canal inválido.');
          if (!QUALIDADES_TELA.includes(qualidade as QualidadeTela)) throw new ErroHttp(400, 'dados_invalidos', 'Qualidade inválida.');
          if (voz.presenca(usuarioId)?.canalVozId !== canalVozId) throw new ErroHttp(403, 'sem_permissao', 'Entre no canal de voz para transmitir.');
          // RN-17: membro transmite só em 720p30 (o servidor aplica, não só a tela).
          const { cargo, alta } = papel(usuarioId, canalVozId);
          if (!qualidadesPermitidas(cargo, alta).includes(qualidade as QualidadeTela)) {
            throw new ErroHttp(403, 'sem_permissao', 'Seu cargo só transmite em 720p30.');
          }
          const atual = ativas.get(canalVozId);
          if (atual && atual.usuarioId !== usuarioId) {
            const nome = buscarPorId(banco, atual.usuarioId)?.nome_exibicao ?? 'Alguém';
            throw new ErroHttp(409, 'sem_permissao', `${nome} já está transmitindo neste canal.`);
          }
          if (atual) return atual;
          const t: TransmissaoDto = { canalVozId, usuarioId, qualidade: qualidade as QualidadeTela };
          ativas.set(canalVozId, t);
          auditar('tela_iniciou', t);
          paraCanal(canalVozId).emit('tela:iniciada', t);
          return t;
        }),
      );
      socket.on(
        'tela:parar',
        comAck(registrarErro, (dados: unknown) => {
          const canalVozId = typeof dados === 'object' && dados !== null ? (dados as { canalVozId?: unknown }).canalVozId : undefined;
          if (typeof canalVozId !== 'number' || !Number.isInteger(canalVozId)) throw new ErroHttp(400, 'dados_invalidos', 'Canal inválido.');
          if (ativas.get(canalVozId)?.usuarioId === usuarioId) liberar(canalVozId, 'parou');
          return undefined;
        }),
      );
    },
    /**
     * R-2: confere a faixa de tela publicada no LiveKit (webhook). Silenciar quando quem publicou não tem a
     * trava do canal (segunda tela) ou passou das dimensões da qualidade pedida (membro acima de 720p30).
     * As dimensões vêm de quem publica: um app adulterado poderia mentir (risco aceito na técnica).
     */
    faixaForaDaRegra(usuarioId: number, canalVozId: number, largura: number, altura: number, soAudio = false): boolean {
      const t = ativas.get(canalVozId);
      if (!t || t.usuarioId !== usuarioId) return true;
      // Áudio da tela: basta ter a trava.
      if (soAudio) return false;
      // Sem dimensões (o livekit-client sempre manda em vídeo): de membro, é suspeito.
      const { cargo, alta } = papel(usuarioId, canalVozId);
      if (largura <= 0 || altura <= 0) return !alta;
      const qualidade = qualidadesPermitidas(cargo, alta).includes(t.qualidade) ? t.qualidade : '720p30';
      const max = DIMENSOES_TELA[qualidade];
      // Retrato (tela em pé) também vale: compara o lado maior e o menor.
      return Math.max(largura, altura) > max.largura || Math.min(largura, altura) > max.altura;
    },
    /** RN-17: quem perdeu o cargo transmitindo acima de 720p30 deixa de transmitir. */
    cargoMudou(usuarioId: number) {
      for (const t of [...ativas.values()]) {
        if (t.usuarioId !== usuarioId) continue;
        const { cargo, alta } = papel(usuarioId, t.canalVozId);
        if (!qualidadesPermitidas(cargo, alta).includes(t.qualidade)) liberar(t.canalVozId, 'cargo_alterado');
      }
    },
    /** Quem saiu da voz (por qualquer motivo) deixa de transmitir. */
    saiuDaVoz(usuarioId: number, canalVozId: number) {
      if (ativas.get(canalVozId)?.usuarioId === usuarioId) liberar(canalVozId, 'saiu_da_voz');
    },
  };
}
