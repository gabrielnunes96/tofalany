import { describe, expect, it } from 'vitest';
import { abrirBanco } from '../src/db/banco.js';
import { lerConfig } from '../src/config.js';

/** audios-na-loja, T1: migração 024 e preços por raridade (CA-14). */
const config = (extra: Record<string, string> = {}) => lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: 'c', TENTATIVAS_POR_MINUTO: '1000', ...extra });

describe('base dos áudios da loja', () => {
  it('migração 024: tabelas, raridade conferida pelo banco e posse única por pessoa', () => {
    const banco = abrirBanco(':memory:');
    banco.prepare("INSERT INTO usuarios (id, usuario, senha_hash, nome_exibicao, cor, cargo, criado_em) VALUES (1, 'ana', 'x', 'ana', '#00f0ff', 'membro', 0)").run();
    const inserir = (raridade: string) =>
      banco.prepare("INSERT INTO loja_audios (nome, arquivo, duracao_ms, raridade, criado_por, criado_em) VALUES ('a', 'x.mp3', 1000, ?, 1, 0)").run(raridade);
    expect(() => inserir('mitico')).toThrow();
    const id = Number(inserir('raro').lastInsertRowid);
    banco.prepare('INSERT INTO loja_audios_compras (usuario_id, audio_id, comprado_em) VALUES (1, ?, 0)').run(id);
    expect(() => banco.prepare('INSERT INTO loja_audios_compras (usuario_id, audio_id, comprado_em) VALUES (1, ?, 0)').run(id)).toThrow();
  });

  it('CA-14: preços padrão por raridade, ajustáveis; zero não vale', () => {
    expect(config().pontos.precos.audios).toEqual({ comum: 100, raro: 300, epico: 800, lendario: 2000 });
    expect(config({ PRECO_AUDIO_RARO: '250' }).pontos.precos.audios.raro).toBe(250);
    expect(() => config({ PRECO_AUDIO_RARO: '0' })).toThrow();
  });
});
