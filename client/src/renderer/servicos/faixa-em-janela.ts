import type { FaixaVideo } from './voz';

/** O que o livekit-client oferece numa faixa remota além de attach/detach (adaptiveStream). */
interface FaixaRemota extends FaixaVideo {
  mediaStreamTrack?: MediaStreamTrack;
  observeElementInfo?(info: InfoElemento): void;
  stopObservingElementInfo?(info: InfoElemento): void;
}

/** O formato que o livekit-client espera (ElementInfo) para saber se e em que tamanho o vídeo está na tela. */
interface InfoElemento {
  element: object;
  width(): number;
  height(): number;
  visible: boolean;
  pictureInPicture: boolean;
  visibilityChangedAt: number | undefined;
  handleResize?: () => void;
  handleVisibilityChanged?: () => void;
  observe(): void;
  stopObserving(): void;
}

/**
 * Prende a faixa num <video> e devolve como soltar. Na janela principal, como sempre (attach/detach). Numa janela
 * própria (video-teatro-cameras-e-sons), o vídeo recebe a mesma MediaStreamTrack (sem nova conexão) e a visibilidade
 * é informada ao livekit-client pela própria janela: o observador dele mede só a janela principal e acharia o vídeo
 * escondido (com o adaptiveStream, o servidor pararia de mandar a imagem).
 */
export function ligarFaixa(faixa: FaixaVideo, el: HTMLVideoElement): () => void {
  const doc = el.ownerDocument;
  const remota = faixa as FaixaRemota;
  if (doc === document || !remota.mediaStreamTrack) {
    faixa.attach(el);
    return () => faixa.detach(el);
  }
  el.srcObject = new MediaStream([remota.mediaStreamTrack]);
  void el.play?.()?.catch(() => undefined);
  if (!remota.observeElementInfo || !remota.stopObservingElementInfo) {
    return () => {
      el.srcObject = null;
    };
  }
  const janela = doc.defaultView;
  let redimensionar: ResizeObserver | undefined;
  const aoMudarVisibilidade = () => {
    info.visible = doc.visibilityState !== 'hidden';
    info.visibilityChangedAt = Date.now();
    info.handleVisibilityChanged?.();
  };
  const info: InfoElemento = {
    element: el,
    width: () => el.clientWidth,
    height: () => el.clientHeight,
    visible: doc.visibilityState !== 'hidden',
    pictureInPicture: false,
    visibilityChangedAt: Date.now(),
    observe() {
      doc.addEventListener('visibilitychange', aoMudarVisibilidade);
      const Observador = (janela as (Window & typeof globalThis) | null)?.ResizeObserver;
      if (Observador) {
        redimensionar = new Observador(() => info.handleResize?.());
        redimensionar.observe(el);
      }
    },
    stopObserving() {
      doc.removeEventListener('visibilitychange', aoMudarVisibilidade);
      redimensionar?.disconnect();
    },
  };
  remota.observeElementInfo(info);
  return () => {
    remota.stopObservingElementInfo!(info);
    el.srcObject = null;
  };
}
