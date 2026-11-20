import { describe, expect, it, vi } from 'vitest';
import { criarKlipy, lerPagina } from './gif';

const config = { chave: 'chave-xyz', base: 'https://api.klipy.com', cliente: 'abc123' };
const fmt = (url: string, w = 220, h = 124) => ({ webp: { url, width: w, height: h, size: 10 } });
export const itemKlipy = (slug: string, titulo = slug) => ({
  id: 1,
  slug,
  title: titulo,
  type: 'gif',
  blur_preview: 'data:image/jpeg;base64,AAAA',
  file: { sm: fmt(`https://static.klipy.com/${slug}-sm.webp`), md: fmt(`https://static.klipy.com/${slug}-md.webp`, 498, 280), xs: fmt(`https://static.klipy.com/${slug}-xs.webp`, 90, 50) },
});

describe('serviço da Klipy (T3)', () => {
  it('converte a resposta documentada: miniatura sm, GIF md, descrição, fundo borrado, próxima página', () => {
    const p = lerPagina({ result: true, data: { data: [itemKlipy('gato-1', ' Gato '), { ...itemKlipy('anuncio'), type: 'ad' }, { slug: 'sem-arquivo', file: {} }], current_page: 1, per_page: 24, has_next: true } });
    expect(p.temMais).toBe(true);
    expect(p.itens).toHaveLength(1);
    expect(p.itens[0]).toEqual({
      slug: 'gato-1',
      descricao: 'Gato',
      miniatura: { url: 'https://static.klipy.com/gato-1-sm.webp', largura: 220, altura: 124 },
      gif: { slug: 'gato-1', url: 'https://static.klipy.com/gato-1-md.webp', largura: 498, altura: 280, descricao: 'Gato' },
      borrada: 'data:image/jpeg;base64,AAAA',
    });
    expect(lerPagina(null)).toEqual({ itens: [], temMais: false });
    // Fundo borrado só como imagem embutida; sem a versão média, o item fica de fora (o chat usa a média).
    const outroFundo = { ...itemKlipy('x'), blur_preview: 'data:image/x"), url("https://outro.host/r' };
    expect(lerPagina({ data: { data: [outroFundo] } }).itens[0]!.borrada).toBeUndefined();
    const semMedia = { ...itemKlipy('y'), file: { sm: itemKlipy('y').file.sm } };
    expect(lerPagina({ data: { data: [semMedia] } }).itens).toEqual([]);
  });

  it('em alta e busca: chave no caminho, cliente, filtro médio, português, só webp', async () => {
    const buscar = vi.fn(async () => new Response(JSON.stringify({ result: true, data: { data: [], has_next: false } })));
    const k = criarKlipy(config, buscar as unknown as typeof fetch);
    await k.emAlta(2);
    await k.buscar('gato preto', 1);
    const [alta, busca] = buscar.mock.calls.map((c) => new URL((c as unknown as [string])[0]));
    expect(alta!.pathname).toBe('/api/v1/chave-xyz/gifs/trending');
    expect(Object.fromEntries(alta!.searchParams)).toEqual({ page: '2', per_page: '24', customer_id: 'abc123', locale: 'br', content_filter: 'medium', format_filter: 'webp' });
    expect(busca!.pathname).toBe('/api/v1/chave-xyz/gifs/search');
    expect(busca!.searchParams.get('q')).toBe('gato preto');
    // Todo pedido tem prazo (sem resposta em 8 s, o painel avisa que está indisponível).
    expect((buscar.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('erro HTTP vira falha', async () => {
    const k = criarKlipy(config, (async () => new Response('x', { status: 503 })) as unknown as typeof fetch);
    await expect(k.emAlta()).rejects.toThrow();
  });

  it('CA-10: compartilhar manda customer_id e q; falha não estoura', async () => {
    const buscar = vi.fn(async () => new Response('{}'));
    const k = criarKlipy(config, buscar as unknown as typeof fetch);
    await k.compartilhar('gato-1', 'gato');
    const [url, opcoes] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.klipy.com/api/v1/chave-xyz/gifs/share/gato-1');
    expect(opcoes.method).toBe('POST');
    expect(JSON.parse(opcoes.body as string)).toEqual({ customer_id: 'abc123', q: 'gato' });
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);
    const falha = criarKlipy(config, (async () => Promise.reject(new Error('rede'))) as unknown as typeof fetch);
    await expect(falha.compartilhar('x', '')).resolves.toBeUndefined();
  });
});
