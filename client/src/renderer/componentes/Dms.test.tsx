// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DmDto, UsuarioDto } from '@tofalando/shared';
import { useLoja } from '../estado/loja';
import { ErroApiCliente } from '../servicos/api';
import { BarraLateral } from './BarraLateral';
import { DmAberta } from './DmAberta';

beforeEach(() => useLoja.getState().limpar());
afterEach(cleanup);

const bia: UsuarioDto = { id: 2, usuario: 'bia', nomeExibicao: 'Bia', cor: '#00f0ff', avatarUrl: null, cargo: 'membro' };
const dm: DmDto = { id: 7, outroId: 2, ultimaEm: 1 };
const fn = () => vi.fn(async () => null);

describe('BarraLateral — mensagens diretas', () => {
  it('lista pelo nome da outra pessoa, mostra "conta removida" e abre ao clicar', () => {
    const aoAbrirDm = vi.fn();
    render(
      <BarraLateral
        nomeServidor="T"
        canais={[]}
        canalAtivo={null}
        ehAdmin={false}
        aoAbrir={vi.fn()}
        aoCriar={fn()}
        aoRenomear={fn()}
        aoRemover={fn()}
        dms={[dm, { id: 8, outroId: 99, ultimaEm: 0 }]}
        usuarios={[bia]}
        dmAtiva={7}
        aoAbrirDm={aoAbrirDm}
        aba="diretas"
      />,
    );
    const lista = screen.getByRole('list', { name: 'Mensagens diretas' });
    expect(lista.textContent).toContain('Bia');
    expect(lista.textContent).toContain('conta removida');
    expect(screen.getByRole('button', { name: /Bia/ }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: /conta removida/ }));
    expect(aoAbrirDm).toHaveBeenCalledWith(8);
  });
});

describe('BarraLateral — aba Amigos', () => {
  it('pedidos, amigos (clicar abre a conversa) e outras conversas; adicionar amigo e aceitar pedido', () => {
    const aoPedirAmizade = vi.fn();
    const aoAceitarAmizade = vi.fn();
    const aoConversarCom = vi.fn();
    const caio = { ...bia, id: 3, usuario: 'caio', nomeExibicao: 'Caio' };
    const davi = { ...bia, id: 4, usuario: 'davi', nomeExibicao: 'Davi' };
    render(
      <BarraLateral
        nomeServidor="T"
        canais={[{ id: 1, tipo: 'texto', nome: 'geral', posicao: 1 }]}
        canalAtivo={1}
        ehAdmin={false}
        aoAbrir={vi.fn()}
        aoCriar={fn()}
        aoRenomear={fn()}
        aoRemover={fn()}
        dms={[dm]}
        usuarios={[bia, caio, davi]}
        dmAtiva={null}
        aoAbrirDm={vi.fn()}
        naoLidas={{ 'd:7': 2 }}
        euId={1}
        amizades={[
          { usuarioId: 3, situacao: 'amigo' },
          { usuarioId: 4, situacao: 'recebido' },
        ]}
        aoConversarCom={aoConversarCom}
        aoPedirAmizade={aoPedirAmizade}
        aoAceitarAmizade={aoAceitarAmizade}
      />,
    );
    expect(screen.queryByRole('list', { name: 'Amigos' })).toBeNull();
    const aba = screen.getByRole('tab', { name: /Amigos/ });
    // 2 não lidas na conversa com a Bia + 1 pedido recebido.
    expect(aba.textContent).toContain('3 não lidas');
    fireEvent.click(aba);
    expect(screen.getByRole('list', { name: 'Amigos' }).textContent).toContain('Caio');
    // A Bia não é amiga: a conversa com ela fica em "Outras conversas".
    expect(screen.getByRole('list', { name: 'Mensagens diretas' }).textContent).toContain('Bia');
    fireEvent.click(screen.getByRole('list', { name: 'Amigos' }).querySelector('button')!);
    expect(aoConversarCom).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar Davi' }));
    expect(aoAceitarAmizade).toHaveBeenCalledWith(4);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar amigo' }));
    fireEvent.click(screen.getByRole('list', { name: 'Adicionar amigo' }).querySelector('button')!);
    expect(aoPedirAmizade).toHaveBeenCalledWith(2);
  });
});

describe('BarraLateral — contadores de não lidas', () => {
  it('mostra o número por canal e por DM, com rótulo acessível e 99+', () => {
    render(
      <BarraLateral
        nomeServidor="T"
        canais={[{ id: 1, tipo: 'texto', nome: 'geral', posicao: 1 }, { id: 2, tipo: 'texto', nome: 'jogos', posicao: 2 }]}
        canalAtivo={1}
        ehAdmin={false}
        aoAbrir={vi.fn()}
        aoCriar={fn()}
        aoRenomear={fn()}
        aoRemover={fn()}
        dms={[dm]}
        usuarios={[bia]}
        dmAtiva={null}
        aoAbrirDm={vi.fn()}
        naoLidas={{ 'c:2': 3, 'd:7': 150 }}
      />,
    );
    expect(screen.getByText('3 não lidas').parentElement!.querySelector('[aria-hidden="true"]')!.textContent).toBe('3');
    expect(screen.getByText('150 não lidas').parentElement!.querySelector('[aria-hidden="true"]')!.textContent).toBe('99+');
    expect(screen.getByRole('button', { name: /geral/ }).textContent).not.toMatch(/\d/);
  });
});

describe('DmAberta', () => {
  const props = {
    usuarios: [bia],
    servidorUrl: 'http://s',
    euId: 1,
    aoEnviar: fn(),
    aoEditarMensagem: fn(),
    aoApagarMensagem: fn(),
    aoDigitar: vi.fn(),
  };

  it('carrega o histórico da DM e mostra o erro do servidor (ex.: 403)', async () => {
    const mensagensDm = vi.fn(async () => {
      throw new ErroApiCliente(403, 'sem_permissao', 'Conversa não encontrada.');
    });
    render(<DmAberta {...props} dm={dm} outro={bia} api={{ mensagensDm, enviarAnexo: vi.fn() }} />);
    expect(screen.getByRole('heading', { name: 'Bia' })).toBeTruthy();
    await waitFor(() => expect(mensagensDm).toHaveBeenCalledWith(7, undefined));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Conversa não encontrada.');
    expect(screen.getByLabelText('Mensagem para Bia')).toBeTruthy();
  });

  it('com conta removida: sem campo de escrever, aviso de só leitura', () => {
    render(<DmAberta {...props} dm={dm} outro={undefined} api={{ mensagensDm: async () => ({ mensagens: [], fim: true }), enviarAnexo: vi.fn() }} />);
    expect(screen.getByRole('heading', { name: 'conta removida' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('note').textContent).toBe('Essa conta foi removida. A conversa ficou só para leitura.');
  });
});
