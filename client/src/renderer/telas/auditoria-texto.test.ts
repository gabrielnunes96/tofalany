import { describe, expect, it } from 'vitest';
import type { RegistroAuditoriaDto } from '@tofalando/shared';
import { descreverRegistro, limiteDoDia } from './auditoria-texto';

const base: RegistroAuditoriaDto = { id: 1, quando: 0, tipo: 'login', ator: { id: 1, nome: 'ana' }, alvo: null, canal: null, detalhes: {} };

describe('descreverRegistro', () => {
  it('monta a frase com pessoa, evento, alvo, canal e detalhes', () => {
    expect(descreverRegistro(base)).toBe('ana entrou com usuário e senha');
    expect(descreverRegistro({ ...base, tipo: 'cargo_alterado', alvo: { id: 2, nome: 'bia' }, detalhes: { cargo: 'admin' } })).toBe(
      'ana alterou o cargo de bia (cargo: admin)',
    );
    expect(descreverRegistro({ ...base, tipo: 'voz_entrou', canal: { id: 3, nome: 'Geral' } })).toBe('ana entrou no canal de voz "Geral"');
    expect(descreverRegistro({ ...base, tipo: 'offline', detalhes: { motivo: 'servidor_parou' } })).toBe('ana ficou offline (servidor desligado)');
    expect(descreverRegistro({ ...base, tipo: 'senha_redefinida', ator: null, alvo: { id: 2, nome: 'bia' } })).toBe(
      'Host (comando no servidor) redefiniu a senha de bia',
    );
  });
});

describe('limiteDoDia', () => {
  it('início e fim do dia local; vazio dá undefined', () => {
    expect(limiteDoDia('2026-11-05', false)).toBe(new Date(2026, 10, 5).getTime());
    expect(limiteDoDia('2026-11-05', true)).toBe(new Date(2026, 10, 5, 23, 59, 59, 999).getTime());
    expect(limiteDoDia('', false)).toBeUndefined();
  });
});
