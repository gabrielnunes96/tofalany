// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import type { Organizacao, PastaServidores } from '@tofalando/shared';
import { ColunaServidores } from './ColunaServidores';

afterEach(cleanup);

const LISTA = [
  { url: 'https://a.io', nome: 'Alfa' },
  { url: 'https://b.io', nome: 'Beta' },
  { url: 'https://c.io', nome: 'Gama' },
];

function Coluna({ naoLidas = {}, pastasIniciais = [] as PastaServidores[], aoOrganizar = vi.fn() }) {
  const [o, setO] = useState<Organizacao>({ urls: LISTA.map((s) => s.url), pastas: pastasIniciais });
  const servidores = o.urls.map((u) => LISTA.find((s) => s.url === u)!);
  return (
    <ColunaServidores
      servidores={servidores}
      pastas={o.pastas}
      ativo="https://a.io"
      naoLidas={naoLidas}
      aoEscolher={() => undefined}
      aoAdicionar={() => undefined}
      aoOrganizar={(n) => {
        aoOrganizar(n);
        setO(n);
      }}
    />
  );
}

/** Simula o arrastar do HTML (o jsdom não tem DataTransfer). */
function arrastar(de: HTMLElement, para: HTMLElement, y: number) {
  const dados = new Map<string, string>();
  const dataTransfer = {
    setData: (t: string, v: string) => dados.set(t, v),
    getData: (t: string) => dados.get(t) ?? '',
    get types() {
      return [...dados.keys()];
    },
    effectAllowed: '',
    dropEffect: '',
  };
  vi.spyOn(para, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 40, bottom: 40, left: 0, right: 40, width: 40, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.dragStart(de, { dataTransfer });
  for (const criar of [createEvent.dragOver, createEvent.drop]) {
    const ev = criar(para, { dataTransfer });
    Object.defineProperty(ev, 'clientY', { value: y });
    fireEvent(para, ev);
  }
  fireEvent.dragEnd(de, { dataTransfer });
}

const ordem = () => screen.getAllByRole('button', { name: /^(Alfa|Beta|Gama|Pasta)/ }).map((b) => b.getAttribute('aria-label')!.split(' ')[0]);

describe('pastas e ordem dos servidores (organizar-a-tela)', () => {
  it('CA-8: arrastar Gama para antes de Alfa muda a ordem', () => {
    const aoOrganizar = vi.fn();
    render(<Coluna aoOrganizar={aoOrganizar} />);
    arrastar(screen.getByRole('button', { name: /^Gama/ }), screen.getByRole('button', { name: /^Alfa/ }), 2);
    expect(aoOrganizar).toHaveBeenLastCalledWith({ urls: ['https://c.io', 'https://a.io', 'https://b.io'], pastas: [] });
    expect(ordem()).toEqual(['Gama', 'Alfa', 'Beta']);
  });

  it('CA-4, CA-5: soltar no meio de outro cria a pasta; arrastar para fora tira e a pasta de um só se desfaz', () => {
    render(<Coluna />);
    arrastar(screen.getByRole('button', { name: /^Beta/ }), screen.getByRole('button', { name: /^Alfa/ }), 20);
    const pasta = screen.getByRole('button', { name: /^Pasta Pasta, 2 servidores/ });
    expect(pasta.getAttribute('aria-expanded')).toBe('true');
    arrastar(screen.getByRole('button', { name: /^Beta/ }), screen.getByRole('button', { name: /^Gama/ }), 38);
    expect(screen.queryByRole('button', { name: /^Pasta/ })).toBeNull();
    expect(ordem()).toEqual(['Alfa', 'Gama', 'Beta']);
  });

  it('CA-6: pasta fechada soma as não lidas dos de dentro (o aberto não conta); clicar abre', () => {
    const pasta: PastaServidores = { id: 'p1', nome: 'Jogos', cor: '#22e4f2', aberta: false, urls: ['https://a.io', 'https://b.io'] };
    render(<Coluna pastasIniciais={[pasta]} naoLidas={{ 'https://a.io': 4, 'https://b.io': 3 }} />);
    const botao = screen.getByRole('button', { name: 'Pasta Jogos, 2 servidores, 3 não lidas' });
    expect(screen.queryByRole('button', { name: /^Beta/ })).toBeNull();
    fireEvent.click(botao);
    expect(screen.getByRole('button', { name: /^Beta/ })).toBeTruthy();
  });

  it('CA-7: pelo menu, sem arrastar: Mover para pasta → Nova pasta com outro; Tirar da pasta; Editar pasta', () => {
    render(<Coluna />);
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Gama/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para pasta…' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Nova pasta/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Nova pasta com Alfa' }));
    expect(screen.getByRole('button', { name: /^Pasta Pasta, 2 servidores/ })).toBeTruthy();
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Pasta/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar pasta' }));
    fireEvent.change(screen.getByLabelText('Nome da pasta'), { target: { value: 'Amigos' } });
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('button', { name: /^Pasta Amigos/ })).toBeTruthy();
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Gama/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tirar da pasta' }));
    expect(screen.queryByRole('button', { name: /^Pasta/ })).toBeNull();
  });

  it('RN-7: Mover para cima e para baixo pelo menu', () => {
    render(<Coluna />);
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Beta/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para cima' }));
    expect(ordem()).toEqual(['Beta', 'Alfa', 'Gama']);
  });
});
