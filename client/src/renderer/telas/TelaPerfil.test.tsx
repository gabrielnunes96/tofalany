// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UsuarioDto } from '@tofalando/shared';
import { TelaPerfil } from './TelaPerfil';

afterEach(cleanup);

const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'ana', cor: '#5865f2', avatarUrl: null, cargo: 'membro' };

function montar(api: Partial<Parameters<typeof TelaPerfil>[0]['api']> = {}, usuario: UsuarioDto = ana) {
  const aoAtualizar = vi.fn();
  const atualizarPerfil = vi.fn(async (d: { nomeExibicao?: string; cor?: string }) => ({ ...usuario, ...d }) as UsuarioDto);
  const enviarAvatar = vi.fn(async () => ({ avatarUrl: '/files/abc.webp' }));
  const enviarFundo = vi.fn(async () => ({ ...usuario, fundo: { url: '/files/0123456789abcdef0123456789abcdef.webp' } }) as UsuarioDto);
  const removerFundo = vi.fn(async () => ({ ...usuario, fundo: null }) as UsuarioDto);
  render(<TelaPerfil usuario={usuario} servidorUrl="http://s" api={{ atualizarPerfil, enviarAvatar, enviarFundo, removerFundo, ...api }} aoAtualizar={aoAtualizar} aoVoltar={vi.fn()} />);
  return { aoAtualizar, atualizarPerfil, enviarAvatar, enviarFundo, removerFundo };
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

  it('mini perfil: some com servidor antigo (sem o campo fundo)', () => {
    montar();
    expect(screen.queryByLabelText('Sobre mim')).toBeNull();
  });

  it('CA-9: sobre mim com 191 caracteres ou 4 linhas mostra o limite e não salva', async () => {
    const { atualizarPerfil } = montar({}, { ...ana, fundo: null });
    const campo = screen.getByLabelText('Sobre mim');
    fireEvent.change(campo, { target: { value: 'a'.repeat(191) } });
    expect(screen.getByText('191/190 caracteres · 1/3 linhas').className).toBe('erro');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'O "sobre mim" deve ter no máximo 190 caracteres.');
    fireEvent.change(campo, { target: { value: 'a\nb\nc\nd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'O "sobre mim" deve ter no máximo 3 linhas.');
    expect(atualizarPerfil).not.toHaveBeenCalled();
  });

  it('salva sobre mim e degradê; envia imagem de fundo; tira o fundo', async () => {
    const { atualizarPerfil, enviarFundo, aoAtualizar } = montar({}, { ...ana, fundo: null });
    fireEvent.change(screen.getByLabelText('Sobre mim'), { target: { value: 'joga de suporte' } });
    fireEvent.click(screen.getByLabelText('Fundo de cor'));
    fireEvent.change(screen.getByLabelText('Cor do fundo'), { target: { value: '#112233' } });
    fireEvent.click(screen.getByLabelText('Degradê'));
    fireEvent.change(screen.getByLabelText('Segunda cor do fundo'), { target: { value: '#445566' } });
    expect((screen.getByRole('img', { name: 'Prévia do cartão' }).querySelector('.perfil-mini-previa-fundo') as HTMLElement).style.backgroundImage).toContain('linear-gradient');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(atualizarPerfil).toHaveBeenCalledWith({ nomeExibicao: 'ana', cor: '#5865f2', sobreMim: 'joga de suporte', fundoCores: ['#112233', '#445566'] }));
    const arquivo = new File(['x'], 'fundo.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText('Arquivo do fundo'), { target: { files: [arquivo] } });
    await waitFor(() => expect(enviarFundo).toHaveBeenCalledWith(arquivo, 'fundo.gif'));
    expect(aoAtualizar).toHaveBeenLastCalledWith(expect.objectContaining({ fundo: { url: '/files/0123456789abcdef0123456789abcdef.webp' } }));
    cleanup();
    const t = montar({}, { ...ana, fundo: { cores: ['#112233'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Tirar fundo' }));
    await waitFor(() => expect(t.removerFundo).toHaveBeenCalled());
  });

  it('erro do servidor no envio do fundo aparece', async () => {
    montar({ enviarFundo: vi.fn(async () => Promise.reject(new Error('Muitas trocas de fundo seguidas. Espere alguns minutos.'))) }, { ...ana, fundo: null });
    fireEvent.change(screen.getByLabelText('Arquivo do fundo'), { target: { files: [new File(['x'], 'f.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Muitas trocas de fundo seguidas. Espere alguns minutos.');
  });

  it('só manda o que mudou: trocar o nome não envia fundo nem sobre mim; desmarcar as cores envia null', async () => {
    const { atualizarPerfil } = montar({}, { ...ana, fundo: { cores: ['#112233'] }, sobreMim: 'oi' });
    fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: 'Ana B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(atualizarPerfil).toHaveBeenLastCalledWith({ nomeExibicao: 'Ana B', cor: '#5865f2' }));
    fireEvent.click(screen.getByLabelText('Fundo de cor'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(atualizarPerfil).toHaveBeenLastCalledWith({ nomeExibicao: 'Ana B', cor: '#5865f2', fundoCores: null }));
  });

  it('servidor antigo: o salvar não manda campos novos; tipo e tamanho errados recusados no app', async () => {
    const { atualizarPerfil } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(atualizarPerfil).toHaveBeenCalledWith({ nomeExibicao: 'ana', cor: '#5865f2' }));
    cleanup();
    const { enviarFundo } = montar({}, { ...ana, fundo: null });
    fireEvent.change(screen.getByLabelText('Arquivo do fundo'), { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Use uma imagem PNG, JPEG, GIF ou WebP.');
    const grande = new File(['x'], 'g.png', { type: 'image/png' });
    Object.defineProperty(grande, 'size', { value: 9 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText('Arquivo do fundo'), { target: { files: [grande] } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'A imagem deve ter no máximo 8 MB.');
    expect(enviarFundo).not.toHaveBeenCalled();
  });

  it('contador conta como o validador (acentos decompostos contam como um)', () => {
    montar({}, { ...ana, fundo: null });
    fireEvent.change(screen.getByLabelText('Sobre mim'), { target: { value: 'e\u0301'.repeat(100) } });
    expect(screen.getByText('100/190 caracteres · 1/3 linhas')).toBeTruthy();
  });
});
