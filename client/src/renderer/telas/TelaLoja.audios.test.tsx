// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AudioLojaDto, CatalogoLojaDto, LojaEstadoDto, MovimentoDto } from '@tofalando/shared';
import { TelaLoja } from './TelaLoja';

/** audios-na-loja, T5: seção Áudios (CA-3, CA-4, CA-5, CA-13). */
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PRECOS: CatalogoLojaDto['precos'] = { tema: 600, vales: { '720p60': 200, '1080p30': 300, '1080p60': 600 }, audios: { comum: 100, raro: 300, epico: 800, lendario: 2000 } };
const AUDIOS: AudioLojaDto[] = [
  { id: 7, nome: 'Dragão', url: '/files/d.wav', duracaoMs: 2500, raridade: 'lendario' },
  { id: 3, nome: 'Trovão', url: '/files/t.wav', duracaoMs: 1000, raridade: 'raro' },
];
const estado = (e: Partial<LojaEstadoDto> = {}): LojaEstadoDto => ({ saldo: 0, temas: [], vales: [], tudoLiberado: false, audiosIds: [], ...e });

function montar(e: LojaEstadoDto, extrato: MovimentoDto[] = []) {
  const api = {
    loja: vi.fn(async () => ({ precos: PRECOS, pontosPorMinuto: 3, estado: e, audios: AUDIOS })),
    comprarNaLoja: vi.fn(async () => estado({ saldo: e.saldo - 300, audiosIds: [3] })),
    extratoLoja: vi.fn(async () => ({ movimentos: extrato })),
  };
  const aoComprar = vi.fn();
  render(<TelaLoja estado={e} api={api} servidorUrl="http://srv" temaAtual="neon" aoUsarTema={vi.fn()} aoComprar={aoComprar} aoVoltar={vi.fn()} />);
  return { api, aoComprar };
}

describe('TelaLoja: áudios', () => {
  it('CA-3: cada áudio com a raridade (cor e texto), a duração e o preço da raridade', async () => {
    montar(estado({ saldo: 0 }));
    const trovao = (await screen.findByRole('heading', { name: 'Trovão' })).closest('li')!;
    expect(trovao.className).toContain('raridade-raro');
    expect(trovao.textContent).toContain('Raro');
    expect(trovao.textContent).toContain('1 s');
    expect(trovao.textContent).toContain('Faltam 300 pontos');
    expect(screen.getByRole('heading', { name: 'Dragão' }).closest('li')!.className).toContain('raridade-lendario');
  });

  it('CA-5: compra com confirmação (nome, raridade e preço) e vira "Comprado"', async () => {
    const { api, aoComprar } = montar(estado({ saldo: 350 }));
    const trovao = (await screen.findByRole('heading', { name: 'Trovão' })).closest('li')!;
    fireEvent.click(within(trovao).getByRole('button', { name: 'Comprar por 300 pontos' }));
    expect(screen.getByRole('dialog', { name: 'Confirmar compra' }).textContent).toContain('Comprar o áudio Trovão (Raro) por 300 pontos?');
    fireEvent.click(screen.getByRole('button', { name: 'Comprar' }));
    await waitFor(() => expect(aoComprar).toHaveBeenCalledWith(expect.objectContaining({ saldo: 50, audiosIds: [3] })));
    expect(api.comprarNaLoja).toHaveBeenCalledWith({ tipo: 'audio', audioId: 3 });
    cleanup();
    montar(estado({ saldo: 50, audiosIds: [3] }));
    expect((await screen.findByRole('heading', { name: 'Trovão' })).closest('li')!.textContent).toContain('Comprado');
  });

  it('CA-4: "Ouvir" toca só aqui, pelo arquivo da instalação', async () => {
    const tocar = vi.fn(async () => undefined);
    const criados: string[] = [];
    vi.stubGlobal(
      'Audio',
      class {
        constructor(src: string) {
          criados.push(src);
        }
        play = tocar;
        pause = vi.fn();
      },
    );
    montar(estado());
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvir Trovão' }));
    expect(criados).toEqual(['http://srv/files/t.wav']);
    expect(tocar).toHaveBeenCalled();
  });

  it('CA-10 (item 64): enquanto toca, "Ouvir" vira "Pausar"; pausar para e volta a "Ouvir"; ouvir outro para o anterior', async () => {
    const pausados: string[] = [];
    vi.stubGlobal(
      'Audio',
      class {
        src: string;
        onpause: (() => void) | null = null;
        constructor(src: string) {
          this.src = src;
        }
        play = vi.fn(async () => undefined);
        pause = vi.fn(() => {
          pausados.push(this.src);
          this.onpause?.();
        });
      },
    );
    montar(estado());
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvir Trovão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pausar Trovão' }));
    expect(pausados).toEqual(['http://srv/files/t.wav']);
    expect(screen.getByRole('button', { name: 'Ouvir Trovão' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir Trovão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir Dragão' }));
    expect(pausados).toEqual(['http://srv/files/t.wav', 'http://srv/files/t.wav']);
    expect(screen.getByRole('button', { name: 'Pausar Dragão' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvir Trovão' })).toBeTruthy();
  });

  it('CA-13: o administrador vê tudo liberado; o extrato mostra o nome do áudio', async () => {
    montar(estado({ tudoLiberado: true }), [{ id: 1, tipo: 'compra', item: 'audio:3', valor: -300, em: 0, nomeItem: 'Trovão' }]);
    expect((await screen.findByRole('heading', { name: 'Dragão' })).closest('li')!.textContent).toContain('Liberado (administrador)');
    expect(await screen.findByText('Áudio: Trovão')).toBeTruthy();
  });
});
