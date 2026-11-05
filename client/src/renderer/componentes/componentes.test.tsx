// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CanalDto } from '@tofalando/shared';
import { BarraLateral } from './BarraLateral';
import { CanalAberto } from './CanalAberto';
import { FormNome } from './FormNome';

afterEach(cleanup);

const canais: CanalDto[] = [
  { id: 1, tipo: 'texto', nome: 'geral', posicao: 1 },
  { id: 2, tipo: 'voz', nome: 'Sala 1', posicao: 1 },
];

describe('FormNome', () => {
  it('valida como o servidor, mostra o erro do servidor e cancela com Esc', async () => {
    const aoEnviar = vi.fn(async () => 'Canal não encontrado.');
    const aoCancelar = vi.fn();
    render(<FormNome rotulo="Nome" textoBotao="Criar" aoEnviar={aoEnviar} aoCancelar={aoCancelar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Informe o nome do canal.');
    expect(aoEnviar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  bate  papo ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('bate papo'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Canal não encontrado.');
    fireEvent.keyDown(screen.getByLabelText('Nome'), { key: 'Escape' });
    expect(aoCancelar).toHaveBeenCalled();
  });
});

describe('BarraLateral', () => {
  const props = { nomeServidor: 'T', canais, canalAtivo: 1, aoAbrir: vi.fn(), aoCriar: vi.fn(async () => null) };

  it('membro renomeia canal de voz e não vê "remover"', async () => {
    const aoRenomear = vi.fn(async () => null);
    render(<BarraLateral {...props} ehAdmin={false} aoRenomear={aoRenomear} aoRemover={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Remover canal de voz Sala 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Renomear canal de voz Sala 1' }));
    fireEvent.change(screen.getByLabelText('Novo nome do canal de voz Sala 1'), { target: { value: 'Squad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoRenomear).toHaveBeenCalledWith(2, 'Squad'));
  });

  it('administrador remove canal de voz com confirmação', async () => {
    const aoRemover = vi.fn(async () => null);
    render(<BarraLateral {...props} ehAdmin aoRenomear={vi.fn()} aoRemover={aoRemover} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover canal de voz Sala 1' }));
    expect(aoRemover).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('group', { name: 'Confirmar remoção de Sala 1' })).getByRole('button', { name: 'Confirmar remoção' }));
    await waitFor(() => expect(aoRemover).toHaveBeenCalledWith(2));
  });

  it('cria canal pelo "+" e marca o canal aberto', async () => {
    const aoCriar = vi.fn(async () => null);
    render(<BarraLateral {...props} aoCriar={aoCriar} ehAdmin={false} aoRenomear={vi.fn()} aoRemover={vi.fn()} />);
    expect(screen.getByRole('button', { name: /geral/ }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Criar canal de texto' }));
    fireEvent.change(screen.getByLabelText('Nome do novo canal de texto'), { target: { value: 'jogos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(aoCriar).toHaveBeenCalledWith('texto', 'jogos'));
    await waitFor(() => expect(screen.queryByLabelText('Nome do novo canal de texto')).toBeNull());
  });
});

describe('CanalAberto', () => {
  it('membro não vê remover; admin confirma e o botão fica desativado durante o pedido', async () => {
    const { rerender } = render(<CanalAberto canal={canais[0]} ehAdmin={false} aoRenomear={vi.fn()} aoRemover={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Remover canal' })).toBeNull();
    let terminar: (v: string | null) => void = () => undefined;
    const aoRemover = vi.fn(() => new Promise<string | null>((r) => (terminar = r)));
    rerender(<CanalAberto canal={canais[0]} ehAdmin aoRenomear={vi.fn()} aoRemover={aoRemover} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover canal' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar remoção' });
    fireEvent.click(confirmar);
    expect(confirmar).toHaveProperty('disabled', true);
    fireEvent.click(confirmar);
    expect(aoRemover).toHaveBeenCalledTimes(1);
    terminar('Só administradores removem canais.');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Só administradores removem canais.');
  });

  it('sem canal de texto, orienta a criar um', () => {
    render(<CanalAberto canal={undefined} ehAdmin={false} aoRenomear={vi.fn()} aoRemover={vi.fn()} />);
    expect(screen.getByText('Nenhum canal de texto. Crie um na barra ao lado.')).toBeTruthy();
  });
});
