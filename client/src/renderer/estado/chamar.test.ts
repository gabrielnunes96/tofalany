import { afterEach, describe, expect, it, vi } from 'vitest';
import { chamavel, deveTocarChamado, textoFimChamado, tocarRepetido } from './chamar';

afterEach(() => vi.useRealTimers());

describe('chamar como um telefone (chamar-tocando)', () => {
  it('CA-1: só online e ausente aparecem como chamáveis', () => {
    expect(chamavel('online')).toBe(true);
    expect(chamavel('ausente')).toBe(true);
    expect(chamavel('naoIncomodar')).toBe(false);
    expect(chamavel('offline')).toBe(false);
    expect(chamavel(undefined)).toBe(false);
  });

  it('CA-6: surdo ou preferência desligada não tocam', () => {
    expect(deveTocarChamado(false, undefined)).toBe(true);
    expect(deveTocarChamado(true, true)).toBe(false);
    expect(deveTocarChamado(false, false)).toBe(false);
  });

  it('CA-3, CA-4: avisos de recusa e de não atendido; cancelado e atendido sem aviso', () => {
    expect(textoFimChamado('recusado', 'Bia')).toBe('Bia recusou o chamado.');
    expect(textoFimChamado('tempo', 'Bia')).toBe('Bia não atendeu.');
    expect(textoFimChamado('cancelado', 'Bia')).toBeNull();
    expect(textoFimChamado('atendido', 'Bia')).toBeNull();
  });

  it('CA-2: o toque repete até parar', () => {
    vi.useFakeTimers();
    const tocar = vi.fn();
    const parar = tocarRepetido(tocar, 2000);
    vi.advanceTimersByTime(4100);
    expect(tocar).toHaveBeenCalledTimes(3);
    parar();
    vi.advanceTimersByTime(10_000);
    expect(tocar).toHaveBeenCalledTimes(3);
  });
});
