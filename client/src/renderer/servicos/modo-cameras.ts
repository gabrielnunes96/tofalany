import { useSyncExternalStore } from 'react';

/**
 * Câmeras do canal de voz: na conversa (padrão), flutuantes (janelinha arrastável) ou numa janela própria. A posição da
 * janelinha fica neste computador. Um só lugar para ler e mudar, para o botão "Voltar as câmeras ao lugar" (no painel
 * de voz e em Configurações) mexer na janelinha de fora dela (video-teatro-cameras-e-sons, RN-2).
 */
export interface ModoCameras {
  flutuante: boolean;
  x: number;
  y: number;
  /** Numa janela própria (só nesta sessão: reabrir o app não abre a janela sozinho). */
  janela?: boolean;
}

const CHAVE = 'tofalany.cameras';
let ultimo: ModoCameras | undefined;
const EVENTO = 'tofalany:cameras';
/** Canto padrão da janelinha (à vista em qualquer tamanho de janela). */
export const POSICAO_PADRAO = { x: 24, y: 80 };

export function lerModoCameras(): ModoCameras {
  return ultimo ?? lerDoArmazenamento();
}

function lerDoArmazenamento(): ModoCameras {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '') as Partial<ModoCameras>;
    const x = Number(bruto.x);
    const y = Number(bruto.y);
    return {
      flutuante: bruto.flutuante === true,
      x: Number.isFinite(x) ? x : POSICAO_PADRAO.x,
      y: Number.isFinite(y) ? y : POSICAO_PADRAO.y,
    };
  } catch {
    return { flutuante: false, ...POSICAO_PADRAO };
  }
}

export function gravarModoCameras(modo: ModoCameras): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ flutuante: modo.flutuante, x: modo.x, y: modo.y }));
  } catch {
    // Sem armazenamento: vale só nesta sessão (o evento avisa quem mostra).
  }
  ultimo = modo;
  window.dispatchEvent(new Event(EVENTO));
}

/** Para os testes: esquece o que está em memória (como ao abrir o app). */
export function reiniciarModoCameras(): void {
  ultimo = undefined;
}

/** RN-2: a janelinha volta ao canto padrão, à vista (continua flutuante). */
export function voltarCamerasAoLugar(): void {
  gravarModoCameras({ ...lerModoCameras(), ...POSICAO_PADRAO });
}

const assinar = (aviso: () => void) => {
  const mudou = () => {
    ultimo = { ...lerDoArmazenamento(), janela: ultimo?.janela };
    aviso();
  };
  window.addEventListener(EVENTO, aviso);
  window.addEventListener('storage', mudou);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener('storage', mudou);
  };
};
const instantaneo = () => (ultimo ??= lerDoArmazenamento());

/** O modo atual, atualizado quando alguém o muda (inclusive de fora da grade de câmeras). */
export function useModoCameras(): ModoCameras {
  return useSyncExternalStore(assinar, instantaneo);
}
