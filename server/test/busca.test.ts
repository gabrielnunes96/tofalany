import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PedidoBusca, RespostaBusca } from '@tofalando/shared';
import { appTeste, cadastrar, configTeste } from './apoio.js';
import { construirApp } from '../src/app.js';
import { inserirMensagem } from '../src/dominio/mensagens.js';
import { criarCanal } from '../src/dominio/canais.js';
import { abrirDm } from '../src/dominio/dms.js';
import { consultaFts, destaquesDe, termosDaBusca } from '../src/dominio/busca.js';

/** chat-fixar-e-buscar, T3: busca de mensagens. */
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

async function preparar(extra: Record<string, string> = {}) {
  app = await appTeste(extra);
  const dono = (await cadastrar(app, 'dono')).json() as { token: string; usuario: { id: number } };
  const ana = (await cadastrar(app, 'ana')).json() as { token: string; usuario: { id: number } };
  const beto = (await cadastrar(app, 'beto')).json() as { token: string; usuario: { id: number } };
  const geral = (app.banco.prepare("SELECT id FROM canais WHERE tipo = 'texto' AND comunidade_id = 1 ORDER BY id LIMIT 1").get() as { id: number }).id;
  const outroCanal = criarCanal(app.banco, 'texto', 'jogos', dono.usuario.id).id;
  const buscar = (token: string, pedido: PedidoBusca, url = '/api/busca') => app!.inject({ method: 'POST', url, headers: auth(token), payload: pedido });
  const achados = async (token: string, pedido: PedidoBusca) => {
    const r = await buscar(token, pedido);
    expect(r.statusCode).toBe(200);
    return (r.json() as RespostaBusca).resultados.map((x) => x.mensagem.texto);
  };
  return { dono, ana, beto, geral, outroCanal, buscar, achados };
}

describe('termos e destaques (A6, RN-8)', () => {
  it('só letras e números viram termos com prefixo; sintaxe do FTS não passa', () => {
    expect(termosDaBusca('voce jog')).toEqual(['voce', 'jog']);
    expect(consultaFts(termosDaBusca('voce jog'))).toBe('"voce"* "jog"*');
    expect(termosDaBusca('"abc texto:x {a b}:c NEAR(a b -c ^d * ( ) OR AND')).toEqual(['abc', 'texto', 'NEAR', 'OR', 'AND']);
    expect(termosDaBusca('a b')).toEqual([]);
    expect(termosDaBusca('um dois tres quatro cinco seis sete oito nove dez')).toHaveLength(8);
    expect(termosDaBusca('x'.repeat(50))[0]).toHaveLength(32);
  });

  it('CA-8: destaques sem acento e por prefixo, em índices do texto', () => {
    expect(termosDaBusca('x² ok')).toEqual(['x²', 'ok']);
    const texto = 'Você vai jogar hoje?';
    const d = destaquesDe(texto, ['voce', 'jog']);
    expect(d.map(([i, f]) => texto.slice(i, f))).toEqual(['Você', 'jogar']);
  });
});

