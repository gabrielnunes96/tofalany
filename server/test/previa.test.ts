import { describe, expect, it, vi } from 'vitest';
import { buscarSeguro, ipPrivado, urlPublica } from '../src/previa/rede-segura.js';
import { criarCachePrevias, idYoutube, lerMetatags } from '../src/previa/previa.js';

const publico = async () => ['93.184.216.34'];
const privado = async () => ['10.0.0.5'];

describe('prévia de links (backlog v2, item 10b)', () => {
  it('reconhece links do YouTube', () => {
    expect(idYoutube('https://www.youtube.com/watch?v=TDmH-2Zs9_8')).toBe('TDmH-2Zs9_8');
    expect(idYoutube('https://youtu.be/EssuGzPA9iU?t=10')).toBe('EssuGzPA9iU');
    expect(idYoutube('https://youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk');
    expect(idYoutube('https://m.youtube.com/watch?v=abcdefghijk&list=x')).toBe('abcdefghijk');
    expect(idYoutube('https://www.youtube.com/@canal')).toBeUndefined();
    expect(idYoutube('https://youtube.com.mal.io/watch?v=abcdefghijk')).toBeUndefined();
  });

  it('lê título, descrição, imagem e site das metatags (com entidades)', () => {
    const html = `<html><head><title>Sem OG</title>
      <meta property="og:title" content="Tragédia &amp; vitória">
      <meta name="description" content="Resumo do jogo">
      <meta property="og:image" content="/capa.jpg"><meta property="og:site_name" content="Rádio">
    </head></html>`;
    expect(lerMetatags(html)).toEqual({ titulo: 'Tragédia & vitória', descricao: 'Resumo do jogo', imagem: '/capa.jpg', site: 'Rádio' });
    expect(lerMetatags('<title> Só o &#233; título </title>').titulo).toBe('Só o é título');
  });

  it('proteção da rede interna: só endereços públicos, HTTP(S), portas web', async () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.0.10', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0']) {
      expect(ipPrivado(ip)).toBe(true);
    }
    expect(ipPrivado('93.184.216.34')).toBe(false);
    expect(await urlPublica('https://exemplo.com/a', publico)).toBeInstanceOf(URL);
    expect(await urlPublica('https://exemplo.com/a', privado)).toBeUndefined();
    expect(await urlPublica('http://127.0.0.1:3000/api/saude', publico)).toBeUndefined();
    expect(await urlPublica('http://localhost/x', publico)).toBeUndefined();
    expect(await urlPublica('https://exemplo.com:7880/x', publico)).toBeUndefined();
    expect(await urlPublica('file:///etc/passwd', publico)).toBeUndefined();
    expect(await urlPublica('https://usuario:senha@exemplo.com/', publico)).toBeUndefined();
  });

  it('redirecionamento para a rede interna é barrado', async () => {
    const resolver = async (host: string) => (host === 'interno.exemplo' ? ['192.168.0.2'] : ['93.184.216.34']);
    const buscar = vi.fn(async (url: string | URL) =>
      String(url).includes('interno')
        ? new Response('segredo', { status: 200, headers: { 'content-type': 'text/html' } })
        : new Response(null, { status: 302, headers: { location: 'http://interno.exemplo/admin' } }),
    );
    expect(await buscarSeguro('https://exemplo.com/', { limite: 1024, resolver, buscar: buscar as unknown as typeof fetch })).toBeUndefined();
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('imagem maior que o limite é recusada; HTML grande é cortado no começo', async () => {
    const grande = new Uint8Array(4096).fill(65);
    const buscar = async (url: string | URL) =>
      new Response(grande, { status: 200, headers: { 'content-type': String(url).endsWith('.png') ? 'image/png' : 'text/html' } });
    const opcoes = { limite: 1024, resolver: publico, buscar: buscar as unknown as typeof fetch };
    expect(await buscarSeguro('https://exemplo.com/a.png', opcoes)).toBeUndefined();
    const html = await buscarSeguro('https://exemplo.com/', opcoes);
    expect(html?.corpo.length).toBeGreaterThan(0);
    expect(html!.corpo.length).toBeLessThanOrEqual(4096);
  });

  it('cache: o mesmo link não é buscado de novo dentro de 1 h', async () => {
    let t = 0;
    const montar = vi.fn(async (url: string) => ({ url, tipo: 'pagina' as const, titulo: 'x' }));
    const cache = criarCachePrevias(montar, () => t);
    await cache('https://a.io');
    await cache('https://a.io');
    expect(montar).toHaveBeenCalledTimes(1);
    t += 60 * 60 * 1000 + 1;
    await cache('https://a.io');
    expect(montar).toHaveBeenCalledTimes(2);
  });
});
