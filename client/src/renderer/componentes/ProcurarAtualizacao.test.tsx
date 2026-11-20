// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProcurarAtualizacao } from './ProcurarAtualizacao';

afterEach(cleanup);

describe('Procurar atualização (backlog 27)', () => {
  it('procura na hora e diz o resultado', async () => {
    const procurar = vi.fn(async () => ({ situacao: 'baixando' as const, versao: '0.17.0' }));
    render(<ProcurarAtualizacao atualizacao={{ procurar }} versaoAtual="0.16.0" />);
    expect(screen.getByText('Versão instalada: 0.16.0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Procurar atualização' }));
    expect((await screen.findByRole('status')).textContent).toContain('Baixando a versão 0.17.0');
    expect(procurar).toHaveBeenCalledTimes(1);
  });

  it('já atualizado e falha', async () => {
    const procurar = vi.fn().mockResolvedValueOnce({ situacao: 'atualizado' }).mockRejectedValueOnce(new Error('x'));
    render(<ProcurarAtualizacao atualizacao={{ procurar }} versaoAtual="0.16.0" />);
    const botao = screen.getByRole('button', { name: 'Procurar atualização' });
    fireEvent.click(botao);
    expect(await screen.findByText('Você já está na versão mais nova.')).toBeTruthy();
    fireEvent.click(botao);
    expect(await screen.findByText(/Não deu para procurar agora/)).toBeTruthy();
  });
});