describe('POST /api/busca (chat-fixar-e-buscar, T3)', () => {
  it('CA-8: "voce jog" acha "Você vai jogar hoje?" com os destaques', async () => {
    const { ana, geral, buscar } = await preparar();
    inserirMensagem(app!.banco, { canalId: geral }, ana.usuario.id, 'Você vai jogar hoje?');
    inserirMensagem(app!.banco, { canalId: geral }, ana.usuario.id, 'nada a ver');
    const r = (await buscar(ana.token, { q: 'voce jog', onde: 'conversa', canalId: geral })).json() as RespostaBusca;
    expect(r.resultados).toHaveLength(1);
    const { mensagem, destaques } = r.resultados[0]!;
    expect(destaques.map(([i, f]) => mensagem.texto.slice(i, f))).toEqual(['Você', 'jogar']);
  });

  it('destaques ficam no texto escrito (o endereço do GIF no fim do texto não ganha destaque)', async () => {
    const { ana, geral, buscar } = await preparar();
    inserirMensagem(app!.banco, { canalId: geral }, ana.usuario.id, 'olha esse gif', Date.now(), undefined, null, {
      slug: 'g',
      url: 'https://static.klipy.com/gif-engracado.gif',
      largura: 1,
      altura: 1,
      descricao: 'g',
    });
    const r = (await buscar(ana.token, { q: 'gif', onde: 'conversa', canalId: geral })).json() as RespostaBusca;
    const { mensagem, destaques } = r.resultados[0]!;
    expect(destaques.map(([i, f]) => mensagem.texto.slice(i, f))).toEqual(['gif']);
  });

  it('"minhas DMs" deixa de fora a DM com quem não é deste servidor nem amigo (R-5)', async () => {
    const { ana, achados } = await preparar();
    const fora = Number(
      app!.banco
        .prepare(
          "INSERT INTO usuarios (usuario, usuario_norm, senha_hash, nome_exibicao, cor, cargo, criado_em) VALUES ('fora', 'fora', 'x', 'Fora', '#fff', 'membro', ?)",
        )
        .run(Date.now()).lastInsertRowid,
    );
    inserirMensagem(app!.banco, { dmId: abrirDm(app!.banco, ana.usuario.id, fora) }, fora, 'palavrafora');
    expect(await achados(ana.token, { q: 'palavrafora', onde: 'dms' })).toEqual([]);
  });

  it('CA-10: conversa só o canal aberto; servidor todos os canais de texto daqui', async () => {
    const { ana, geral, outroCanal, achados } = await preparar();
    inserirMensagem(app!.banco, { canalId: geral }, ana.usuario.id, 'churrasco no geral');
    inserirMensagem(app!.banco, { canalId: outroCanal }, ana.usuario.id, 'churrasco nos jogos');
    expect(await achados(ana.token, { q: 'churrasco', onde: 'conversa', canalId: geral })).toEqual(['churrasco no geral']);
    expect(await achados(ana.token, { q: 'churrasco', onde: 'servidor' })).toEqual(['churrasco nos jogos', 'churrasco no geral']);
  });

  it('CA-9/A1/A2/A9: outro servidor, DM alheia e quem foi expulso não veem nada', async () => {
    const { dono, ana, beto, geral, buscar, achados } = await preparar();
    await app!.inject({ method: 'POST', url: '/api/comunidades', headers: auth(dono.token), payload: { nome: 'Família' } });
    const secreto = criarCanal(app!.banco, 'texto', 'secreto', dono.usuario.id, Date.now(), 2).id;
    inserirMensagem(app!.banco, { canalId: secreto }, dono.usuario.id, 'palavrasecreta do outro servidor');
    const dmDonoBeto = abrirDm(app!.banco, dono.usuario.id, beto.usuario.id);
    inserirMensagem(app!.banco, { dmId: dmDonoBeto }, dono.usuario.id, 'palavrasecreta na DM deles');
    // Canal de outro servidor: 404 com e sem o prefixo do servidor principal.
    expect((await buscar(ana.token, { q: 'palavrasecreta', onde: 'conversa', canalId: secreto })).statusCode).toBe(404);
    expect((await buscar(ana.token, { q: 'palavrasecreta', onde: 'conversa', canalId: secreto }, '/c/1/api/busca')).statusCode).toBe(404);
    expect(await achados(ana.token, { q: 'palavrasecreta', onde: 'servidor' })).toEqual([]);
    // DM alheia: 403, inclusive para o administrador da instalação quando não participa.
    expect((await buscar(ana.token, { q: 'palavrasecreta', onde: 'conversa', dmId: dmDonoBeto })).statusCode).toBe(403);
    expect(await achados(ana.token, { q: 'palavrasecreta', onde: 'dms' })).toEqual([]);
    // Os participantes acham na DM; o dono acha o do outro servidor só pela conexão de lá.
    expect(await achados(beto.token, { q: 'palavrasecreta', onde: 'dms' })).toEqual(['palavrasecreta na DM deles']);
    expect((await buscar(dono.token, { q: 'palavrasecreta', onde: 'servidor' }, '/c/2/api/busca')).json()).toMatchObject({
      resultados: [{ mensagem: { texto: 'palavrasecreta do outro servidor' } }],
    });
    // Expulso: 403 com o token antigo.
    await app!.inject({ method: 'POST', url: `/api/moderacao/${ana.usuario.id}/expulsar`, headers: auth(dono.token), payload: {} });
    expect((await buscar(ana.token, { q: 'churrasco', onde: 'conversa', canalId: geral })).statusCode).toBe(403);
  });

  it('CA-11/CA-12: com anexo (também pelo nome), com GIF e de quem', async () => {
    const { ana, beto, geral, achados } = await preparar();
    const comAnexo = inserirMensagem(app!.banco, { canalId: geral }, ana.usuario.id, 'segue');
    app!.banco
      .prepare(
        "INSERT INTO anexos (id, mensagem_id, autor_id, tipo, mime, nome_original, bytes, arquivo, criado_em) VALUES ('a1', ?, ?, 'documento', 'text/plain', 'planilha.xlsx', 1, 'a1', ?)",
      )
      .run(comAnexo, ana.usuario.id, Date.now());
    inserirMensagem(app!.banco, { canalId: geral }, beto.usuario.id, 'ok da Beto', Date.now(), undefined, null, {
      slug: 'x',
      url: 'https://static.klipy.com/x.gif',
      largura: 10,
      altura: 10,
      descricao: 'x',
    });
    inserirMensagem(app!.banco, { canalId: geral }, ana.usuario.id, 'ok da Ana');
    expect(await achados(ana.token, { onde: 'conversa', canalId: geral, comAnexo: true })).toEqual(['segue']);
    expect(await achados(ana.token, { q: 'planilha', onde: 'conversa', canalId: geral })).toEqual(['segue']);
    expect((await achados(ana.token, { onde: 'conversa', canalId: geral, comGif: true }))[0]).toMatch(/^ok da Beto/);
    expect(await achados(ana.token, { q: 'ok', onde: 'conversa', canalId: geral, autorId: ana.usuario.id })).toEqual(['ok da Ana']);
  });

  it('CA-15: 1 letra sem filtro é recusada; entradas com sintaxe do FTS não dão erro interno', async () => {
    const { ana, beto, dono, geral, buscar } = await preparar();
    const r = await buscar(ana.token, { q: 'a', onde: 'conversa', canalId: geral });
    expect(r.statusCode).toBe(400);
    expect(r.json().mensagem).toBe('Digite pelo menos 2 letras.');
    // Três pessoas para não bater no limite de 10 buscas por 10 s.
    const tokens = [ana.token, beto.token, dono.token];
    const entradas = ['"abc', 'texto:x', '{texto}:a', 'NEAR(a b', 'a OR', '-xx', '^ab', 'ab*', '(ab)', 'AND NOT'];
    for (const [i, q] of entradas.entries()) expect((await buscar(tokens[i % 3]!, { q, onde: 'conversa', canalId: geral })).statusCode).toBe(200);
    // Campo a mais no corpo é descartado pelo schema (nunca vira filtro).
    expect((await buscar(dono.token, { q: 'ab', onde: 'conversa', canalId: geral, ['fixadaPor' as 'q']: 'x' } as PedidoBusca)).statusCode).toBe(200);
  });

  it('paginação: 25 por vez e "antes" traz as seguintes; linha de sistema fica fora', async () => {
    const { ana, beto, geral, buscar, achados } = await preparar();
    for (let i = 0; i < 30; i++) inserirMensagem(app!.banco, { canalId: geral }, ana.usuario.id, `pizza ${i}`);
    // Linha "fixou" da Ana: nem pelo filtro de quem (sem texto) nem pelo texto.
    app!.banco
      .prepare("INSERT INTO mensagens (canal_id, autor_id, texto, criada_em, tipo, ref_mensagem_id) VALUES (?, ?, 'fixou uma mensagem.', ?, 'fixou', 1)")
      .run(geral, ana.usuario.id, Date.now());
    expect((await achados(beto.token, { onde: 'conversa', canalId: geral, autorId: ana.usuario.id })).some((t) => t.startsWith('fixou'))).toBe(false);
    expect(await achados(beto.token, { q: 'fixou', onde: 'conversa', canalId: geral })).toEqual([]);
    const p1 = (await buscar(ana.token, { q: 'pizza', onde: 'conversa', canalId: geral })).json() as RespostaBusca;
    expect(p1.resultados).toHaveLength(25);
    expect(p1.mais).toBe(true);
    const p2 = (await buscar(ana.token, { q: 'pizza', onde: 'conversa', canalId: geral, antes: p1.resultados.at(-1)!.mensagem.id })).json() as RespostaBusca;
    expect(p2.resultados).toHaveLength(5);
    expect(p2.mais).toBe(false);
  });

  it('A7: a 11ª busca em 10 s da mesma pessoa recebe 429', async () => {
    const { ana, geral, buscar } = await preparar();
    const codigos = [];
    for (let i = 0; i < 11; i++) codigos.push((await buscar(ana.token, { q: 'xx', onde: 'conversa', canalId: geral })).statusCode);
    expect(codigos.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codigos[10]).toBe(429);
  });

  it('A15: o termo procurado não vai para o log', async () => {
    const linhas: string[] = [];
    app = await construirApp({ ...configTeste({ LOG: 'true' }), logDestino: { write: (l: string) => void linhas.push(l) } });
    const ana = (await cadastrar(app, 'ana')).json() as { token: string };
    await app.inject({ method: 'POST', url: '/api/busca', headers: auth(ana.token), payload: { q: 'minhasenhasecreta', onde: 'servidor' } });
    expect(linhas.join('\n')).toContain('/api/busca');
    expect(linhas.join('\n')).not.toContain('minhasenhasecreta');
  });

  it('CA-16: 100 mil mensagens em 5 servidores e 50 DMs: cada busca abaixo de 500 ms', async () => {
    const { dono, ana, buscar } = await preparar();
    const banco = app!.banco;
    const canais: number[] = [];
    for (let c = 2; c <= 5; c++)
      banco.prepare('INSERT INTO comunidades (id, nome, dono_id, criado_em) VALUES (?, ?, ?, ?)').run(c, `s${c}`, dono.usuario.id, Date.now());
    for (let c = 1; c <= 5; c++) for (let k = 0; k < 4; k++) canais.push(criarCanal(banco, 'texto', `c${c}-${k}`, dono.usuario.id, Date.now(), c).id);
    const outros: number[] = [];
    for (let i = 0; i < 50; i++) {
      const u = banco
        .prepare("INSERT INTO usuarios (usuario, usuario_norm, senha_hash, nome_exibicao, cor, cargo, criado_em) VALUES (?, ?, 'x', ?, '#fff', 'membro', ?)")
        .run(`p${i}`, `p${i}`, `P${i}`, Date.now());
      outros.push(Number(u.lastInsertRowid));
      // Membros do servidor principal: as DMs com eles aparecem aqui (e entram na busca "dms").
      banco.prepare("INSERT INTO membros (comunidade_id, usuario_id, cargo, entrou_em) VALUES (1, ?, 'membro', ?)").run(Number(u.lastInsertRowid), Date.now());
    }
    const dms = outros.map((o) => abrirDm(banco, ana.usuario.id, o));
    const palavras = ['de', 'jogo', 'abacate', 'churrasco', 'amanhã', 'você', 'partida', 'filme', 'ok', 'vamos', 'hoje', 'noite'];
    const ins = banco.prepare('INSERT INTO mensagens (canal_id, dm_id, autor_id, texto, criada_em) VALUES (?, ?, ?, ?, ?)');
    banco.transaction(() => {
      for (let i = 0; i < 100_000; i++) {
        const texto = Array.from({ length: 6 }, (_, k) => palavras[(i * 7 + k * 13) % palavras.length]).join(' ');
        if (i % 5 === 0) ins.run(null, dms[i % dms.length], ana.usuario.id, texto, i);
        else ins.run(canais[i % canais.length], null, dono.usuario.id, texto, i);
      }
    })();
    // Anexos raros (no começo): o filtro sem texto precisa varrer até eles (uma DM e um canal do servidor principal).
    const alvos = [
      banco.prepare('SELECT id FROM mensagens WHERE dm_id IS NOT NULL ORDER BY id LIMIT 1').get() as { id: number },
      banco.prepare('SELECT id FROM mensagens WHERE canal_id = ? ORDER BY id LIMIT 1').get(canais[1]) as { id: number },
    ];
    for (const [i, alvo] of alvos.entries()) {
      banco
        .prepare(
          "INSERT INTO anexos (id, mensagem_id, autor_id, tipo, mime, nome_original, bytes, arquivo, criado_em) VALUES (?, ?, ?, 'documento', 'text/plain', 'a.txt', 1, ?, 1)",
        )
        .run(`z${i}`, alvo.id, ana.usuario.id, `z${i}`);
    }
    const pedidos: PedidoBusca[] = [
      { q: 'de', onde: 'servidor' },
      { q: 'jogo', onde: 'servidor' },
      { q: 'de jogo ok vamos hoje noite filme partida', onde: 'servidor' },
      { onde: 'dms', comAnexo: true },
      { onde: 'servidor', comAnexo: true },
      { q: 'churrasco', onde: 'dms' },
    ];
    for (const p of pedidos) {
      const inicio = performance.now();
      const r = await buscar(ana.token, p);
      expect(r.statusCode).toBe(200);
      expect(performance.now() - inicio).toBeLessThan(500);
      // As buscas de DM e de anexo passam pelo banco de verdade (não por um escopo vazio).
      if (p.onde === 'dms' || p.comAnexo) expect((r.json() as RespostaBusca).resultados.length).toBeGreaterThan(0);
    }
  }, 120_000);
});
