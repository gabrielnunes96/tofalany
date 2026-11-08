import type { Readable } from 'node:stream';
import { AccessToken, TrackSource as FonteToken } from 'livekit-server-sdk';
import { IDENTIDADE_BOT_MUSICA, salaLivekit } from '@tofalando/shared';
import type { SaidaAudio } from './bot.js';

/** Identidade do bot no LiveKit (não é número: o webhook e o app não confundem com uma pessoa). */
export const IDENTIDADE_BOT = IDENTIDADE_BOT_MUSICA;

/** Nome do bot de música, como ele aparece no canal. */
export const NOME_BOT = 'ToOuvini';

const TAXA = 48_000;
const CANAIS = 2;
/** 20 ms por quadro. */
const AMOSTRAS = TAXA / 50;
const BYTES_QUADRO = AMOSTRAS * CANAIS * 2;

/** O LiveKit do servidor fala HTTP(S) na API e WS(S) na sala: o bot entra pela mesma URL interna. */
export function urlDaSala(urlInterna: string): string {
  return urlInterna.replace(/^http/i, 'ws');
}

/** Corta o PCM em quadros de 20 ms (o resto fica para o próximo pedaço). */
export function* quadros(pendente: Buffer): Generator<Int16Array, Buffer> {
  let inicio = 0;
  while (pendente.length - inicio >= BYTES_QUADRO) {
    const q = new Int16Array(AMOSTRAS * CANAIS);
    Buffer.from(q.buffer).set(pendente.subarray(inicio, inicio + BYTES_QUADRO));
    yield q;
    inicio += BYTES_QUADRO;
  }
  return pendente.subarray(inicio);
}

/**
 * Backlog v2, item 14: o bot entra na sala do canal como participante e publica a música como microfone
 * (o app toca como a voz de qualquer pessoa, com volume próprio).
 */
export function criarConectorLivekit(lk: { urlInterna: string; chave: string; segredo: string }) {
  return async (canalVozId: number): Promise<SaidaAudio> => {
    // Carregado só quando o bot toca: o módulo nativo não pesa no servidor sem música.
    const rtc = await import('@livekit/rtc-node');
    const token = new AccessToken(lk.chave, lk.segredo, { identity: IDENTIDADE_BOT, name: NOME_BOT, ttl: '6h' });
    token.addGrant({ room: salaLivekit(canalVozId), roomJoin: true, canPublish: true, canSubscribe: false, canPublishData: false, canPublishSources: [FonteToken.MICROPHONE] });
    const sala = new rtc.Room();
    await sala.connect(urlDaSala(lk.urlInterna), await token.toJwt(), { autoSubscribe: false, dynacast: false });
    const fonte = new rtc.AudioSource(TAXA, CANAIS);
    const faixa = rtc.LocalAudioTrack.createAudioTrack('musica', fonte);
    const opcoes = new rtc.TrackPublishOptions();
    opcoes.source = rtc.TrackSource.SOURCE_MICROPHONE;
    await sala.localParticipant!.publishTrack(faixa, opcoes);
    // Pausa: o laço de envio espera aqui (o ffmpeg e o download param sozinhos pela contrapressão do pipe).
    let soltar: (() => void) | undefined;
    let pausa: Promise<void> | undefined;
    return {
      pausar() {
        pausa ??= new Promise<void>((r) => (soltar = r));
        fonte.clearQueue();
      },
      continuar() {
        soltar?.();
        soltar = undefined;
        pausa = undefined;
      },
      async tocar(pcm: Readable, aoComecar?: () => void) {
        let pendente: Buffer = Buffer.alloc(0);
        let comecou = false;
        for await (const pedaco of pcm as AsyncIterable<Buffer>) {
          pendente = pendente.length ? Buffer.concat([pendente, pedaco]) : pedaco;
          const corte = quadros(pendente);
          for (;;) {
            const r = corte.next();
            if (r.done) {
              pendente = r.value;
              break;
            }
            if (pausa) await pausa;
            await fonte.captureFrame(new rtc.AudioFrame(r.value, TAXA, CANAIS, AMOSTRAS));
            if (!comecou) {
              comecou = true;
              aoComecar?.();
            }
          }
        }
        await fonte.waitForPlayout();
      },
      async fechar() {
        soltar?.();
        fonte.clearQueue();
        await sala.disconnect();
        await fonte.close();
      },
    };
  };
}
