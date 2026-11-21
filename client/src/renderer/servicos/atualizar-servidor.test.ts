import { describe, expect, it } from 'vitest';
import { ErroApiCliente } from './api';
import { pedirAtualizacaoServidor } from './atualizar-servidor';

describe('"Atualizar o servidor agora" (infra-e-atualizacao, CA-5)', () => {
  it('pedido aceito, espera, servidor sem pedido pelo app, sem permissão e erro qualquer', async () => {
    expect(await pedirAtualizacaoServidor({ atualizarServidor: async () => ({ ok: true }) })).toMatch(/^Pedido enviado: o servidor confere a versão nova em até 1 minuto/);
    const falhando = (status: number) => ({ atualizarServidor: async () => Promise.reject(new ErroApiCliente(status, 'x', 'x')) });
    expect(await pedirAtualizacaoServidor(falhando(429))).toMatch(/já foi pedida/);
    expect(await pedirAtualizacaoServidor(falhando(503))).toMatch(/não atualiza pelo app/);
    expect(await pedirAtualizacaoServidor(falhando(403))).toMatch(/Só o administrador/);
    expect(await pedirAtualizacaoServidor({ atualizarServidor: async () => Promise.reject(new Error('rede')) })).toBe('Não foi possível pedir a atualização agora.');
  });
});
