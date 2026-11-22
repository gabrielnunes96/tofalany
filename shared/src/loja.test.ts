import { describe, expect, it } from 'vitest';
import { chaveItem, lerItemLoja } from './loja.js';

describe('loja: item de áudio (audios-na-loja)', () => {
  it('lê só ids inteiros positivos; preço e raridade do pedido nunca entram', () => {
    expect(lerItemLoja({ tipo: 'audio', audioId: 12, preco: 1, raridade: 'comum' })).toEqual({ tipo: 'audio', audioId: 12 });
    expect(lerItemLoja({ tipo: 'audio', audioId: 0 })).toBeNull();
    expect(lerItemLoja({ tipo: 'audio', audioId: 1.5 })).toBeNull();
    expect(lerItemLoja({ tipo: 'audio', audioId: '3' })).toBeNull();
  });
  it('chave no extrato', () => {
    expect(chaveItem({ tipo: 'audio', audioId: 12 })).toBe('audio:12');
    expect(chaveItem({ tipo: 'tema', tema: 'cinzas' })).toBe('tema:cinzas');
  });
});
