import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import {
  ERRO_HANDSHAKE_NAO_AUTENTICADO,
  PING_INTERVALO_MS,
  PING_TOLERANCIA_MS,
  type EventosCliente,
  type EventosServidor,
  type MotivoRevogacao,
  type OlaPayload,
} from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { hashToken } from '../auth/tokens.js';
import { sessaoValida, usuarioDaSessao } from '../dominio/sessoes.js';
import { buscarPorId, listarAtivos, paraDto } from '../dominio/usuarios.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { CHAVE_CONVITE, lerConfiguracao } from '../dominio/configuracoes.js';
import { baseDoServidor, montarLinkConvite } from '../dominio/convite.js';

interface DadosSocket {
  usuarioId: number;
  tokenHash: string;
  /** Endereço do servidor como esta pessoa o vê (URL_PUBLICA ou o host do handshake). */
  baseServidor: string;
}

type SocketTofalando = Socket<EventosCliente, EventosServidor, Record<string, never>, DadosSocket>;
export type ServidorTempoReal = Server<EventosCliente, EventosServidor, Record<string, never>, DadosSocket>;

export interface TempoReal {
  io: ServidorTempoReal;
  /** Derruba as conexões de uma sessão (ex.: saiu por este servidor). */
  revogarToken(tokenHash: string, motivo: MotivoRevogacao): void;
  /** Derruba todas as conexões de um usuário (ex.: conta removida, T6). */
  revogarUsuario(usuarioId: number, motivo: MotivoRevogacao): void;
  /** Reconfere no banco as sessões conectadas; pega revogações feitas por outro processo (comando da T3). */
  conferirSessoes(): void;
}

const salaUsuario = (id: number) => `usuario:${id}`;

/**
 * Online/offline para a auditoria (RN-24): online quando a primeira conexão do usuário chega;
 * offline só se a última cair e ninguém voltar dentro da carência.
 */
export function criarPresenca(registrar: (tipo: 'online' | 'offline', usuarioId: number, motivo?: string) => void, carenciaMs: number) {
  const conexoes = new Map<number, number>();
  const pendentes = new Map<number, NodeJS.Timeout>();
  let fechando = false;
  return {
    entrou(usuarioId: number) {
      const n = (conexoes.get(usuarioId) ?? 0) + 1;
      conexoes.set(usuarioId, n);
      if (n > 1) return;
      const pendente = pendentes.get(usuarioId);
      if (pendente) {
        clearTimeout(pendente);
        pendentes.delete(usuarioId);
      } else registrar('online', usuarioId);
    },
    saiu(usuarioId: number) {
      const n = (conexoes.get(usuarioId) ?? 1) - 1;
      if (n > 0) {
        conexoes.set(usuarioId, n);
        return;
      }
      conexoes.delete(usuarioId);
      if (fechando) {
        registrar('offline', usuarioId, 'servidor_parou');
        return;
      }
      const t = setTimeout(() => {
        pendentes.delete(usuarioId);
        registrar('offline', usuarioId);
      }, carenciaMs);
      t.unref();
      pendentes.set(usuarioId, t);
    },
    /** Antes de derrubar as conexões no desligamento: quem cair agora é "servidor_parou". */
    iniciarFechamento() {
      fechando = true;
    },
    /** Ao fechar: quem já estava na carência antes do desligamento é registrado como offline agora. */
    fechar() {
      fechando = true;
      for (const [usuarioId, t] of pendentes) {
        clearTimeout(t);
        registrar('offline', usuarioId);
      }
      pendentes.clear();
    },
  };
}

export function criarTempoReal(app: FastifyInstance, banco: Banco, config: Config): TempoReal {
  const io: ServidorTempoReal = new Server(app.server, {
    // Autenticação é pelo token no handshake, não por cookie.
    cors: { origin: true },
    serveClient: false,
    pingInterval: PING_INTERVALO_MS,
    pingTimeout: PING_TOLERANCIA_MS,
  });

  const presenca = criarPresenca((tipo, usuarioId, motivo) => {
    try {
      registrarAuditoria(banco, { tipo, atorId: usuarioId, detalhes: motivo ? { motivo } : undefined });
    } catch (erro) {
      app.log.error(erro);
    }
  }, config.carenciaOfflineMs);

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    let usuarioId: number | undefined;
    try {
      usuarioId = typeof token === 'string' && token ? usuarioDaSessao(banco, token) : undefined;
    } catch (erro) {
      // Falha do banco (ex.: travado): erro transitório, o cliente tenta de novo.
      app.log.error(erro);
      return next(new Error('erro_interno'));
    }
    if (usuarioId === undefined) return next(new Error(ERRO_HANDSHAKE_NAO_AUTENTICADO));
    socket.data.usuarioId = usuarioId;
    socket.data.tokenHash = hashToken(token as string);
    socket.data.baseServidor = baseDoServidor(config, socket.handshake.headers, socket.handshake.secure);
    next();
  });

  io.on('connection', (socket: SocketTofalando) => {
    try {
      aoConectar(socket);
    } catch (erro) {
      app.log.error(erro);
      socket.disconnect(true);
    }
  });

  function aoConectar(socket: SocketTofalando) {
    const eu = buscarPorId(banco, socket.data.usuarioId);
    if (!eu) {
      derrubar(socket, 'sessao_invalida');
      return;
    }
    void socket.join(salaUsuario(eu.id));
    const ola: OlaPayload = {
      servidor: { nome: config.nomeServidor },
      convite: { link: montarLinkConvite(socket.data.baseServidor, lerConfiguracao(banco, CHAVE_CONVITE) ?? '') },
      eu: paraDto(eu),
      usuarios: listarAtivos(banco).map(paraDto),
    };
    socket.emit('ola', ola);
    presenca.entrou(eu.id);
    socket.on('disconnect', () => presenca.saiu(eu.id));
  }

  function derrubar(socket: SocketTofalando, motivo: MotivoRevogacao) {
    socket.emit('sessao:revogada', { motivo });
    socket.disconnect(true);
  }

  const tempoReal: TempoReal = {
    io,
    revogarToken(tokenHash, motivo) {
      for (const s of io.of('/').sockets.values()) if (s.data.tokenHash === tokenHash) derrubar(s, motivo);
    },
    revogarUsuario(usuarioId, motivo) {
      for (const s of io.of('/').sockets.values()) if (s.data.usuarioId === usuarioId) derrubar(s, motivo);
    },
    conferirSessoes() {
      for (const s of io.of('/').sockets.values()) if (!sessaoValida(banco, s.data.tokenHash)) derrubar(s, 'sessao_invalida');
    },
  };

  const relogio = setInterval(() => {
    try {
      tempoReal.conferirSessoes();
    } catch (erro) {
      app.log.error(erro);
    }
  }, config.intervaloSessaoMs);
  relogio.unref();

  // Fecha as conexões antes do servidor HTTP; o engine não tenta fechar o servidor do Fastify.
  app.addHook('preClose', async () => {
    clearInterval(relogio);
    presenca.iniciarFechamento();
    io.local.disconnectSockets(true);
    io.engine.close();
    presenca.fechar();
  });

  return tempoReal;
}
