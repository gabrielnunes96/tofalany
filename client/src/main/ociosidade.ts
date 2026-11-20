import { AUSENTE_APOS_S } from '@tofalando/shared';

/**
 * RN-25: o computador está ocioso (sem teclado/mouse) há `limiteS` segundos? Consulta o sistema a cada
 * `intervaloMs` e avisa só quando muda. Roda no processo principal: não é freado com a janela em segundo plano.
 */
export function criarOciosidade(lerOciosoS: () => number, aoMudar: (ausente: boolean) => void, limiteS = AUSENTE_APOS_S, intervaloMs = 15_000) {
  let ausente = false;
  const verificar = () => {
    let segundos: number;
    try {
      segundos = lerOciosoS();
    } catch {
      return;
    }
    const agora = segundos >= limiteS;
    if (agora === ausente) return;
    ausente = agora;
    aoMudar(ausente);
  };
  const relogio = setInterval(verificar, intervaloMs);
  relogio.unref?.();
  return {
    verificar,
    ausente: () => ausente,
    parar: () => clearInterval(relogio),
  };
}
