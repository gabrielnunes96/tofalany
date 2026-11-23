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
let esperando: ((p: MessagePort | undefined) => void) | undefined;
/** Há uma escolha em andamento (entre `descartarPortaSom` e a porta ser tomada ou o prazo vencer). */
let aguardando = false;
/** Um ouvinte só por janela (a tela da voz e a visível podem estar montadas ao mesmo tempo). */
const instalados = new Map<Window, { contagem: number; aoMensagem: (e: MessageEvent) => void }>();

/** Começa a ouvir as portas que o preload repassa; devolve como parar (conta as telas que pediram). */
export function escutarPortaSom(janela: Window = window): () => void {
  let atual = instalados.get(janela);
  if (!atual) {
    const aoMensagem = (e: MessageEvent) => {
      // Só a própria página repassa (o preload posta na mesma janela); um iframe chega com outra origem.
      const porta = e.ports[0];
      if (e.source !== janela || e.data !== MENSAGEM_PORTA_SOM || !porta || porta === ultimaPorta) return;
      // Fora de uma escolha (chegou depois do prazo): fecha, e o principal para a captura.
      if (!aguardando) {
        porta.close();
        return;
      }
      if (esperando) {
        aguardando = false;
        const entregar = esperando;
        esperando = undefined;
        entregar(porta);
        return;
      }
      ultimaPorta?.close();
      ultimaPorta = porta;
    };
    atual = { contagem: 0, aoMensagem };
    instalados.set(janela, atual);
    janela.addEventListener('message', aoMensagem);
  }
  atual.contagem++;
  const registro = atual;
  return () => {
    if (--registro.contagem > 0) return;
    janela.removeEventListener('message', registro.aoMensagem);
    instalados.delete(janela);
  };
}

/**
 * Fecha a porta que sobrou de uma escolha anterior (não usada): fechar a ponta daqui também para a captura no
 * principal. Chamar antes de uma escolha nova, para nunca usar uma porta velha.
 */
export function descartarPortaSom(): void {
  ultimaPorta?.close();
  ultimaPorta = undefined;
  esperando?.(undefined);
  esperando = undefined;
  aguardando = true;
}

/** A porta da escolha que acabou de ser feita (chega logo depois de `captura.escolher`); sem ela em `prazoMs`, undefined. */
export function tomarPortaSom(prazoMs = 3000): Promise<MessagePort | undefined> {
  if (ultimaPorta) {
    const p = ultimaPorta;
    ultimaPorta = undefined;
    aguardando = false;
    return Promise.resolve(p);
  }
  // Só um pedido por vez: um anterior que ainda esperava fica sem porta.
  esperando?.(undefined);
  return new Promise((resolver) => {
    const t = setTimeout(() => {
      if (esperando === entregar) esperando = undefined;
      aguardando = false;
      resolver(undefined);
    }, prazoMs);
    const entregar = (p: MessagePort | undefined) => {
      clearTimeout(t);
      resolver(p);
    };
    esperando = entregar;
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
        // O worklet fecha a porta: o principal vê o fechamento e para a captura (RN-7).
        no.port.postMessage({ fechar: true });
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
