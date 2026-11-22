// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CanalDto } from '@tofalando/shared';
import { BarraLateral } from './BarraLateral';
import { MenuPessoa } from './MenuPessoa';
import { TelaEditarServidor } from '../telas/TelaEditarServidor';

/** mover-e-afk, T5: "Mover para…", "Desconectar", arrastar, ícone da AFK e AFK em Editar servidor (CA-1, CA-2, CA-3, CA-8). */
afterEach(cleanup);

const canais: CanalDto[] = [
  { id: 1, tipo: 'texto', nome: 'geral', posicao: 1 },
  { id: 2, tipo: 'voz', nome: 'Papo', posicao: 1 },
  { id: 3, tipo: 'voz', nome: 'Jogos', posicao: 2 },
  { id: 4, tipo: 'voz', nome: 'AFK', posicao: 3 },
];
const u = (id: number, nome: string) => ({ id, usuario: nome, nomeExibicao: nome, cor: '#00f0ff', avatarUrl: null, cargo: 'membro' as const });
const base = {
  nomeServidor: 'T',
  canais,
  canalAtivo: 1,
  aoAbrir: vi.fn(),
  aoCriar: vi.fn(async () => null),
  dms: [],
  dmAtiva: null,
  aoAbrirDm: vi.fn(),
  ehAdmin: false,
  aoRenomear: vi.fn(async () => null),
  aoRemover: vi.fn(async () => null),
  usuarios: [u(1, 'ana'), u(2, 'bia')],
  voz: [{ usuarioId: 2, canalVozId: 2, mudo: false, surdo: false, camera: false }],
  falando: [],
  minhaVoz: null,
  euId: 1,
};

/** DataTransfer mínimo do jsdom. */
function dados() {
  const mapa = new Map<string, string>();
  return {
    setData: (t: string, v: string) => void mapa.set(t, v),
    getData: (t: string) => mapa.get(t) ?? '',
    get types() {
      return [...mapa.keys()];
    },
    effectAllowed: '',
    dropEffect: '',
  };
}

describe('mover na lista de voz', () => {
  it('CA-2: quem pode arrasta o nome para outra sala; a sala de AFK tem ícone próprio', () => {
    const aoMover = vi.fn();
    render(<BarraLateral {...base} aoMover={aoMover} afkCanalId={4} />);
    const bia = within(screen.getByRole('list', { name: 'Na voz em Papo' })).getByRole('listitem', { name: 'bia' });
    expect(bia.getAttribute('draggable')).toBe('true');
    const dt = dados();
    fireEvent.dragStart(bia, { dataTransfer: dt });
    const jogos = screen.getByRole('button', { name: 'Entrar no canal de voz Jogos' }).parentElement!;
    fireEvent.dragOver(jogos, { dataTransfer: dt });
    fireEvent.drop(jogos, { dataTransfer: dt });
    expect(aoMover).toHaveBeenCalledWith(2, 3);
    expect(screen.getByRole('button', { name: /Entrar no canal de voz AFK/ }).textContent).toContain('(sala de AFK)');
  });

  it('CA-1: sem a permissão, ninguém é arrastável', () => {
    render(<BarraLateral {...base} />);
    expect(within(screen.getByRole('list', { name: 'Na voz em Papo' })).getByRole('listitem', { name: 'bia' }).getAttribute('draggable')).toBe('false');
  });
});

describe('menu da pessoa', () => {
  const comum = {
    usuario: u(2, 'bia'),
    x: 10,
    y: 10,
    servidorUrl: 'http://s',
    eu: false,
    volume: 1,
    silenciado: false,
    amizade: undefined,
    aoVolume: vi.fn(),
    aoSilenciar: vi.fn(),
    aoConversar: vi.fn(),
    aoPedirAmizade: vi.fn(),
    aoAceitarAmizade: vi.fn(),
    aoRemoverAmizade: vi.fn(),
    aoFechar: vi.fn(),
  };
  it('CA-1: sem a permissão não há "Mover para…" nem "Desconectar"', () => {
    render(<MenuPessoa {...comum} />);
    expect(screen.queryByRole('menuitem', { name: 'Mover para…' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Desconectar da chamada' })).toBeNull();
  });
  it('CA-3/CA-6: "Mover para…" lista as salas e move; "Desconectar da chamada" desconecta', () => {
    const aoMover = vi.fn();
    const aoDesconectar = vi.fn();
    const salas = [
      { id: 3, nome: 'Jogos' },
      { id: 4, nome: 'AFK' },
    ];
    const { rerender } = render(<MenuPessoa {...comum} mover={{ salas, aoMover, aoDesconectar }} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para…' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Jogos' }));
    expect(aoMover).toHaveBeenCalledWith(3);
    rerender(<MenuPessoa {...comum} mover={{ salas, aoMover, aoDesconectar }} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desconectar da chamada' }));
    expect(aoDesconectar).toHaveBeenCalled();
  });
});

describe('sala de AFK em Editar servidor (CA-8)', () => {
  it('escolhe a sala e o tempo; desligar manda null', async () => {
    const api = { renomearComunidade: vi.fn(), enviarIconeComunidade: vi.fn(), removerIconeComunidade: vi.fn(), definirAfk: vi.fn(async () => ({ afk: null })) };
    render(<TelaEditarServidor api={api as never} nome="T" iconeUrl={null} servidorUrl="http://s" aoVoltar={vi.fn()} canaisVoz={canais.filter((c) => c.tipo === 'voz')} afk={null} />);
    expect((screen.getByLabelText('Depois de') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Sala'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Depois de'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar sala de AFK' }));
    await waitFor(() => expect(api.definirAfk).toHaveBeenCalledWith(4, 30));
    expect(await screen.findByText('Sala de AFK salva.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Sala'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar sala de AFK' }));
    await waitFor(() => expect(api.definirAfk).toHaveBeenLastCalledWith(null, 30));
  });
  it('servidor antigo (sem afk): a seção não aparece', () => {
    render(<TelaEditarServidor api={{ renomearComunidade: vi.fn(), enviarIconeComunidade: vi.fn(), removerIconeComunidade: vi.fn() } as never} nome="T" iconeUrl={null} servidorUrl="http://s" aoVoltar={vi.fn()} />);
    expect(screen.queryByText('Sala de AFK')).toBeNull();
  });
});
