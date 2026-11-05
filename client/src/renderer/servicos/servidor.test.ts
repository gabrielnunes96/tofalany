import { describe, expect, it, vi } from 'vitest';
import { testarServidor } from './servidor';

const json = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } }));

describe('testarServidor', () => {
  it('aceita um servidor ToFalany', async () => {
    const buscar = vi.fn(() => json({ app: 'tofalany', nome: 'Turma', versao: '0.1.0', contas: 2, limiteContas: 20 }));
    const r = await testarServidor('http://s:3000', buscar);
    expect(r).toEqual({ ok: true, valor: { app: 'tofalany', nome: 'Turma', versao: '0.1.0', contas: 2, limiteContas: 20 } });
    expect(buscar).toHaveBeenCalledWith('http://s:3000/api/servidor', expect.anything());
  });

  it('recusa servidor inacessível', async () => {
    const r = await testarServidor('http://s', () => Promise.reject(new TypeError('falhou')));
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining('Não foi possível conectar') });
  });

  it('recusa resposta de outro serviço', async () => {
    expect(await testarServidor('http://s', () => json({ ola: 1 }))).toMatchObject({ ok: false, erro: expect.stringContaining('não é de um servidor') });
    expect(await testarServidor('http://s', () => Promise.resolve(new Response('<html>')))).toMatchObject({ ok: false });
  });

  it('recusa resposta com campos de tipo errado', async () => {
    const r = await testarServidor('http://s', () => json({ app: 'tofalany', nome: 'T', versao: 1, limiteContas: '20' }));
    expect(r).toMatchObject({ ok: false });
  });

  it('desiste quando o servidor não responde no tempo (ex.: IP do Tailscale desligado)', async () => {
    const pendurado = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, rejeitar) => {
        init?.signal?.addEventListener('abort', () => rejeitar(init.signal?.reason));
      });
    const r = await testarServidor('http://100.64.0.9:3000', pendurado, 20);
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining('Não foi possível conectar') });
  });

  it('informa erro HTTP', async () => {
    expect(await testarServidor('http://s', () => json({}, 502))).toEqual({ ok: false, erro: 'O servidor respondeu com erro (502).' });
  });
});
