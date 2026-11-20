import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { criarRegistro } from './registro';

const pastas: string[] = [];
const pastaNova = () => {
  const p = mkdtempSync(join(tmpdir(), 'registro-'));
  pastas.push(p);
  return p;
};
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});
const agora = () => new Date(2026, 10, 20, 15, 4, 5);

describe('registro em arquivo (correcoes-atividade, T-3)', () => {
  it('grava uma linha com data, área e motivo; cria a pasta se não existir', () => {
    const pasta = join(pastaNova(), 'logs');
    const registrar = criarRegistro(pasta, { agora });
    registrar('atividade', 'jogo: tempo esgotado');
    expect(readFileSync(join(pasta, 'tofalany.log'), 'utf8')).toBe('2026-11-20 15:04:05 atividade: jogo: tempo esgotado\n');
  });

  it('não repete a mesma linha seguida; motivo novo grava, e voltar ao anterior grava de novo', () => {
    const pasta = pastaNova();
    const registrar = criarRegistro(pasta, { agora });
    registrar('atividade', 'jogo: tempo esgotado');
    registrar('atividade', 'jogo: tempo esgotado');
    registrar('atividade', 'musica: sem dbus');
    registrar('atividade', 'jogo: tempo esgotado');
    const linhas = readFileSync(join(pasta, 'tofalany.log'), 'utf8').trim().split('\n');
    expect(linhas.map((l) => l.slice(20))).toEqual(['atividade: jogo: tempo esgotado', 'atividade: musica: sem dbus', 'atividade: jogo: tempo esgotado']);
  });

  it('acima do limite vira tofalany.old.log (só um antigo) e recomeça', () => {
    const pasta = pastaNova();
    writeFileSync(join(pasta, 'tofalany.old.log'), 'bem velho\n');
    writeFileSync(join(pasta, 'tofalany.log'), 'x'.repeat(200));
    const registrar = criarRegistro(pasta, { agora, maxBytes: 100 });
    registrar('atividade', 'musica: erro 1');
    expect(readFileSync(join(pasta, 'tofalany.old.log'), 'utf8')).toBe('x'.repeat(200));
    expect(readFileSync(join(pasta, 'tofalany.log'), 'utf8')).toBe('2026-11-20 15:04:05 atividade: musica: erro 1\n');
  });

  it('falha ao gravar (pasta impossível) não derruba quem registrou', () => {
    const arquivo = join(pastaNova(), 'um-arquivo');
    writeFileSync(arquivo, '');
    const registrar = criarRegistro(join(arquivo, 'logs'), { agora });
    expect(() => registrar('atividade', 'jogo: erro')).not.toThrow();
    expect(existsSync(join(arquivo, 'logs'))).toBe(false);
  });

  it('motivo com várias linhas vira uma linha só, cortada em 200 caracteres', () => {
    const pasta = pastaNova();
    criarRegistro(pasta, { agora })('atividade', `jogo: erro\nlinha solta\r\n${'y'.repeat(300)}`);
    const conteudo = readFileSync(join(pasta, 'tofalany.log'), 'utf8');
    expect(conteudo.split('\n')).toHaveLength(2);
    expect(conteudo.startsWith('2026-11-20 15:04:05 atividade: jogo: erro linha solta yyy')).toBe(true);
    expect(conteudo.trimEnd().length).toBe(20 + 200);
  });

  it('limite padrão de 1 MB: exatamente 1 MB não rotaciona; 1 MB + 1 byte rotaciona', () => {
    const pasta = pastaNova();
    writeFileSync(join(pasta, 'tofalany.log'), 'x'.repeat(1024 * 1024));
    const registrar = criarRegistro(pasta, { agora });
    registrar('atividade', 'a');
    expect(existsSync(join(pasta, 'tofalany.old.log'))).toBe(false);
    registrar('atividade', 'b');
    expect(existsSync(join(pasta, 'tofalany.old.log'))).toBe(true);
  });

  it('falha passageira ao gravar: a mesma linha é tentada de novo na próxima vez', () => {
    const base = pastaNova();
    const pasta = join(base, 'logs');
    writeFileSync(pasta, '');
    const registrar = criarRegistro(pasta, { agora });
    registrar('atividade', 'jogo: erro');
    rmSync(pasta);
    registrar('atividade', 'jogo: erro');
    expect(readFileSync(join(pasta, 'tofalany.log'), 'utf8')).toBe('2026-11-20 15:04:05 atividade: jogo: erro\n');
  });
});
