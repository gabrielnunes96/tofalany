import { QUALIDADES_TELA, type QualidadeTela, type TransmissaoDto } from '@tofalando/shared';
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

  function liberar(canalVozId: number, motivo?: string) {
    const t = ativas.get(canalVozId);
    if (!t) return;
    ativas.delete(canalVozId);
    auditar('tela_parou', t, motivo);
    io.emit('tela:parada', { canalVozId, usuarioId: t.usuarioId });
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
          const atual = ativas.get(canalVozId);
          if (atual && atual.usuarioId !== usuarioId) {
            const nome = buscarPorId(banco, atual.usuarioId)?.nome_exibicao ?? 'Alguém';
            throw new ErroHttp(409, 'sem_permissao', `${nome} já está transmitindo neste canal.`);
          }
          if (atual) return atual;
          const t: TransmissaoDto = { canalVozId, usuarioId, qualidade: qualidade as QualidadeTela };
          ativas.set(canalVozId, t);
          auditar('tela_iniciou', t);
          io.emit('tela:iniciada', t);
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
    /** Quem saiu da voz (por qualquer motivo) deixa de transmitir. */
    saiuDaVoz(usuarioId: number, canalVozId: number) {
      if (ativas.get(canalVozId)?.usuarioId === usuarioId) liberar(canalVozId, 'saiu_da_voz');
    },
  };
}
