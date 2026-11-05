import type { FastifyInstance } from 'fastify';
import { AccessToken, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import { salaLivekit, type TokenVozResponse } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { exigirSessao } from '../auth/sessao-http.js';
import { buscarCanal } from '../dominio/canais.js';
import { buscarPorId } from '../dominio/usuarios.js';
import type { Voz } from '../realtime/voz.js';

/** Validade do token de mídia: o app pede outro ao reentrar. */
const VALIDADE_TOKEN = '6h';

/** Eventos do webhook mais velhos que isto são descartados (contra reenvio de evento antigo). */
const IDADE_MAX_EVENTO_S = 5 * 60;

/** RF-13: token do LiveKit para um canal de voz e webhook que confere a presença (saída da sala). */
export async function registrarRotasLivekit(app: FastifyInstance, banco: Banco, config: Config, voz: Pick<Voz, 'midiaSaiu'>) {
  const livekit = config.livekit;

  app.post(
    '/api/livekit/token',
    {
      preHandler: exigirSessao(banco),
      schema: { body: { type: 'object', required: ['canalVozId'], properties: { canalVozId: { type: 'integer', minimum: 1 } } } },
    },
    async (req): Promise<TokenVozResponse> => {
      if (!livekit) throw new ErroHttp(503, 'voz_indisponivel', 'A voz não está configurada neste servidor.');
      const { canalVozId } = req.body as { canalVozId: number };
      const canal = buscarCanal(banco, canalVozId);
      if (!canal) throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
      if (canal.tipo !== 'voz') throw new ErroHttp(400, 'dados_invalidos', 'Esse canal não é de voz.');
      const usuario = buscarPorId(banco, req.usuarioId!)!;
      const token = new AccessToken(livekit.chave, livekit.segredo, {
        identity: String(usuario.id),
        name: usuario.nome_exibicao,
        metadata: JSON.stringify({ cargo: usuario.cargo }),
        ttl: VALIDADE_TOKEN,
      });
      token.addGrant({
        room: salaLivekit(canal.id),
        roomJoin: true,
        canSubscribe: true,
        canPublish: true,
        canPublishData: false,
        canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
      });
      return { url: livekit.url, token: await token.toJwt() };
    },
  );

  if (!livekit) return;
  const receptor = new WebhookReceiver(livekit.chave, livekit.segredo);
  const vistos = new Set<string>();

  // O LiveKit manda o corpo como application/webhook+json; a assinatura vale para o texto exato.
  await app.register(async (escopo) => {
    escopo.addContentTypeParser(['application/webhook+json', 'application/json'], { parseAs: 'string', bodyLimit: 64 * 1024 }, (_req, corpo, pronto) =>
      pronto(null, corpo),
    );
    escopo.post('/api/livekit/webhook', async (req, reply) => {
      let evento;
      try {
        evento = await receptor.receive(String(req.body ?? ''), req.headers.authorization);
      } catch {
        throw new ErroHttp(401, 'assinatura_invalida', 'Webhook sem assinatura válida.');
      }
      // Reenvio: mesmo id já tratado, ou evento velho.
      if (evento.id) {
        if (vistos.has(evento.id)) return reply.code(200).send({ ok: true });
        vistos.add(evento.id);
        if (vistos.size > 1000) vistos.delete(vistos.values().next().value!);
      }
      const criado = Number(evento.createdAt ?? 0);
      if (criado && Date.now() / 1000 - criado > IDADE_MAX_EVENTO_S) return reply.code(200).send({ ok: true });
      const sala = /^voz-(\d+)$/.exec(evento.room?.name ?? '');
      const usuarioId = Number(evento.participant?.identity);
      if (evento.event === 'participant_left' && sala && Number.isInteger(usuarioId)) voz.midiaSaiu(usuarioId, Number(sala[1]), evento.participant?.sid || undefined);
      return reply.code(200).send({ ok: true });
    });
  });
}
