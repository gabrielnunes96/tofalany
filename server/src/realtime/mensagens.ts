import { validarTextoMensagem } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarCanal } from '../dominio/canais.js';
import { criarMensagemCanal } from '../dominio/mensagens.js';
import { comAck } from './acoes.js';
import type { ServidorTempoReal, SocketTofalando } from './tempo-real.js';

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** RF-8: envio de mensagem em canal de texto, entregue a todos (mensagem:nova). */
export function registrarEventosMensagens(io: ServidorTempoReal, socket: SocketTofalando, banco: Banco, registrarErro: (e: unknown) => void) {
  socket.on(
    'mensagem:enviar',
    comAck(registrarErro, (dados: unknown) => {
      const destino = ehObjeto(dados) && ehObjeto(dados.destino) ? dados.destino : undefined;
      const canalId = destino?.canalId;
      if (typeof canalId !== 'number' || !Number.isInteger(canalId)) throw new ErroHttp(400, 'dados_invalidos', 'Destino inválido.');
      const texto = validarTextoMensagem(ehObjeto(dados) && typeof dados.texto === 'string' ? dados.texto : '');
      if (!texto.ok) throw new ErroHttp(400, 'dados_invalidos', texto.erro);
      const canal = buscarCanal(banco, canalId);
      if (!canal || canal.tipo !== 'texto') throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
      const mensagem = criarMensagemCanal(banco, canalId, socket.data.usuarioId, texto.valor);
      io.emit('mensagem:nova', mensagem);
      return mensagem;
    }),
  );
}
