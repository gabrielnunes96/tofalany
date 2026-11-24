import { describe, expect, it, vi } from 'vitest';
import { registrarSaidaVoz, sairDaVozAntesDeAtualizar } from './saida-voz';

describe('saída da voz antes de atualizar', () => {
  it('sem voz, resolve na hora', async () => {
    await expect(sairDaVozAntesDeAtualizar()).resolves.toBeUndefined();
  });

  it('chama a saída registrada e espera ela terminar; depois de desregistrar, não chama mais', async () => {
    const ordem: string[] = [];
    const sair = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      ordem.push('saiu');
    });
    const tirar = registrarSaidaVoz(sair);
    await sairDaVozAntesDeAtualizar();
    ordem.push('instalar');
    expect(ordem).toEqual(['saiu', 'instalar']);
    tirar();
    await sairDaVozAntesDeAtualizar();
    expect(sair).toHaveBeenCalledTimes(1);
  });

  it('não fica preso: saída que não termina ou falha respeita o teto', async () => {
    const tirar1 = registrarSaidaVoz(() => new Promise(() => undefined));
    const tirar2 = registrarSaidaVoz(async () => {
      throw new Error('falhou');
    });
    const inicio = Date.now();
    await sairDaVozAntesDeAtualizar(50);
    expect(Date.now() - inicio).toBeLessThan(500);
    tirar1();
    tirar2();
  });
});
