import { describe, expect, it, vi } from 'vitest';
import { criarApi, ErroApiCliente } from './api';

const resposta = (corpo: unknown, status = 200) => Promise.resolve(new Response(corpo === undefined ? null : JSON.stringify(corpo), { status }));

describe('criarApi', () => {
  it('envia JSON e o token Bearer', async () => {
    const buscar = vi.fn((_url: string, _init?: RequestInit) => resposta({ id: 1 }));
    await criarApi('http://s', 'tok', buscar).eu();
    const [url, init] = buscar.mock.calls[0]!;
    expect(url).toBe('http://s/api/eu');
    expect(init?.headers).toEqual({ authorization: 'Bearer tok' });
  });

  it('repassa a mensagem do servidor em erro 4xx', async () => {
    const api = criarApi('http://s', null, () => resposta({ erro: 'convite_invalido', mensagem: 'Código de convite inválido.' }, 403));
    await expect(api.cadastrar({ convite: 'x', usuario: 'ana', senha: '12345678' })).rejects.toMatchObject({
      status: 403,
      codigo: 'convite_invalido',
      message: 'Código de convite inválido.',
    });
  });

  it('usa mensagem genérica em 5xx e sinaliza falta de conexão', async () => {
    await expect(criarApi('http://s', null, () => resposta({ erro: 'erro_interno', mensagem: 'detalhe' }, 500)).eu()).rejects.toMatchObject({
      message: 'O servidor teve um problema. Tente de novo em instantes.',
    });
    const erro = await criarApi('http://s', null, () => Promise.reject(new TypeError('rede'))).eu().catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApiCliente);
    expect((erro as ErroApiCliente).semConexao).toBe(true);
  });

  it('monta a consulta da auditoria só com os filtros preenchidos', async () => {
    const buscar = vi.fn((_url: string, _init?: RequestInit) => resposta({ registros: [], fim: true }));
    await criarApi('http://s', 't', buscar).auditoria({ pessoa: 2, tipo: 'login', de: undefined, antes: 10 });
    expect(buscar.mock.calls[0]![0]).toBe('http://s/api/admin/auditoria?pessoa=2&tipo=login&antes=10');
  });

  it('envia o avatar como multipart, sem content-type manual', async () => {
    const buscar = vi.fn((_url: string, _init?: RequestInit) => resposta({ avatarUrl: '/files/x.webp' }));
    await criarApi('http://s', 't', buscar).enviarAvatar(new Blob(['x'], { type: 'image/png' }), 'a.png');
    const [url, init] = buscar.mock.calls[0]!;
    expect(url).toBe('http://s/api/eu/avatar');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBeInstanceOf(FormData);
    expect(init?.headers).toEqual({ authorization: 'Bearer t' });
  });

  it('aceita 204 sem corpo', async () => {
    await expect(criarApi('http://s', 't', () => resposta(undefined, 204)).sair()).resolves.toBeUndefined();
  });
});
