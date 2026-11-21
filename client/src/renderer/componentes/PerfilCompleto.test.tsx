// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UsuarioDto } from '@tofalando/shared';
import { PerfilCompleto, type PropsPerfilCompleto } from './PerfilCompleto';

afterEach(cleanup);

const pessoa = (id: number, nome: string): UsuarioDto => ({
  id,
  usuario: nome.toLowerCase(),
  nomeExibicao: nome,
  cor: '#fff',
  avatarUrl: null,
  cargo: 'membro',
});
const beto = { ...pessoa(2, 'Beto'), membroDesde: '2026-10-12', sobreMim: 'oi' };

function montar(extra: Partial<PropsPerfilCompleto> = {}) {
  const props: PropsPerfilCompleto = {
    usuario: beto,
    servidorUrl: 'http://s',
    eu: false,
    status: 'online',
    pessoas: [pessoa(5, 'Caio'), pessoa(6, 'Dani')],
    carregarPerfil: async () => ({
      emComum: { amigos: [5, 6, 77], servidores: [{ id: 1, nome: 'ToFalany', url: 'http://s', iconeUrl: null }] },
      contaDesde: '2025-01-02',
    }),
    amizade: undefined,
    aoConversar: vi.fn(),
    aoPedirAmizade: vi.fn(),
    aoAceitarAmizade: vi.fn(),
    aoRemoverAmizade: vi.fn(),
    aoFechar: vi.fn(),
    ...extra,
  };
  render(<PerfilCompleto {...props} />);
  return props;
}

describe('PerfilCompleto (mini perfil T5)', () => {
  it('CA-10: lista os amigos (que o app conhece) e os servidores em comum; datas', async () => {
    montar();
    const dialogo = screen.getByRole('dialog', { name: 'Perfil de Beto' });
    await waitFor(() => expect(screen.getByRole('heading', { name: '2 amigos em comum' })).toBeTruthy());
    expect(dialogo.textContent).toContain('Caio');
    expect(dialogo.textContent).toContain('Dani');
    expect(screen.getByRole('heading', { name: '1 servidor em comum' })).toBeTruthy();
    expect(dialogo.textContent).toContain('Membro desde12/10/2026');
    expect(dialogo.textContent).toContain('Conta desde02/01/2025');
  });

  it('botão de amizade conforme a situação; Mensagem; Esc fecha', () => {
    const p = montar({ amizade: 'recebido' });
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar pedido' }));
    expect(p.aoAceitarAmizade).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mensagem' }));
    expect(p.aoConversar).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(p.aoFechar).toHaveBeenCalled();
  });

  it('sem poder ver (404): sem listas, sem erro', async () => {
    montar({ carregarPerfil: async () => undefined, amizade: 'amigo' });
    expect(screen.getByRole('button', { name: 'Desfazer amizade' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Amigos em comum' })).toBeTruthy());
  });
});
