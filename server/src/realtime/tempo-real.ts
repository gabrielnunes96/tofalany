import { listarFuncoes } from '../dominio/funcoes.js';
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
  ESCOLHAS_STATUS,
  type EscolhaStatus,
  type StatusPessoa,
  type StatusVisivel,
  COMUNIDADE_PRINCIPAL,
  caminhoComunidade,
} from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { hashToken } from '../auth/tokens.js';
import { sessaoValida, usuarioDaSessao } from '../dominio/sessoes.js';
import { buscarPorId, listarMembros, paraDto } from '../dominio/usuarios.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { conviteDa, donoDa, existeComunidade, membroNaComunidade, nomeComunidade } from '../dominio/comunidades.js';
import { baseDoServidor, montarLinkConvite } from '../dominio/convite.js';
import { listarCanais } from '../dominio/canais.js';
import { listarDms } from '../dominio/dms.js';
import { contarNaoLidas } from '../dominio/leituras.js';
import { listarSons } from '../dominio/sons.js';
import { registrarEventosCanais } from './canais.js';
import { registrarEventosMensagens } from './mensagens.js';
import type { Armazem } from '../arquivos/armazem.js';
import { RoomServiceClient } from 'livekit-server-sdk';
import { salaLivekit } from '@tofalando/shared';
import { criarVoz, type RemoverDaMidia, type Voz } from './voz.js';
import { criarSoundboard } from './soundboard.js';
import { salaComunidade } from './salas.js';
import { conhecidosDe, registrarEventosAmizades } from './amizades.js';
import { listarAmizades } from '../dominio/amizades.js';
import { criarMusica } from './musica.js';
import { criarTela } from './tela.js';

interface DadosSocket {
  usuarioId: number;
  tokenHash: string;
  /** Endereço do servidor como esta pessoa o vê (URL_PUBLICA ou o host do handshake), com o /c/<id> do servidor. */
  baseServidor: string;
  /** Servidor (comunidade) desta conexão: o app abre uma conexão por servidor. */
  comunidadeId: number;
}

export { salaComunidade } from './salas.js';

export type SocketTofalando = Socket<EventosCliente, EventosServidor, Record<string, never>, DadosSocket>;
export type ServidorTempoReal = Server<EventosCliente, EventosServidor, Record<string, never>, DadosSocket>;

export interface TempoReal {
  io: ServidorTempoReal;
  /** Derruba as conexões de uma sessão (ex.: saiu por este servidor). */
  revogarToken(tokenHash: string, motivo: MotivoRevogacao): void;
  /** Derruba todas as conexões de um usuário (ex.: conta removida, T6). */
  revogarUsuario(usuarioId: number, motivo: MotivoRevogacao): void;
  /** Reconfere no banco as sessões conectadas; pega revogações feitas por outro processo (comando da T3). */
  conferirSessoes(): void;
  /** RF-13: presença nos canais de voz. */
  voz: Voz;
  /** R-2/RN-17: faixa de tela publicada (webhook); silencia no LiveKit se estiver fora da regra. Devolve se silenciou. */
  conferirFaixaTela(
    usuarioId: number,
    canalVozId: number,
    faixa: { sid: string; largura: number; altura: number; soAudio?: boolean },
    silenciar?: (sala: string, identidade: string, sid: string) => Promise<void>,
  ): Promise<boolean>;
  /** RN-17: o cargo de alguém mudou (transmissão acima de 720p30 de quem não é mais admin para). */
  cargoMudou(usuarioId: number, comunidadeId?: number): void;
  /** Derruba as conexões de alguém num servidor (saiu ou foi tirado de lá). */
  tirarDaComunidade(usuarioId: number, comunidadeId: number): void;
  /** Derruba todas as conexões de um servidor (excluído). */
  fecharComunidade(comunidadeId: number): void;
}

export const salaUsuario = (id: number) => `usuario:${id}`;

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

