/**
 * organizar-a-tela: largura das colunas e pastas de servidores, guardadas no computador. Funções puras: a coluna de
 * servidores e as Configurações usam as mesmas regras, e o processo principal valida o que vem do arquivo.
 */

/** Largura das colunas de canais e de membros (px). */
export interface LarguraColunas {
  canais?: number;
  membros?: number;
}

/** Pasta de servidores: os de dentro ficam juntos na lista, e a pasta aparece no lugar do primeiro. */
export interface PastaServidores {
  id: string;
  nome: string;
  cor: string;
  aberta: boolean;
  urls: string[];
}

/** RN-1: limites e padrões das colunas. */
export const COLUNA_CANAIS = { min: 180, max: 400, padrao: 250 } as const;
export const COLUNA_MEMBROS = { min: 180, max: 360, padrao: 220 } as const;
export const CONVERSA_MINIMA = 360;
/** RN-3: passo das setas na divisória. */
export const PASSO_DIVISORIA = 10;
/** Cores que a pasta pode ter (mesma família das cores de cargo). */
export const CORES_PASTA = ['#7c6cff', '#22e4f2', '#3ddc84', '#ffb020', '#ff5d8f', '#ff7a45', '#a0a0b8', '#4f8cff'] as const;
export const MAX_PASTAS = 20;
export const NOME_PASTA_MAX = 30;

/**
 * RN-1 (CA-2): limites de uma coluna para a janela atual. A outra coluna está com `outra` px (0 se escondida) e a
 * coluna de servidores com `fixo` px; a conversa nunca fica com menos de 360 px.
 */
export function limitesColunas(qual: 'canais' | 'membros', larguraJanela: number, outra: number, fixo = 0) {
  const base = qual === 'canais' ? COLUNA_CANAIS : COLUNA_MEMBROS;
  const sobra = larguraJanela - fixo - outra - CONVERSA_MINIMA;
  return { min: base.min, max: Math.max(base.min, Math.min(base.max, sobra)) };
}

export const limitar = (v: number, l: { min: number; max: number }) => Math.round(Math.min(l.max, Math.max(l.min, v)));

/** Lê as larguras do arquivo: inteiros dentro dos limites da RN-1; o resto fica no padrão. */
export function mesclarColunas(bruto: unknown): LarguraColunas {
  const r: LarguraColunas = {};
  if (!bruto || typeof bruto !== 'object') return r;
  const o = bruto as Record<string, unknown>;
  for (const [chave, l] of [
    ['canais', COLUNA_CANAIS],
    ['membros', COLUNA_MEMBROS],
  ] as const) {
    const v = o[chave];
    if (typeof v === 'number' && Number.isFinite(v)) r[chave] = limitar(v, l);
  }
  return r;
}

/** Lê as pastas do arquivo: nome, cor da lista, urls em texto; normalizar depois tira o que não existe. */
export function mesclarPastas(bruto: unknown): PastaServidores[] {
  if (!Array.isArray(bruto)) return [];
  const r: PastaServidores[] = [];
  for (const item of bruto.slice(0, MAX_PASTAS)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string' || !/^[\w-]{1,40}$/.test(o.id) || !Array.isArray(o.urls)) continue;
    const nome = typeof o.nome === 'string' ? o.nome.trim().slice(0, NOME_PASTA_MAX) : '';
    const cor = typeof o.cor === 'string' && (CORES_PASTA as readonly string[]).includes(o.cor) ? o.cor : CORES_PASTA[0];
    const urls = o.urls.filter((u): u is string => typeof u === 'string' && u.length <= 300);
    r.push({ id: o.id, nome, cor, aberta: o.aberta === true, urls });
  }
  return r;
}

/**
 * RN-4, RN-8: deixa tudo coerente. Só urls que estão na lista, cada uma numa pasta só; pasta com menos de dois
 * servidores se desfaz; os de uma pasta ficam juntos, no lugar do primeiro. Devolve a ordem nova e as pastas.
 */
export function normalizarPastas(urls: string[], pastas: PastaServidores[]): { urls: string[]; pastas: PastaServidores[] } {
  const existem = new Set(urls);
  const usadas = new Set<string>();
  const limpas: PastaServidores[] = [];
  for (const p of pastas) {
    const dentro = urls.filter((u) => p.urls.includes(u) && !usadas.has(u));
    // Mantém a ordem guardada na pasta quando ela é válida (a ordem de dentro pode ser diferente da lista).
    const ordem = p.urls.filter((u) => existem.has(u) && dentro.includes(u));
    if (ordem.length < 2) continue;
    for (const u of ordem) usadas.add(u);
    limpas.push({ ...p, urls: ordem });
  }
  const resultado: string[] = [];
  const colocadas = new Set<string>();
  for (const u of urls) {
    if (colocadas.has(u)) continue;
    const p = limpas.find((x) => x.urls.includes(u));
    for (const v of p ? p.urls : [u]) {
      resultado.push(v);
      colocadas.add(v);
    }
  }
  return { urls: resultado, pastas: limpas };
}

/** Um item da coluna: um servidor solto ou uma pasta. */
export type ItemColuna = { tipo: 'servidor'; url: string } | { tipo: 'pasta'; pasta: PastaServidores };

