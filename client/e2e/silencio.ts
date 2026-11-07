import { execFileSync } from 'node:child_process';

/**
 * Cria uma saída de áudio falsa (null sink) e manda o som dos apps de teste para ela (PULSE_SINK). Os testes de
 * voz continuam medindo o áudio de verdade; só não sai na caixa de som de quem está usando o PC.
 * Sem pactl (ex.: Windows ou CI sem PulseAudio), não faz nada. A saída é removida no fim da suíte.
 */
const SAIDA = 'tofalany_e2e';

function pactl(...args: string[]): string {
  return execFileSync('pactl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

export default function silenciar(): (() => void) | undefined {
  let modulo: string | undefined;
  try {
    if (!pactl('list', 'short', 'sinks').includes(SAIDA)) {
      modulo = pactl('load-module', 'module-null-sink', `sink_name=${SAIDA}`, `sink_properties=device.description=ToFalany-testes`).trim();
    }
  } catch {
    return undefined;
  }
  globalThis.process['env'].PULSE_SINK = SAIDA;
  return () => {
    if (modulo) {
      try {
        pactl('unload-module', modulo);
      } catch {
        // Já removida: nada a fazer.
      }
    }
  };
}
