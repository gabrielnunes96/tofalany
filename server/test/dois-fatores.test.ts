import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { codigoDoPasso, conferirCodigo, deBase32, enderecoOtpauth, gerarCodigoRecuperacao, paraBase32, passoDe } from '../src/auth/totp.js';
import { listarAuditoria } from '../src/dominio/auditoria.js';
import { appTeste, cadastrar } from './apoio.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('TOTP (RFC 6238)', () => {
  // Vetores oficiais do anexo B da RFC 6238 (SHA1, segredo "12345678901234567890"), nos 6 últimos dígitos.
  const segredo = paraBase32(Buffer.from('12345678901234567890'));
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('em %i s o código é %s', (segundos, esperado) => {
    expect(codigoDoPasso(segredo, passoDe(segundos * 1000))).toBe(esperado);
  });

  it('base32 vai e volta; aceita um passo de folga; não aceita o mesmo passo de novo', () => {
    expect(deBase32(segredo).toString()).toBe('12345678901234567890');
    const agora = 1_700_000_000_000;
    const passo = passoDe(agora);
    expect(conferirCodigo(segredo, codigoDoPasso(segredo, passo - 1), agora)).toBe(passo - 1);
    expect(conferirCodigo(segredo, codigoDoPasso(segredo, passo + 2), agora)).toBeNull();
    expect(conferirCodigo(segredo, codigoDoPasso(segredo, passo), agora, passo)).toBeNull();
    expect(conferirCodigo(segredo, 'abc123', agora)).toBeNull();
  });

  it('endereço do QR code e códigos de recuperação', () => {
    expect(enderecoOtpauth('ABC', 'ana', 'ToFalany')).toBe('otpauth://totp/ToFalany%3Aana?secret=ABC&issuer=ToFalany&algorithm=SHA1&digits=6&period=30');
    expect(gerarCodigoRecuperacao()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const login = (usuario: string, codigo?: string) =>
  app!.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario, senha: 'Senha-forte-1', ...(codigo !== undefined ? { codigo } : {}) } });

/** Liga o 2FA da ana pela API; devolve o segredo e os códigos de recuperação. */
async function ligar(token: string) {
  const inicio = await app!.inject({ method: 'POST', url: '/api/conta/2fa/iniciar', headers: auth(token), payload: { senha: 'Senha-forte-1' } });
  expect(inicio.statusCode).toBe(200);
  const { segredo, otpauth } = inicio.json() as { segredo: string; otpauth: string };
  expect(otpauth).toContain(`secret=${segredo}`);
  const ativou = await app!.inject({ method: 'POST', url: '/api/conta/2fa/ativar', headers: auth(token), payload: { codigo: codigoDoPasso(segredo, passoDe(Date.now())) } });
  expect(ativou.statusCode).toBe(200);
  return { segredo, codigos: ativou.json().codigos as string[] };
}

