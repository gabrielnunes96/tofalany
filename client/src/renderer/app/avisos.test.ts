import { describe, expect, it } from 'vitest';
import { avisoDeRevogacao } from './avisos';

describe('avisoDeRevogacao', () => {
  it('não avisa quando a própria pessoa saiu; avisa nos outros casos', () => {
    expect(avisoDeRevogacao('saiu')).toBeUndefined();
    expect(avisoDeRevogacao('sessao_invalida')).toBe('Sua sessão foi encerrada. Entre de novo.');
    expect(avisoDeRevogacao('conta_removida')).toBe('Sua conta foi removida deste servidor.');
  });

  it('expulso e banido: nome do servidor e motivo, quando houver', () => {
    expect(avisoDeRevogacao('expulso', 'flood', 'Turma')).toBe('Você foi expulso de Turma. Motivo: flood Para voltar, peça um convite.');
    expect(avisoDeRevogacao('banido', null)).toBe('Você foi banido do servidor.');
  });
});
