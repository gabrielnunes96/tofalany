import { GIF_FILTRO, GIF_POR_PAGINA, type GifConfig, type GifDto } from '@tofalando/shared';

/** Um GIF na grade do painel: miniatura leve para a grade, versão média para o chat. */
export interface GifResultado {
  slug: string;
  descricao: string;
  miniatura: { url: string; largura: number; altura: number };
  /** O que vai na mensagem. */
  gif: GifDto;
  /** Imagem borrada minúscula (data URL) para o fundo enquanto a miniatura carrega. */
  borrada?: string;
}

export interface PaginaGifs {
  itens: GifResultado[];
  temMais: boolean;
}

type Buscar = typeof fetch;
const TEMPO_MS = 8000;

interface Formato {
  url?: unknown;
  width?: unknown;
  height?: unknown;
}
interface ItemKlipy {
  slug?: unknown;
  title?: unknown;
  type?: unknown;
  blur_preview?: unknown;
  file?: Record<string, Record<string, Formato> | undefined>;
}

/** Só uma imagem embutida de verdade (vai num `url()` do CSS: nada de outro endereço junto). */
const BORRADA = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const lado = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined);
function formato(item: ItemKlipy, tamanho: string): { url: string; largura: number; altura: number } | undefined {
  const f = item.file?.[tamanho]?.webp;
  if (!f || typeof f.url !== 'string') return undefined;
  const largura = lado(f.width);
  const altura = lado(f.height);
  return largura && altura ? { url: f.url, largura, altura } : undefined;
}

/** Converte a resposta da Klipy ({ result, data: { data, has_next } }); itens sem as versões em webp ficam de fora. */
export function lerPagina(json: unknown): PaginaGifs {
  const dados = (json as { data?: { data?: unknown; has_next?: unknown } } | null)?.data;
  const lista = Array.isArray(dados?.data) ? (dados.data as ItemKlipy[]) : [];
  const itens: GifResultado[] = [];
  for (const item of lista) {
    // Anúncios ficam desligados na chave; se vier algum, não é um GIF para enviar.
    if (item.type !== undefined && item.type !== 'gif') continue;
    if (typeof item.slug !== 'string') continue;
    // Miniatura: sm (xs se faltar). No chat vai sempre a versão média (RN-8): sem ela, o item fica de fora.
    const mini = formato(item, 'sm') ?? formato(item, 'xs');
    const media = formato(item, 'md');
    if (!mini || !media) continue;
    const descricao = typeof item.title === 'string' ? item.title.trim() : '';
    itens.push({
      slug: item.slug,
      descricao,
      miniatura: mini,
      gif: { slug: item.slug, url: media.url, largura: media.largura, altura: media.altura, descricao },
      ...(typeof item.blur_preview === 'string' && BORRADA.test(item.blur_preview) ? { borrada: item.blur_preview } : {}),
    });
  }
  return { itens, temMais: dados?.has_next === true };
}

/** Chamadas à Klipy, feitas pelo app (os termos pedem que não passem pelo servidor). */
export function criarKlipy(config: GifConfig, buscar: Buscar = fetch) {
  const raiz = `${config.base}/api/v1/${encodeURIComponent(config.chave)}/gifs`;
  async function pagina(caminho: 'trending' | 'search', pagina: number, q?: string): Promise<PaginaGifs> {
    const params = new URLSearchParams({ page: String(pagina), per_page: String(GIF_POR_PAGINA), customer_id: config.cliente, locale: 'br', content_filter: GIF_FILTRO, format_filter: 'webp' });
    if (q !== undefined) params.set('q', q);
    const r = await buscar(`${raiz}/${caminho}?${params}`, { signal: AbortSignal.timeout(TEMPO_MS) });
    if (!r.ok) throw new Error(`Klipy respondeu ${r.status}`);
    return lerPagina(await r.json());
  }
  return {
    emAlta: (n = 1) => pagina('trending', n),
    buscar: (q: string, n = 1) => pagina('search', n, q),
    /** Registro de envio que os termos pedem; `q` vazio quando o GIF veio dos em alta. Falha não incomoda ninguém. */
    compartilhar: (slug: string, q: string) =>
      buscar(`${raiz}/share/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: config.cliente, q }),
        signal: AbortSignal.timeout(TEMPO_MS),
      }).then(
        () => undefined,
        () => undefined,
      ),
  };
}

export type Klipy = ReturnType<typeof criarKlipy>;
