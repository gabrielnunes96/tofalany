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
const agora = () => new Date('2026-11-20T15:04:05Z');

describe('registro em arquivo (correcoes-atividade, T-3)', () => {
  it('grava uma linha com data, área e motivo; cria a pasta se não existir', () => {
    const pasta = join(pastaNova(), 'logs');
    const registrar = criarRegistro(pasta, { agora });
    registrar('atividade', 'jogo: tempo esgotado');
    expect(readFileSync(join(pasta, 'tofalany.log'), 'utf8')).toBe('2026-11-20T15:04:05.000Z atividade: jogo: tempo esgotado\n');
  });

  it('não repete a mesma linha seguida; motivo novo grava, e voltar ao anterior grava de novo', () => {
    const pasta = pastaNova();
    const registrar = criarRegistro(pasta, { agora });
    registrar('atividade', 'jogo: tempo esgotado');
    registrar('atividade', 'jogo: tempo esgotado');
    registrar('atividade', 'musica: sem dbus');
    registrar('atividade', 'jogo: tempo esgotado');
    const linhas = readFileSync(join(pasta, 'tofalany.log'), 'utf8').trim().split('\n');
    expect(linhas.map((l) => l.slice(25))).toEqual(['atividade: jogo: tempo esgotado', 'atividade: musica: sem dbus', 'atividade: jogo: tempo esgotado']);
  });

  it('acima do limite vira tofalany.old.log (só um antigo) e recomeça', () => {
    const pasta = pastaNova();
    writeFileSync(join(pasta, 'tofalany.old.log'), 'bem velho\n');
    writeFileSync(join(pasta, 'tofalany.log'), 'x'.repeat(200));
    const registrar = criarRegistro(pasta, { agora, maxBytes: 100 });
    registrar('atividade', 'musica: erro 1');
    expect(readFileSync(join(pasta, 'tofalany.old.log'), 'utf8')).toBe('x'.repeat(200));
    expect(readFileSync(join(pasta, 'tofalany.log'), 'utf8')).toBe('2026-11-20T15:04:05.000Z atividade: musica: erro 1\n');
  });

  it('falha ao gravar (pasta impossível) não derruba quem registrou', () => {
    const arquivo = join(pastaNova(), 'um-arquivo');
    writeFileSync(arquivo, '');
    const registrar = criarRegistro(join(arquivo, 'logs'), { agora });
    expect(() => registrar('atividade', 'jogo: erro')).not.toThrow();
    expect(existsSync(join(arquivo, 'logs'))).toBe(false);
  });
});
