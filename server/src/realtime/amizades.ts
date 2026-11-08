import type { Ack, AmizadeDto, UsuarioDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { aceitarAmizade, listarAmizades, pedirAmizade, removerAmizade } from '../dominio/amizades.js';
import { membroDe } from '../dominio/comunidades.js';
import { listarDms } from '../dominio/dms.js';
import { buscarPorId, paraDto } from '../dominio/usuarios.js';
import type { ServidorTempoReal, SocketTofalando } from './tempo-real.js';

/**
 * Quem a pessoa precisa conhecer (nome, cor, avatar) além dos membros do servidor da conexão: amigos, pedidos e
 * quem conversa com ela em DM. Vale de qualquer servidor da instalação.
 */
export function conhecidosDe(banco: Banco, eu: number, comunidadeId: number): UsuarioDto[] {
  const ids = new Set<number>([...listarAmizades(banco, eu).map((a) => a.usuarioId), ...listarDms(banco, eu).map((d) => d.outroId)]);
  const lista: UsuarioDto[] = [];
  for (const id of ids) {
    if (membroDe(banco, comunidadeId, id)) continue;
    const u = buscarPorId(banco, id);
    // Fora deste servidor: sem cargo de lá (aparece como membro comum, só para nome e avatar).
    if (u) lista.push({ ...paraDto(u), cargo: 'membro', funcaoId: null });
  }
  return lista;
}

/** Amigos: pedir, aceitar e recusar/desfazer; as duas pessoas recebem a lista nova em todas as conexões. */
export function registrarEventosAmizades(io: ServidorTempoReal, socket: SocketTofalando, banco: Banco, registrarErro: (e: unknown) => void) {
  const eu = socket.data.usuarioId;

  const avisar = (usuarioId: number) => {
    for (const s of io.of('/').sockets.values()) {
      if (s.data.usuarioId !== usuarioId) continue;
      s.emit('amizades:atualizadas', { amizades: listarAmizades(banco, usuarioId), conhecidos: conhecidosDe(banco, usuarioId, s.data.comunidadeId) });
    }
  };

  const tratar = (acao: (outro: number) => void) => (dados: unknown, ack: Ack<AmizadeDto[]>) => {
    if (typeof ack !== 'function') return;
    try {
      const outro = typeof dados === 'object' && dados !== null ? (dados as { usuarioId?: unknown }).usuarioId : undefined;
      if (typeof outro !== 'number' || !Number.isInteger(outro) || outro < 1) throw new ErroHttp(400, 'dados_invalidos', 'Pessoa inválida.');
      acao(outro);
      avisar(eu);
      avisar(outro);
      ack({ ok: true, valor: listarAmizades(banco, eu) });
    } catch (erro) {
      if (erro instanceof ErroHttp) ack({ ok: false, erro: erro.message });
      else {
        registrarErro(erro);
        ack({ ok: false, erro: 'Erro interno no servidor.' });
      }
    }
  };

  socket.on('amizade:pedir', tratar((outro) => pedirAmizade(banco, eu, outro)));
  socket.on('amizade:aceitar', tratar((outro) => aceitarAmizade(banco, eu, outro)));
  socket.on('amizade:remover', tratar((outro) => removerAmizade(banco, eu, outro)));
}
