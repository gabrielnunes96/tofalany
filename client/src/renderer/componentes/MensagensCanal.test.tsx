// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MensagemDto, PaginaMensagens, UsuarioDto } from '@tofalando/shared';
import { useLoja } from '../estado/loja';
import { MensagensCanal } from './MensagensCanal';

beforeEach(() => useLoja.getState().limpar());
afterEach(cleanup);

const extras = { euId: 1, ehAdmin: false, aoEditar: vi.fn(async () => null), aoApagar: vi.fn(async () => null), aoDigitar: vi.fn() };
const canal = { id: 1, tipo: 'texto' as const, nome: 'geral', posicao: 1 };
const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#00f0ff', avatarUrl: null, cargo: 'membro' };
const msg = (id: number, autorId = 1): MensagemDto => ({
  id,
  canalId: 1,
  dmId: null,
  autorId,
  texto: `texto ${id}`,
  criadaEm: 1_700_000_000_000 + id,
  editadaEm: null,
  anexos: [],
});

describe('MensagensCanal', () => {
  it('carrega, mostra autor ou "conta removida" e pagina para trás pelo botão', async () => {
    const mensagensCanal = vi.fn(async (_c: number, antes?: number): Promise<PaginaMensagens> =>
      antes ? { mensagens: [msg(1)], fim: true } : { mensagens: [msg(2, 99), msg(3)], fim: false },
    );
    render(
      <MensagensCanal canal={canal} usuarios={[ana]} servidorUrl="http://s" api={{ mensagensCanal, enviarAnexo: vi.fn() }} aoEnviar={vi.fn()} {...extras} />,
    );
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
        api={{
          enviarAnexo: vi.fn(async () => {
            throw new Error('sem anexo no teste');
          }),
          mensagensCanal: async () => ({ mensagens: [], fim: true }),
        }}
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
    render(
      <MensagensCanal canal={canal} usuarios={[ana]} servidorUrl="http://s" api={{ mensagensCanal, enviarAnexo: vi.fn() }} aoEnviar={vi.fn()} {...extras} />,
    );
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Não foi possível carregar as mensagens.');
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('texto 1')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('menções: "@" abre a lista (sem mim; @todos só com permissão), Enter insere @usuario; a mensagem que me marca fica em destaque', async () => {
    const beto: UsuarioDto = { id: 2, usuario: 'beto', nomeExibicao: 'Beto Silva', cor: '#fff', avatarUrl: null, cargo: 'membro' };
    const marcada: MensagemDto = { ...msg(5, 2), texto: 'oi @ana e @todos', mencoes: [1], mencionaTodos: true };
    const mensagensCanal = vi.fn(async (): Promise<PaginaMensagens> => ({ mensagens: [marcada], fim: true }));
    const aoEnviar = vi.fn(async () => null);
    render(
      <MensagensCanal
        canal={canal}
        usuarios={[ana, beto]}
        servidorUrl="http://s"
        api={{ mensagensCanal, enviarAnexo: vi.fn() }}
        aoEnviar={aoEnviar}
        mencoes={{ podeTodos: false }}
        {...extras}
      />,
    );
    const lista = await screen.findByRole('list', { name: 'Mensagens de #geral' });
    await waitFor(() => expect(lista.querySelector('.mencionou-me')).toBeTruthy());
    expect([...lista.querySelectorAll('.mencao')].map((e) => e.textContent)).toEqual(['@Ana', '@todos']);

    const campo = screen.getByLabelText('Mensagem para #geral') as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: 'ei @', selectionStart: 4 } });
    const opcoes = screen.getByRole('listbox', { name: 'Mencionar' });
    expect([...opcoes.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['Beto Silva@beto']);
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(campo.value).toBe('ei @beto ');
    expect(screen.queryByRole('listbox', { name: 'Mencionar' })).toBeNull();
    expect(aoEnviar).not.toHaveBeenCalled();
  });

  it('CA-10/CA-15/CA-17: Responder abre a faixa; envia com a original e o aviso; aviso desligável; Esc e X cancelam', async () => {
    const beto: UsuarioDto = { id: 2, usuario: 'beto', nomeExibicao: 'Beto', cor: '#fff', avatarUrl: null, cargo: 'membro' };
    const dele = { ...msg(5, 2), texto: 'vamos jogar?\nàs 21h' };
    const mensagensCanal = vi.fn(async (): Promise<PaginaMensagens> => ({ mensagens: [dele, msg(6)], fim: true }));
    const aoEnviar = vi.fn(async () => null);
    render(
      <MensagensCanal
        canal={canal}
        usuarios={[ana, beto]}
        servidorUrl="http://s"
        api={{ mensagensCanal, enviarAnexo: vi.fn() }}
        aoEnviar={aoEnviar}
        {...extras}
      />,
    );
    await screen.findByText('vamos jogar?', { exact: false });
    const campo = screen.getByLabelText('Mensagem para #geral') as HTMLTextAreaElement;

    fireEvent.click(screen.getAllByRole('button', { name: 'Responder' })[0]!);
    const faixa = screen.getByRole('group', { name: 'Respondendo a Beto' });
    expect(faixa.textContent).toContain('vamos jogar?');
    expect(faixa.textContent).not.toContain('21h');
    await waitFor(() => expect(document.activeElement).toBe(campo));
    fireEvent.change(campo, { target: { value: 'bora' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('bora', [], { respostaA: 5, avisar: true }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Respondendo a Beto' })).toBeNull());

    // Aviso desligado.
    fireEvent.click(screen.getAllByRole('button', { name: 'Responder' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Avisar Beto' }));
    expect(screen.getByRole('button', { name: 'Avisar Beto' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Avisar Beto' }).textContent).toBe('@ Sem aviso');
    fireEvent.change(campo, { target: { value: 'quieto' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(aoEnviar).toHaveBeenLastCalledWith('quieto', [], { respostaA: 5, avisar: false }));

    // Esc e X cancelam; a próxima sai sem vínculo.
    fireEvent.click(screen.getAllByRole('button', { name: 'Responder' })[0]!);
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: /Respondendo a/ })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Responder' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar resposta' }));
    expect(screen.queryByRole('group', { name: /Respondendo a/ })).toBeNull();
    expect(document.activeElement).toBe(campo);
    fireEvent.change(campo, { target: { value: 'solta' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(aoEnviar).toHaveBeenLastCalledWith('solta', []));

    // Responder a si mesmo: sem o botão de aviso.
    fireEvent.click(screen.getAllByRole('button', { name: 'Responder' })[1]!);
    expect(screen.getByRole('group', { name: 'Respondendo a você mesmo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Avisar/ })).toBeNull();
  });

  it('resposta: falha no envio mantém a faixa; Esc fecha a lista de menção antes; original apagada vai sem vínculo', async () => {
    const beto: UsuarioDto = { id: 2, usuario: 'beto', nomeExibicao: 'Beto', cor: '#fff', avatarUrl: null, cargo: 'membro' };
    const mensagensCanal = vi.fn(async (): Promise<PaginaMensagens> => ({ mensagens: [msg(5, 2)], fim: true }));
    const aoEnviar = vi.fn(async () => 'Sem conexão.' as string | null);
    render(
      <MensagensCanal
        canal={canal}
        usuarios={[ana, beto]}
        servidorUrl="http://s"
        api={{ mensagensCanal, enviarAnexo: vi.fn() }}
        aoEnviar={aoEnviar}
        mencoes={{ podeTodos: false }}
        {...extras}
      />,
    );
    await screen.findByText('texto 5');
    const campo = screen.getByLabelText('Mensagem para #geral') as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    // O campo é descrito pela faixa (leitor de tela).
    expect(document.getElementById(campo.getAttribute('aria-describedby')!)?.getAttribute('aria-label')).toBe('Respondendo a Beto');
    fireEvent.change(campo, { target: { value: 'oi' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(await screen.findByText('Sem conexão.')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Respondendo a Beto' })).toBeTruthy();

    fireEvent.change(campo, { target: { value: 'oi @', selectionStart: 4 } });
    expect(screen.getByRole('listbox', { name: 'Mencionar' })).toBeTruthy();
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Mencionar' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Respondendo a Beto' })).toBeTruthy();

    // A original é apagada enquanto a resposta é escrita.
    act(() => useLoja.getState().removerMensagem(5, 'c:1'));
    expect(screen.getByRole('group', { name: 'Resposta a uma mensagem apagada' }).textContent).toContain('vai como mensagem comum');
    aoEnviar.mockResolvedValue(null);
    fireEvent.change(campo, { target: { value: 'ok' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(aoEnviar).toHaveBeenLastCalledWith('ok', []));
  });

  it('somente leitura: sem Responder', async () => {
    const mensagensCanal = vi.fn(async (): Promise<PaginaMensagens> => ({ mensagens: [msg(5, 2)], fim: true }));
    render(
      <MensagensCanal
        canal={canal}
        usuarios={[ana]}
        servidorUrl="http://s"
        api={{ mensagensCanal, enviarAnexo: vi.fn() }}
        aoEnviar={vi.fn()}
        somenteLeitura="Só leitura."
        {...extras}
      />,
    );
    await screen.findByText('texto 5');
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull();
  });

  it('CA-11: original já carregada: rola e destaca sem chamar o servidor', async () => {
    const resposta: MensagemDto = { ...msg(6), resposta: { id: 5, autorId: 1, trecho: 'texto 5' } };
    const mensagensCanal = vi.fn(async (): Promise<PaginaMensagens> => ({ mensagens: [msg(5), resposta], fim: true }));
    render(
      <MensagensCanal canal={canal} usuarios={[ana]} servidorUrl="http://s" api={{ mensagensCanal, enviarAnexo: vi.fn() }} aoEnviar={vi.fn()} {...extras} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Ir até a mensagem/ }));
    const original = document.querySelector('[data-mensagem-id="5"]')!;
    expect(original.className).toContain('destacada');
    expect(document.activeElement).toBe(original);
    expect(mensagensCanal).toHaveBeenCalledTimes(1);
    // Ao sair dela, deixa de ser focável (um clique comum numa mensagem não prende as ações).
    act(() => (original as HTMLElement).blur());
    expect(original.hasAttribute('tabindex')).toBe(false);
  });

  it('destaque some em 2 s; rola suave, ou sem animação com "reduzir movimento"', async () => {
    const resposta: MensagemDto = { ...msg(6), resposta: { id: 5, autorId: 1, trecho: 'texto 5' } };
    const mensagensCanal = vi.fn(async (): Promise<PaginaMensagens> => ({ mensagens: [msg(5), resposta], fim: true }));
    render(
      <MensagensCanal canal={canal} usuarios={[ana]} servidorUrl="http://s" api={{ mensagensCanal, enviarAnexo: vi.fn() }} aoEnviar={vi.fn()} {...extras} />,
    );
    const trecho = await screen.findByRole('button', { name: /Ir até a mensagem/ });
    const original = document.querySelector<HTMLElement>('[data-mensagem-id="5"]')!;
    const rolar = vi.fn();
    original.scrollIntoView = rolar;
    vi.useFakeTimers();
    try {
      fireEvent.click(trecho);
      expect(rolar).toHaveBeenLastCalledWith({ block: 'center', behavior: 'smooth' });
      expect(original.className).toContain('destacada');
      act(() => vi.advanceTimersByTime(2000));
      expect(original.className).not.toContain('destacada');
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
      fireEvent.click(trecho);
      expect(rolar).toHaveBeenLastCalledWith({ block: 'center', behavior: 'auto' });
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('clique durante uma carga em andamento: abre a janela da original quando ela terminar', async () => {
    const resposta: MensagemDto = { ...msg(100), resposta: { id: 3, autorId: 1, trecho: 'texto 3' } };
    let liberar: (p: PaginaMensagens) => void = () => undefined;
    const mensagensCanal = vi.fn((_c: number, antes?: number, _ate?: number, janela?: { em?: number }): Promise<PaginaMensagens> => {
      if (janela?.em === 3) return Promise.resolve({ mensagens: [msg(2), msg(3), msg(4)], fim: true, fimDepois: false });
      if (!antes) return Promise.resolve({ mensagens: [msg(99), resposta], fim: false });
      return new Promise((r) => (liberar = r));
    });
    render(
      <MensagensCanal canal={canal} usuarios={[ana]} servidorUrl="http://s" api={{ mensagensCanal, enviarAnexo: vi.fn() }} aoEnviar={vi.fn()} {...extras} />,
    );
    const trecho = await screen.findByRole('button', { name: /Ir até a mensagem/ });
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mensagens anteriores' }));
    fireEvent.click(trecho);
    expect(mensagensCanal).toHaveBeenCalledTimes(2);
    await act(async () => liberar({ mensagens: [msg(97), msg(98)], fim: false }));
    await waitFor(() => expect(mensagensCanal).toHaveBeenLastCalledWith(1, undefined, undefined, { em: 3 }));
    await waitFor(() => expect(document.querySelector('[data-mensagem-id="3"]')?.className).toContain('destacada'));
    expect(document.activeElement).toBe(document.querySelector('[data-mensagem-id="3"]'));
  });

  it('original que não existe mais: a janela chega sem ela e aparece o aviso', async () => {
    const resposta: MensagemDto = { ...msg(9), resposta: { id: 8, autorId: 1, trecho: 'sumiu' } };
    const mensagensCanal = vi.fn(async (_c: number, _antes?: number, _ate?: number, janela?: { em?: number }): Promise<PaginaMensagens> =>
      janela?.em ? { mensagens: [msg(7), resposta], fim: true, fimDepois: true } : { mensagens: [msg(7), resposta], fim: true },
    );
    render(
      <MensagensCanal canal={canal} usuarios={[ana]} servidorUrl="http://s" api={{ mensagensCanal, enviarAnexo: vi.fn() }} aoEnviar={vi.fn()} {...extras} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Ir até a mensagem/ }));
    expect(await screen.findByText('Essa mensagem não está mais aqui.')).toBeTruthy();
  });

  it('CA-6: mensagem muito antiga abre a janela em volta dela; mensagem nova não entra; "Ir para as mais recentes" volta ao fim', async () => {
    const resposta: MensagemDto = { ...msg(2000), resposta: { id: 3, autorId: 1, trecho: 'texto 3' } };
    const mensagensCanal = vi.fn(async (_c: number, _antes?: number, _ate?: number, janela?: { em?: number }): Promise<PaginaMensagens> =>
      janela?.em === 3 ? { mensagens: [msg(2), msg(3), msg(4)], fim: true, fimDepois: false } : { mensagens: [msg(1999), resposta], fim: false },
    );
    render(
      <MensagensCanal canal={canal} usuarios={[ana]} servidorUrl="http://s" api={{ mensagensCanal, enviarAnexo: vi.fn() }} aoEnviar={vi.fn()} {...extras} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Ir até a mensagem/ }));
    await waitFor(() => expect(document.querySelector('[data-mensagem-id="3"]')?.className).toContain('destacada'));
    expect(document.querySelectorAll('[data-mensagem-id]')).toHaveLength(3);
    act(() => useLoja.getState().adicionarMensagem(msg(2001)));
    expect(document.querySelector('[data-mensagem-id="2001"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para as mais recentes' }));
    await waitFor(() => expect(document.querySelector('[data-mensagem-id="2000"]')).toBeTruthy());
    expect(document.querySelector('[data-mensagem-id="3"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ir para as mais recentes' })).toBeNull();
  });

  it('pedido de ir até vindo de fora (fixadas, busca) é atendido quando a conversa carrega', async () => {
    const mensagensCanal = vi.fn(async (_c: number, _antes?: number, _ate?: number, janela?: { em?: number }): Promise<PaginaMensagens> =>
      janela?.em === 40 ? { mensagens: [msg(39), msg(40), msg(41)], fim: false, fimDepois: false } : { mensagens: [msg(99), msg(100)], fim: false },
    );
    act(() => useLoja.getState().pedirIrAte('c:1', 40));
    render(
      <MensagensCanal canal={canal} usuarios={[ana]} servidorUrl="http://s" api={{ mensagensCanal, enviarAnexo: vi.fn() }} aoEnviar={vi.fn()} {...extras} />,
    );
    await waitFor(() => expect(document.querySelector('[data-mensagem-id="40"]')?.className).toContain('destacada'));
    expect(useLoja.getState().irAte).toBeNull();
  });
});
