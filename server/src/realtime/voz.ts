import type { VozEstadoDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarCanal, comunidadeDoCanal } from '../dominio/canais.js';
import { afkDa } from '../dominio/comunidades.js';
import { temPermissao } from '../dominio/funcoes.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { comAck } from './acoes.js';
import { conferirMover } from '../dominio/moderacao.js';
import { criarLimitador } from '../auth/limitador.js';
import type { ServidorTempoReal, SocketTofalando } from './tempo-real.js';

/**
 * RF-13: quem está em qual canal de voz. A mídia vai direto ao LiveKit; aqui fica a presença que todos
 * veem, informada pelo app (`voz:estado`) e conferida pelo webhook do LiveKit (saída da sala).
 * Uma pessoa está em no máximo um canal; vale o último computador que entrou: o anterior recebe
 * `voz:tirado` e é tirado da sala do LiveKit (a identidade só é única dentro de cada sala).
 */
export interface Voz {
  estados(): VozEstadoDto[];
  /** Onde a pessoa está na voz agora (e por qual conexão), se estiver. */
  presenca(usuarioId: number): { canalVozId: number; socketId: string } | undefined;
  /** Conexões de quem está num canal de voz (para mandar só a eles). */
  conexoesNoCanal(canalVozId: number): string[];
  registrar(socket: SocketTofalando): void;
  /** Pontos e loja: quem está em voz agora, se está surdo e se está na carência de queda (a conexão caiu). */
  participantes(): { usuarioId: number; canalVozId: number; surdo: boolean; emCarencia: boolean }[];
  /** Canal de voz removido: todos saem dele. */
  canalRemovido(canal: { id: number; nome: string }): void;
  /** Webhook: a sessão de mídia `sid` saiu da sala do LiveKit (fechou, caiu, foi derrubada). */
  midiaSaiu(usuarioId: number, canalVozId: number, sid: string | undefined): void;
  /**
   * mover-e-afk (A6): webhook — alguém entrou numa sala do LiveKit. Depois do prazo, quem não está nela pela presença
   * (token antigo reaproveitado depois de mover, desconectar ou castigo) é tirado.
   */
  midiaEntrou(usuarioId: number, canalVozId: number): void;
  /** mover-e-afk (A7): a sala de AFK do servidor mudou — quem já está nela passa a ficar mudo. */
  afkMudou(comunidadeId: number): void;
  /** Sessão derrubada (conta removida, saiu, revogada): se era este socket que estava na voz, sai da presença e da mídia. */
  revogar(usuarioId: number, socketId: string): void;
  fechar(): void;
}

/** Tira a pessoa da sala do LiveKit (best effort; sem LiveKit configurado, não faz nada). */
export type RemoverDaMidia = (usuarioId: number, canalVozId: number) => Promise<void>;
/** Tira a permissão de publicar de quem está na sala do LiveKit (AFK). */
export type CalarNaMidia = (usuarioId: number, canalVozId: number) => Promise<void>;

