import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { appTeste, cadastrar, CONVITE } from './apoio.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const contas = (a: FastifyInstance) => (a.banco.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }).n;

describe('POST /api/auth/cadastro', () => {
  it('CA-2: convite errado é recusado e nenhuma conta é criada', async () => {
    app = await appTeste();
    const r = await cadastrar(app, 'ana', 'Senha-forte-1', 'errado');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ erro: 'convite_invalido', mensagem: 'Código de convite inválido.' });
    expect(contas(app)).toBe(0);
  });

  it('CA-3: com o limite atingido, o cadastro é recusado', async () => {
    app = await appTeste({ LIMITE_CONTAS: '3' });
    for (const nome of ['ana', 'bia', 'caio']) expect((await cadastrar(app, nome)).statusCode).toBe(201);
    const r = await cadastrar(app, 'davi');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ erro: 'limite_contas', mensagem: 'Limite de contas atingido neste servidor.' });
    expect(contas(app)).toBe(3);
  });

  it('CA-3: o padrão é 20 contas', async () => {
    app = await appTeste();
    const inserir = app.banco.prepare(
      "INSERT INTO usuarios (usuario, usuario_norm, senha_hash, nome_exibicao, cor, cargo, criado_em) VALUES (?, ?, 'x', ?, '#fff', 'membro', 0)",
    );
    for (let i = 0; i < 20; i++) inserir.run(`u${i}`, `u${i}`, `u${i}`);
    expect((await cadastrar(app, 'vinte_e_um')).json()).toMatchObject({ erro: 'limite_contas' });
  });

  it('CA-4: nome de usuário repetido sem diferenciar maiúsculas', async () => {
    app = await appTeste();
    expect((await cadastrar(app, 'Gabriel')).statusCode).toBe(201);
    const r = await cadastrar(app, 'gabriel');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ erro: 'usuario_em_uso' });
  });

  it('CA-5: a primeira conta é administrador, a segunda é membro', async () => {
    app = await appTeste();
    const primeira = await cadastrar(app, 'dono');
    const segunda = await cadastrar(app, 'amigo');
    expect(primeira.json().usuario).toMatchObject({ usuario: 'dono', nomeExibicao: 'dono', cargo: 'admin', avatarUrl: null });
    expect(segunda.json().usuario).toMatchObject({ usuario: 'amigo', cargo: 'membro' });
    expect(primeira.json().token).toMatch(/^[\w-]{43}$/);
  });

  it('CA-2: convite errado vence dados inválidos (convite conferido antes de validar e do hash)', async () => {
    app = await appTeste();
    const r = await cadastrar(app, 'jo', '123', 'errado');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ erro: 'convite_invalido' });
  });

  it('sem código vigente no banco, nenhum convite passa (nem vazio)', async () => {
    app = await appTeste();
    app.banco.prepare("DELETE FROM configuracoes WHERE chave = 'codigo_convite'").run();
    expect((await cadastrar(app, 'ana', 'Senha-forte-1', '')).statusCode).toBe(403);
    expect((await cadastrar(app, 'ana', 'Senha-forte-1', CONVITE)).statusCode).toBe(403);
  });

  it('recusa dados inválidos com mensagem', async () => {
    app = await appTeste();
    expect((await cadastrar(app, 'ana', '123')).json()).toEqual({ erro: 'dados_invalidos', mensagem: 'A senha precisa ter: pelo menos 8 caracteres, uma letra maiúscula, uma letra minúscula.' });
    expect((await cadastrar(app, 'jo')).json()).toMatchObject({ erro: 'dados_invalidos' });
    const semCampo = await app.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana' } });
    expect(semCampo.statusCode).toBe(400);
    expect(semCampo.json()).toMatchObject({ erro: 'dados_invalidos' });
  });

  it('guarda a senha só como hash scrypt', async () => {
    app = await appTeste();
    await cadastrar(app, 'ana', 'Senha-forte-1');
    const { senha_hash } = app.banco.prepare('SELECT senha_hash FROM usuarios').get() as { senha_hash: string };
    expect(senha_hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(senha_hash).not.toContain('Senha-forte-1');
  });
});

describe('erros no formato do contrato', () => {
  it('JSON malformado dá 400 dados_invalidos (não 500)', async () => {
    app = await appTeste();
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json' }, payload: '{ruim' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ erro: 'dados_invalidos', mensagem: 'Requisição inválida.' });
  });

  it('rota inexistente dá 404 no formato { erro, mensagem }', async () => {
    app = await appTeste();
    const r = await app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ erro: 'nao_encontrado', mensagem: 'Recurso não encontrado.' });
  });
});

describe('login, sessão e saída', () => {
  it('entra com usuário (sem diferenciar maiúsculas) e senha; erra com a senha errada', async () => {
    app = await appTeste();
    await cadastrar(app, 'Ana', 'Senha-forte-1');
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'Senha-forte-1' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().usuario).toMatchObject({ usuario: 'Ana' });
    const errada = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ana', senha: 'outra-senha' } });
    expect(errada.statusCode).toBe(401);
    const inexistente = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'ninguem', senha: 'outra-senha' } });
    expect(inexistente.json()).toEqual(errada.json());
  });

  it('CA-6 (servidor): o token continua valendo em GET /api/eu até sair', async () => {
    app = await appTeste();
    const { token } = (await cadastrar(app, 'ana')).json();
    const eu = await app.inject({ method: 'GET', url: '/api/eu', headers: { authorization: `Bearer ${token}` } });
    expect(eu.statusCode).toBe(200);
    expect(eu.json()).toMatchObject({ usuario: 'ana' });

    const sair = await app.inject({ method: 'POST', url: '/api/auth/sair', headers: { authorization: `Bearer ${token}` } });
    expect(sair.statusCode).toBe(204);
    const depois = await app.inject({ method: 'GET', url: '/api/eu', headers: { authorization: `Bearer ${token}` } });
    expect(depois.statusCode).toBe(401);
    expect(depois.json()).toMatchObject({ erro: 'nao_autenticado' });
  });

  it('recusa sem token ou com token inventado', async () => {
    app = await appTeste();
    expect((await app.inject({ method: 'GET', url: '/api/eu' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/eu', headers: { authorization: 'Bearer inventado' } })).statusCode).toBe(401);
  });

  it('só guarda o hash do token', async () => {
    app = await appTeste();
    const { token } = (await cadastrar(app, 'ana')).json();
    const { token_hash } = app.banco.prepare('SELECT token_hash FROM sessoes').get() as { token_hash: string };
    expect(token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(token_hash).not.toBe(token);
  });

  it('limita tentativas de login por IP', async () => {
    app = await appTeste({ TENTATIVAS_POR_MINUTO: '2' });
    const tentar = () => app!.inject({ method: 'POST', url: '/api/auth/login', payload: { usuario: 'x', senha: 'yyyyyyyy' } });
    expect((await tentar()).statusCode).toBe(401);
    expect((await tentar()).statusCode).toBe(401);
    const terceira = await tentar();
    expect(terceira.statusCode).toBe(429);
    expect(terceira.json()).toMatchObject({ erro: 'muitas_tentativas' });
  });
});
