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

  const info = (endereco: string) => ({ ok: true as const, valor: { app: 'tofalany' as const, nome: 'T', versao: '0.1.0', contas: 0, limiteContas: 20, endereco } });

  it('sem esquema: tenta HTTPS e, se não responder, HTTP (Tailscale)', async () => {
    const aoConectar = vi.fn();
    const testar = vi.fn((url: string) => Promise.resolve(url.startsWith('https:') ? { ok: false as const, erro: 'não' } : info(url)));
    render(<TelaServidor aoConectar={aoConectar} testar={testar} />);
    preencher('100.64.0.1:3000');
    await waitFor(() => expect(aoConectar).toHaveBeenCalledWith('http://100.64.0.1:3000'));
    expect(testar.mock.calls.map((c) => c[0])).toEqual(['https://100.64.0.1:3000', 'http://100.64.0.1:3000']);
  });

  it('sem esquema: servidor com HTTPS (VPS) fica salvo como https://', async () => {
    const aoConectar = vi.fn();
    const testar = vi.fn((url: string) => Promise.resolve(info(url)));
    render(<TelaServidor aoConectar={aoConectar} testar={testar} />);
    preencher('167-234-225-58.sslip.io');
    await waitFor(() => expect(aoConectar).toHaveBeenCalledWith('https://167-234-225-58.sslip.io'));
    expect(testar).toHaveBeenCalledTimes(1);
  });

  it('com http:// digitado e redirecionamento para HTTPS, guarda o endereço final', async () => {
    const aoConectar = vi.fn();
    render(<TelaServidor aoConectar={aoConectar} testar={() => Promise.resolve(info('https://fala.exemplo.com'))} />);
    preencher('http://fala.exemplo.com');
    await waitFor(() => expect(aoConectar).toHaveBeenCalledWith('https://fala.exemplo.com'));
  });

  it('mostra erro se guardar falhar e libera o botão', async () => {
    const testar = (url: string) => Promise.resolve(info(url));
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