/** A coluna como aparece: servidores soltos e pastas, na ordem (a lista já normalizada). */
export function itensColuna(urls: string[], pastas: PastaServidores[]): ItemColuna[] {
  const itens: ItemColuna[] = [];
  const vistas = new Set<string>();
  for (const u of urls) {
    const p = pastas.find((x) => x.urls.includes(u));
    if (!p) itens.push({ tipo: 'servidor', url: u });
    else if (!vistas.has(p.id)) {
      vistas.add(p.id);
      itens.push({ tipo: 'pasta', pasta: p });
    }
  }
  return itens;
}

export type Organizacao = { urls: string[]; pastas: PastaServidores[] };

const semUrl = (pastas: PastaServidores[], url: string) => pastas.map((p) => ({ ...p, urls: p.urls.filter((u) => u !== url) }));

/** RN-4: arrastar `url` sobre `alvo` (outro servidor solto) cria uma pasta com os dois, no lugar do alvo. */
export function criarPasta(o: Organizacao, url: string, alvo: string, id: string, nome = 'Pasta'): Organizacao {
  if (url === alvo || o.pastas.length >= MAX_PASTAS) return o;
  const pastas = semUrl(o.pastas, url);
  const urls = o.urls.filter((u) => u !== url);
  urls.splice(urls.indexOf(alvo) + 1, 0, url);
  return normalizarPastas(urls, [...pastas, { id, nome, cor: CORES_PASTA[pastas.length % CORES_PASTA.length]!, aberta: true, urls: [alvo, url] }]);
}

/** RN-4: arrastar `url` sobre a pasta soma o servidor a ela (no fim). */
export function somarAPasta(o: Organizacao, url: string, pastaId: string): Organizacao {
  const pastas = semUrl(o.pastas, url).map((p) => (p.id === pastaId ? { ...p, urls: [...p.urls, url] } : p));
  const alvo = pastas.find((p) => p.id === pastaId);
  if (!alvo) return o;
  const urls = o.urls.filter((u) => u !== url);
  const ultimo = alvo.urls.at(-2);
  urls.splice(ultimo ? urls.indexOf(ultimo) + 1 : urls.length, 0, url);
  return normalizarPastas(urls, pastas);
}

/** RN-4: tirar da pasta deixa o servidor solto logo depois dela (pasta com um só se desfaz). */
export function tirarDaPasta(o: Organizacao, url: string): Organizacao {
  const p = o.pastas.find((x) => x.urls.includes(url));
  if (!p) return o;
  const urls = o.urls.filter((u) => u !== url);
  const ultimo = p.urls.filter((u) => u !== url).at(-1);
  urls.splice(ultimo ? urls.indexOf(ultimo) + 1 : urls.length, 0, url);
  return normalizarPastas(urls, semUrl(o.pastas, url));
}

/** Chave de um item: a url do servidor solto ou `pasta:<id>`. */
export const chaveItemColuna = (i: ItemColuna) => (i.tipo === 'servidor' ? i.url : `pasta:${i.pasta.id}`);

/**
 * RN-5: muda a ordem de um item (servidor solto, servidor dentro de pasta ou pasta inteira) para antes de `antesDe`
 * (chave de um item da coluna; null = no fim). Servidor de dentro de pasta que vai para fora dela sai da pasta.
 */
export function moverItem(o: Organizacao, chave: string, antesDe: string | null): Organizacao {
  if (chave === antesDe) return o;
  const pasta = chave.startsWith('pasta:') ? o.pastas.find((p) => `pasta:${p.id}` === chave) : undefined;
  const bloco = pasta ? pasta.urls : [chave];
  let pastas = o.pastas;
  if (!pasta) pastas = semUrl(pastas, chave);
  const urls = o.urls.filter((u) => !bloco.includes(u));
  const destino = antesDe?.startsWith('pasta:') ? pastas.find((p) => `pasta:${p.id}` === antesDe)?.urls[0] : antesDe;
  const pos = destino ? urls.indexOf(destino) : -1;
  urls.splice(pos < 0 ? urls.length : pos, 0, ...bloco);
  return normalizarPastas(urls, pastas);
}

/** RN-7: mover para cima/baixo pelo menu (troca de lugar com o item vizinho). */
export function moverPasso(o: Organizacao, chave: string, passo: -1 | 1): Organizacao {
  const itens = itensColuna(o.urls, o.pastas).map(chaveItemColuna);
  const i = itens.indexOf(chave);
  if (i < 0) {
    // Servidor dentro de uma pasta: anda dentro dela.
    const p = o.pastas.find((x) => x.urls.includes(chave));
    if (!p) return o;
    const j = p.urls.indexOf(chave);
    const k = j + passo;
    if (k < 0 || k >= p.urls.length) return o;
    const dentro = [...p.urls];
    [dentro[j], dentro[k]] = [dentro[k]!, dentro[j]!];
    return normalizarPastas(o.urls, o.pastas.map((x) => (x.id === p.id ? { ...x, urls: dentro } : x)));
  }
  const alvo = i + passo;
  if (alvo < 0 || alvo >= itens.length) return o;
  return moverItem(o, chave, passo < 0 ? itens[alvo]! : (itens[alvo + 1] ?? null));
}
