import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { BUILD_MINIMO_WINDOWS, buildDoWindows, criarSomWindows } from './som-windows';

/** som-sistema-windows, T1: captura do som do sistema sem o próprio app (CA-3, CA-7). */
function moduloFalso() {
  const instancias: { startSystemAudio: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; lastError: string | null }[] = [];
  class LoopbackCapture {
    lastError: string | null = null;
    startSystemAudio = vi.fn();
    stop = vi.fn();
    constructor() {
      instancias.push(this);
    }
  }
  return { modulo: { LoopbackCapture }, instancias };
}

describe('som do sistema no Windows', () => {
  it('lê o build do Windows', () => {
    expect(buildDoWindows('10.0.22631')).toBe(22631);
    expect(buildDoWindows('10.0.19045')).toBe(19045);
    expect(buildDoWindows('x')).toBe(0);
    expect(BUILD_MINIMO_WINDOWS).toBe(22000);
  });

  it('CA-3: Windows 10 → windows-antigo, sem carregar o módulo', () => {
    const carregar = vi.fn(() => moduloFalso().modulo);
    const s = criarSomWindows({ plataforma: 'win32', build: 19045, carregar });
    expect(s.motivo()).toBe('windows-antigo');
    expect(s.ligar(vi.fn())).toBe(false);
    expect(carregar).not.toHaveBeenCalled();
  });

  it('CA-7: binário ausente → sem-modulo; binário que não carrega → ligar falha e passa a sem-modulo, sem lançar', () => {
    expect(criarSomWindows({ plataforma: 'win32', build: 22631, existe: () => false }).motivo()).toBe('sem-modulo');
    const carregar = vi.fn(() => {
      throw new Error('não carregou');
    });
    const s = criarSomWindows({ plataforma: 'win32', build: 22631, existe: () => true, carregar });
    // Abrir o app não carrega o código nativo (só ao transmitir com som).
    expect(s.motivo()).toBeUndefined();
    expect(carregar).not.toHaveBeenCalled();
    expect(s.ligar(vi.fn())).toBe(false);
    expect(s.motivo()).toBe('sem-modulo');
  });

  it('CA-1: liga excluindo a árvore do processo principal; para; a falha da captura aparece', () => {
    const f = moduloFalso();
    const s = criarSomWindows({ plataforma: 'win32', build: 22631, existe: () => true, carregar: () => f.modulo, pid: 4242 });
    expect(s.motivo()).toBeUndefined();
    const aoPedaco = vi.fn();
    expect(s.ligar(aoPedaco)).toBe(true);
    expect(f.instancias[0]!.startSystemAudio).toHaveBeenCalledWith(aoPedaco, 4242);
    expect(s.ativo()).toBe(true);
    f.instancias[0]!.lastError = 'device invalidated';
    expect(s.erro()).toBe('device invalidated');
    s.desligar();
    expect(f.instancias[0]!.stop).toHaveBeenCalled();
    expect(s.ativo()).toBe(false);
    expect(s.erro()).toBeNull();
  });

  it('falha ao iniciar → false; ligar de novo para a anterior', () => {
    const f = moduloFalso();
    const s = criarSomWindows({ plataforma: 'win32', build: 22631, existe: () => true, carregar: () => f.modulo });
    s.ligar(vi.fn());
    s.ligar(vi.fn());
    expect(f.instancias[0]!.stop).toHaveBeenCalled();
    const quebrado = { LoopbackCapture: class { lastError = null; stop = vi.fn(); startSystemAudio() { throw new Error('20348'); } } };
    expect(criarSomWindows({ plataforma: 'win32', build: 22631, existe: () => true, carregar: () => quebrado }).ligar(vi.fn())).toBe(false);
  });

  it('fora do Windows não há módulo', () => {
    expect(criarSomWindows({ plataforma: 'linux' }).motivo()).toBe('sem-modulo');
  });

  it('segurança: o binário do Windows é o que foi revisado (trocar a versão exige rever o pacote e este valor)', () => {
    const arquivo = createRequire(import.meta.url).resolve('loopback-capture/prebuilds/win32-x64/loopback_capture_addon.node');
    expect(createHash('sha256').update(readFileSync(arquivo)).digest('hex')).toBe('29a369650e955de50c7e9b1fc18b7b6d1a5343a061774ae0f2af31da8a8ce86d');
  });
});
