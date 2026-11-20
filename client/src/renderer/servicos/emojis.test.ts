// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import dados from 'emojibase-data/pt/compact.json';
import { validarEmojiReacao } from '@tofalando/shared';
import { buscarEmojis, guardarRecente, lerRecentes, montarGrupos, RECENTES_MAX, semAcento, type DadoEmoji } from './emojis';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const grupos = montarGrupos(dados as unknown as DadoEmoji[]);

describe('emojis do seletor (T4)', () => {
  it('categorias em português, sem os componentes; todos os itens passam na validação do servidor', () => {
    expect(grupos.map((g) => g.nome)).toEqual(['Carinhas e emoções', 'Pessoas', 'Animais e natureza', 'Comida e bebida', 'Viagens e lugares', 'Atividades', 'Objetos', 'Símbolos', 'Bandeiras']);
    const todos = grupos.flatMap((g) => g.emojis.map((e) => e.emoji));
    expect(todos.length).toBeGreaterThan(1800);
    expect(todos.every(validarEmojiReacao)).toBe(true);
    expect(todos).toContain('❤️');
    expect(todos).not.toContain('🏽');
  });

  it('busca em português, sem acento, nome primeiro', () => {
    expect(semAcento('Coração')).toBe('coracao');
    expect(buscarEmojis(grupos, 'joinha')[0]!.emoji).toBe('👍');
    expect(buscarEmojis(grupos, 'kkk').map((e) => e.emoji)).toContain('😂');
    expect(buscarEmojis(grupos, 'joia').map((e) => e.emoji)).toContain('👍');
    expect(buscarEmojis(grupos, 'polegar para cima')[0]!.emoji).toBe('👍');
    expect(buscarEmojis(grupos, 'coracao vermelho')[0]!.emoji).toBe('❤️');
    expect(buscarEmojis(grupos, 'brasil').map((e) => e.emoji)).toContain('🇧🇷');
    expect(buscarEmojis(grupos, '   ')).toEqual([]);
    expect(buscarEmojis(grupos, 'xyzqwk')).toEqual([]);
    expect(buscarEmojis(grupos, 'a', 10)).toHaveLength(10);
  });

  it('recentes: o mais novo primeiro, sem repetir, até 16; armazenamento indisponível não quebra', () => {
    expect(lerRecentes()).toEqual([]);
    guardarRecente('👍');
    guardarRecente('😂');
    guardarRecente('👍');
    expect(lerRecentes()).toEqual(['👍', '😂']);
    const muitos = [...'😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙😚'];
    for (const e of muitos) guardarRecente(e);
    expect(lerRecentes()).toHaveLength(RECENTES_MAX);
    expect(lerRecentes()[0]).toBe('😚');
    localStorage.setItem('tofalany:emojis-recentes', '["abc", "🔥", 3]');
    expect(lerRecentes()).toEqual(['🔥']);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(lerRecentes()).toEqual([]);
    expect(() => guardarRecente('👍')).not.toThrow();
  });
});
