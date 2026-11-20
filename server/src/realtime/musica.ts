import type { Ack, ComandoMusica, EstadoMusica } from '@tofalando/shared';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { criarBotMusica, type BotMusica, type SaidaAudio } from '../musica/bot.js';
import { atualizarYtDlp, criarFonteYtDlp, fonteDisponivel, type FonteMusica } from '../musica/fonte.js';
import { criarConectorLivekit } from '../musica/saida-livekit.js';
import type { ServidorTempoReal, SocketTofalando } from './tempo-real.js';
import { salaComunidade } from './salas.js';
import { comunidadeDoCanal } from '../dominio/canais.js';
import { temPermissao } from '../dominio/funcoes.js';
import type { Banco } from '../db/banco.js';
import type { Voz } from './voz.js';

/** O yt-dlp se atualiza uma vez por dia (e ao primeiro uso). */
const INTERVALO_ATUALIZACAO_MS = 24 * 60 * 60 * 1000;

/** Pedidos de música por pessoa: no máximo um por segundo (a busca roda um processo no servidor). */
const INTERVALO_PEDIDOS_MS = 1000;

function lerComando(dados: unknown): ComandoMusica {
  const d = typeof dados === 'object' && dados !== null ? (dados as Record<string, unknown>) : {};
  if (d.comando === 'pular' || d.comando === 'parar' || d.comando === 'pausar' || d.comando === 'continuar' || d.comando === 'expulsar') return { comando: d.comando };
  if (d.comando === 'tocar' && typeof d.busca === 'string' && d.busca.trim() && d.busca.length <= 300) return { comando: 'tocar', busca: d.busca };
  throw new ErroHttp(400, 'dados_invalidos', 'Comando de música inválido.');
}

/**
 * Backlog v2, item 14: comandos do bot de música (/tocar, /pular, /parar). Só quem está num canal de voz manda,
 * e vale para aquele canal. Todos recebem `musica:estado` (a barra do canal mostra o que toca).
 */
export function criarMusica(
  io: ServidorTempoReal,
  config: Config,
  voz: Pick<Voz, 'presenca' | 'conexoesNoCanal'>,
  registrarErro: (e: unknown) => void,
  banco?: Banco,
  deps: { fonte?: FonteMusica; conectar?: (canalVozId: number) => Promise<SaidaAudio>; disponivel?: () => Promise<boolean>; agora?: () => number } = {},
) {
  const agora = deps.agora ?? (() => Date.now());
  const lk = config.livekit;
  const conectar = deps.conectar ?? (lk ? criarConectorLivekit(lk) : undefined);
  const opcoesFonte = { ytdlp: config.musica.ytdlp, ffmpeg: config.musica.ffmpeg, extras: config.musica.extras, cookies: config.musica.cookies, registrarErro };
  const fonte = deps.fonte ?? criarFonteYtDlp(opcoesFonte);
  let disponivel: Promise<boolean> | undefined;
  const conferir = () => {
    if (!disponivel) {
      disponivel = (deps.disponivel ?? (() => fonteDisponivel(opcoesFonte)))();
      // Só no servidor de verdade (com a fonte padrão): atualiza já e depois uma vez por dia, sem travar o pedido.
      if (!deps.fonte && !deps.disponivel) {
        const atualizar = () => void atualizarYtDlp(config.musica.ytdlp).catch(() => undefined);
        void disponivel.then((ok) => {
          if (!ok) return;
          atualizar();
          setInterval(atualizar, INTERVALO_ATUALIZACAO_MS).unref();
        });
      }
    }
    return disponivel;
  };

  const bot: BotMusica | undefined = conectar
    ? criarBotMusica({ fonte, conectar, registrarErro, agora, aoMudar: (estado) => io.to(salaComunidade((banco && comunidadeDoCanal(banco, estado.canalVozId)) ?? 1)).emit('musica:estado', estado) })
    : undefined;
  const ultimoPedido = new Map<number, number>();

  async function executar(usuarioId: number, comando: ComandoMusica): Promise<EstadoMusica> {
    if (!config.musica.ligada || !bot || !(await conferir())) throw new ErroHttp(503, 'musica_indisponivel', 'O bot de música não está disponível neste servidor.');
    const onde = voz.presenca(usuarioId);
    if (onde && banco && !temPermissao(banco, usuarioId, 'usar_toouvini', comunidadeDoCanal(banco, onde.canalVozId) ?? 1)) throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não permite usar o ToOuvini.');
    if (!onde) throw new ErroHttp(403, 'sem_permissao', 'Entre num canal de voz para usar o bot de música.');
    if (comando.comando === 'pular') return bot.pular(onde.canalVozId);
    if (comando.comando === 'parar') return bot.parar(onde.canalVozId);
    if (comando.comando === 'pausar') return bot.pausar(onde.canalVozId);
    if (comando.comando === 'continuar') return bot.continuar(onde.canalVozId);
    if (comando.comando === 'expulsar') return bot.expulsar(onde.canalVozId);
    const falta = (ultimoPedido.get(usuarioId) ?? -Infinity) + INTERVALO_PEDIDOS_MS - agora();
    if (falta > 0) throw new ErroHttp(429, 'muitas_tentativas', 'Calma: um pedido de música por segundo.');
    ultimoPedido.set(usuarioId, agora());
    return bot.tocar(onde.canalVozId, comando.busca, usuarioId);
  }

  return {
    estados: (): EstadoMusica[] => bot?.estados() ?? [],
    /** Último a sair do canal de voz: o bot para e sai também. */
    saiuDaVoz(canalVozId: number) {
      if (bot && voz.conexoesNoCanal(canalVozId).length === 0 && bot.estado(canalVozId).conectado) void bot.expulsar(canalVozId);
    },
    registrar(socket: SocketTofalando) {
      const usuarioId = socket.data.usuarioId;
      socket.on('musica:comando', (dados: unknown, ack: Ack<EstadoMusica>) => {
        if (typeof ack !== 'function') return;
        let comando: ComandoMusica;
        try {
          comando = lerComando(dados);
        } catch (erro) {
          ack({ ok: false, erro: (erro as Error).message });
          return;
        }
        executar(usuarioId, comando).then(
          (valor) => ack({ ok: true, valor }),
          (erro: unknown) => {
            if (erro instanceof ErroHttp) ack({ ok: false, erro: erro.message });
            else {
              registrarErro(erro);
              ack({ ok: false, erro: 'Erro interno no servidor.' });
            }
          },
        );
      });
    },
  };
}
