import { randomBytes } from 'node:crypto';
import { CHAMADO_DURACAO_MS, type ChamadoVozDto, type FimChamadoDto, type MotivoFimChamado } from '@tofalando/shared';
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

/** chamar-tocando: um chamado aberto (só em memória; um reinício do servidor perde os abertos). */
interface Aberto {
  id: string;
  porId: number;
  alvoId: number;
  alvoNome: string;
  comunidadeId: number;
  canalVozId: number;
  timer: NodeJS.Timeout;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * celular (RN-11, RF-9) e chamar-tocando: quem está numa sala de voz chama outra pessoa do mesmo servidor. O chamado
 * fica aberto por 15 s (RN-3) e acaba por resposta, cancelamento, entrada na voz ou tempo, avisando os dois lados
 * (`voz:chamado:fim`). Só quem está online ou ausente pode ser chamado (RN-1); offline, invisível e quem não pode
 * entrar na voz recebem a mesma recusa (o status não vaza). Não incomodar: o chamado é aceito em silêncio.
 */
export function criarChamar(
  io: ServidorTempoReal,
  banco: Banco,
  voz: Pick<Voz, 'presenca'>,
  statusDe: (usuarioId: number) => string | undefined,
  push: Push,
  registrarErro: (e: unknown) => void,
  duracaoMs = CHAMADO_DURACAO_MS,
) {
  const porPar = criarLimitador(1, UM_MINUTO);
  const porPessoa = criarLimitador(5, UM_MINUTO);
  /** Um chamado aberto por pessoa chamada em cada servidor (RN-6); chave `comunidade:alvo`. */
  const abertos = new Map<string, Aberto>();
  const chave = (comunidadeId: number, alvoId: number) => `${comunidadeId}:${alvoId}`;

  const conexoes = (usuarioId: number, comunidadeId: number) =>
    [...io.of('/').sockets.values()].filter((s) => s.data.usuarioId === usuarioId && s.data.comunidadeId === comunidadeId);

  /** Idempotente: o primeiro motivo vence (resposta, cancelamento e tempo podem chegar juntos). */
  function encerrar(a: Aberto, motivo: MotivoFimChamado) {
    if (abertos.get(chave(a.comunidadeId, a.alvoId)) !== a) return;
    clearTimeout(a.timer);
    abertos.delete(chave(a.comunidadeId, a.alvoId));
    const fim: FimChamadoDto = { id: a.id, motivo, nome: a.alvoNome };
    for (const s of [...conexoes(a.porId, a.comunidadeId), ...conexoes(a.alvoId, a.comunidadeId)]) s.emit('voz:chamado:fim', fim);
  }

  const lerId = (dados: unknown) => {
    const id = ehObjeto(dados) ? dados.id : undefined;
    if (typeof id !== 'string' || id.length > 64) throw new ErroHttp(400, 'dados_invalidos', 'Chamado inválido.');
    return id;
  };
  const acharPorId = (id: string, comunidadeId: number) => [...abertos.values()].find((a) => a.id === id && a.comunidadeId === comunidadeId);

  return {
    registrar(socket: SocketTofalando) {
      const usuarioId = socket.data.usuarioId;
      socket.on(
        'voz:chamar',
        comAck(registrarErro, (dados: unknown) => {
          const alvo = ehObjeto(dados) ? dados.usuarioId : undefined;
          if (typeof alvo !== 'number' || !Number.isInteger(alvo) || alvo < 1) throw new ErroHttp(400, 'dados_invalidos', 'Pessoa inválida.');
          const c = socket.data.comunidadeId;
          const onde = voz.presenca(usuarioId);
          if (!onde || comunidadeDoCanal(banco, onde.canalVozId) !== c) throw new ErroHttp(403, 'sem_permissao', 'Entre numa sala de voz deste servidor para chamar alguém.');
          if (alvo === usuarioId) throw new ErroHttp(400, 'dados_invalidos', 'Você já está na voz.');
          // A mesma resposta para quem não é do servidor, quem não pode entrar na voz e quem está offline ou
          // invisível (RN-1): quem chama não descobre o status.
          if (!membroDe(banco, c, alvo) || !temPermissao(banco, alvo, 'entrar_voz', c) || statusDe(alvo) === undefined) {
            throw new ErroHttp(404, 'nao_encontrado', 'Essa pessoa não pode ser chamada para a voz.');
          }
          if (voz.presenca(alvo)?.canalVozId === onde.canalVozId) throw new ErroHttp(400, 'dados_invalidos', 'Essa pessoa já está na sala.');
          const alvoNome = buscarPorId(banco, alvo)?.nome_exibicao ?? 'Essa pessoa';
          // RN-6 (CA-8): um chamado aberto por pessoa; vale antes do limite de tentativas.
          if (abertos.has(chave(c, alvo))) throw new ErroHttp(409, 'dados_invalidos', `${alvoNome} já está recebendo um chamado.`);
          if (!porPessoa.permitir(String(usuarioId)) || !porPar.permitir(`${usuarioId}:${alvo}`)) throw new ErroHttp(429, 'muitas_tentativas', 'Calma: espere um pouco para chamar de novo.');
          const sala = buscarCanal(banco, onde.canalVozId);
          const porNome = buscarPorId(banco, usuarioId)?.nome_exibicao ?? 'Alguém';
          registrarAuditoria(banco, { tipo: 'voz_chamou', atorId: usuarioId, alvoUsuarioId: alvo, comunidadeId: c, canal: sala ? { id: sala.id, nome: sala.nome } : undefined });
          const aberto: Aberto = {
            id: randomBytes(12).toString('hex'),
            porId: usuarioId,
            alvoId: alvo,
            alvoNome,
            comunidadeId: c,
            canalVozId: onde.canalVozId,
            timer: setTimeout(() => encerrar(aberto, 'tempo'), duracaoMs),
          };
          aberto.timer.unref();
          abertos.set(chave(c, alvo), aberto);
          // Não incomodar: o chamado não chega (nem pelo app, nem por push); quem chamou vê "não atendeu" no fim.
          if (statusDe(alvo) === 'naoIncomodar') return { id: aberto.id };
          const aviso: ChamadoVozDto = { id: aberto.id, segundos: Math.round(duracaoMs / 1000), porId: usuarioId, porNome, canalVozId: onde.canalVozId, canalNome: sala?.nome ?? '' };
          for (const s of conexoes(alvo, c)) s.emit('voz:chamado', aviso);
          push.avisar([alvo], { tipo: 'chamado', resumo: { tipo: 'chamado', porNome, texto: sala?.nome ?? '', onde: sala?.nome ?? '', comunidadeId: c, canalVozId: onde.canalVozId } });
          return { id: aberto.id };
        }),
      );
      // RN-4: só quem foi chamado responde; chamado desconhecido (já acabou, servidor reiniciou) é ok sem efeito.
      socket.on(
        'voz:responder',
        comAck(registrarErro, (dados: unknown) => {
          const id = lerId(dados);
          const aceitar = ehObjeto(dados) && dados.aceitar === true;
          const a = acharPorId(id, socket.data.comunidadeId);
          if (a && a.alvoId === usuarioId) encerrar(a, aceitar ? 'atendido' : 'recusado');
          return undefined;
        }),
      );
      // RN-5: só quem chamou cancela.
      socket.on(
        'voz:cancelar',
        comAck(registrarErro, (dados: unknown) => {
          const a = acharPorId(lerId(dados), socket.data.comunidadeId);
          if (a && a.porId === usuarioId) encerrar(a, 'cancelado');
          return undefined;
        }),
      );
    },
    /** RN-5: quem chamou saiu da voz: os chamados dele acabam. */
    saiuDaVoz(usuarioId: number) {
      for (const a of [...abertos.values()]) if (a.porId === usuarioId) encerrar(a, 'cancelado');
    },
    /**
     * Alguém entrou numa sala de voz: se foi chamado para ela, atendeu; se foi para outra, não atendeu. Quem chamou e
     * trocou de sala desiste dos chamados (a sala do chamado não é mais a dele).
     */
    entrouNaVoz(usuarioId: number, canalVozId: number) {
      for (const a of [...abertos.values()]) {
        if (a.alvoId === usuarioId) encerrar(a, a.canalVozId === canalVozId ? 'atendido' : 'tempo');
        else if (a.porId === usuarioId && a.canalVozId !== canalVozId) encerrar(a, 'cancelado');
      }
    },
    fechar() {
      for (const a of abertos.values()) clearTimeout(a.timer);
      abertos.clear();
    },
  };
}
