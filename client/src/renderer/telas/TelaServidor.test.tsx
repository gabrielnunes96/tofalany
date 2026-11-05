// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TelaServidor } from './TelaServidor';

afterEach(cleanup);

function preencher(texto: string) {
  fireEvent.change(screen.getByLabelText('Endereço do servidor'), { target: { value: texto } });
  fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
}

describe('TelaServidor', () => {
  it('mostra erro de validação sem chamar o servidor', async () => {
    const testar = vi.fn();
    render(<TelaServidor aoConectar={vi.fn()} testar={testar} />);
    preencher('   ');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Informe o endereço do servidor.');
    expect(testar).not.toHaveBeenCalled();
  });

  it('mostra o erro do teste de conexão e não avança', async () => {
    const aoConectar = vi.fn();
    render(<TelaServidor aoConectar={aoConectar} testar={() => Promise.resolve({ ok: false, erro: 'Não foi possível conectar.' })} />);
    preencher('127.0.0.1:1');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Não foi possível conectar.');
    expect(aoConectar).not.toHaveBeenCalled();
  });

  it('avança com a URL normalizada quando o servidor responde', async () => {
    const aoConectar = vi.fn();
    const testar = vi.fn(() => Promise.resolve({ ok: true as const, valor: { app: 'tofalando' as const, nome: 'T', versao: '0.1.0', contas: 0, limiteContas: 20 } }));
    render(<TelaServidor aoConectar={aoConectar} testar={testar} />);
    preencher('100.64.0.1:3000');
    await waitFor(() => expect(aoConectar).toHaveBeenCalledWith('http://100.64.0.1:3000'));
    expect(testar).toHaveBeenCalledWith('http://100.64.0.1:3000');
  });

  it('mostra erro se guardar falhar e libera o botão', async () => {
    const testar = () => Promise.resolve({ ok: true as const, valor: { app: 'tofalando' as const, nome: 'T', versao: '0.1.0', contas: 0, limiteContas: 20 } });
    render(<TelaServidor aoConectar={() => Promise.reject(new Error('ipc'))} testar={testar} />);
    preencher('100.64.0.1:3000');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Não foi possível guardar o endereço. Tente de novo.');
    expect(screen.getByRole('button', { name: 'Conectar' })).toHaveProperty('disabled', false);
  });

  it('oferece cancelar só quando já existe servidor guardado', () => {
    const aoCancelar = vi.fn();
    const { rerender } = render(<TelaServidor aoConectar={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    rerender(<TelaServidor aoConectar={vi.fn()} aoCancelar={aoCancelar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(aoCancelar).toHaveBeenCalled();
  });
});
