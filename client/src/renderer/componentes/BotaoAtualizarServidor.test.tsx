// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotaoAtualizarServidor } from './BotaoAtualizarServidor';

afterEach(cleanup);

describe('BotaoAtualizarServidor (infra-e-atualizacao, CA-5, CA-6)', () => {
  it('CA-6: quem não é administrador da instalação não vê o item', () => {
    render(<BotaoAtualizarServidor podePedir={false} api={{ atualizarServidor: async () => undefined }} aoResponder={() => undefined} />);
    expect(screen.queryByText('Atualizar o servidor agora')).toBeNull();
  });

  it('CA-5: o administrador clica e recebe "Pedido enviado"; o botão fica desabilitado enquanto o pedido vai', async () => {
    let soltar!: () => void;
    const atualizarServidor = vi.fn(() => new Promise<void>((r) => (soltar = r)));
    const aoResponder = vi.fn();
    render(<BotaoAtualizarServidor podePedir api={{ atualizarServidor }} aoResponder={aoResponder} />);
    const botao = screen.getByText('Atualizar o servidor agora') as HTMLButtonElement;
    fireEvent.click(botao);
    expect(botao.disabled).toBe(true);
    fireEvent.click(botao);
    expect(atualizarServidor).toHaveBeenCalledTimes(1);
    soltar();
    await waitFor(() =>
      expect(aoResponder).toHaveBeenCalledWith({ ok: true, texto: expect.stringMatching(/^Pedido enviado: o servidor confere a versão nova em até 1 minuto/) }),
    );
    expect(botao.disabled).toBe(false);
  });
});
