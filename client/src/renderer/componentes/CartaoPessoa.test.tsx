// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UsuarioDto } from '@tofalando/shared';
import { CartaoPessoa, dataCurta, type PropsCartao } from './CartaoPessoa';
import { estiloFundo, fundoDaLinha } from './fundoPerfil';

afterEach(cleanup);

const beto: UsuarioDto = {
  id: 2,
  usuario: 'beto',
  nomeExibicao: 'Beto',
  cor: '#ff8800',
  avatarUrl: null,
  cargo: 'membro',
  sobreMim: 'joga de suporte\nfala pouco',
  fundo: { cores: ['#112233', '#445566'] },
  membroDesde: '2026-10-12',
};

function montar(extra: Partial<PropsCartao> = {}) {
  const props: PropsCartao = {
    usuario: beto,
    servidorUrl: 'http://s',
    x: 10,
    y: 10,
    eu: false,
    status: 'online',
    funcao: { nome: 'Moderador', cor: '#00ff88' },
    aoMensagem: vi.fn(async () => null),
    aoConversar: vi.fn(),
    aoVerPerfil: vi.fn(),
    aoEditarPerfil: vi.fn(),
    aoFechar: vi.fn(),
    ...extra,
  };
  render(<CartaoPessoa {...props} />);
  return props;
}

describe('CartaoPessoa (mini perfil T4)', () => {
  it('CA-3: degradê, nome, @usuario, etiqueta do cargo, sobre mim, membro desde; em comum chega depois', async () => {
    montar({ carregarPerfil: async () => ({ emComum: { amigos: [5, 6], servidores: [{ id: 1, nome: 'ToFalany', url: 'http://s', iconeUrl: null }] } }) });
    const dialogo = screen.getByRole('dialog', { name: 'Perfil de Beto' });
    expect((dialogo.querySelector('.cartao-pessoa-fundo') as HTMLElement).style.backgroundImage).toContain('linear-gradient');
    expect(dialogo.textContent).toContain('@beto');
    expect(screen.getByRole('list', { name: 'Cargos' }).textContent).toBe('Moderador');
    expect(dialogo.querySelector('.cartao-pessoa-sobre')!.textContent).toBe('joga de suporte\nfala pouco');
    expect(dialogo.querySelector('.cartao-pessoa-sobre')!.getAttribute('dir')).toBe('auto');
    expect(dialogo.textContent).toContain('Membro desde 12/10/2026');
    await waitFor(() => expect(dialogo.querySelector('.cartao-pessoa-comum')!.textContent).toBe('2 amigos em comum · 1 servidor em comum'));
  });

  it('CA-4/CA-12: foco no campo; Enter envia o texto; Tab chega a Mensagem e Ver perfil; Esc fecha devolvendo o foco', async () => {
    const p = montar();
    const campo = screen.getByRole('textbox', { name: 'Mensagem para @beto' });
    expect(document.activeElement).toBe(campo);
    fireEvent.change(campo, { target: { value: 'bora jogar?' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(p.aoMensagem).toHaveBeenCalledWith('bora jogar?'));
    fireEvent.click(screen.getByRole('button', { name: 'Mensagem' }));
    expect(p.aoConversar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil' }));
    expect(p.aoVerPerfil).toHaveBeenCalled();
    // Ordem do Tab: campo, Mensagem, Ver perfil.
    const focaveis = [...screen.getByRole('dialog').querySelectorAll<HTMLElement>('input, button')].map((e) => e.getAttribute('aria-label') ?? e.textContent);
    expect(focaveis).toEqual(['Mensagem para @beto', 'Mensagem', 'Ver perfil']);
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(p.aoFechar).toHaveBeenLastCalledWith(true);
    fireEvent.mouseDown(document.body);
    expect(p.aoFechar).toHaveBeenLastCalledWith(false);
  });

  it('erro no envio aparece', async () => {
    montar({ aoMensagem: async () => 'Sem conexão com o servidor.' });
    const campo = screen.getByRole('textbox', { name: 'Mensagem para @beto' });
    fireEvent.change(campo, { target: { value: 'oi' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toBe('Sem conexão com o servidor.');
  });

  it('CA-5: no próprio cartão, "Editar perfil" no lugar do campo', () => {
    const p = montar({ eu: true });
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editar perfil' }));
    expect(p.aoEditarPerfil).toHaveBeenCalled();
  });

  it('CA-11: conta removida mostra só "conta removida", sem campo nem fundo; Esc fecha mesmo assim', () => {
    const p = montar({ usuario: undefined });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(p.aoFechar).toHaveBeenCalledWith(true);
    const dialogo = screen.getByRole('dialog', { name: 'Perfil de conta removida' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect((dialogo.querySelector('.cartao-pessoa-fundo') as HTMLElement).getAttribute('style')).toBeNull();
  });

  it('sem "membro desde" (conversa direta), mostra a data da conta', async () => {
    montar({
      usuario: { ...beto, membroDesde: undefined },
      carregarPerfil: async () => ({ emComum: { amigos: [], servidores: [] }, contaDesde: '2025-03-04' }),
    });
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('Conta desde 04/03/2025'));
  });

  it('data curta', () => {
    expect(dataCurta('2026-10-12')).toBe('12/10/2026');
  });
});

describe('estiloFundo (segurança, T-6)', () => {
  it('só cores #rrggbb e arquivos do próprio servidor', () => {
    expect(estiloFundo({ cores: ['#112233'] }, '#000000', 'http://s')).toEqual({ backgroundColor: '#112233' });
    expect(estiloFundo({ cores: ['red' as string] as [string] }, '#abcdef', 'http://s')).toEqual({ backgroundColor: '#abcdef' });
    expect(estiloFundo({ url: 'https://x.io/a.webp' }, '#abcdef', 'http://s')).toEqual({ backgroundColor: '#abcdef' });
    const ok = estiloFundo(
      { url: '/files/0123456789abcdef0123456789abcdef.webp', miniUrl: '/files/fedcba9876543210fedcba9876543210.webp' },
      '#abcdef',
      'http://s',
      { parado: true },
    );
    expect(ok.backgroundImage).toBe('url("http://s/files/fedcba9876543210fedcba9876543210.webp")');
    expect(estiloFundo(null, '#abcdef', 'http://s')).toEqual({ backgroundColor: '#abcdef' });
  });

  it('CA-14: a linha da lista usa a miniatura parada (nunca o GIF animado) ou as cores', () => {
    const f = { url: '/files/0123456789abcdef0123456789abcdef.webp', miniUrl: '/files/fedcba9876543210fedcba9876543210.webp' };
    expect(fundoDaLinha(f, '#000000', 'http://s')).toBe('url("http://s/files/fedcba9876543210fedcba9876543210.webp")');
    expect(fundoDaLinha({ cores: ['#112233', '#445566'] }, '#000000', 'http://s')).toBe('linear-gradient(135deg, #112233, #445566)');
    expect(fundoDaLinha(null, '#000000', 'http://s')).toBeUndefined();
  });
});
