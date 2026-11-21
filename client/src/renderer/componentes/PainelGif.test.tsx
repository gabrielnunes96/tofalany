// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PainelGif } from './PainelGif';
import type { GifResultado, PaginaGifs } from '../servicos/gif';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const res = (slug: string): GifResultado => ({
  slug,
  descricao: slug,
  miniatura: { url: `https://static.klipy.com/${slug}-sm.webp`, largura: 220, altura: 124 },
  gif: { slug, url: `https://static.klipy.com/${slug}-md.webp`, largura: 498, altura: 280, descricao: slug },
});
const pagina = (slugs: string[], temMais = false): PaginaGifs => ({ itens: slugs.map(res), temMais });

/** IntersectionObserver falso: `ver()` avisa que o fim da grade apareceu. */
function observador() {
  const ouvintes: ((e: { isIntersecting: boolean }[]) => void)[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(fn: (e: { isIntersecting: boolean }[]) => void) {
        ouvintes.push(fn);
      }
      observe() {}
      disconnect() {}
    },
  );
  return () => ouvintes.at(-1)?.([{ isIntersecting: true }]);
}

async function esperar(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe('PainelGif (T3)', () => {
  it('CA-3: em alta sem texto; busca depois da pausa, na ordem devolvida; não repete a mesma busca', async () => {
    vi.useFakeTimers();
    const emAlta = vi.fn(async () => pagina(['alta-1', 'alta-2']));
    const buscar = vi.fn(async (q: string) => pagina([`${q}-b`, `${q}-a`]));
    render(<PainelGif klipy={{ emAlta, buscar }} aoEscolher={vi.fn()} aoFechar={vi.fn()} />);
    const campo = screen.getByRole('searchbox', { name: 'Buscar GIF' });
    expect(document.activeElement).toBe(campo);
    expect((campo as HTMLInputElement).placeholder).toBe('Search KLIPY');
    await esperar(0);
    expect(emAlta).toHaveBeenCalledWith(1);
    expect(screen.getByRole('group', { name: 'Em alta' }).querySelectorAll('button')).toHaveLength(2);
    fireEvent.change(campo, { target: { value: 'g' } });
    fireEvent.change(campo, { target: { value: 'gato' } });
    await esperar(299);
    expect(buscar).not.toHaveBeenCalled();
    await esperar(1);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledWith('gato', 1);
    const nomes = [...screen.getByRole('group', { name: 'Resultados de gato' }).querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(nomes).toEqual(['gato-b', 'gato-a']);
    // Volta para os em alta e de novo para "gato": nada é pedido outra vez.
    fireEvent.change(campo, { target: { value: '' } });
    await esperar(300);
    fireEvent.change(campo, { target: { value: 'gato' } });
    await esperar(300);
    expect(emAlta).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('carrega a próxima página ao chegar no fim', async () => {
    vi.useFakeTimers();
    const ver = observador();
    const emAlta = vi.fn(async (n?: number) => (n === 1 ? pagina(['a', 'b'], true) : pagina(['c'])));
    render(<PainelGif klipy={{ emAlta, buscar: vi.fn() }} aoEscolher={vi.fn()} aoFechar={vi.fn()} />);
    await esperar(0);
    await act(async () => {
      ver();
      await Promise.resolve();
    });
    expect(emAlta).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole('group', { name: 'Em alta' }).querySelectorAll('button')).toHaveLength(3);
  });

  it('CA-9: falha mostra que a busca está indisponível', async () => {
    vi.useFakeTimers();
    render(<PainelGif klipy={{ emAlta: vi.fn(async () => Promise.reject(new Error('fora'))), buscar: vi.fn() }} aoEscolher={vi.fn()} aoFechar={vi.fn()} />);
    await esperar(0);
    expect(screen.getAllByText('A busca de GIF está indisponível agora.').length).toBeGreaterThan(0);
  });

  it('nada encontrado', async () => {
    vi.useFakeTimers();
    render(<PainelGif klipy={{ emAlta: vi.fn(async () => pagina([])), buscar: vi.fn() }} aoEscolher={vi.fn()} aoFechar={vi.fn()} />);
    await esperar(0);
    expect(screen.getAllByText('Nada encontrado.').length).toBeGreaterThan(0);
  });

  it('CA-11: teclado — seta para baixo entra na grade, setas andam, Enter escolhe com o termo; Esc e clique fora fecham', async () => {
    vi.useFakeTimers();
    const aoEscolher = vi.fn();
    const aoFechar = vi.fn();
    const ancora = document.createElement('button');
    document.body.appendChild(ancora);
    render(
      <PainelGif
        klipy={{ emAlta: vi.fn(async () => pagina(['a', 'b', 'c', 'd', 'e'])), buscar: vi.fn() }}
        aoEscolher={aoEscolher}
        aoFechar={aoFechar}
        ancora={ancora}
      />,
    );
    await esperar(0);
    const campo = screen.getByRole('searchbox');
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('a');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('b');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('e');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('b');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(campo);
    fireEvent.click(screen.getByRole('button', { name: 'c' }));
    expect(aoEscolher).toHaveBeenCalledWith(res('c').gif, '');
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(aoFechar).toHaveBeenLastCalledWith(true);
    fireEvent.mouseDown(ancora);
    expect(aoFechar).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(document.body);
    expect(aoFechar).toHaveBeenLastCalledWith(false);
    ancora.remove();
  });

  it('corridas: resposta ou falha de uma consulta antiga não mexe na que está na tela; voltar aos em alta não traz o aviso', async () => {
    vi.useFakeTimers();
    let falharGato!: () => void;
    const buscar = vi.fn((q: string) =>
      q === 'gato' ? new Promise<PaginaGifs>((_, rej) => (falharGato = () => rej(new Error('fora')))) : Promise.resolve(pagina(['cao-1'])),
    );
    render(<PainelGif klipy={{ emAlta: vi.fn(async () => pagina(['alta-1'])), buscar }} aoEscolher={vi.fn()} aoFechar={vi.fn()} />);
    await esperar(0);
    const campo = screen.getByRole('searchbox', { name: 'Buscar GIF' });
    fireEvent.change(campo, { target: { value: 'gato' } });
    await esperar(300);
    fireEvent.change(campo, { target: { value: 'cao' } });
    await esperar(300);
    await act(async () => {
      falharGato();
      await Promise.resolve();
    });
    expect(screen.getByRole('group', { name: 'Resultados de cao' })).toBeTruthy();
    expect(screen.queryByText('A busca de GIF está indisponível agora.')).toBeNull();
    fireEvent.change(campo, { target: { value: '' } });
    await esperar(300);
    expect(screen.getByRole('group', { name: 'Em alta' })).toBeTruthy();
    expect(screen.queryByText('A busca de GIF está indisponível agora.')).toBeNull();
    // Voltar a "gato" (que falhou) tenta de novo.
    fireEvent.change(campo, { target: { value: 'gato' } });
    await esperar(300);
    expect(buscar.mock.calls.filter(([q]) => q === 'gato')).toHaveLength(2);
  });

  it('a página seguinte não é pedida duas vezes; falha nela avisa e permite nova tentativa', async () => {
    vi.useFakeTimers();
    const ver = observador();
    let resolver!: (p: PaginaGifs) => void;
    let rejeitar!: () => void;
    const emAlta = vi.fn((n?: number) =>
      n === 1 ? Promise.resolve(pagina(['a'], true)) : new Promise<PaginaGifs>((res, rej) => ((resolver = res), (rejeitar = () => rej(new Error('x'))))),
    );
    render(<PainelGif klipy={{ emAlta, buscar: vi.fn() }} aoEscolher={vi.fn()} aoFechar={vi.fn()} />);
    await esperar(0);
    ver();
    ver();
    expect(emAlta.mock.calls.filter(([n]) => n === 2)).toHaveLength(1);
    await act(async () => {
      rejeitar();
      await Promise.resolve();
    });
    expect(screen.getByRole('status').textContent).toBe('A busca de GIF está indisponível agora.');
    await act(async () => {
      ver();
      await Promise.resolve();
    });
    expect(emAlta.mock.calls.filter(([n]) => n === 2)).toHaveLength(2);
    await act(async () => {
      resolver(pagina(['b']));
      await Promise.resolve();
    });
    expect(screen.getByRole('group', { name: 'Em alta' }).querySelectorAll('button')).toHaveLength(2);
  });

  it('roving tab: o último GIF focado é o que recebe o Tab; cada GIF é um botão (Enter envia)', async () => {
    vi.useFakeTimers();
    render(<PainelGif klipy={{ emAlta: vi.fn(async () => pagina(['a', 'b', 'c'])), buscar: vi.fn() }} aoEscolher={vi.fn()} aoFechar={vi.fn()} />);
    await esperar(0);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    const botoes = screen.getAllByRole('button');
    expect(botoes.map((b) => b.tabIndex)).toEqual([-1, -1, 0]);
    expect(botoes.every((b) => b.tagName === 'BUTTON' && b.getAttribute('type') === 'button')).toBe(true);
  });
});
