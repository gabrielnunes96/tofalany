// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TelaEditarServidor } from './TelaEditarServidor';

afterEach(cleanup);

describe('TelaEditarServidor', () => {
  it('salva o nome (só se mudou), troca e remove a imagem, e mostra o erro do servidor', async () => {
    const dto = { id: 1, nome: 'Turma', url: 'https://a.io' };
    const api = {
      renomearComunidade: vi.fn(async (nome: string) => ({ ...dto, nome })),
      enviarIconeComunidade: vi.fn(async () => ({ ...dto, iconeUrl: '/files/x.webp' })),
      removerIconeComunidade: vi.fn(async () => ({ ...dto, iconeUrl: null })),
    };
    const { rerender } = render(<TelaEditarServidor api={api} nome="Turma" iconeUrl={null} servidorUrl="https://a.io" aoVoltar={vi.fn()} />);
    const salvar = screen.getByRole('button', { name: 'Salvar nome' }) as HTMLButtonElement;
    expect(salvar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nome do servidor'), { target: { value: '  Turma   Nova ' } });
    fireEvent.click(salvar);
    await waitFor(() => expect(api.renomearComunidade).toHaveBeenCalledWith('Turma Nova'));
    expect(await screen.findByText('Nome salvo.')).toBeTruthy();

    const arquivo = new File([new Uint8Array([1])], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Imagem do servidor'), { target: { files: [arquivo] } });
    await waitFor(() => expect(api.enviarIconeComunidade).toHaveBeenCalledWith(arquivo, 'logo.png'));
    rerender(<TelaEditarServidor api={api} nome="Turma Nova" iconeUrl="/files/x.webp" servidorUrl="https://a.io" aoVoltar={vi.fn()} />);
    expect((screen.getByAltText('Imagem atual do servidor') as HTMLImageElement).src).toBe('https://a.io/files/x.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Remover imagem' }));
    await waitFor(() => expect(api.removerIconeComunidade).toHaveBeenCalled());

    api.enviarIconeComunidade.mockRejectedValueOnce(new Error('Use uma imagem PNG, JPEG, GIF ou WebP.'));
    fireEvent.change(screen.getByLabelText('Imagem do servidor'), { target: { files: [arquivo] } });
    expect((await screen.findByRole('alert')).textContent).toContain('PNG');
  });
});
