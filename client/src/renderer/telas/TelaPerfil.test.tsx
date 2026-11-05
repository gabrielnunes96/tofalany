// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UsuarioDto } from '@tofalando/shared';
import { TelaPerfil } from './TelaPerfil';

afterEach(cleanup);

const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'ana', cor: '#5865f2', avatarUrl: null, cargo: 'membro' };

function montar(api: Partial<Parameters<typeof TelaPerfil>[0]['api']> = {}) {
  const aoAtualizar = vi.fn();
  const atualizarPerfil = vi.fn(async (d: { nomeExibicao?: string; cor?: string }) => ({ ...ana, ...d }) as UsuarioDto);
  const enviarAvatar = vi.fn(async () => ({ avatarUrl: '/files/abc.webp' }));
  render(<TelaPerfil usuario={ana} servidorUrl="http://s" api={{ atualizarPerfil, enviarAvatar, ...api }} aoAtualizar={aoAtualizar} aoVoltar={vi.fn()} />);
  return { aoAtualizar, atualizarPerfil, enviarAvatar };
}

describe('TelaPerfil', () => {
  it('salva nome e cor validados', async () => {
    const { atualizarPerfil, aoAtualizar } = montar();
    fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: '  Ana  Paula ' } });
    fireEvent.change(screen.getByLabelText('Cor do perfil'), { target: { value: '#ff8800' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(atualizarPerfil).toHaveBeenCalledWith({ nomeExibicao: 'Ana Paula', cor: '#ff8800' }));
    expect(aoAtualizar).toHaveBeenCalledWith(expect.objectContaining({ nomeExibicao: 'Ana Paula' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Perfil salvo.');
  });

  it('nome vazio não chama a API', async () => {
    const { atualizarPerfil } = montar();
    fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Informe o nome de exibição.');
    expect(atualizarPerfil).not.toHaveBeenCalled();
  });

  it('foto: recusa formato e tamanho no cliente; envia a válida', async () => {
    const { enviarAvatar, aoAtualizar } = montar();
    const campo = screen.getByLabelText('Arquivo da foto');
    fireEvent.change(campo, { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Use uma imagem PNG, JPEG, GIF ou WebP.');
    const grande = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'g.png', { type: 'image/png' });
    fireEvent.change(campo, { target: { files: [grande] } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'A imagem deve ter no máximo 8 MB.');
    expect(enviarAvatar).not.toHaveBeenCalled();
    fireEvent.change(campo, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(aoAtualizar).toHaveBeenCalledWith({ ...ana, avatarUrl: '/files/abc.webp' }));
  });
});
