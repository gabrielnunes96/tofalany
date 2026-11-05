// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SomDto } from '@tofalando/shared';
import { TelaSons } from './TelaSons';

const som = (id: number, nome: string): SomDto => ({ id, nome, url: `/files/${id}.wav`, duracaoMs: 8000 });
const audio = (nome = 'grilo.wav', bytes = 10) => new File([new Uint8Array(bytes)], nome, { type: 'audio/wav' });

function montar(sons: SomDto[], api: Partial<Parameters<typeof TelaSons>[0]['api']> = {}) {
  const aoSalvar = vi.fn();
  const aoRemover = vi.fn();
  const completa = { cadastrarSom: vi.fn(), trocarSom: vi.fn(), removerSom: vi.fn(), ...api };
  render(<TelaSons sons={sons} servidorUrl="http://s" api={completa} aoSalvar={aoSalvar} aoRemover={aoRemover} aoVoltar={() => undefined} />);
  return { aoSalvar, aoRemover, api: completa };
}

describe('TelaSons (RF-22, administrador)', () => {
  afterEach(cleanup);
  it('cadastra com nome e arquivo e aplica na lista', async () => {
    const novo = som(1, 'Grilo');
    const { api, aoSalvar } = montar([], { cadastrarSom: vi.fn().mockResolvedValue(novo) });
    expect(screen.getByText('Nenhum som cadastrado ainda.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome do som'), { target: { value: 'Grilo' } });
    fireEvent.change(screen.getByLabelText('Arquivo de áudio'), { target: { files: [audio()] } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar som' }));
    expect(api.cadastrarSom).toHaveBeenCalledWith('Grilo', expect.any(File), 'grilo.wav');
    expect((await screen.findByRole('status')).textContent).toContain('Som "Grilo" cadastrado.');
    expect(aoSalvar).toHaveBeenCalledWith(novo);
  });

  it('confere nome, arquivo e tamanho antes de enviar; mostra o erro do servidor', async () => {
    const { api } = montar([], { cadastrarSom: vi.fn().mockRejectedValue(new Error('O som deve ter no máximo 10 segundos.')) });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar som' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome do som'), { target: { value: 'Grilo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar som' }));
    expect((screen.getByRole('alert')).textContent).toContain('Escolha um arquivo de áudio.');
    fireEvent.change(screen.getByLabelText('Arquivo de áudio'), { target: { files: [audio('g.wav', 2 * 1024 * 1024 + 1)] } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar som' }));
    expect((screen.getByRole('alert')).textContent).toContain('O arquivo passa de 2 MB.');
    expect(api.cadastrarSom).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Arquivo de áudio'), { target: { files: [audio()] } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar som' }));
    expect((await screen.findByRole('alert')).textContent).toContain('O som deve ter no máximo 10 segundos.');
  });

  it('com 5 sons não oferece cadastro', () => {
    montar([1, 2, 3, 4, 5].map((i) => som(i, `S${i}`)));
    expect(screen.queryByLabelText('Nome do som')).toBeNull();
    expect(screen.getByText(/já tem 5 sons/)).toBeTruthy();
  });

  it('prévia, renomear, trocar áudio e remover com confirmação', async () => {
    const grilo = som(1, 'Grilo');
    const { api, aoSalvar, aoRemover } = montar([grilo], {
      trocarSom: vi.fn().mockImplementation(async (_id: number, m: { nome?: string }) => ({ ...grilo, nome: m.nome ?? grilo.nome, url: '/files/novo.wav' })),
      removerSom: vi.fn().mockResolvedValue(undefined),
    });
    const item = screen.getByRole('listitem', { name: 'Grilo' });
    expect(within(item).getByLabelText('Ouvir Grilo').getAttribute('src')).toBe('http://s/files/1.wav');
    expect(within(item).getByText('8,0 s')).toBeTruthy();

    fireEvent.click(within(item).getByRole('button', { name: 'Renomear' }));
    const campo = within(item).getByLabelText('Novo nome de Grilo');
    fireEvent.change(campo, { target: { value: 'Grilo 2' } });
    fireEvent.click(within(item).getByRole('button', { name: 'Salvar' }));
    expect(api.trocarSom).toHaveBeenCalledWith(1, { nome: 'Grilo 2' });
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledWith({ ...grilo, nome: 'Grilo 2', url: '/files/novo.wav' }));
    // O formulário fecha e o foco volta para "Renomear".
    await waitFor(() => expect(document.activeElement).toBe(within(item).getByRole('button', { name: 'Renomear' })));

    fireEvent.change(within(item).getByLabelText('Novo áudio de Grilo'), { target: { files: [audio('outro.wav')] } });
    expect(api.trocarSom).toHaveBeenLastCalledWith(1, { arquivo: { dados: expect.any(File), nome: 'outro.wav' } });
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledTimes(2));

    fireEvent.click(within(item).getByRole('button', { name: 'Remover' }));
    fireEvent.click(within(item).getByRole('button', { name: 'Confirmar remoção' }));
    expect(api.removerSom).toHaveBeenCalledWith(1);
    await waitFor(() => expect(aoRemover).toHaveBeenCalledWith(1));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Soundboard' })));
  });
});
