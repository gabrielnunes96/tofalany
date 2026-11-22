// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AudioLojaAdminDto } from '@tofalando/shared';
import { TelaAudiosLoja } from './TelaAudiosLoja';

/** audios-na-loja, T6: tela do administrador da instalação (CA-1, CA-2, CA-12, CA-15). */
afterEach(cleanup);

function montar(lista: AudioLojaAdminDto[]) {
  let atual = lista;
  const api = {
    audiosLojaAdmin: vi.fn(async () => atual),
    cadastrarAudioLoja: vi.fn(async (nome: string, raridade: AudioLojaAdminDto['raridade']) => {
      const novo = { id: 9, nome, raridade, url: '/files/n.wav', duracaoMs: 1000, compradores: 0, retirado: false };
      atual = [...atual, novo];
      return novo;
    }),
    alterarAudioLoja: vi.fn(async (id: number, m: { nome?: string; raridade?: AudioLojaAdminDto['raridade'] }) => {
      atual = atual.map((a) => (a.id === id ? { ...a, ...m } : a));
      return atual.find((a) => a.id === id)!;
    }),
    retirarAudioLoja: vi.fn(async (id: number) => {
      atual = atual.map((a) => (a.id === id ? { ...a, retirado: true } : a));
    }),
  };
  render(<TelaAudiosLoja api={api} servidorUrl="http://srv" aoVoltar={vi.fn()} />);
  return api;
}

const TROVAO: AudioLojaAdminDto = { id: 3, nome: 'Trovão', url: '/files/t.wav', duracaoMs: 1000, raridade: 'raro', compradores: 2, retirado: false };

describe('TelaAudiosLoja', () => {
  it('lista com raridade, compradores e prévia; cadastra com nome, raridade e arquivo', async () => {
    const api = montar([TROVAO]);
    const item = await screen.findByRole('listitem', { name: 'Trovão' });
    expect(item.textContent).toContain('2 pessoas compraram');
    expect((within(item).getByLabelText('Ouvir Trovão') as HTMLAudioElement).src).toBe('http://srv/files/t.wav');
    fireEvent.change(screen.getByLabelText('Nome do áudio'), { target: { value: 'Dragão' } });
    fireEvent.change(screen.getByLabelText('Raridade'), { target: { value: 'lendario' } });
    const arquivo = new File([new Uint8Array(10)], 'd.wav', { type: 'audio/wav' });
    fireEvent.change(screen.getByLabelText('Arquivo de áudio'), { target: { files: [arquivo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar na loja' }));
    await waitFor(() => expect(api.cadastrarAudioLoja).toHaveBeenCalledWith('Dragão', 'lendario', arquivo, 'd.wav'));
    expect(await screen.findByRole('listitem', { name: 'Dragão' })).toBeTruthy();
    expect(screen.getByText(/licença que permita usar/)).toBeTruthy();
  });

  it('CA-2: sem arquivo ou com mais de 2 MB, não envia', async () => {
    const api = montar([]);
    await screen.findByText('Nenhum áudio na loja ainda.');
    fireEvent.change(screen.getByLabelText('Nome do áudio'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar na loja' }));
    expect(screen.getByRole('alert').textContent).toBe('Escolha um arquivo de áudio.');
    fireEvent.change(screen.getByLabelText('Arquivo de áudio'), { target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'g.wav')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar na loja' }));
    expect(screen.getByRole('alert').textContent).toBe('O arquivo passa de 2 MB.');
    expect(api.cadastrarAudioLoja).not.toHaveBeenCalled();
  });

  it('CA-11/CA-12: troca a raridade e tira da loja com confirmação (quem comprou continua)', async () => {
    const api = montar([TROVAO]);
    const item = await screen.findByRole('listitem', { name: 'Trovão' });
    fireEvent.change(within(item).getByLabelText('Raridade de Trovão'), { target: { value: 'epico' } });
    await waitFor(() => expect(api.alterarAudioLoja).toHaveBeenCalledWith(3, { raridade: 'epico' }));
    fireEvent.click(within(item).getByRole('button', { name: 'Tirar da loja' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Confirmar retirada de Trovão' })).getByRole('button', { name: 'Tirar da loja' }));
    await waitFor(() => expect(api.retirarAudioLoja).toHaveBeenCalledWith(3));
    expect((await screen.findByRole('status')).textContent).toBe('"Trovão" saiu da loja; quem comprou continua com ele.');
    expect(screen.getByRole('listitem', { name: 'Trovão' }).textContent).toContain('fora da loja');
  });
});
