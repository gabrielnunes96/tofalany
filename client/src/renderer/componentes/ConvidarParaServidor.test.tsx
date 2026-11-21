// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComunidadeDto, UsuarioDto } from '@tofalando/shared';
import { ConvidarParaServidor } from './ConvidarParaServidor';
import { CartaoPessoa } from './CartaoPessoa';
import { MenuPessoa } from './MenuPessoa';

afterEach(cleanup);

const familia: ComunidadeDto = { id: 2, nome: 'Família', url: 'http://s/c/2', iconeUrl: null };
const jogos: ComunidadeDto = { id: 3, nome: 'Jogos', url: 'http://s/c/3', iconeUrl: null };
const beto: UsuarioDto = { id: 2, usuario: 'beto', nomeExibicao: 'Beto', cor: '#ff8800', avatarUrl: null, cargo: 'membro' };

describe('Convidar para servidor (qualidade-de-vida, RF-2 e RF-3)', () => {
  it('CA-3/CA-5: lista os servidores da API; escolher envia e mostra "Convite enviado"; o servidor some da lista', async () => {
    const aoConvidar = vi.fn(async () => null);
    render(<ConvidarParaServidor carregar={async () => [familia, jogos]} aoConvidar={aoConvidar} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Convidar para servidor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Família' }));
    expect((await screen.findByRole('status')).textContent).toBe('Convite enviado para Família.');
    expect(aoConvidar).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Convidar para servidor' }));
    expect(screen.queryByRole('button', { name: 'Família' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Jogos' })).toBeTruthy();
  });

  it('CA-4: lista vazia (ou falha ao carregar) não mostra o item', async () => {
    const { rerender } = render(<ConvidarParaServidor carregar={async () => []} aoConvidar={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: 'Convidar para servidor' })).toBeNull();
    rerender(<ConvidarParaServidor key="2" carregar={async () => Promise.reject(new Error('x'))} aoConvidar={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: 'Convidar para servidor' })).toBeNull();
  });

  it('falha no envio mostra o motivo e mantém o servidor na lista', async () => {
    render(<ConvidarParaServidor carregar={async () => [familia]} aoConvidar={async () => 'Muitos convites seguidos.'} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Convidar para servidor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Família' }));
    expect((await screen.findByRole('status')).textContent).toBe('Muitos convites seguidos.');
    expect(screen.getByRole('button', { name: 'Família' })).toBeTruthy();
  });

  it('aparece no cartão e no menu da pessoa (com role de item de menu)', async () => {
    const convite = { carregar: async () => [familia], aoConvidar: vi.fn(async () => null) };
    render(
      <CartaoPessoa
        usuario={beto}
        servidorUrl="http://s"
        x={10}
        y={10}
        eu={false}
        status="online"
        aoMensagem={vi.fn(async () => null)}
        aoConversar={vi.fn()}
        aoVerPerfil={vi.fn()}
        aoEditarPerfil={vi.fn()}
        aoFechar={vi.fn()}
        convite={convite}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Convidar para servidor' })).toBeTruthy();
    cleanup();
    render(
      <MenuPessoa
        usuario={beto}
        x={10}
        y={10}
        servidorUrl="http://s"
        eu={false}
        volume={1}
        silenciado={false}
        amizade="amigo"
        aoVolume={vi.fn()}
        aoSilenciar={vi.fn()}
        aoConversar={vi.fn()}
        aoPedirAmizade={vi.fn()}
        aoAceitarAmizade={vi.fn()}
        aoRemoverAmizade={vi.fn()}
        aoFechar={vi.fn()}
        convite={convite}
      />,
    );
    expect(await screen.findByRole('menuitem', { name: 'Convidar para servidor' })).toBeTruthy();
  });
});
