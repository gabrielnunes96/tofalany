// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SeletorEmoji } from './SeletorEmoji';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('SeletorEmoji (T4)', () => {
  it('abre com foco na busca, recentes (ou os atalhos) e as categorias carregadas', async () => {
    render(<SeletorEmoji aoEscolher={vi.fn()} aoFechar={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: /Buscar emoji/ }));
    expect(screen.getByRole('region', { name: 'Sugestões' }).textContent).toBe('Sugestões👍😂❤️');
    expect(await screen.findByRole('region', { name: 'Carinhas e emoções' }, { timeout: 5000 })).toBeTruthy();
  });

  it('busca: Enter escolhe o primeiro; sem resultado avisa', async () => {
    const aoEscolher = vi.fn();
    render(<SeletorEmoji aoEscolher={aoEscolher} aoFechar={vi.fn()} />);
    await screen.findByRole('region', { name: 'Bandeiras' }, { timeout: 5000 });
    const busca = screen.getByRole('searchbox', { name: /Buscar emoji/ });
    fireEvent.change(busca, { target: { value: 'polegar para cima' } });
    expect(screen.getByRole('region', { name: 'Resultados' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/^\d+ emojis?$/);
    fireEvent.keyDown(busca, { key: 'Enter' });
    expect(aoEscolher).toHaveBeenCalledWith('👍');
    fireEvent.change(busca, { target: { value: 'xyzqwk' } });
    expect(screen.getByText('Nenhum emoji com "xyzqwk".')).toBeTruthy();
  });

  it('setas andam pela grade; clicar escolhe; Esc e clique fora fecham; clicar na âncora não fecha por fora', async () => {
    const aoEscolher = vi.fn();
    const aoFechar = vi.fn();
    const ancora = document.createElement('button');
    document.body.appendChild(ancora);
    render(<SeletorEmoji aoEscolher={aoEscolher} aoFechar={aoFechar} ancora={ancora} />);
    await screen.findByRole('region', { name: 'Pessoas' }, { timeout: 5000 });
    const dialogo = screen.getByRole('dialog', { name: 'Escolher reação' });
    fireEvent.keyDown(dialogo, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('👍');
    fireEvent.keyDown(dialogo, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('😂');
    fireEvent.keyDown(dialogo, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    // Da segunda coluna das sugestões, a seta para baixo vai para a segunda coluna da primeira categoria.
    fireEvent.keyDown(dialogo, { key: 'ArrowDown' });
    fireEvent.keyDown(dialogo, { key: 'ArrowRight' });
    fireEvent.keyDown(dialogo, { key: 'ArrowDown' });
    const carinhas = screen.getByRole('region', { name: 'Carinhas e emoções' }).querySelectorAll('.emoji');
    expect(document.activeElement).toBe(carinhas[1]);
    // Só um emoji entra no Tab.
    expect(screen.getByRole('dialog').querySelectorAll('.emoji[tabindex="0"]')).toHaveLength(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'coração vermelho' })[0]!);
    expect(aoEscolher).toHaveBeenCalledWith('❤️');
    fireEvent.mouseDown(ancora);
    expect(aoFechar).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(aoFechar).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(dialogo, { key: 'Escape' });
    expect(aoFechar).toHaveBeenLastCalledWith(true);
    ancora.remove();
  });

  it('mostra os usados recentemente deste aparelho', async () => {
    localStorage.setItem('tofalany:emojis-recentes', JSON.stringify(['🔥', '🥳']));
    render(<SeletorEmoji aoEscolher={vi.fn()} aoFechar={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Usados recentemente' }).textContent).toBe('Usados recentemente🔥🥳');
    // Com os dados carregados, os recentes ganham o nome em português.
    expect((await screen.findAllByRole('button', { name: 'fogo' }, { timeout: 4000 }))[0]!.closest('section')!.textContent).toContain('Usados recentemente');
  });
});