interface Presente {
  estado: VozEstadoDto;
  socketId: string;
  /** Sessão de mídia (participant.sid do LiveKit), para o webhook não tirar uma sessão mais nova. */
  sid: string | undefined;
  /** Socket caiu: espera a carência antes de tirar (a mídia pode continuar e o app reenviar ao reconectar). */
  pendente?: NodeJS.Timeout;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function lerPedido(dados: unknown) {
  if (!ehObjeto(dados)) throw new ErroHttp(400, 'dados_invalidos', 'Dados inválidos.');
  const { canalVozId, mudo, surdo, camera, sid, motivo } = dados;
  if (motivo !== undefined && motivo !== 'afk') throw new ErroHttp(400, 'dados_invalidos', 'Dados inválidos.');
  if (canalVozId !== null && (typeof canalVozId !== 'number' || !Number.isInteger(canalVozId) || canalVozId < 1)) {
    throw new ErroHttp(400, 'dados_invalidos', 'Canal inválido.');
  }
  if (typeof mudo !== 'boolean' || typeof surdo !== 'boolean' || typeof camera !== 'boolean') throw new ErroHttp(400, 'dados_invalidos', 'Dados inválidos.');
  if (sid !== undefined && (typeof sid !== 'string' || sid.length > 64)) throw new ErroHttp(400, 'dados_invalidos', 'Dados inválidos.');
  // Deafen também muta o microfone (RF-16).
  return { canalVozId, mudo: mudo || surdo, surdo, camera, sid: sid as string | undefined, afk: motivo === 'afk' };
}

export function criarVoz(
  io: ServidorTempoReal,
  banco: Banco,
  registrarErro: (e: unknown) => void,
  opcoes: {
    carenciaMs: number;
    removerDaMidia?: RemoverDaMidia;
    calarNaMidia?: CalarNaMidia;
    aoSair?: (usuarioId: number, canalVozId: number) => void;
    /** Pontos e loja: a presença na voz mudou (entrou, saiu, surdo, conexão caiu ou voltou). */
    aoMudar?: () => void;
    /** mover-e-afk (A5): quanto o app movido tem para sair da sala antiga antes de ser tirado à força. */
    prazoMoverMs?: number;
  },
): Voz {
  const presentes = new Map<number, Presente>();
  const prazoMover = opcoes.prazoMoverMs ?? 10_000;
  /** A10: até 5 mover/desconectar a cada 10 s por moderador e 1 a cada 3 s por pessoa movida. */
  const limiteAtor = criarLimitador(5, 10_000);
  const limiteAlvo = criarLimitador(1, 3_000);
  /** A9: até 1 ida à AFK por minuto por pessoa. */
  const limiteAfk = criarLimitador(1, 60_000);
  const nomeDe = (id: number) => (banco.prepare('SELECT nome_exibicao AS n FROM usuarios WHERE id = ?').get(id) as { n: string } | undefined)?.n ?? 'Alguém';

  const estados = () => [...presentes.values()].map((p) => p.estado).sort((a, b) => a.usuarioId - b.usuarioId);
  /** Cada servidor recebe só quem está nos canais de voz dele. */
  const avisar = () => {
    // Servidor fechando (carência que venceu depois do fechamento): não há a quem avisar.
    if (!banco.open) return;
    opcoes.aoMudar?.();
    const todos = estados();
    const porComunidade = new Map<number, VozEstadoDto[]>();
    for (const e of todos) {
      const c = comunidadeDoCanal(banco, e.canalVozId);
      if (c !== undefined) porComunidade.set(c, [...(porComunidade.get(c) ?? []), e]);
    }
    for (const sala of io.of('/').adapter.rooms.keys()) {
      const m = /^comunidade:(\d+)$/.exec(sala);
      if (m) io.to(sala).emit('voz:estados', porComunidade.get(Number(m[1])) ?? []);
    }
  };
  const removerDaMidia = (usuarioId: number, canalVozId: number) => {
    opcoes.removerDaMidia?.(usuarioId, canalVozId).catch(registrarErro);
  };

  function auditar(tipo: 'voz_entrou' | 'voz_saiu', usuarioId: number, canalVozId: number, motivo?: string, nome?: string) {
    try {
      const canal = nome !== undefined ? { id: canalVozId, nome } : buscarCanal(banco, canalVozId);
      registrarAuditoria(banco, { tipo, atorId: usuarioId, canal: canal ?? undefined, detalhes: motivo ? { motivo } : undefined });
    } catch (erro) {
      registrarErro(erro);
    }
  }

  function tirar(usuarioId: number, motivo: string, nomeCanal?: string) {
    const p = presentes.get(usuarioId);
    if (!p) return undefined;
    clearTimeout(p.pendente);
    presentes.delete(usuarioId);
    auditar('voz_saiu', usuarioId, p.estado.canalVozId, motivo, nomeCanal);
    // Quem sai da voz deixa de transmitir (RN-10).
    opcoes.aoSair?.(usuarioId, p.estado.canalVozId);
    return p;
  }

  return {
    estados,
    participantes: () =>
      [...presentes.values()].map((p) => ({ usuarioId: p.estado.usuarioId, canalVozId: p.estado.canalVozId, surdo: p.estado.surdo, emCarencia: p.pendente !== undefined })),
    presenca(usuarioId) {
      const p = presentes.get(usuarioId);
      return p && { canalVozId: p.estado.canalVozId, socketId: p.socketId };
    },
    conexoesNoCanal: (canalVozId) => [...presentes.values()].filter((p) => p.estado.canalVozId === canalVozId).map((p) => p.socketId),
    registrar(socket) {
      const usuarioId = socket.data.usuarioId;
      socket.on(
        'voz:estado',
        comAck(registrarErro, (dados: unknown) => {
          const pedido = lerPedido(dados);
          const atual = presentes.get(usuarioId);
          if (pedido.canalVozId !== null && !temPermissao(banco, usuarioId, 'entrar_voz', socket.data.comunidadeId)) throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não permite entrar na voz.');
          // Sem a permissão de câmera, o estado nunca diz "câmera ligada" (o LiveKit também não deixa publicar).
          if (pedido.camera && !temPermissao(banco, usuarioId, 'usar_camera', socket.data.comunidadeId)) pedido.camera = false;
          if (pedido.canalVozId === null) {
            // Só o computador que está na voz tira a pessoa (o outro já foi tirado com voz:tirado).
            if (atual && atual.socketId === socket.id) {
              tirar(usuarioId, 'saiu');
              avisar();
            }
            return undefined;
          }
          // Só canais de voz do servidor desta conexão.
          const canal = comunidadeDoCanal(banco, pedido.canalVozId) === socket.data.comunidadeId ? buscarCanal(banco, pedido.canalVozId) : undefined;
          if (!canal) throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
          if (canal.tipo !== 'voz') throw new ErroHttp(400, 'dados_invalidos', 'Esse canal não é de voz.');
          // mover-e-afk: na sala de AFK ninguém fala nem mostra a câmera (RN-9); a ida por inatividade só vale para a
          // AFK deste servidor, uma vez por minuto (A8, A9), e fica na auditoria.
          const afk = afkDa(banco, socket.data.comunidadeId);
          const naAfk = afk?.canalId === canal.id;
          if (naAfk) {
            pedido.mudo = true;
            pedido.camera = false;
          }
          if (pedido.afk) {
            if (!naAfk) throw new ErroHttp(400, 'dados_invalidos', 'Essa sala não é a de AFK.');
            if (atual?.estado.canalVozId === canal.id) return undefined;
            if (!limiteAfk.permitir(String(usuarioId))) throw new ErroHttp(429, 'muitas_tentativas', 'Calma: idas seguidas para a AFK.');
            const de = atual ? buscarCanal(banco, atual.estado.canalVozId) : undefined;
            registrarAuditoria(banco, { tipo: 'voz_afk', atorId: usuarioId, canal: { id: canal.id, nome: canal.nome }, detalhes: de ? { de: de.nome } : undefined });
          }
          if (atual) {
            clearTimeout(atual.pendente);
            atual.pendente = undefined;
            // Outro computador assumiu: o anterior (ainda conectado) sai da voz e da mídia.
            if (atual.socketId !== socket.id) {
              io.to(atual.socketId).emit('voz:tirado', { motivo: 'outro_computador' });
              // A sessão anterior saiu da mídia (mesmo continuando no mesmo canal): o que ela transmitia acaba.
              opcoes.aoSair?.(usuarioId, atual.estado.canalVozId);
              if (atual.estado.canalVozId !== canal.id) removerDaMidia(usuarioId, atual.estado.canalVozId);
            }
            if (atual.estado.canalVozId !== canal.id) tirar(usuarioId, 'trocou_de_canal');
          }
          if (!presentes.has(usuarioId)) auditar('voz_entrou', usuarioId, canal.id, undefined, canal.nome);
          presentes.set(usuarioId, {
            socketId: socket.id,
            sid: pedido.sid ?? (atual?.estado.canalVozId === canal.id ? atual.sid : undefined),
            estado: { usuarioId, canalVozId: canal.id, mudo: pedido.mudo, surdo: pedido.surdo, camera: pedido.camera },
          });
          avisar();
          return undefined;
        }),
      );
      /**
       * mover-e-afk (RF-2, A1–A5, A10): mover quem está em chamada neste servidor para outra sala de voz daqui, ou
       * desconectar. O servidor confere, audita e avisa o app da pessoa; se ela não sair da sala antiga a tempo (app
       * antigo ou modificado), é tirada da presença e da mídia.
       */
      const conferirAlvo = (dados: unknown, comDestino: boolean) => {
        const d = ehObjeto(dados) ? dados : {};
        const alvoId = d.usuarioId;
        if (typeof alvoId !== 'number' || !Number.isInteger(alvoId) || alvoId < 1) throw new ErroHttp(400, 'dados_invalidos', 'Pessoa inválida.');
        const c = socket.data.comunidadeId;
        conferirMover(banco, c, usuarioId, alvoId);
        const p = presentes.get(alvoId);
        if (!p || p.pendente || comunidadeDoCanal(banco, p.estado.canalVozId) !== c) throw new ErroHttp(404, 'nao_encontrado', 'Essa pessoa não está em chamada neste servidor.');
        let destino: { id: number; nome: string } | undefined;
        if (comDestino) {
          const id = d.canalVozId;
          if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) throw new ErroHttp(400, 'dados_invalidos', 'Sala inválida.');
          const canal = comunidadeDoCanal(banco, id) === c ? buscarCanal(banco, id) : undefined;
          if (!canal) throw new ErroHttp(404, 'nao_encontrado', 'Sala não encontrada.');
          if (canal.tipo !== 'voz') throw new ErroHttp(400, 'dados_invalidos', 'Essa sala não é de voz.');
          if (canal.id === p.estado.canalVozId) throw new ErroHttp(400, 'dados_invalidos', 'A pessoa já está nessa sala.');
          if (!temPermissao(banco, alvoId, 'entrar_voz', c)) throw new ErroHttp(403, 'sem_permissao', 'Essa pessoa não pode entrar na voz agora.');
          destino = { id: canal.id, nome: canal.nome };
        }
        if (!limiteAtor.permitir(`${c}:${usuarioId}`) || !limiteAlvo.permitir(`${c}:${alvoId}`)) throw new ErroHttp(429, 'muitas_tentativas', 'Calma: muitas trocas seguidas.');
        return { alvoId, p, destino, origem: buscarCanal(banco, p.estado.canalVozId) };
      };
      /** Tira à força quem continua na sala de antes pela mesma conexão (A5). */
      const tirarSeNaoSaiu = (alvoId: number, socketId: string, canalAntigo: number, motivo: string) => {
        const atual = presentes.get(alvoId);
        if (!atual || atual.socketId !== socketId || atual.estado.canalVozId !== canalAntigo) return;
        tirar(alvoId, motivo);
        removerDaMidia(alvoId, canalAntigo);
        avisar();
      };
      socket.on(
        'voz:mover',
        comAck(registrarErro, (dados: unknown) => {
          const { alvoId, p, destino, origem } = conferirAlvo(dados, true);
          registrarAuditoria(banco, {
            tipo: 'voz_movido',
            atorId: usuarioId,
            alvoUsuarioId: alvoId,
            canal: destino!,
            detalhes: { de: origem?.nome ?? String(p.estado.canalVozId) },
          });
          io.to(p.socketId).emit('voz:movido', { canalVozId: destino!.id, canalNome: destino!.nome, porNome: nomeDe(usuarioId) });
          const t = setTimeout(() => tirarSeNaoSaiu(alvoId, p.socketId, p.estado.canalVozId, 'movido'), prazoMover);
          t.unref();
          return undefined;
        }),
      );
      socket.on(
        'voz:desconectar',
        comAck(registrarErro, (dados: unknown) => {
          const { alvoId, p, origem } = conferirAlvo(dados, false);
          registrarAuditoria(banco, { tipo: 'voz_desconectado', atorId: usuarioId, alvoUsuarioId: alvoId, canal: origem ?? undefined });
          io.to(p.socketId).emit('voz:desconectado', { porNome: nomeDe(usuarioId) });
          tirarSeNaoSaiu(alvoId, p.socketId, p.estado.canalVozId, 'desconectado');
          return undefined;
        }),
      );
      socket.on('disconnect', () => {
        const p = presentes.get(usuarioId);
        if (!p || p.socketId !== socket.id || p.pendente) return;
        // Queda curta do tempo real não tira da voz: o app reenvia o estado ao reconectar.
        p.pendente = setTimeout(() => {
          if (presentes.get(usuarioId) !== p) return;
          tirar(usuarioId, 'desconectou');
          removerDaMidia(usuarioId, p.estado.canalVozId);
          avisar();
        }, opcoes.carenciaMs);
        p.pendente.unref();
        // A conexão caiu: os pontos param de contar já (a carência não conta, técnica R-4).
        if (banco.open) opcoes.aoMudar?.();
      });
    },
    canalRemovido(canal) {
      let mudou = false;
      for (const p of [...presentes.values()]) {
        if (p.estado.canalVozId !== canal.id) continue;
        tirar(p.estado.usuarioId, 'canal_removido', canal.nome);
        removerDaMidia(p.estado.usuarioId, canal.id);
        mudou = true;
      }
      if (mudou) avisar();
    },
    midiaSaiu(usuarioId, canalVozId, sid) {
      const p = presentes.get(usuarioId);
      if (p?.estado.canalVozId !== canalVozId) return;
      // Saída de uma sessão de mídia antiga (reentrou, ou derrubada por identidade repetida): ignora.
      if (p.sid && sid && p.sid !== sid) return;
      tirar(usuarioId, 'midia_saiu');
      avisar();
    },
    midiaEntrou(usuarioId, canalVozId) {
      const t = setTimeout(() => {
        if (presentes.get(usuarioId)?.estado.canalVozId === canalVozId) return;
        removerDaMidia(usuarioId, canalVozId);
      }, prazoMover);
      t.unref();
    },
    afkMudou(comunidadeId) {
      const afk = afkDa(banco, comunidadeId);
      if (!afk) return;
      let mudou = false;
      for (const p of presentes.values()) {
        if (p.estado.canalVozId !== afk.canalId) continue;
        p.estado = { ...p.estado, mudo: true, camera: false };
        opcoes.calarNaMidia?.(p.estado.usuarioId, afk.canalId).catch(registrarErro);
        mudou = true;
      }
      if (mudou) avisar();
    },
    revogar(usuarioId, socketId) {
      if (presentes.get(usuarioId)?.socketId !== socketId) return;
      const p = tirar(usuarioId, 'sessao_revogada');
      if (!p) return;
      removerDaMidia(usuarioId, p.estado.canalVozId);
      avisar();
    },
    fechar() {
      for (const p of presentes.values()) clearTimeout(p.pendente);
    },
  };
}
