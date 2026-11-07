import type { VozEstadoDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarCanal, comunidadeDoCanal } from '../dominio/canais.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { comAck } from './acoes.js';
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
  /** Canal de voz removido: todos saem dele. */
  canalRemovido(canal: { id: number; nome: string }): void;
  /** Webhook: a sessão de mídia `sid` saiu da sala do LiveKit (fechou, caiu, foi derrubada). */
  midiaSaiu(usuarioId: number, canalVozId: number, sid: string | undefined): void;
  /** Sessão derrubada (conta removida, saiu, revogada): se era este socket que estava na voz, sai da presença e da mídia. */
  revogar(usuarioId: number, socketId: string): void;
  fechar(): void;
}

/** Tira a pessoa da sala do LiveKit (best effort; sem LiveKit configurado, não faz nada). */
export type RemoverDaMidia = (usuarioId: number, canalVozId: number) => Promise<void>;

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
  const { canalVozId, mudo, surdo, camera, sid } = dados;
  if (canalVozId !== null && (typeof canalVozId !== 'number' || !Number.isInteger(canalVozId) || canalVozId < 1)) {
    throw new ErroHttp(400, 'dados_invalidos', 'Canal inválido.');
  }
  if (typeof mudo !== 'boolean' || typeof surdo !== 'boolean' || typeof camera !== 'boolean') throw new ErroHttp(400, 'dados_invalidos', 'Dados inválidos.');
  if (sid !== undefined && (typeof sid !== 'string' || sid.length > 64)) throw new ErroHttp(400, 'dados_invalidos', 'Dados inválidos.');
  // Deafen também muta o microfone (RF-16).
  return { canalVozId, mudo: mudo || surdo, surdo, camera, sid: sid as string | undefined };
}

export function criarVoz(
  io: ServidorTempoReal,
  banco: Banco,
  registrarErro: (e: unknown) => void,
  opcoes: { carenciaMs: number; removerDaMidia?: RemoverDaMidia; aoSair?: (usuarioId: number, canalVozId: number) => void },
): Voz {
  const presentes = new Map<number, Presente>();

  const estados = () => [...presentes.values()].map((p) => p.estado).sort((a, b) => a.usuarioId - b.usuarioId);
  /** Cada servidor recebe só quem está nos canais de voz dele. */
  const avisar = () => {
    // Servidor fechando (carência que venceu depois do fechamento): não há a quem avisar.
    if (!banco.open) return;
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
