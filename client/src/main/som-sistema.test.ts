import { describe, expect, it, vi } from 'vitest';
import { binariosExcluidos, criarSomSistema } from './som-sistema';

function venmicFalsa(pipewire = true) {
  const link = vi.fn((_dados: unknown) => true);
  const unlink = vi.fn();
  class PatchBay {
    static hasPipeWire = () => pipewire;
    link = link;
    unlink = unlink;
  }
  return { modulo: { PatchBay }, link, unlink };
}

describe('som do sistema no Linux (backlog v2, item 13)', () => {
  it('exclui o próprio app (empacotado e em desenvolvimento) do microfone virtual', () => {
    expect(binariosExcluidos('/opt/ToFalany/tofalany')).toEqual(['tofalany', 'electron']);
    expect(binariosExcluidos('/home/x/node_modules/electron/dist/electron')).toEqual(['electron', 'tofalany']);
  });

  it('Linux com PipeWire: liga com o app excluído, só alto-falantes, e desliga', () => {
    const f = venmicFalsa();
    const som = criarSomSistema('linux', () => f.modulo as never);
    expect(som.disponivel()).toBe(true);
    expect(som.ligar()).toBe(true);
    const pedido = f.link.mock.calls[0]![0] as { exclude: Record<string, string>[]; only_speakers: boolean; ignore_devices: boolean };
    expect(pedido.exclude).toContainEqual({ 'application.process.binary': 'tofalany' });
    expect(pedido.only_speakers).toBe(true);
    expect(pedido.ignore_devices).toBe(true);
    som.desligar();
    expect(f.unlink).toHaveBeenCalled();
  });

  it('Windows, Linux sem PipeWire ou sem o binário: indisponível', () => {
    const carregar = vi.fn(() => venmicFalsa().modulo as never);
    expect(criarSomSistema('win32', carregar).disponivel()).toBe(false);
    expect(carregar).not.toHaveBeenCalled();
    expect(criarSomSistema('linux', () => venmicFalsa(false).modulo as never).disponivel()).toBe(false);
    const quebrado = criarSomSistema('linux', () => {
      throw new Error('sem binário');
    });
    expect(quebrado.disponivel()).toBe(false);
    expect(quebrado.ligar()).toBe(false);
  });
});
