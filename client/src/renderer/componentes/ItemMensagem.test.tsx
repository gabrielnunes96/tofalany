// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MensagemDto, UsuarioDto } from '@tofalando/shared';
import { useLoja } from '../estado/loja';
import { ItemMensagem } from './ItemMensagem';
import { MensagensCanal, textoDigitando } from './MensagensCanal';

afterEach(cleanup);

const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#00f0ff', avatarUrl: null, cargo: 'membro' };
const m: MensagemDto = { id: 7, canalId: 1, autorId: 1, texto: 'original', criadaEm: 1_700_000_000_000, editadaEm: null };

function lista(ui: React.ReactElement) {
  return render(<ol>{ui}</ol>);
}

describe('ItemMensagem', () => {
  it('editar: Enter salva, Esc cancela; "(editada)" aparece quando editadaEm vem preenchido', async () => {
    const aoEditar = vi.fn(async () => null);
    const { rerender } = lista(
      <ItemMensagem mensagem={m} autor={ana} servidorUrl="http://s" podeEditar podeApagar aoEditar={aoEditar} aoApagar={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const campo = screen.getByLabelText('Editar mensagem');
    fireEvent.change(campo, { target: { value: 'mudou' } });
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(screen.getByText('original')).toBeTruthy();
    expect(aoEditar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Editar mensagem'), { target: { value: ' corrigida ' } });
    fireEvent.keyDown(screen.getByLabelText('Editar mensagem'), { key: 'Enter' });
    await waitFor(() => expect(aoEditar).toHaveBeenCalledWith(7, 'corrigida'));
    rerender(
      <ol>
        <ItemMensagem mensagem={{ ...m, texto: 'corrigida', editadaEm: 1 }} autor={ana} servidorUrl="http://s" podeEditar podeApagar aoEditar={aoEditar} aoApagar={vi.fn()} />
      </ol>,
    );
    expect(screen.getByText('(editada)')).toBeTruthy();
  });

  it('apagar pede confirmação e mostra o erro do servidor; sem permissão, sem botões', async () => {
    const aoApagar = vi.fn(async () => 'Você só pode apagar as suas mensagens.');
    const { rerender } = lista(<ItemMensagem mensagem={m} autor={ana} servidorUrl="http://s" podeEditar={false} podeApagar aoEditar={vi.fn()} aoApagar={aoApagar} />);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(aoApagar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Você só pode apagar as suas mensagens.');
    rerender(
      <ol>
        <ItemMensagem mensagem={m} autor={undefined} servidorUrl="http://s" podeEditar={false} podeApagar={false} aoEditar={vi.fn()} aoApagar={aoApagar} />
      </ol>,
    );
    expect(screen.queryByRole('button', { name: 'Apagar' })).toBeNull();
    expect(screen.getByText('conta removida')).toBeTruthy();
  });
});

describe('textoDigitando', () => {
  it('formata um, dois, três e muitos', () => {
    expect(textoDigitando([])).toBeNull();
    expect(textoDigitando(['Ana'])).toBe('Ana está digitando…');
    expect(textoDigitando(['Ana', 'Bia'])).toBe('Ana e Bia estão digitando…');
    expect(textoDigitando(['Ana', 'Bia', 'Caio'])).toBe('Ana, Bia e Caio estão digitando…');
    expect(textoDigitando(['a', 'b', 'c', 'd'])).toBe('Várias pessoas estão digitando…');
  });
});

describe('sinal de digitando', () => {
  beforeEach(() => useLoja.getState().limpar());

  it('manda no máximo a cada 3 s enquanto digita; texto vazio não manda', () => {
    const aoDigitar = vi.fn();
    const agora = vi.spyOn(Date, 'now');
    agora.mockReturnValue(10_000);
    render(
      <MensagensCanal
        canal={{ id: 1, tipo: 'texto', nome: 'geral', posicao: 1 }}
        usuarios={[ana]}
        servidorUrl="http://s"
        api={{ mensagensCanal: async () => ({ mensagens: [], fim: true }) }}
        aoEnviar={vi.fn()}
        euId={1}
        ehAdmin={false}
        aoEditar={vi.fn()}
        aoApagar={vi.fn()}
        aoDigitar={aoDigitar}
      />,
    );
    const campo = screen.getByLabelText('Mensagem para #geral');
    fireEvent.change(campo, { target: { value: '   ' } });
    expect(aoDigitar).not.toHaveBeenCalled();
    fireEvent.change(campo, { target: { value: 'o' } });
    fireEvent.change(campo, { target: { value: 'oi' } });
    expect(aoDigitar).toHaveBeenCalledTimes(1);
    agora.mockReturnValue(13_500);
    fireEvent.change(campo, { target: { value: 'oi!' } });
    expect(aoDigitar).toHaveBeenCalledTimes(2);
    agora.mockRestore();
  });
});

describe('aviso de digitando expira (CA-17)', () => {
  beforeEach(() => useLoja.getState().limpar());
  afterEach(() => vi.useRealTimers());

  it('some em até 5 s e o relógio para depois', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const bia: UsuarioDto = { ...ana, id: 2, nomeExibicao: 'Bia' };
    render(
      <MensagensCanal
        canal={{ id: 1, tipo: 'texto', nome: 'geral', posicao: 1 }}
        usuarios={[ana, bia]}
        servidorUrl="http://s"
        api={{ mensagensCanal: () => new Promise(() => undefined) }}
        aoEnviar={vi.fn()}
        euId={1}
        ehAdmin={false}
        aoEditar={vi.fn()}
        aoApagar={vi.fn()}
        aoDigitar={vi.fn()}
      />,
    );
    const { act } = await import('@testing-library/react');
    act(() => useLoja.getState().registrarDigitando(1, 2, Date.now() + 5000));
    expect(screen.getByText('Bia está digitando…')).toBeTruthy();
    act(() => vi.advanceTimersByTime(5500));
    expect(screen.queryByText('Bia está digitando…')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

