import somExternoWorklet from './som-externo.worklet.js?url';

/**
 * som-sistema-windows: o processo principal captura o som do sistema sem o próprio app (Windows 11) e entrega uma
 * MessagePort à janela (o preload repassa com `window.postMessage`). Aqui a porta vira uma faixa de áudio: o PCM vai
 * direto para um AudioWorklet (sem passar pela thread da página) e sai num MediaStreamDestination, que a sala publica
 * como o áudio da tela.
 */
export const MENSAGEM_PORTA_SOM = 'tofalany:porta-som';
/** RN-4: a captura não começou ou caiu; a tela segue sem o som. */
export const AVISO_SEM_SOM_SISTEMA = 'Não foi possível capturar o som do sistema; a transmissão continua sem ele.';

let ultimaPorta: MessagePort | undefined;
let esperando: ((p: MessagePort) => void) | undefined;

/** Começa a ouvir as portas que o preload repassa (uma vez por janela). */
export function escutarPortaSom(janela: Window = window): () => void {
  const aoMensagem = (e: MessageEvent) => {
    // Só a própria página repassa (o preload posta na mesma janela).
    if (e.source !== janela || e.data !== MENSAGEM_PORTA_SOM || !e.ports[0]) return;
    ultimaPorta?.close();
    ultimaPorta = e.ports[0];
    if (esperando) {
      esperando(ultimaPorta);
      ultimaPorta = undefined;
      esperando = undefined;
    }
  };
  janela.addEventListener('message', aoMensagem);
  return () => janela.removeEventListener('message', aoMensagem);
}

/** A porta da escolha que acabou de ser feita (chega logo depois de `captura.escolher`); sem ela em `prazoMs`, undefined. */
export function tomarPortaSom(prazoMs = 3000): Promise<MessagePort | undefined> {
  if (ultimaPorta) {
    const p = ultimaPorta;
    ultimaPorta = undefined;
    return Promise.resolve(p);
  }
  return new Promise((resolver) => {
    const t = setTimeout(() => {
      esperando = undefined;
      resolver(undefined);
    }, prazoMs);
    esperando = (p) => {
      clearTimeout(t);
      resolver(p);
    };
  });
}

export interface FaixaSomExterno {
  faixa: MediaStreamTrack;
  parar(): void;
}

/** Transforma a porta numa faixa de áudio estéreo a 48 kHz; `aoCair` avisa se a captura do principal caiu. */
export async function faixaDaPorta(porta: MessagePort, aoCair: () => void, criarContexto: () => AudioContext = () => new AudioContext({ sampleRate: 48_000 })): Promise<FaixaSomExterno> {
  const ctx = criarContexto();
  try {
    await ctx.audioWorklet.addModule(somExternoWorklet);
    const no = new AudioWorkletNode(ctx, 'som-externo', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const destino = ctx.createMediaStreamDestination();
    no.connect(destino);
    no.port.onmessage = (e) => {
      if ((e.data as { erro?: string } | null)?.erro) aoCair();
    };
    no.port.postMessage({ porta }, [porta]);
    const faixa = destino.stream.getAudioTracks()[0]!;
    return {
      faixa,
      parar() {
        faixa.stop();
        no.disconnect();
        void ctx.close().catch(() => undefined);
      },
    };
  } catch (erro) {
    porta.close();
    void ctx.close().catch(() => undefined);
    throw erro;
  }
}
