import { describe, expect, it, vi } from 'vitest';
import { naoLidasDosOutros } from './naolidas-servidores';

describe('naoLidasDosOutros (backlog v2)', () => {
  it('consulta só os outros servidores com sessão e guarda os que têm não lidas', async () => {
    const servidores = [{ url: 'https://a.io' }, { url: 'https://b.io' }, { url: 'https://c.io' }, { url: 'https://d.io' }, { url: 'https://e.io' }];
    const lerToken = vi.fn(async (url: string) => (url === 'https://c.io' ? null : `tok-${url}`));
    const consultar = vi.fn(async (url: string) => {
      if (url === 'https://d.io') throw new Error('fora do ar');
      return { total: url === 'https://b.io' ? 4 : 0 };
    });
    expect(await naoLidasDosOutros(servidores, 'https://a.io', lerToken, consultar)).toEqual({ 'https://b.io': 4 });
    expect(consultar).not.toHaveBeenCalledWith('https://a.io', expect.anything());
    expect(consultar).not.toHaveBeenCalledWith('https://c.io', expect.anything());
    expect(consultar).toHaveBeenCalledWith('https://b.io', 'tok-https://b.io');
  });
});
