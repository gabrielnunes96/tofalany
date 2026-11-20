// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MensagemDto, UsuarioDto } from '@tofalando/shared';
import { ItemMensagem } from './ItemMensagem';
import { BarraLateral } from './BarraLateral';
import { DmAberta } from './DmAberta';
import { ContextoPerfil } from './ContextoPerfil';
import { useLoja } from '../estado/loja';

beforeEach(() => useLoja.getState().limpar());
afterEach(cleanup);

const beto: UsuarioDto = { id: 2, usuario: 'beto', nomeExibicao: 'Beto', cor: '#fff', avatarUrl: null, cargo: 'membro' };
const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#0ff', avatarUrl: null, cargo: 'membro' };
const msg = (extra: Partial<MensagemDto> = {}): MensagemDto => ({ id: 9, canalId: 1, dmId: null, autorId: 2, texto: 'oi @ana', criadaEm: 1, editadaEm: null, anexos: [], mencoes: [1], ...extra });

function montar(m: MensagemDto, autor: UsuarioDto | undefined) {
  const abrir = vi.fn();
  render(
    <ContextoPerfil.Provider value={abrir}>
      <ul>
        <ItemMensagem mensagem={m} autor={autor} servidorUrl="http://s" podeEditar={false} podeApagar={false} aoEditar={vi.fn(async () => null)} aoApagar={vi.fn(async () => null)} usuarios={new Map([[1, ana], [2, beto]])} euId={1} />
      </ul>
    </ContextoPerfil.Provider>,
  );
  return abrir;
}

describe('onde o cartão abre (mini perfil T4)', () => {
  it('CA-1/CA-2: foto e nome do autor e a menção abrem o cartão da pessoa certa', () => {
    const abrir = montar(msg(), beto);
    fireEvent.click(screen.getByRole('button', { name: 'Perfil de Beto' }));
    expect(abrir).toHaveBeenLastCalledWith(2, expect.any(HTMLElement));
    fireEvent.click(screen.getByRole('button', { name: 'Beto' }));
    expect(abrir).toHaveBeenLastCalledWith(2, expect.any(HTMLElement));
    fireEvent.click(screen.getByRole('button', { name: '@Ana' }));
    expect(abrir).toHaveBeenLastCalledWith(1, expect.any(HTMLElement));
  });

  it('CA-11: autor removido também abre (cartão de conta removida)', () => {
    const abrir = montar(msg({ mencoes: [] }), undefined);
    fireEvent.click(screen.getByRole('button', { name: 'conta removida' }));
    expect(abrir).toHaveBeenCalledWith(2, expect.any(HTMLElement));
  });

  it('T-8: conhecido atualizado muda só a lista de conhecidos; o PATCH mantém o "membro desde"', () => {
    const l = useLoja.getState();
    useLoja.setState({ conhecidos: [beto], usuarios: [{ ...ana, membroDesde: '2026-01-01' }], eu: { ...ana, membroDesde: '2026-01-01' } });
    l.atualizarConhecido({ ...beto, sobreMim: 'novo' });
    expect(useLoja.getState().conhecidos[0]!.sobreMim).toBe('novo');
    expect(useLoja.getState().usuarios.map((u) => u.id)).toEqual([1]);
    l.atualizarConhecido({ ...ana, id: 99 });
    expect(useLoja.getState().conhecidos.map((u) => u.id)).toEqual([2]);
    l.atualizarUsuario({ ...ana, sobreMim: 'oi' });
    expect(useLoja.getState().eu!.membroDesde).toBe('2026-01-01');
  });

  it('CA-2/T-2: em conversas diretas a foto abre o cartão e a linha continua abrindo a conversa', () => {
    const abrir = vi.fn();
    const aoAbrirDm = vi.fn();
    const fn = () => vi.fn(async () => null);
    render(
      <ContextoPerfil.Provider value={abrir}>
        <BarraLateral nomeServidor="T" canais={[]} canalAtivo={null} ehAdmin={false} aoAbrir={vi.fn()} aoCriar={fn()} aoRenomear={fn()} aoRemover={fn()} dms={[{ id: 7, outroId: 2, ultimaEm: 1 }]} usuarios={[beto]} dmAtiva={null} aoAbrirDm={aoAbrirDm} aba="diretas" />
      </ContextoPerfil.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Perfil de Beto' }));
    expect(abrir).toHaveBeenCalledWith(2, expect.any(HTMLElement));
    expect(aoAbrirDm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Beto/ }));
    expect(aoAbrirDm).toHaveBeenCalledWith(7);
  });

  it('CA-2: o cabeçalho da conversa direta abre o cartão', () => {
    const abrir = vi.fn();
    render(
      <ContextoPerfil.Provider value={abrir}>
        <DmAberta
          dm={{ id: 7, outroId: 2, ultimaEm: 1 }}
          outro={beto}
          usuarios={[beto]}
          servidorUrl="http://s"
          euId={1}
          api={{ mensagensDm: async () => ({ mensagens: [], fim: true }), enviarAnexo: vi.fn() }}
          aoEnviar={vi.fn(async () => null)}
          aoEditarMensagem={vi.fn(async () => null)}
          aoApagarMensagem={vi.fn(async () => null)}
          aoDigitar={vi.fn()}
        />
      </ContextoPerfil.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Perfil de Beto' }));
    expect(abrir).toHaveBeenCalledWith(2, expect.any(HTMLElement));
  });

  it('a foto do autor fica fora do Tab (o nome é o alvo do teclado)', () => {
    montar(msg(), beto);
    expect(screen.getByRole('button', { name: 'Perfil de Beto' }).tabIndex).toBe(-1);
    expect(screen.getByRole('button', { name: 'Beto' }).tabIndex).toBe(0);
  });
});
