// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FixadaDto, MensagemDto, UsuarioDto } from '@tofalando/shared';
import { useLoja } from '../estado/loja';
import { decidirMensagemNova } from '../estado/notificar';
import { ItemMensagem } from './ItemMensagem';
import { PainelFixadas } from './PainelFixadas';

/** chat-fixar-e-buscar, T6: fixar no menu, linha "fixou", painel e estado. */
afterEach(cleanup);
beforeEach(() => useLoja.getState().limpar());

const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#00f0ff', avatarUrl: null, cargo: 'membro' };
const beto: UsuarioDto = { ...ana, id: 2, usuario: 'beto', nomeExibicao: 'Beto' };
const m: MensagemDto = { id: 7, canalId: 1, dmId: null, autorId: 2, texto: 'o churrasco é sábado', criadaEm: 1_700_000_000_000, editadaEm: null, anexos: [] };
const linha: MensagemDto = { ...m, id: 8, autorId: 1, texto: 'fixou uma mensagem.', fixou: { mensagemId: 7, apagada: false } };
const item = (props: Partial<Parameters<typeof ItemMensagem>[0]>) =>
  render(
    <ol>
      <ItemMensagem mensagem={m} autor={beto} servidorUrl="http://s" podeEditar={false} podeApagar={false} aoEditar={vi.fn()} aoApagar={vi.fn()} {...props} />
    </ol>,
  );

describe('fixar no menu da mensagem (CA-1, CA-2)', () => {
  it('sem aoFixar (sem permissão ou servidor antigo) não aparece "Fixar"', () => {
    item({});
    expect(screen.queryByRole('button', { name: 'Fixar' })).toBeNull();
  });

  it('com aoFixar: "Fixar" chama com true; fixada mostra o selo e "Desafixar"; erro aparece', async () => {
    const aoFixar = vi.fn(async () => 'Seu cargo não permite fixar mensagens.');
    const { rerender } = item({ aoFixar });
    fireEvent.click(screen.getByRole('button', { name: 'Fixar' }));
    expect(aoFixar).toHaveBeenCalledWith(7, true);
    expect(await screen.findByText('Seu cargo não permite fixar mensagens.')).toBeTruthy();
    rerender(
      <ol>
        <ItemMensagem
          mensagem={m}
          autor={beto}
          servidorUrl="http://s"
          podeEditar={false}
          podeApagar={false}
          aoEditar={vi.fn()}
          aoApagar={vi.fn()}
          aoFixar={aoFixar}
          fixada
        />
      </ol>,
    );
    expect(screen.getByTitle('Mensagem fixada')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Desafixar' }));
    expect(aoFixar).toHaveBeenLastCalledWith(7, false);
  });
});

describe('linha "fulano fixou uma mensagem" (CA-5, CA-7)', () => {
  it('sem ações; clicar leva até a fixada; apagada não é clicável', () => {
    const aoIrPara = vi.fn();
    const { rerender } = item({ mensagem: linha, autor: ana, aoIrPara, aoReagir: vi.fn(), aoResponder: vi.fn() });
    expect(screen.getByRole('listitem', { name: 'Ana fixou uma mensagem' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'uma mensagem' }));
    expect(aoIrPara).toHaveBeenCalledWith(7);
    rerender(
      <ol>
        <ItemMensagem
          mensagem={{ ...linha, fixou: { mensagemId: 7, apagada: true } }}
          autor={ana}
          servidorUrl="http://s"
          podeEditar={false}
          podeApagar={false}
          aoEditar={vi.fn()}
          aoApagar={vi.fn()}
          aoIrPara={aoIrPara}
        />
      </ol>,
    );
    expect(screen.getByText('uma mensagem (apagada)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'uma mensagem' })).toBeNull();
  });

  it('não vira não lida nem notificação', () => {
    expect(decidirMensagemNova(linha, { euId: 2, chaveAberta: null, focado: false, usuarios: [ana, beto], canais: [] })).toBeUndefined();
  });
});

describe('painel "Fixadas" (RF-2, CA-6, CA-7)', () => {
  const fixada: FixadaDto = { mensagem: m, fixadaPor: 1, fixadaEm: 1 };
  it('lista autor, trecho e quem fixou; clicar pede para ir até; desafixar só para quem pode', () => {
    const aoIr = vi.fn();
    const aoDesafixar = vi.fn(async () => null);
    const usuarios = new Map([ana, beto].map((u) => [u.id, u]));
    const { rerender } = render(<PainelFixadas fixadas={[fixada]} usuarios={usuarios} aoIr={aoIr} aoFechar={vi.fn()} aoDesafixar={aoDesafixar} />);
    expect(screen.getByText('Fixadas — 1')).toBeTruthy();
    expect(screen.getByText('o churrasco é sábado')).toBeTruthy();
    expect(screen.getByText('Fixada por Ana')).toBeTruthy();
    fireEvent.click(screen.getByText('o churrasco é sábado'));
    expect(aoIr).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole('button', { name: 'Desafixar' }));
    expect(aoDesafixar).toHaveBeenCalledWith(7);
    rerender(<PainelFixadas fixadas={[]} usuarios={usuarios} aoIr={aoIr} aoFechar={vi.fn()} />);
    expect(screen.getByText('Nenhuma mensagem fixada nesta conversa.')).toBeTruthy();
  });

  it('a loja tira a apagada e troca o texto da editada, mesmo sem o histórico carregado', async () => {
    useLoja.getState().receberFixadas('c:1', [fixada, { ...fixada, mensagem: { ...m, id: 9, texto: 'outra' } }]);
    useLoja.getState().atualizarMensagem({ ...m, texto: 'mudou' });
    useLoja.getState().removerMensagem(9, 'c:1');
    await waitFor(() => expect(useLoja.getState().fixadas['c:1']!.map((f) => f.mensagem.texto)).toEqual(['mudou']));
  });
});
