import { describe, expect, it, vi } from 'vitest';
import { testarServidor } from './servidor';

const json = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } }));

describe('testarServidor', () => {
  it('aceita um servidor ToFalany', async () => {
    const buscar = vi.fn(() => json({ app: 'tofalany', nome: 'Turma', versao: '0.1.0', contas: 2, limiteContas: 20 }));
    const r = await testarServidor('http://s:3000', buscar);
    expect(r).toEqual({ ok: true, valor: { app: 'tofalany', nome: 'Turma', versao: '0.1.0', contas: 2, limiteContas: 20, endereco: 'http://s:3000' } });
    expect(buscar).toHaveBeenCalledWith('http://s:3000/api/servidor', expect.anything());
  });

  it('servidor criado na mesma instalação: o endereço mantém o /c/<id>', async () => {
    const buscar = vi.fn(() => json({ app: 'tofalany', nome: 'Família', versao: '0.1.0', contas: 2, limiteContas: 20 }));
    const r = await testarServidor('http://s:3000/c/2', buscar);
    expect(r).toMatchObject({ ok: true, valor: { nome: 'Família', endereco: 'http://s:3000/c/2' } });
    expect(buscar).toHaveBeenCalledWith('http://s:3000/c/2/api/servidor', expect.anything());
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

  it('guarda o endereço final quando o servidor redireciona de http para https no mesmo host', async () => {
    const resposta = (url: string) => {
      const r = new Response(JSON.stringify({ app: 'tofalany', nome: 'T', versao: '1', contas: 0, limiteContas: 20 }), { headers: { 'content-type': 'application/json' } });
      Object.defineProperty(r, 'url', { value: url });
      return Promise.resolve(r);
    };
    expect(await testarServidor('http://s.io', () => resposta('https://s.io/api/servidor'))).toMatchObject({ ok: true, valor: { endereco: 'https://s.io' } });
    // Redirecionamento para outro host não muda o endereço guardado.
    expect(await testarServidor('http://s.io', () => resposta('https://outro.io/api/servidor'))).toMatchObject({ ok: true, valor: { endereco: 'http://s.io' } });
  });
});
