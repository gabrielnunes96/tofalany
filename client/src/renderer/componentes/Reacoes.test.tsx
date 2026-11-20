// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MensagemDto, UsuarioDto } from '@tofalando/shared';
import { Reacoes, quemReagiu, rotuloReacao } from './Reacoes';
import { ItemMensagem } from './ItemMensagem';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const pessoa = (id: number, nome: string): UsuarioDto => ({ id, usuario: nome.toLowerCase(), nomeExibicao: nome, cor: '#fff', avatarUrl: null, cargo: 'membro' });
const nomes = ['Ana', 'Beto', 'Carla', 'Davi', 'Eva', 'Fabi', 'Gil', 'Hugo', 'Iara', 'Juca', 'Kika', 'Lia'];
const usuarios = new Map(nomes.map((n, i) => [i + 1, pessoa(i + 1, n)] as const));

describe('Reacoes (T3)', () => {
  it('CA-4: quem reagiu, com "e mais N" acima de 10', () => {
    expect(quemReagiu([1, 2], usuarios)).toBe('Ana e Beto');
    expect(quemReagiu([1, 2, 3], usuarios, 3)).toBe('Ana, Beto e você');
    expect(quemReagiu(nomes.map((_, i) => i + 1), usuarios)).toBe('Ana, Beto, Carla, Davi, Eva, Fabi, Gil, Hugo, Iara, Juca e mais 2');
    expect(quemReagiu([99], usuarios)).toBe('conta removida');
  });

  it('CA-1/CA-19: contagem, a minha em destaque e o rótulo para leitor de tela', () => {
    expect(rotuloReacao({ emoji: '👍', usuarios: [1, 2] }, true)).toBe('👍, 2 reações, inclusive você');
    expect(rotuloReacao({ emoji: '😂', usuarios: [2] }, false)).toBe('😂, 1 reação');
    render(<Reacoes reacoes={[{ emoji: '👍', usuarios: [1] }, { emoji: '😂', usuarios: [2, 3] }]} usuarios={usuarios} euId={1} podeReagir aoAlternar={vi.fn()} aoAbrirSeletor={vi.fn()} />);
    const minha = screen.getByRole('button', { name: '👍, 1 reação, inclusive você' });
    expect(minha.className).toContain('minha');
    expect(minha.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '😂, 2 reações' }).textContent).toContain('Beto e Carla');
    // A dica de quem reagiu chega ao leitor de tela pela descrição.
    const id = screen.getByRole('button', { name: '😂, 2 reações' }).getAttribute('aria-describedby')!;
    expect(document.getElementById(id)?.textContent).toBe('Beto e Carla');
  });

  it('CA-2: clicar alterna; sem permissão, só olha (sem "+")', () => {
    const aoAlternar = vi.fn();
    const aoAbrirSeletor = vi.fn();
    const { rerender } = render(<Reacoes reacoes={[{ emoji: '👍', usuarios: [1] }]} euId={1} podeReagir aoAlternar={aoAlternar} aoAbrirSeletor={aoAbrirSeletor} />);
    fireEvent.click(screen.getByRole('button', { name: /👍/ }));
    expect(aoAlternar).toHaveBeenCalledWith('👍');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar reação' }));
    expect(aoAbrirSeletor).toHaveBeenCalled();
    rerender(<Reacoes reacoes={[{ emoji: '👍', usuarios: [1] }]} euId={1} podeReagir={false} aoAlternar={aoAlternar} aoAbrirSeletor={aoAbrirSeletor} />);
    const so = screen.getByRole('button', { name: /👍/ });
    expect(so.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(so);
    expect(aoAlternar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Adicionar reação' })).toBeNull();
  });

  it('sem reações, nada aparece', () => {
    const { container } = render(<Reacoes reacoes={[]} podeReagir aoAlternar={vi.fn()} aoAbrirSeletor={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('ItemMensagem com reações (T3)', () => {
  const m: MensagemDto = { id: 7, canalId: 1, dmId: null, autorId: 2, texto: 'oi', criadaEm: 1, editadaEm: null, anexos: [], reacoes: [{ emoji: '🔥', usuarios: [2] }] };
  const item = (aoReagir?: (id: number, e: string) => Promise<string | null>) =>
    render(
      <ol>
        <ItemMensagem mensagem={m} autor={usuarios.get(2)} servidorUrl="http://s" podeEditar={false} podeApagar={false} aoEditar={vi.fn()} aoApagar={vi.fn()} usuarios={usuarios} euId={1} aoReagir={aoReagir} />
      </ol>,
    );

  it('CA-1/CA-19: atalhos 👍 😂 ❤️ e Reagir pelo teclado; o painel escolhe e fecha com Esc', async () => {
    const aoReagir = vi.fn(async () => null);
    item(aoReagir);
    fireEvent.click(screen.getByRole('button', { name: 'Reagir com 😂' }));
    expect(aoReagir).toHaveBeenCalledWith(7, '😂');
    fireEvent.click(screen.getByRole('button', { name: 'Reagir' }));
    const painel = screen.getByRole('dialog', { name: 'Escolher reação' });
    expect(document.activeElement?.closest('[role="dialog"]')).toBe(painel);
    fireEvent.keyDown(painel, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // O foco volta para o botão que abriu.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reagir' })));
    // Os atalhos usados (e aceitos pelo servidor) viram "usados recentemente".
    await waitFor(() => expect(localStorage.getItem('tofalany:emojis-recentes')).toBe('["😂"]'));
    fireEvent.click(screen.getByRole('button', { name: 'Reagir' }));
    const recentes = screen.getByRole('region', { name: 'Usados recentemente' });
    expect(recentes.textContent).toBe('Usados recentemente😂');
    fireEvent.click(recentes.querySelector('button')!);
    expect(aoReagir).toHaveBeenLastCalledWith(7, '😂');
    // Clicar de novo no "Reagir" fecha o painel.
    fireEvent.click(screen.getByRole('button', { name: 'Reagir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reagir' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    localStorage.clear();
    fireEvent.click(screen.getByRole('button', { name: 'Reagir' }));
    fireEvent.click(screen.getByRole('button', { name: '❤️' }));
    expect(aoReagir).toHaveBeenLastCalledWith(7, '❤️');
    expect(screen.queryByRole('dialog')).toBeNull();
    // Clicar numa reação existente também reage.
    fireEvent.click(screen.getByRole('button', { name: '🔥, 1 reação' }));
    expect(aoReagir).toHaveBeenLastCalledWith(7, '🔥');
  });

  it('erro do servidor aparece na mensagem e não entra nos recentes; tirar a reação também não', async () => {
    item(vi.fn(async () => 'Calma, muitas reações seguidas.'));
    fireEvent.click(screen.getByRole('button', { name: 'Reagir com 👍' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Calma, muitas reações seguidas.');
    expect(localStorage.getItem('tofalany:emojis-recentes')).toBeNull();
    cleanup();
    const ok = vi.fn(async () => null);
    render(
      <ol>
        <ItemMensagem mensagem={{ ...m, reacoes: [{ emoji: '🔥', usuarios: [1] }] }} autor={usuarios.get(2)} servidorUrl="http://s" podeEditar={false} podeApagar={false} aoEditar={vi.fn()} aoApagar={vi.fn()} usuarios={usuarios} euId={1} aoReagir={ok} />
      </ol>,
    );
    fireEvent.click(screen.getByRole('button', { name: '🔥, 1 reação, inclusive você' }));
    await waitFor(() => expect(ok).toHaveBeenCalledWith(7, '🔥'));
    expect(localStorage.getItem('tofalany:emojis-recentes')).toBeNull();
  });

  it('CA-7: somente leitura (sem aoReagir): sem Reagir nem atalhos; as reações aparecem desligadas', () => {
    item(undefined);
    expect(screen.queryByRole('button', { name: 'Reagir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reagir com 👍' })).toBeNull();
    expect(screen.getByRole('button', { name: '🔥, 1 reação' }).getAttribute('aria-disabled')).toBe('true');
  });
});
