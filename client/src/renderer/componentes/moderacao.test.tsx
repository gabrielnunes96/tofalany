// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DialogoModeracao } from './DialogoModeracao';
import { MenuPessoa } from './MenuPessoa';
import { ListaBanidos } from './ListaBanidos';

afterEach(cleanup);

const ana = { id: 2, usuario: 'ana', nomeExibicao: 'Ana', cor: '#fff', avatarUrl: null, cargo: 'membro' as const };
const menu = (extra: Partial<Parameters<typeof MenuPessoa>[0]> = {}) =>
  render(
    <MenuPessoa
      usuario={ana}
      x={10}
      y={10}
      servidorUrl="https://a.io"
      eu={false}
      volume={1}
      silenciado={false}
      amizade={undefined}
      aoVolume={vi.fn()}
      aoSilenciar={vi.fn()}
      aoConversar={vi.fn()}
      aoPedirAmizade={vi.fn()}
      aoAceitarAmizade={vi.fn()}
      aoRemoverAmizade={vi.fn()}
      aoFechar={vi.fn()}
      {...extra}
    />,
  );

describe('moderação no app', () => {
  it('menu: sem permissão não aparece; com permissão, castigo/expulsar/banir; de castigo, "Tirar castigo"', () => {
    menu();
    expect(screen.queryByRole('menuitem', { name: /castigo/ })).toBeNull();
    cleanup();
    const aoAbrir = vi.fn();
    const aoTirarCastigo = vi.fn();
    menu({ moderacao: { castigoAte: null, aoAbrir, aoTirarCastigo } });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pôr de castigo…' }));
    expect(aoAbrir).toHaveBeenLastCalledWith('castigo');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Banir…' }));
    expect(aoAbrir).toHaveBeenLastCalledWith('banir');
    cleanup();
    menu({ moderacao: { castigoAte: Date.now() + 60_000, aoAbrir, aoTirarCastigo } });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Tirar castigo/ }));
    expect(aoTirarCastigo).toHaveBeenCalled();
  });

  it('diálogo: castigo escolhe a duração e manda o motivo limpo; erro do servidor aparece e o diálogo fica', async () => {
    const aoConfirmar = vi.fn(async () => undefined);
    const aoFechar = vi.fn();
    render(<DialogoModeracao tipo="castigo" nome="Ana" aoConfirmar={aoConfirmar} aoFechar={aoFechar} />);
    fireEvent.click(screen.getByLabelText('1 hora'));
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: '  flood  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pôr de castigo' }));
    await waitFor(() => expect(aoConfirmar).toHaveBeenCalledWith({ minutos: 60, motivo: 'flood' }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    cleanup();
    const falha = vi.fn(async () => Promise.reject(new Error('Administradores não podem ser moderados.')));
    render(<DialogoModeracao tipo="banir" nome="Ana" aoConfirmar={falha} aoFechar={vi.fn()} />);
    expect(screen.queryByText('Por quanto tempo')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Banir' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Administradores não podem ser moderados.');
    expect(falha).toHaveBeenCalledWith({ minutos: 10, motivo: null });
  });

  it('lista de banidos: mostra quem baniu e o motivo; desbanir tira da lista', async () => {
    const api = {
      banidos: vi.fn(async () => [{ usuario: ana, motivo: 'spam', em: Date.UTC(2026, 10, 9), porNome: 'dono' }]),
      desbanir: vi.fn(async () => undefined),
    };
    render(<ListaBanidos api={api} servidorUrl="https://a.io" />);
    expect((await screen.findByRole('list', { name: 'Banidos' })).textContent).toContain('por dono · spam');
    fireEvent.click(screen.getByRole('button', { name: 'Desbanir' }));
    await waitFor(() => expect(screen.getByText('Ninguém banido.')).toBeTruthy());
    expect(api.desbanir).toHaveBeenCalledWith(2);
  });
});
