// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ColunaServidores } from './ColunaServidores';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const servidores = [
  { url: 'https://a.io', nome: 'Turma' },
  { url: 'https://a.io/c/2', nome: 'Jogos' },
  { url: 'https://b.io', nome: 'Família' },
];

function montar(aoRemover?: (url: string) => void) {
  const aoEscolher = vi.fn();
  render(<ColunaServidores servidores={servidores} ativo="https://a.io" aoEscolher={aoEscolher} aoAdicionar={() => undefined} aoRemover={aoRemover} />);
  return { aoEscolher };
}

describe('ColunaServidores: remover da lista (item 41)', () => {
  it('clique direito abre o menu ao lado do ícone e, confirmado, tira só da lista', () => {
    const aoRemover = vi.fn();
    const { aoEscolher } = montar(aoRemover);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.contextMenu(screen.getByRole('button', { name: /Família/ }), { clientX: 30, clientY: 120 });
    const menu = screen.getByRole('menu', { name: 'Opções de Família' });
    expect(menu.style.left).toBe('8px');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /Remover da lista/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Remover da lista/ }));
    expect(aoRemover).toHaveBeenCalledWith('https://b.io');
    expect(aoEscolher).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('pelo teclado (sem coordenadas) também abre; Esc fecha e devolve o foco ao ícone', () => {
    montar(vi.fn());
    const icone = screen.getByRole('button', { name: /Família/ });
    icone.focus();
    fireEvent.contextMenu(icone);
    expect(screen.getByRole('menu', { name: 'Opções de Família' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(icone);
  });

  it('cancelado na confirmação, não tira e o foco volta ao ícone', () => {
    const aoRemover = vi.fn();
    montar(aoRemover);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const icone = screen.getByRole('button', { name: /Família/ });
    fireEvent.contextMenu(icone);
    fireEvent.click(screen.getByRole('menuitem', { name: /Remover da lista/ }));
    expect(aoRemover).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(icone);
  });

  it('clique fora e foco saindo do menu fecham', () => {
    montar(vi.fn());
    fireEvent.contextMenu(screen.getByRole('button', { name: /Família/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Família/ }));
    fireEvent.blur(screen.getByRole('menuitem', { name: /Remover da lista/ }), { relatedTarget: document.body });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('servidores do endereço aberto (eles voltam sozinhos para a lista) e sem aoRemover: sem menu', () => {
    montar(vi.fn());
    fireEvent.contextMenu(screen.getByRole('button', { name: /Turma/ }));
    fireEvent.contextMenu(screen.getByRole('button', { name: /Jogos/ }));
    expect(screen.queryByRole('menu')).toBeNull();
    cleanup();
    montar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Família/ }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
