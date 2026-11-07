import sharp from 'sharp';
import type { PreviaLink } from '@tofalando/shared';
import { buscarSeguro, type Resolver } from './rede-segura.js';

/** ID de um vídeo do YouTube (watch, youtu.be, shorts, embed, live), ou undefined. */
export function idYoutube(texto: string): string | undefined {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return undefined;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null | undefined;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined;
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodificar(texto: string): string {
  return texto
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (inteiro, e: string) => {
      if (e[0] === '#') {
        const n = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : inteiro;
      }
      return ENTIDADES[e.toLowerCase()] ?? inteiro;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lê as metatags OpenGraph/Twitter e o <title> do começo de uma página HTML. */
export function lerMetatags(html: string): { titulo?: string; descricao?: string; imagem?: string; site?: string } {
  const cabeca = html.slice(0, 200_000);
  const metas = new Map<string, string>();
  for (const tag of cabeca.match(/<meta\b[^>]*>/gi) ?? []) {
    const chave = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const valor = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (chave && valor !== undefined && !metas.has(chave)) metas.set(chave, decodificar(valor));
  }
  const titulo = metas.get('og:title') ?? metas.get('twitter:title') ?? (/<title[^>]*>([^<]*)<\/title>/i.exec(cabeca)?.[1] ? decodificar(/<title[^>]*>([^<]*)<\/title>/i.exec(cabeca)![1]!) : undefined);
  return {
    titulo: titulo?.slice(0, 200) || undefined,
    descricao: (metas.get('og:description') ?? metas.get('twitter:description') ?? metas.get('description'))?.slice(0, 300) || undefined,
    imagem: metas.get('og:image') ?? metas.get('twitter:image'),
    site: metas.get('og:site_name')?.slice(0, 80) || undefined,
  };
}

/** Miniatura reduzida (até 480 px de largura, webp) embutida como data: — a janela não acessa o site. */
async function miniatura(url: string | undefined, base: string, resolver?: Resolver): Promise<string | undefined> {
  if (!url) return undefined;
  let absoluta: string;
  try {
    absoluta = new URL(url, base).toString();
  } catch {
    return undefined;
  }
  const r = await buscarSeguro(absoluta, { limite: 3 * 1024 * 1024, aceitar: 'image/*', resolver });
  if (!r || !/^image\/(jpeg|png|webp|gif)/.test(r.tipo)) return undefined;
  try {
    const dados = await sharp(r.corpo, { animated: false }).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
    return `data:image/webp;base64,${dados.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** Prévia de um link: YouTube pelo oEmbed; o resto pelas metatags da página. */
export async function montarPrevia(url: string, resolver?: Resolver): Promise<PreviaLink | undefined> {
  const video = idYoutube(url);
  if (video) {
    const oembed = await buscarSeguro(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${video}`)}`, {
      limite: 64 * 1024,
      aceitar: 'application/json',
      resolver,
    });
    let titulo: string | undefined;
    let autor: string | undefined;
    if (oembed) {
      try {
        const j = JSON.parse(oembed.corpo.toString('utf8')) as { title?: unknown; author_name?: unknown };
        titulo = typeof j.title === 'string' ? j.title.slice(0, 200) : undefined;
        autor = typeof j.author_name === 'string' ? j.author_name.slice(0, 80) : undefined;
      } catch {
        // Sem título: o cartão sai só com a miniatura.
      }
    }
    const imagem = await miniatura(`https://i.ytimg.com/vi/${video}/hqdefault.jpg`, url, resolver);
    return { url, tipo: 'youtube', videoId: video, site: 'YouTube', titulo, descricao: autor, imagem };
  }
  const pagina = await buscarSeguro(url, { limite: 512 * 1024, resolver });
  if (!pagina || !pagina.tipo.includes('text/html')) return undefined;
  const meta = lerMetatags(pagina.corpo.toString('utf8'));
  if (!meta.titulo && !meta.descricao) return undefined;
  const imagem = await miniatura(meta.imagem, pagina.url, resolver);
  return { url, tipo: 'pagina', site: meta.site ?? new URL(pagina.url).hostname.replace(/^www\./, ''), titulo: meta.titulo, descricao: meta.descricao, imagem };
}

/** Cache simples em memória (1 h, até 300 links): o mesmo link no chat não é buscado de novo a cada tela. */
export function criarCachePrevias(montar: (url: string) => Promise<PreviaLink | undefined> = (u) => montarPrevia(u), agora = () => Date.now()) {
  const itens = new Map<string, { quando: number; valor: Promise<PreviaLink | undefined> }>();
  const VALIDADE = 60 * 60 * 1000;
  return (url: string): Promise<PreviaLink | undefined> => {
    const existente = itens.get(url);
    if (existente && agora() - existente.quando < VALIDADE) return existente.valor;
    const valor = montar(url).catch(() => undefined);
    itens.set(url, { quando: agora(), valor });
    if (itens.size > 300) itens.delete(itens.keys().next().value!);
    return valor;
  };
}
