import { describe, expect, it } from 'vitest';
import { ErroApiCliente } from './api';
import { pedirAtualizacaoServidor } from './atualizar-servidor';

describe('"Atualizar o servidor agora" (infra-e-atualizacao, CA-5)', () => {
  it('pedido aceito, espera, sem permissão e erro qualquer', async () => {
    const aceito = await pedirAtualizacaoServidor({ atualizarServidor: async () => ({ ok: true }) });
    expect(aceito.ok).toBe(true);
    expect(aceito.texto).toMatch(/^Pedido enviado: o servidor confere a versão nova em até 1 minuto/);
    const falhando = (status: number, codigo = 'x', msg = 'x') => ({ atualizarServidor: async () => Promise.reject(new ErroApiCliente(status, codigo, msg)) });
    expect(await pedirAtualizacaoServidor(falhando(429))).toEqual({ ok: false, texto: expect.stringMatching(/já foi pedida/) });
    expect((await pedirAtualizacaoServidor(falhando(403))).texto).toMatch(/Só o administrador/);
    expect(await pedirAtualizacaoServidor({ atualizarServidor: async () => Promise.reject(new Error('rede')) })).toEqual({
      ok: false,
      texto: 'Não foi possível pedir a atualização agora.',
    });
  });

  it('503: mostra o motivo que chegou (servidor sem pedido pelo app, pasta indisponível ou proxy com o servidor reiniciando)', async () => {
    const falhando = (codigo: string, msg: string) => ({ atualizarServidor: async () => Promise.reject(new ErroApiCliente(503, codigo, msg)) });
    expect((await pedirAtualizacaoServidor(falhando('atualizacao_indisponivel', 'pasta de pedidos indisponível'))).texto).toBe('pasta de pedidos indisponível');
    expect((await pedirAtualizacaoServidor(falhando('erro', 'O servidor está reiniciando'))).texto).toBe('O servidor está reiniciando');
  });
});