describe('autenticação em dois fatores (opcional, só no login)', () => {
  it('sem 2FA, o login segue igual; com 2FA, pede o código, recusa o errado e aceita o do app', async () => {
    app = await appTeste();
    await cadastrar(app, 'dono');
    const ana = (await cadastrar(app, 'ana')).json().token as string;
    expect((await login('ana')).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/conta/2fa', headers: auth(ana) })).json()).toEqual({ ativo: false, codigosRestantes: 0 });

    const { segredo, codigos } = await ligar(ana);
    expect(codigos).toHaveLength(8);
    expect((await app.inject({ method: 'GET', url: '/api/conta/2fa', headers: auth(ana) })).json()).toEqual({ ativo: true, codigosRestantes: 8 });

    // A sessão já salva continua valendo (não pede de novo).
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: auth(ana) })).statusCode).toBe(200);
    const semCodigo = await login('ana');
    expect([semCodigo.statusCode, semCodigo.json().erro]).toEqual([401, 'codigo_2fa_necessario']);
    const errado = await login('ana', '000000');
    expect([errado.statusCode, errado.json().erro]).toEqual([401, 'codigo_2fa_invalido']);
    // O código que ativou já foi usado; o do próximo passo serve.
    const proximo = codigoDoPasso(segredo, passoDe(Date.now()) + 1);
    expect((await login('ana', proximo)).statusCode).toBe(200);
    expect((await login('ana', proximo)).statusCode).toBe(401);
  });

  it('código de recuperação entra uma vez só (com ou sem hífen, maiúscula ou minúscula)', async () => {
    app = await appTeste();
    await cadastrar(app, 'dono');
    const ana = (await cadastrar(app, 'ana')).json().token as string;
    const { codigos } = await ligar(ana);
    expect((await login('ana', codigos[0]!.toLowerCase().replace('-', ''))).statusCode).toBe(200);
    expect((await login('ana', codigos[0]!)).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/conta/2fa', headers: auth(ana) })).json().codigosRestantes).toBe(7);
  });

  it('desligar pede senha e código; senha errada ou código errado recusam', async () => {
    app = await appTeste();
    await cadastrar(app, 'dono');
    const ana = (await cadastrar(app, 'ana')).json().token as string;
    const { codigos } = await ligar(ana);
    const desligar = (senha: string, codigo: string) => app!.inject({ method: 'POST', url: '/api/conta/2fa/desativar', headers: auth(ana), payload: { senha, codigo } });
    expect((await desligar('errada', codigos[1]!)).statusCode).toBe(401);
    expect((await desligar('Senha-forte-1', 'ZZZZ-ZZZZ')).json().erro).toBe('codigo_2fa_invalido');
    expect((await desligar('Senha-forte-1', codigos[1]!)).json()).toEqual({ ativo: false, codigosRestantes: 0 });
    expect((await login('ana')).statusCode).toBe(200);
    expect(listarAuditoria(app.banco).registros.map((r) => r.tipo)).toEqual(expect.arrayContaining(['dois_fatores_ligado', 'dois_fatores_desligado']));
  });

  it('o administrador da instalação vê quem tem 2FA e desliga o de alguém; membro não pode', async () => {
    app = await appTeste();
    const dono = (await cadastrar(app, 'dono')).json().token as string;
    const respostaAna = (await cadastrar(app, 'ana')).json();
    const ana = respostaAna.token as string;
    const anaId = respostaAna.usuario.id as number;
    await ligar(ana);
    const contas = (await app.inject({ method: 'GET', url: '/api/admin/usuarios', headers: auth(dono) })).json() as { id: number; doisFatores?: boolean }[];
    expect(contas.find((c) => c.id === anaId)?.doisFatores).toBe(true);
    expect((await app.inject({ method: 'POST', url: `/api/admin/usuarios/${anaId}/2fa/desligar`, headers: auth(ana) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/admin/usuarios/${anaId}/2fa/desligar`, headers: auth(dono) })).statusCode).toBe(200);
    expect((await login('ana')).statusCode).toBe(200);
  });

  it('ligar pede a senha; a configuração só vale depois de confirmar um código do app', async () => {
    app = await appTeste();
    await cadastrar(app, 'dono');
    const ana = (await cadastrar(app, 'ana')).json().token as string;
    expect((await app.inject({ method: 'POST', url: '/api/conta/2fa/iniciar', headers: auth(ana), payload: { senha: 'errada' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/conta/2fa/iniciar', headers: auth(ana), payload: { senha: 'Senha-forte-1' } })).statusCode).toBe(200);
    // Começou e não confirmou: o login segue sem código.
    expect((await login('ana')).statusCode).toBe(200);
    const errado = await app.inject({ method: 'POST', url: '/api/conta/2fa/ativar', headers: auth(ana), payload: { codigo: '123456' } });
    expect(errado.json().erro).toBe('codigo_2fa_invalido');
  });
});
