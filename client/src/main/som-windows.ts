import { createRequire } from 'node:module';
import { release } from 'node:os';

/**
 * som-sistema-windows: som do computador na transmissão de tela no Windows, **sem o som do próprio ToFalany**.
 *
 * O "loopback" do Chromium leva tudo o que sai no alto-falante, inclusive as vozes da chamada (quem assiste ouve a
 * própria voz de volta). O Windows 11 (build 20348+ na API; 22000+ para uso comum) captura o som de todos os
 * programas menos uma árvore de processos: passamos o processo principal, que é pai das janelas, do serviço de
 * áudio do Chromium e dos iframes. O pacote `loopback-capture` (MIT, binário N-API pronto) faz a captura WASAPI e
 * entrega PCM 16 bits, 48 kHz, estéreo. No Windows 10 o recurso não existe: a opção fica desligada.
 */

/** Windows 11: primeiro build de uso comum com a captura que exclui uma árvore de processos. */
export const BUILD_MINIMO_WINDOWS = 22000;

export type MotivoSemSom = 'windows-antigo' | 'sem-modulo' | 'sem-pipewire';

interface Captura {
  readonly lastError: string | null;
  stop(): void;
  startSystemAudio(callback: (pedaco: Buffer) => void, excluirPid?: number): void;
}
interface ModuloCaptura {
  LoopbackCapture: new () => Captura;
}

/** Build do Windows a partir de `os.release()` ("10.0.22631" → 22631); 0 se não der para ler. */
export function buildDoWindows(versao: string = release()): number {
  const build = Number(versao.split('.')[2]);
  return Number.isInteger(build) && build > 0 ? build : 0;
}

// O binário é carregado direto do pacote (fora do asar, pelo asarUnpack), sem passar pelo localizador dele.
const carregarPadrao = (): ModuloCaptura => createRequire(import.meta.url)('loopback-capture/prebuilds/win32-x64/loopback_capture_addon.node') as ModuloCaptura;

export function criarSomWindows(opcoes: { plataforma?: NodeJS.Platform; build?: number; carregar?: () => ModuloCaptura; pid?: number } = {}) {
  const plataforma = opcoes.plataforma ?? process.platform;
  const build = opcoes.build ?? (plataforma === 'win32' ? buildDoWindows() : 0);
  const carregar = opcoes.carregar ?? carregarPadrao;
  const pid = opcoes.pid ?? process.pid;
  let modulo: ModuloCaptura | null | undefined;
  let captura: Captura | undefined;

  const obter = (): ModuloCaptura | null => {
    if (modulo !== undefined) return modulo;
    modulo = null;
    try {
      modulo = carregar();
    } catch (erro) {
      console.warn('Som do sistema indisponível (módulo do Windows):', (erro as Error).message);
    }
    return modulo;
  };

  const api = {
    /** Por que não há som do sistema aqui (undefined = disponível). Só faz sentido no Windows. */
    motivo(): MotivoSemSom | undefined {
      if (plataforma !== 'win32') return 'sem-modulo';
      if (build < BUILD_MINIMO_WINDOWS) return 'windows-antigo';
      return obter() ? undefined : 'sem-modulo';
    },
    /** Começa a capturar (tudo menos este app); cada pedaço de PCM vai para `aoPedaco`. Devolve se começou. */
    ligar(aoPedaco: (pedaco: Buffer) => void): boolean {
      api.desligar();
      const m = api.motivo() ? null : obter();
      if (!m) return false;
      try {
        const nova = new m.LoopbackCapture();
        nova.startSystemAudio(aoPedaco, pid);
        captura = nova;
        return true;
      } catch (erro) {
        console.warn('Não foi possível capturar o som do sistema:', (erro as Error).message);
        return false;
      }
    },
    /** Falha da captura em andamento (saída de áudio trocada, por exemplo), ou null. */
    erro(): string | null {
      return captura?.lastError ?? null;
    },
    ativo: () => captura !== undefined,
    desligar() {
      const c = captura;
      captura = undefined;
      if (!c) return;
      try {
        c.stop();
      } catch (erro) {
        console.warn('Erro ao parar a captura do som do sistema:', (erro as Error).message);
      }
    },
  };
  return api;
}
