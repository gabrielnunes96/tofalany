// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CanalDto } from '@tofalando/shared';
import { BarraLateral } from './BarraLateral';
import { CanalAberto } from './CanalAberto';
import { FormNome } from './FormNome';

afterEach(cleanup);

const canais: CanalDto[] = [
  { id: 1, tipo: 'texto', nome: 'geral', posicao: 1 },
  { id: 2, tipo: 'voz', nome: 'Sala 1', posicao: 1 },
];

describe('FormNome', () => {
  it('valida como o servidor, mostra o erro do servidor e cancela com Esc', async () => {
    const aoEnviar = vi.fn(async () => 'Canal não encontrado.');
    const aoCancelar = vi.fn();
    render(<FormNome rotulo="Nome" textoBotao="Criar" aoEnviar={aoEnviar} aoCancelar={aoCancelar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Informe o nome do canal.');
    expect(aoEnviar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  bate  papo ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('bate papo'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Canal não encontrado.');
    fireEvent.keyDown(screen.getByLabelText('Nome'), { key: 'Escape' });
    expect(aoCancelar).toHaveBeenCalled();
  });
});

describe('BarraLateral', () => {
  const props = {
    nomeServidor: 'T',
    canais,
    canalAtivo: 1,
    aoAbrir: vi.fn(),
    aoCriar: vi.fn(async () => null),
    dms: [],
    usuarios: [],
    dmAtiva: null,
    aoAbrirDm: vi.fn(),
  };

  it('RF-13: mostra quem está na voz, quem fala, mute/deafen e entra ao clicar', () => {
    const u = (id: number, nome: string) => ({ id, usuario: nome, nomeExibicao: nome, cor: '#00f0ff', avatarUrl: null, cargo: 'membro' as const });
    const aoEntrarVoz = vi.fn();
    const base = { ...props, ehAdmin: false, aoRenomear: vi.fn(async () => null), aoRemover: vi.fn(async () => null), usuarios: [u(1, 'dono'), u(2, 'ana'), u(3, 'bia')] };
    const voz = [
      { usuarioId: 1, canalVozId: 2, mudo: false, surdo: false, camera: false },
      { usuarioId: 2, canalVozId: 2, mudo: true, surdo: false, camera: false },
      { usuarioId: 3, canalVozId: 2, mudo: true, surdo: true, camera: false },
    ];
    const { rerender } = render(<BarraLateral {...base} voz={voz} falando={[1]} minhaVoz={null} aoEntrarVoz={aoEntrarVoz} />);
    const lista = screen.getByRole('list', { name: 'Na voz em Sala 1' });
    expect(within(lista).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['dono, falando', 'ana', 'bia']);
    expect(within(lista).getByLabelText('microfone desligado')).toBeTruthy();
    expect(within(lista).getByLabelText('sem áudio')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar no canal de voz Sala 1' }));
    expect(aoEntrarVoz).toHaveBeenCalledWith(2);
    rerender(<BarraLateral {...base} voz={[]} falando={[]} minhaVoz={2} aoEntrarVoz={aoEntrarVoz} />);
    expect(screen.queryByRole('list', { name: 'Na voz em Sala 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sala 1, você está aqui' }));
    expect(aoEntrarVoz).toHaveBeenCalledTimes(1);
  });

  it('RF-19/RF-38: ajustes só para quem está no meu canal (menos eu): volume e silenciar', () => {
    const u = (id: number, nome: string) => ({ id, usuario: nome, nomeExibicao: nome, cor: '#00f0ff', avatarUrl: null, cargo: 'membro' as const });
    const aoVolumePessoa = vi.fn();
    const aoSilenciarPessoa = vi.fn();
    const base = { ...props, ehAdmin: false, aoRenomear: vi.fn(async () => null), aoRemover: vi.fn(async () => null), usuarios: [u(1, 'dono'), u(2, 'ana')] };
    const voz = [1, 2].map((usuarioId) => ({ usuarioId, canalVozId: 2, mudo: false, surdo: false, camera: false }));
    const { rerender } = render(
      <BarraLateral {...base} voz={voz} minhaVoz={null} euId={1} pessoasVoz={{ volumes: { '2': 0.5 }, silenciados: [] }} aoVolumePessoa={aoVolumePessoa} aoSilenciarPessoa={aoSilenciarPessoa} />,
    );
    // Fora do canal: sem ajustes.
    expect(screen.queryByRole('button', { name: /Ajustes de voz/ })).toBeNull();
    rerender(<BarraLateral {...base} voz={voz} minhaVoz={2} euId={1} pessoasVoz={{ volumes: { '2': 0.5 }, silenciados: [2] }} aoVolumePessoa={aoVolumePessoa} aoSilenciarPessoa={aoSilenciarPessoa} />);
    expect(screen.queryByRole('button', { name: 'Ajustes de voz de dono' })).toBeNull();
    expect(screen.getByLabelText('silenciado por você')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes de voz de ana' }));
    const volume = screen.getByLabelText(/Volume de ana/) as HTMLInputElement;
    expect(volume.value).toBe('50');
    fireEvent.change(volume, { target: { value: '150' } });
    expect(aoVolumePessoa).toHaveBeenCalledWith(2, 1.5);
    const reativar = screen.getByRole('button', { name: 'Silenciar ana' });
    expect(reativar.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(reativar);
    expect(aoSilenciarPessoa).toHaveBeenCalledWith(2, false);
  });

  it('membro renomeia canal de voz e não vê "remover"', async () => {
    const aoRenomear = vi.fn(async () => null);
    render(<BarraLateral {...props} ehAdmin={false} aoRenomear={aoRenomear} aoRemover={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Remover canal de voz Sala 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Renomear canal de voz Sala 1' }));
    fireEvent.change(screen.getByLabelText('Novo nome do canal de voz Sala 1'), { target: { value: 'Squad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoRenomear).toHaveBeenCalledWith(2, 'Squad'));
  });

  it('administrador remove canal de voz com confirmação', async () => {
    const aoRemover = vi.fn(async () => null);
    render(<BarraLateral {...props} ehAdmin aoRenomear={vi.fn()} aoRemover={aoRemover} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover canal de voz Sala 1' }));
    expect(aoRemover).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('group', { name: 'Confirmar remoção de Sala 1' })).getByRole('button', { name: 'Confirmar remoção' }));
    await waitFor(() => expect(aoRemover).toHaveBeenCalledWith(2));
  });

  it('cria canal pelo "+" e marca o canal aberto', async () => {
    const aoCriar = vi.fn(async () => null);
    render(<BarraLateral {...props} aoCriar={aoCriar} ehAdmin={false} aoRenomear={vi.fn()} aoRemover={vi.fn()} />);
    expect(screen.getByRole('button', { name: /geral/ }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Criar canal de texto' }));
    fireEvent.change(screen.getByLabelText('Nome do novo canal de texto'), { target: { value: 'jogos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(aoCriar).toHaveBeenCalledWith('texto', 'jogos'));
    await waitFor(() => expect(screen.queryByLabelText('Nome do novo canal de texto')).toBeNull());
  });
});

const extras = {
  usuarios: [],
  servidorUrl: 'http://s',
  api: { enviarAnexo: vi.fn(async () => { throw new Error('sem anexo no teste'); }), mensagensCanal: vi.fn(async () => ({ mensagens: [], fim: true })) },
  aoEnviar: vi.fn(async () => null),
  euId: 1,
  aoEditarMensagem: vi.fn(async () => null),
  aoApagarMensagem: vi.fn(async () => null),
  aoDigitar: vi.fn(),
};

describe('CanalAberto', () => {
  it('membro não vê remover; admin confirma e o botão fica desativado durante o pedido', async () => {
    const { rerender } = render(<CanalAberto canal={canais[0]} ehAdmin={false} aoRenomear={vi.fn()} aoRemover={vi.fn()} {...extras} />);
    expect(screen.queryByRole('button', { name: 'Remover canal' })).toBeNull();
    let terminar: (v: string | null) => void = () => undefined;
    const aoRemover = vi.fn(() => new Promise<string | null>((r) => (terminar = r)));
    rerender(<CanalAberto canal={canais[0]} ehAdmin aoRenomear={vi.fn()} aoRemover={aoRemover} {...extras} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover canal' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar remoção' });
    fireEvent.click(confirmar);
    expect(confirmar).toHaveProperty('disabled', true);
    fireEvent.click(confirmar);
    expect(aoRemover).toHaveBeenCalledTimes(1);
    terminar('Só administradores removem canais.');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Só administradores removem canais.');
  });

  it('sem canal de texto, orienta a criar um', () => {
    render(<CanalAberto canal={undefined} ehAdmin={false} aoRenomear={vi.fn()} aoRemover={vi.fn()} {...extras} />);
    expect(screen.getByText('Nenhum canal de texto. Crie um na barra ao lado.')).toBeTruthy();
  });
});
