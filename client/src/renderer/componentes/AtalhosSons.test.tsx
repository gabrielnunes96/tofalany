// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ATALHOS_PADRAO, ATALHOS_SONS_PADRAO, type Atalho } from '@tofalando/shared';
import { AtalhosSonsSecao } from './AtalhosSons';

afterEach(cleanup);
const f = (codigo: string): Atalho => ({ codigo, ctrl: false, alt: false, shift: false, meta: false });

function montar(valor = ATALHOS_SONS_PADRAO, atalhos = ATALHOS_PADRAO) {
  const aoMudar = vi.fn();
  render(
    <AtalhosSonsSecao
      atalhos={atalhos}
      atalhosSons={valor}
      servidor="https://a"
      sonsDoServidor={[{ id: 1, nome: 'Grilo' }]}
      meusSons={[{ id: 7, nome: 'Trovão' }]}
      aoMudar={aoMudar}
    />,
  );
  return aoMudar;
}

describe('atalhos dos sons (atalhos-de-sons)', () => {
  it('RN-6: nenhum vem pronto; "Usar F1" grava no servidor e "Meus sons" vale em todos', () => {
    const aoMudar = montar();
    expect(screen.getByRole('listitem', { name: 'Grilo' }).textContent).toContain('Nenhum');
    fireEvent.click(screen.getByRole('button', { name: 'Usar F1 para Grilo' }));
    expect(aoMudar).toHaveBeenLastCalledWith({ globais: {}, porServidor: { 'https://a': { 1: f('F1') } } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar F1 para Trovão (Meus sons)' }));
    expect(aoMudar).toHaveBeenLastCalledWith({ globais: { 7: f('F1') }, porServidor: {} });
  });

  it('CA-1: gravar um atalho já usado mostra o conflito e não grava', () => {
    const aoMudar = montar({ globais: {}, porServidor: { 'https://a': { 1: f('F1') } } }, { ...ATALHOS_PADRAO, ptt: f('F2') });
    fireEvent.click(screen.getByRole('button', { name: 'Gravar atalho de Trovão (Meus sons)' }));
    fireEvent.keyDown(window, { code: 'F1' });
    expect(screen.getByRole('alert').textContent).toBe('F1 já é o atalho de outro som. Escolha outro para Trovão.');
    fireEvent.keyDown(window, { code: 'F2' });
    expect(screen.getByRole('alert').textContent).toContain('F2 já é o atalho de Push-to-talk');
    expect(aoMudar).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { code: 'F6' });
    expect(aoMudar).toHaveBeenLastCalledWith({ globais: { 7: f('F6') }, porServidor: { 'https://a': { 1: f('F1') } } });
  });

  it('remover tira o atalho do som', () => {
    const aoMudar = montar({ globais: {}, porServidor: { 'https://a': { 1: f('F1') } } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover atalho de Grilo' }));
    expect(aoMudar).toHaveBeenLastCalledWith({ globais: {}, porServidor: {} });
  });
});
