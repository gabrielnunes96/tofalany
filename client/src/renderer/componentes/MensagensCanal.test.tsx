// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MensagemDto, PaginaMensagens, UsuarioDto } from '@tofalando/shared';
import { useLoja } from '../estado/loja';
import { MensagensCanal } from './MensagensCanal';

beforeEach(() => useLoja.getState().limpar());
afterEach(cleanup);

const extras = { euId: 1, ehAdmin: false, aoEditar: vi.fn(async () => null), aoApagar: vi.fn(async () => null), aoDigitar: vi.fn() };
const canal = { id: 1, tipo: 'texto' as const, nome: 'geral', posicao: 1 };
const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#00f0ff', avatarUrl: null, cargo: 'membro' };
const msg = (id: number, autorId = 1): MensagemDto => ({ id, canalId: 1, autorId, texto: `texto ${id}`, criadaEm: 1_700_000_000_000 + id, editadaEm: null, anexos: [] });

describe('MensagensCanal', () => {
  it('carrega, mostra autor ou "conta removida" e pagina para trás pelo botão', async () => {
    const mensagensCanal = vi.fn(
      async (_c: number, antes?: number): Promise<PaginaMensagens> =>
        antes ? { mensagens: [msg(1)], fim: true } : { mensagens: [msg(2, 99), msg(3)], fim: false },
    );
    render(<MensagensCanal canal={canal} usuarios={[ana]} servidorUrl="http://s" api={{ mensagensCanal, enviarAnexo: vi.fn() }} aoEnviar={vi.fn()} {...extras} />);
    const lista = await screen.findByRole('list', { name: 'Mensagens de #geral' });
    await waitFor(() => expect(lista.textContent).toContain('texto 3'));
    expect(lista.textContent).toContain('conta removida');
    expect(lista.textContent).toContain('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mensagens anteriores' }));
    await waitFor(() => expect(mensagensCanal).toHaveBeenLastCalledWith(1, 2));
    expect(await screen.findByText('Este é o começo de #geral.')).toBeTruthy();
    expect(lista.querySelectorAll('li')).toHaveLength(3);
  });

  it('Enter envia; Shift+Enter não; vazio não envia; erro do servidor aparece', async () => {
    const aoEnviar = vi.fn(async (t: string) => (t === 'falha' ? 'Sem conexão com o servidor.' : null));
    render(
      <MensagensCanal
        canal={canal}
        usuarios={[ana]}
        servidorUrl="http://s"
        api={{ enviarAnexo: vi.fn(async () => { throw new Error('sem anexo no teste'); }), mensagensCanal: async () => ({ mensagens: [], fim: true }) }}
        aoEnviar={aoEnviar}
        {...extras}
      />,
    );
    const campo = screen.getByLabelText('Mensagem para #geral') as HTMLTextAreaElement;
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(aoEnviar).not.toHaveBeenCalled();
    fireEvent.change(campo, { target: { value: 'oi\nlinha 2' } });
    fireEvent.keyDown(campo, { key: 'Enter', shiftKey: true });
    expect(aoEnviar).not.toHaveBeenCalled();
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('oi\nlinha 2', []));
    await waitFor(() => expect(campo.value).toBe(''));
    fireEvent.change(campo, { target: { value: 'falha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sem conexão com o servidor.');
    expect(campo.value).toBe('falha');
  });

  it('primeira carga falhou: "Tentar de novo" carrega', async () => {
    let falhar = true;
    const mensagensCanal = vi.fn(async (): Promise<PaginaMensagens> => {
      if (falhar) throw new Error('rede');
      return { mensagens: [msg(1)], fim: true };
    });
    render(<MensagensCanal canal={canal} usuarios={[ana]} servidorUrl="http://s" api={{ mensagensCanal, enviarAnexo: vi.fn() }} aoEnviar={vi.fn()} {...extras} />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Não foi possível carregar as mensagens.');
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('texto 1')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
