import { SOM_INTERVALO_MS } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarSom, comunidadeDoSom } from '../dominio/sons.js';
import { temPermissao } from '../dominio/funcoes.js';
import { comunidadeDoCanal } from '../dominio/canais.js';
import { ehSalaAfk } from '../dominio/comunidades.js';
import { meuCastigo } from '../dominio/moderacao.js';
import { buscarAudio, temAudio } from '../dominio/audios-loja.js';
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
          const d = typeof dados === 'object' && dados !== null ? (dados as { somId?: unknown; audioId?: unknown }) : {};
          const id = d.audioId !== undefined ? d.audioId : d.somId;
          const daLoja = d.audioId !== undefined;
          if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || (d.audioId !== undefined && d.somId !== undefined)) throw new ErroHttp(400, 'dados_invalidos', 'Som inválido.');
          const onde = voz.presenca(usuarioId);
          if (!onde) throw new ErroHttp(403, 'sem_permissao', 'Entre num canal de voz para tocar sons.');
          // audios-na-loja (A1): o canal da voz precisa ser deste servidor (a presença é uma por conta).
          if (comunidadeDoCanal(banco, onde.canalVozId) !== socket.data.comunidadeId) throw new ErroHttp(403, 'sem_permissao', 'Toque os sons pelo servidor da sua chamada.');
          // Castigo antes da permissão (o castigo também tira "Soundboard"), para a mensagem certa.
          if (meuCastigo(banco, socket.data.comunidadeId, usuarioId)) throw new ErroHttp(403, 'sem_permissao', 'Você está de castigo.');
          if (!temPermissao(banco, usuarioId, 'tocar_sons', socket.data.comunidadeId)) throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não permite tocar sons.');
          // A2: na sala de AFK ninguém toca (RN-11).
          if (ehSalaAfk(banco, onde.canalVozId)) throw new ErroHttp(403, 'sem_permissao', 'Na sala de AFK não se tocam sons.');
          const falta = (ultimo.get(usuarioId) ?? -Infinity) + SOM_INTERVALO_MS - agora();
          if (falta > 0) throw new ErroHttp(429, 'muitas_tentativas', `Aguarde ${Math.ceil(falta / 1000)} s para tocar outro som.`);
          if (daLoja) {
            // A3: só quem tem o áudio (ou o administrador da instalação); inexistente e sem posse dão o mesmo erro.
            const audio = temAudio(banco, usuarioId, id) ? buscarAudio(banco, id) : undefined;
            if (!audio) throw new ErroHttp(404, 'nao_encontrado', 'Som não encontrado.');
            ultimo.set(usuarioId, agora());
            // A4: o áudio vai do banco (quem ouve pode não ter); nada do pedido é repassado.
            const aviso = { audio: audio.dto, porUsuarioId: usuarioId, canalVozId: onde.canalVozId };
            for (const c of voz.conexoesNoCanal(onde.canalVozId)) io.to(c).emit('audio:tocado', aviso);
            return undefined;
          }
          const somId = id;
          if (comunidadeDoSom(banco, somId) !== socket.data.comunidadeId || !buscarSom(banco, somId)) throw new ErroHttp(404, 'nao_encontrado', 'Som não encontrado.');
          ultimo.set(usuarioId, agora());
          const aviso = { somId, porUsuarioId: usuarioId, canalVozId: onde.canalVozId };
          for (const c of voz.conexoesNoCanal(onde.canalVozId)) io.to(c).emit('som:tocado', aviso);
          return undefined;
        }),
      );
    },
  };
}
