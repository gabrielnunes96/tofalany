// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CatalogoLojaDto, LojaEstadoDto, MovimentoDto } from '@tofalando/shared';
import { TelaLoja } from './TelaLoja';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.tema;
});

const PRECOS: CatalogoLojaDto['precos'] = { tema: 600, vales: { '720p60': 200, '1080p30': 300, '1080p60': 600 } };
const estado = (e: Partial<LojaEstadoDto> = {}): LojaEstadoDto => ({ saldo: 0, temas: [], vales: [], tudoLiberado: false, ...e });

function montar(e: LojaEstadoDto, extrato: MovimentoDto[] = []) {
  const api = {
    loja: vi.fn(async () => ({ precos: PRECOS, pontosPorMinuto: 1, estado: e })),
    comprarNaLoja: vi.fn(async () => estado({ saldo: e.saldo - 600, temas: ['cinzas'] })),
    extratoLoja: vi.fn(async () => ({ movimentos: extrato })),
  };
  const aoComprar = vi.fn();
  const aoUsarTema = vi.fn();
  const r = render(<TelaLoja estado={e} api={api} temaAtual="neon" aoUsarTema={aoUsarTema} aoComprar={aoComprar} aoVoltar={vi.fn()} />);
  return { api, aoComprar, aoUsarTema, ...r };
}

describe('TelaLoja (pontos-e-loja)', () => {
  it('CA-9: com 700, compra o tema com confirmação e aplica o estado novo', async () => {
    const { api, aoComprar } = montar(estado({ saldo: 700 }));
    const botoes = await screen.findAllByRole('button', { name: 'Comprar por 600 pontos' });
    fireEvent.click(botoes[0]!);
    const dialogo = screen.getByRole('dialog', { name: 'Confirmar compra' });
    expect(dialogo.textContent).toContain('Comprar o tema Cinzas do Trono por 600 pontos?');
    expect(document.activeElement?.textContent).toBe('Cancelar');
    fireEvent.click(screen.getByRole('button', { name: 'Comprar' }));
    await waitFor(() => expect(aoComprar).toHaveBeenCalledWith(expect.objectContaining({ saldo: 100, temas: ['cinzas'] })));
    expect(api.comprarNaLoja).toHaveBeenCalledWith({ tipo: 'tema', tema: 'cinzas' });
    expect(screen.getByRole('status').textContent).toBe('Cinzas do Trono é seu.');
  });

  it('CA-10: sem saldo, o botão fica desligado e diz quanto falta', async () => {
    montar(estado({ saldo: 500 }));
    const temas = await screen.findAllByRole('button', { name: 'Faltam 100 pontos' });
    expect(temas).toHaveLength(4);
    for (const b of temas) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Comprar por 200 pontos' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('CA-20: a prévia troca o tema do app sem gravar e volta ao sair', async () => {
    document.documentElement.dataset.tema = 'neon';
    const { aoUsarTema } = montar(estado({ saldo: 0 }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver prévia' }))[1]!);
    expect(document.documentElement.dataset.tema).toBe('arcano');
    expect(screen.getByRole('region', { name: 'Prévia do tema' }).textContent).toContain('Arcano Dourado');
    fireEvent.click(screen.getByRole('button', { name: 'Sair da prévia' }));
    expect(document.documentElement.dataset.tema).toBe('neon');
    expect(aoUsarTema).not.toHaveBeenCalled();
  });

  it('prévia aberta ao sair da loja também volta ao tema em uso', async () => {
    document.documentElement.dataset.tema = 'neon';
    const { unmount } = montar(estado());
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver prévia' }))[2]!);
    expect(document.documentElement.dataset.tema).toBe('gibi');
    unmount();
    expect(document.documentElement.dataset.tema).toBe('neon');
  });

  it('tema meu: "Seu" e "Usar agora"; vale ativo mostra até quando vale', async () => {
    const { aoUsarTema } = montar(estado({ saldo: 10, temas: ['gibi'], vales: [{ qualidade: '1080p60', expiraEm: Date.UTC(2026, 10, 20, 12) }] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Usar agora' }));
    expect(aoUsarTema).toHaveBeenCalledWith('gibi');
    expect(screen.getByText('Seu')).toBeTruthy();
    expect(screen.getByText(/Vale até 20\/11\/2026/)).toBeTruthy();
  });

  it('CA-21: o administrador vê tudo liberado, sem botão de compra', async () => {
    montar(estado({ tudoLiberado: true }));
    await screen.findByText('Temas');
    expect(screen.queryByRole('button', { name: /Comprar|Faltam/ })).toBeNull();
    expect(screen.getAllByText('Liberado (administrador)')).toHaveLength(6);
  });

  it('CA-22: extrato do mais novo para o mais antigo, com o texto de cada linha', async () => {
    montar(estado({ saldo: 100 }), [
      { id: 3, tipo: 'compra', item: 'vale:720p60', valor: -200, em: 3 },
      { id: 2, tipo: 'compra', item: 'tema:arcano', valor: -600, em: 2 },
      { id: 1, tipo: 'ganho', item: null, valor: 900, em: 1 },
    ]);
    const linhas = (await screen.findByRole('list', { name: 'Extrato' })).querySelectorAll('li');
    expect([...linhas].map((l) => l.textContent?.replace(/^.*?\d{2}:\d{2}/, ''))).toEqual([
      'Vale de 7 dias: Transmitir em 720p60−200',
      'Tema Arcano Dourado−600',
      'Tempo em voz+900',
    ]);
  });

  it('erro do servidor na compra aparece na tela', async () => {
    const { api } = montar(estado({ saldo: 700 }));
    api.comprarNaLoja.mockRejectedValueOnce(new Error('Faltam 100 pontos.'));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Comprar por 600 pontos' }))[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Comprar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Faltam 100 pontos.');
  });

  it('Escape fecha a confirmação sem comprar', async () => {
    const { api } = montar(estado({ saldo: 700 }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Comprar por 600 pontos' }))[0]!);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Confirmar compra' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.comprarNaLoja).not.toHaveBeenCalled();
  });

  it('erro ao carregar o extrato aparece com "Tentar de novo" (não vira lista vazia)', async () => {
    const { api } = montar(estado());
    api.extratoLoja.mockRejectedValueOnce(new Error('rede'));
    cleanup();
    render(<TelaLoja estado={estado()} api={api} temaAtual="neon" aoUsarTema={vi.fn()} aoComprar={vi.fn()} aoVoltar={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível carregar o extrato.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText(/Nada por aqui ainda/)).toBeTruthy();
  });
});
