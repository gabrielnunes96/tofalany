import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarCanal, comunidadeDoCanal } from '../dominio/canais.js';
import { membroDe } from '../dominio/comunidades.js';
import { temPermissao } from '../dominio/funcoes.js';
import { buscarPorId } from '../dominio/usuarios.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { criarLimitador } from '../auth/limitador.js';
import type { Push } from '../dominio/push.js';
import { comAck } from './acoes.js';
import type { ServidorTempoReal, SocketTofalando } from './tempo-real.js';
import type { Voz } from './voz.js';

/** RN-11: no máximo 1 chamado por minuto para a mesma pessoa (de quem chama) e 5 por minuto de cada pessoa. */
const UM_MINUTO = 60_000;

/**
 * celular (RN-11, RF-9): quem está numa sala de voz chama outra pessoa do mesmo servidor. A pessoa recebe
 * `voz:chamado` nas conexões dela neste servidor e, com o app fechado, um aviso por push. Quem está em "não
 * incomodar" não recebe; quem não pode entrar na voz também não.
 */
export function criarChamar(io: ServidorTempoReal, banco: Banco, voz: Pick<Voz, 'presenca'>, statusDe: (usuarioId: number) => string | undefined, push: Push, registrarErro: (e: unknown) => void) {
  const porPar = criarLimitador(1, UM_MINUTO);
  const porPessoa = criarLimitador(5, UM_MINUTO);
  return {
    registrar(socket: SocketTofalando) {
      const usuarioId = socket.data.usuarioId;
      socket.on(
        'voz:chamar',
        comAck(registrarErro, (dados: unknown) => {
          const alvo = typeof dados === 'object' && dados !== null ? (dados as { usuarioId?: unknown }).usuarioId : undefined;
          if (typeof alvo !== 'number' || !Number.isInteger(alvo) || alvo < 1) throw new ErroHttp(400, 'dados_invalidos', 'Pessoa inválida.');
          const c = socket.data.comunidadeId;
          const onde = voz.presenca(usuarioId);
          if (!onde || comunidadeDoCanal(banco, onde.canalVozId) !== c) throw new ErroHttp(403, 'sem_permissao', 'Entre numa sala de voz deste servidor para chamar alguém.');
          if (alvo === usuarioId) throw new ErroHttp(400, 'dados_invalidos', 'Você já está na voz.');
          // A mesma resposta para quem não é do servidor e quem não pode entrar na voz.
          if (!membroDe(banco, c, alvo) || !temPermissao(banco, alvo, 'entrar_voz', c)) throw new ErroHttp(404, 'nao_encontrado', 'Essa pessoa não pode ser chamada para a voz.');
          if (voz.presenca(alvo)?.canalVozId === onde.canalVozId) throw new ErroHttp(400, 'dados_invalidos', 'Essa pessoa já está na sala.');
          if (!porPessoa.permitir(String(usuarioId)) || !porPar.permitir(`${usuarioId}:${alvo}`)) throw new ErroHttp(429, 'muitas_tentativas', 'Calma: espere um pouco para chamar de novo.');
          const sala = buscarCanal(banco, onde.canalVozId);
          const porNome = buscarPorId(banco, usuarioId)?.nome_exibicao ?? 'Alguém';
          registrarAuditoria(banco, { tipo: 'voz_chamou', atorId: usuarioId, alvoUsuarioId: alvo, comunidadeId: c, canal: sala ? { id: sala.id, nome: sala.nome } : undefined });
          // Não incomodar: o chamado não chega (nem pelo app, nem por push); quem chamou não fica sabendo.
          if (statusDe(alvo) === 'naoIncomodar') return undefined;
          const aviso = { porId: usuarioId, porNome, canalVozId: onde.canalVozId, canalNome: sala?.nome ?? '' };
          for (const s of io.of('/').sockets.values()) if (s.data.usuarioId === alvo && s.data.comunidadeId === c) s.emit('voz:chamado', aviso);
          push.avisar([alvo], { tipo: 'chamado', resumo: { tipo: 'chamado', porNome, texto: sala?.nome ?? '', onde: sala?.nome ?? '', comunidadeId: c, canalVozId: onde.canalVozId } });
          return undefined;
        }),
      );
    },
  };
}