export function criarTempoReal(app: FastifyInstance, banco: Banco, config: Config, armazem: Armazem): TempoReal {
  const io: ServidorTempoReal = new Server(app.server, {
    // Autenticação é pelo token no handshake, não por cookie.
    cors: { origin: true },
    serveClient: false,
    pingInterval: PING_INTERVALO_MS,
    pingTimeout: PING_TOLERANCIA_MS,
  });

  // RF-37/RN-25: status visível (online/ausente/não incomodar). Offline só depois da carência (mesma regra da
  // auditoria). Backlog v2, item 2: a escolha da pessoa vence a ociosidade; "invisível" fica fora do mapa.
  const status = new Map<number, StatusVisivel>();
  const ausentes = new Set<string>();
  const escolhas = new Map<number, EscolhaStatus>();
  function recalcularStatus(usuarioId: number) {
    const conexoes = [...io.of('/').sockets.values()].filter((s) => s.data.usuarioId === usuarioId);
    if (conexoes.length === 0) return;
    const escolha = escolhas.get(usuarioId) ?? 'auto';
    const novo: StatusPessoa =
      escolha === 'invisivel'
        ? 'offline'
        : escolha === 'naoIncomodar'
          ? 'naoIncomodar'
          : escolha === 'ausente'
            ? 'ausente'
            : conexoes.some((s) => !ausentes.has(s.id))
              ? 'online'
              : 'ausente';
    const antes = status.get(usuarioId) ?? 'offline';
    if (antes === novo) return;
    if (novo === 'offline') status.delete(usuarioId);
    else status.set(usuarioId, novo);
    io.emit('presenca:atualizada', { id: usuarioId, status: novo });
  }
  const lerEscolha = (valor: unknown): EscolhaStatus | undefined =>
    typeof valor === 'string' && (ESCOLHAS_STATUS as string[]).includes(valor) ? (valor as EscolhaStatus) : undefined;
  const presenca = criarPresenca((tipo, usuarioId, motivo) => {
    if (tipo === 'offline') escolhas.delete(usuarioId);
    if (tipo === 'offline' && status.delete(usuarioId)) io.emit('presenca:atualizada', { id: usuarioId, status: 'offline' });
    try {
      registrarAuditoria(banco, { tipo, atorId: usuarioId, detalhes: motivo ? { motivo } : undefined });
    } catch (erro) {
      app.log.error(erro);
    }
  }, config.carenciaOfflineMs);
  const lk = config.livekit;
  const salas = lk ? new RoomServiceClient(lk.urlInterna, lk.chave, lk.segredo) : undefined;
  const removerDaMidia: RemoverDaMidia | undefined = salas
    ? async (usuarioId, canalVozId) => {
        try {
          await salas.removeParticipant(salaLivekit(canalVozId), String(usuarioId));
        } catch (erro) {
          // Já saiu da sala (404) é o caso comum; o resto vai ao log.
          if (!/not.?found|does not exist/i.test(String((erro as Error)?.message))) throw erro;
        }
      }
    : undefined;
  // A tela é criada depois da voz, mas a voz avisa quem saiu (libera a trava de transmissão).
  // (o callback só roda depois, quando alguém sai; a essa altura `tela` já existe)
  const silenciarFaixa = salas ? (sala: string, identidade: string, sid: string) => salas.mutePublishedTrack(sala, identidade, sid, true).then(() => undefined) : undefined;
  const voz = criarVoz(io, banco, (e) => app.log.error(e), {
    carenciaMs: config.carenciaOfflineMs,
    removerDaMidia,
    aoSair: (u, c) => {
      tela.saiuDaVoz(u, c);
      musica.saiuDaVoz(c);
    },
  });
  const tela = criarTela(io, banco, voz, (e) => app.log.error(e));
  const soundboard = criarSoundboard(io, banco, voz, (e) => app.log.error(e));
  const musica = criarMusica(io, config, voz, (e) => app.log.error(e), banco);

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
    // Uma conexão por servidor: o app manda qual (o principal, se não mandar); só quem participa entra.
    const pedido = Number(socket.handshake.auth?.comunidade ?? COMUNIDADE_PRINCIPAL);
    const comunidadeId = Number.isInteger(pedido) && pedido > 0 ? pedido : COMUNIDADE_PRINCIPAL;
    try {
      if (!existeComunidade(banco, comunidadeId) || !membroNaComunidade(banco, comunidadeId, usuarioId)) return next(new Error('nao_membro'));
    } catch (erro) {
      app.log.error(erro);
      return next(new Error('erro_interno'));
    }
    socket.data.comunidadeId = comunidadeId;
    socket.data.baseServidor = baseDoServidor(config, socket.handshake.headers, socket.handshake.secure) + caminhoComunidade(comunidadeId);
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
    const comunidadeId = socket.data.comunidadeId;
    const eu = buscarPorId(banco, socket.data.usuarioId);
    if (!eu) {
      derrubar(socket, 'sessao_invalida');
      return;
    }
    void socket.join([salaUsuario(eu.id), salaComunidade(comunidadeId)]);
    // Tudo do servidor desta conexão: canais, membros (com o cargo de lá), cargos, sons, voz e telas dos canais de lá.
    const membros = listarMembros(banco, comunidadeId);
    const ids = new Set(membros.map((m) => m.id));
    const canais = listarCanais(banco, comunidadeId);
    const daqui = new Set(canais.map((c) => c.id));
    // Conversas diretas com quem está neste servidor ou é amigo (amizade vale em todos os servidores).
    const amizades = listarAmizades(banco, eu.id);
    const amigos = new Set(amizades.filter((a) => a.situacao === 'amigo').map((a) => a.usuarioId));
    const dms = listarDms(banco, eu.id).filter((d) => ids.has(d.outroId) || amigos.has(d.outroId));
    const chaves = new Set([...canais.map((c) => `c:${c.id}`), ...dms.map((d) => `d:${d.id}`)]);
    const ola: OlaPayload = {
      servidor: { nome: nomeComunidade(banco, comunidadeId, config.nomeServidor) ?? config.nomeServidor, id: comunidadeId, donoId: donoDa(banco, comunidadeId) },
      convite: { link: montarLinkConvite(socket.data.baseServidor, conviteDa(banco, comunidadeId) ?? '') },
      eu: paraDto(membros.find((m) => m.id === eu.id) ?? eu),
      usuarios: membros.map(paraDto),
      funcoes: listarFuncoes(banco, comunidadeId),
      canais,
      dms,
      naoLidas: Object.fromEntries(Object.entries(contarNaoLidas(banco, eu.id)).filter(([k]) => chaves.has(k))),
      sons: listarSons(banco, comunidadeId),
      voz: voz.estados().filter((e) => daqui.has(e.canalVozId)),
      presencas: {},
      transmissoes: tela.transmissoes().filter((t) => daqui.has(t.canalVozId)),
      musica: musica.estados().filter((m) => daqui.has(m.canalVozId)),
      amizades,
      conhecidos: conhecidosDe(banco, eu.id, comunidadeId),
    };
    registrarEventosCanais(io, socket, banco, armazem, voz, (e) => app.log.error(e));
    voz.registrar(socket);
    soundboard.registrar(socket);
    musica.registrar(socket);
    tela.registrar(socket);
    registrarEventosMensagens(io, socket, banco, armazem, (e) => app.log.error(e));
    registrarEventosAmizades(io, socket, banco, (e) => app.log.error(e));
    presenca.entrou(eu.id);
    // RN-25: quem reconecta já ausente avisa no handshake (sem piscar "online" para os outros).
    if (socket.handshake.auth?.ausente === true) ausentes.add(socket.id);
    // Backlog v2, item 2: o status escolhido também vem no handshake (quem está invisível não pisca online).
    const escolhaInicial = lerEscolha(socket.handshake.auth?.status);
    if (escolhaInicial) escolhas.set(eu.id, escolhaInicial);
    recalcularStatus(eu.id);
    ola.presencas = Object.fromEntries([...status].filter(([id]) => ids.has(id) || amigos.has(id)));
    socket.emit('ola', ola);
    socket.on('presenca:ausente', (dados) => {
      const ausente = typeof dados === 'object' && dados !== null && (dados as { ausente?: unknown }).ausente === true;
      // Repetição não muda nada (nem gera aviso para todos).
      if (ausente === ausentes.has(socket.id)) return;
      if (ausente) ausentes.add(socket.id);
      else ausentes.delete(socket.id);
      recalcularStatus(eu.id);
    });
    socket.on('presenca:escolher', (dados) => {
      const escolha = lerEscolha(typeof dados === 'object' && dados !== null ? (dados as { status?: unknown }).status : undefined);
      if (!escolha) return;
      escolhas.set(eu.id, escolha);
      recalcularStatus(eu.id);
    });
    socket.on('disconnect', () => {
      ausentes.delete(socket.id);
      presenca.saiu(eu.id);
      // Ainda há outro computador conectado: o status passa a ser o dele.
      recalcularStatus(eu.id);
    });
  }

  function derrubar(socket: SocketTofalando, motivo: MotivoRevogacao) {
    voz.revogar(socket.data.usuarioId, socket.id);
    socket.emit('sessao:revogada', { motivo });
    socket.disconnect(true);
  }

  const tempoReal: TempoReal = {
    io,
    voz,
    async conferirFaixaTela(usuarioId, canalVozId, faixa, silenciar = silenciarFaixa) {
      if (!tela.faixaForaDaRegra(usuarioId, canalVozId, faixa.largura, faixa.altura, faixa.soAudio)) return false;
      await silenciar?.(salaLivekit(canalVozId), String(usuarioId), faixa.sid);
      return true;
    },
    cargoMudou: (usuarioId) => tela.cargoMudou(usuarioId),
    tirarDaComunidade(usuarioId, comunidadeId) {
      for (const s of io.of('/').sockets.values()) if (s.data.usuarioId === usuarioId && s.data.comunidadeId === comunidadeId) derrubar(s, 'fora_do_servidor');
    },
    fecharComunidade(comunidadeId) {
      for (const s of io.of('/').sockets.values()) if (s.data.comunidadeId === comunidadeId) derrubar(s, 'fora_do_servidor');
    },
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
    voz.fechar();
    presenca.iniciarFechamento();
    io.local.disconnectSockets(true);
    io.engine.close();
    presenca.fechar();
  });

  return tempoReal;
}
