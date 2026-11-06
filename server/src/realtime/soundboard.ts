import { SOM_INTERVALO_MS } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarSom } from '../dominio/sons.js';
import { comAck } from './acoes.js';
import type { ServidorTempoReal, SocketTofalando } from './tempo-real.js';
import type { Voz } from './voz.js';

/**
 * RF-23: tocar um som do soundboard. Só quem está num canal de voz toca (RN-12), uma vez a cada 3 s (RN-13),
 * e só quem está naquele canal recebe `som:tocado` (cada app toca localmente, com o próprio volume).
 */
export function criarSoundboard(io: ServidorTempoReal, banco: Banco, voz: Pick<Voz, 'presenca' | 'conexoesNoCanal'>, registrarErro: (e: unknown) => void, agora: () => number = () => Date.now()) {
  const ultimo = new Map<number, number>();
  return {
    registrar(socket: SocketTofalando) {
      const usuarioId = socket.data.usuarioId;
      socket.on(
        'som:tocar',
        comAck(registrarErro, (dados: unknown) => {
          const somId = typeof dados === 'object' && dados !== null ? (dados as { somId?: unknown }).somId : undefined;
          if (typeof somId !== 'number' || !Number.isInteger(somId) || somId < 1) throw new ErroHttp(400, 'dados_invalidos', 'Som inválido.');
          const onde = voz.presenca(usuarioId);
          if (!onde) throw new ErroHttp(403, 'sem_permissao', 'Entre num canal de voz para tocar sons.');
          const falta = (ultimo.get(usuarioId) ?? -Infinity) + SOM_INTERVALO_MS - agora();
          if (falta > 0) throw new ErroHttp(429, 'muitas_tentativas', `Aguarde ${Math.ceil(falta / 1000)} s para tocar outro som.`);
          if (!buscarSom(banco, somId)) throw new ErroHttp(404, 'nao_encontrado', 'Som não encontrado.');
          ultimo.set(usuarioId, agora());
          const aviso = { somId, porUsuarioId: usuarioId, canalVozId: onde.canalVozId };
          for (const id of voz.conexoesNoCanal(onde.canalVozId)) io.to(id).emit('som:tocado', aviso);
          return undefined;
        }),
      );
    },
  };
}
