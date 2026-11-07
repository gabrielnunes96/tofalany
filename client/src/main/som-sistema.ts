import { createRequire } from 'node:module';
import { basename } from 'node:path';

/**
 * Backlog v2, item 13: som do computador na transmissão de tela no Linux.
 *
 * O Chromium não captura o som do sistema no Linux (o "loopback" é só do Windows). Com o PipeWire, a venmic
 * cria um microfone virtual ("vencord-screen-share") que recebe o som de todos os aplicativos **menos o
 * próprio ToFalany**: assim a voz da chamada não volta para quem assiste (sem eco). A janela captura esse
 * microfone e publica como o áudio da tela. Sem PipeWire (ou sem o binário da venmic), a opção fica desligada.
 */

/** Nome do microfone virtual que a venmic cria (a janela procura o dispositivo por ele). */
export const NOME_MICROFONE_VIRTUAL = 'vencord-screen-share';

interface PatchBay {
  link(dados: { exclude: Record<string, string>[]; only_speakers?: boolean; ignore_devices?: boolean }): boolean;
  unlink(): void;
}
interface Venmic {
  PatchBay: { new (): PatchBay; hasPipeWire(): boolean };
}

/** Binários cujo som nunca entra: o app empacotado ("tofalany") e o Electron do desenvolvimento e dos testes. */
export function binariosExcluidos(executavel: string): string[] {
  return [...new Set([basename(executavel), 'tofalany', 'electron'])];
}

export function criarSomSistema(plataforma: NodeJS.Platform = process.platform, carregar: () => Venmic = () => createRequire(import.meta.url)('@vencord/venmic') as Venmic) {
  let venmic: Venmic | null | undefined;
  let patchbay: PatchBay | undefined;

  const modulo = (): Venmic | null => {
    if (venmic !== undefined) return venmic;
    venmic = null;
    if (plataforma !== 'linux') return venmic;
    try {
      const m = carregar();
      if (m.PatchBay.hasPipeWire()) venmic = m;
    } catch (erro) {
      console.warn('Som do sistema indisponível (venmic):', (erro as Error).message);
    }
    return venmic;
  };

  return {
    disponivel: () => modulo() !== null,
    /** Cria (ou refaz) o microfone virtual com o som dos outros aplicativos. */
    ligar(): boolean {
      const m = modulo();
      if (!m) return false;
      try {
        patchbay ??= new m.PatchBay();
        patchbay.unlink();
        return patchbay.link({
          exclude: binariosExcluidos(process.execPath).map((b) => ({ 'application.process.binary': b })),
          only_speakers: true,
          ignore_devices: true,
        });
      } catch (erro) {
        console.warn('Não foi possível ligar o som do sistema:', (erro as Error).message);
        return false;
      }
    },
    desligar() {
      try {
        patchbay?.unlink();
      } catch {
        // Já desfeito.
      }
    },
  };
}
