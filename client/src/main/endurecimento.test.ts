import { describe, expect, it, vi } from 'vitest';
import { preferenciasDoEmpacotado, prepararMenu } from './endurecimento';

describe('app instalado sem recarregar nem ferramentas de desenvolvedor', () => {
  it('no empacotado, as janelas nascem sem ferramentas de desenvolvedor', () => {
    expect(preferenciasDoEmpacotado(true)).toEqual({ devTools: false });
  });

  it('em desenvolvimento e nos testes E2E, nada muda', () => {
    expect(preferenciasDoEmpacotado(false)).toEqual({});
  });

  it('no empacotado, o menu padrão sai (e com ele Ctrl+R e Ctrl+Shift+I)', () => {
    const definir = vi.fn();
    prepararMenu(true, definir);
    expect(definir).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('fora do empacotado, o menu padrão fica', () => {
    const definir = vi.fn();
    prepararMenu(false, definir);
    expect(definir).not.toHaveBeenCalled();
  });
});
