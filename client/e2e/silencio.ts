import { execFileSync } from 'node:child_process';

/**
 * Cria uma saída de áudio falsa (null sink) e manda o som dos apps de teste para ela (PULSE_SINK). Os testes de
 * voz continuam medindo o áudio de verdade; só não sai na caixa de som de quem está usando o PC.
 * Sem pactl (ex.: Windows ou CI sem PulseAudio), não faz nada. A saída é removida no fim da suíte.
 *
 * Cuidado: ao aparecer um dispositivo novo, o PipeWire pode torná-lo o padrão, e o "monitor" da saída falsa vira o
 * microfone padrão do sistema. Um ToFalany de verdade aberto numa chamada passaria a mandar o som dos testes para
 * o canal (aconteceu em 07/11). Por isso a saída falsa nasce sem prioridade e os padrões de antes são devolvidos.
 */
const SAIDA = 'tofalany_e2e';

function pactl(...args: string[]): string {
  return execFileSync('pactl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function padroes(): { saida?: string; entrada?: string } {
  try {
    return { saida: pactl('get-default-sink').trim() || undefined, entrada: pactl('get-default-source').trim() || undefined };
  } catch {
    return {};
  }
}

function devolver(p: { saida?: string; entrada?: string }) {
  try {
    if (p.saida && p.saida !== SAIDA) pactl('set-default-sink', p.saida);
    if (p.entrada && !p.entrada.startsWith(SAIDA)) pactl('set-default-source', p.entrada);
  } catch {
    // Sem permissão ou dispositivo sumiu: nada a fazer.
  }
}

export default function silenciar(): (() => void) | undefined {
  let modulo: string | undefined;
  const antes = padroes();
  let vigia: NodeJS.Timeout | undefined;
  try {
    if (!pactl('list', 'short', 'sinks').includes(SAIDA)) {
      modulo = pactl(
        'load-module',
        'module-null-sink',
        `sink_name=${SAIDA}`,
        // Prioridade zero: o PipeWire não escolhe esta saída (nem o monitor dela) como padrão.
        `sink_properties=device.description=ToFalany-testes priority.session=0 priority.driver=0 node.passive=true`,
      ).trim();
    }
  } catch {
    return undefined;
  }
  devolver(antes);
  // Durante a suíte, se o sistema trocar o padrão para a saída falsa (ou o monitor dela), volta na hora.
  vigia = setInterval(() => {
    const agora = padroes();
    if (agora.saida === SAIDA || agora.entrada?.startsWith(SAIDA)) devolver(antes);
  }, 500);
  vigia.unref();
  globalThis.process['env'].PULSE_SINK = SAIDA;
  return () => {
    clearInterval(vigia);
    vigia = undefined;
    if (modulo) {
      try {
        pactl('unload-module', modulo);
      } catch {
        // Já removida: nada a fazer.
      }
    }
    devolver(antes);
  };
}
