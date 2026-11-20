import { validarEmojiReacao } from '@tofalando/shared';

/** Um emoji do seletor: o caractere, o nome em português e o texto de busca (nome e palavras-chave sem acento). */
export interface Emoji {
  emoji: string;
  nome: string;
  busca: string[];
}

export interface GrupoEmojis {
  id: number;
  nome: string;
  emojis: Emoji[];
}

/** Formato dos dados de emoji em português (emojibase-data/pt/compact.json, só o que usamos). */
export interface DadoEmoji {
  group?: number;
  label: string;
  tags?: string[];
  unicode: string;
  order?: number;
}

/** Categorias na ordem dos dados; "componentes" (tons de pele sozinhos) e os sem grupo ficam de fora. */
const NOMES_GRUPO: Record<number, string> = {
  0: 'Carinhas e emoções',
  1: 'Pessoas',
  3: 'Animais e natureza',
  4: 'Comida e bebida',
  5: 'Viagens e lugares',
  6: 'Atividades',
  7: 'Objetos',
  8: 'Símbolos',
  9: 'Bandeiras',
};

/** Jeitos de falar daqui que os dados não trazem como palavra-chave. */
const APELIDOS: Record<string, string[]> = {
  '👍': ['joinha', 'blz', 'firmeza'],
  '😂': ['kkk', 'kkkk', 'rsrs', 'haha', 'rindo'],
  '🤣': ['kkk', 'kkkk', 'rolando de rir'],
  '❤️': ['s2', 'amo'],
  '🔥': ['top', 'brabo'],
  '😭': ['chorando'],
  '🙏': ['obrigado', 'por favor', 'amem'],
  '👏': ['parabens', 'palmas'],
  '😡': ['bravo', 'raiva'],
  '🤔': ['pensando', 'hmm'],
};

export const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Agrupa e ordena; só entra o que o servidor aceita como reação (validarEmojiReacao). */
export function montarGrupos(dados: readonly DadoEmoji[]): GrupoEmojis[] {
  const grupos = new Map<number, GrupoEmojis>();
  const ordenados = [...dados].filter((d) => d.group !== undefined && d.group in NOMES_GRUPO).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const d of ordenados) {
    if (!validarEmojiReacao(d.unicode)) continue;
    const id = d.group!;
    let g = grupos.get(id);
    if (!g) grupos.set(id, (g = { id, nome: NOMES_GRUPO[id]!, emojis: [] }));
    g.emojis.push({ emoji: d.unicode, nome: d.label, busca: [semAcento(d.label), ...[...(d.tags ?? []), ...(APELIDOS[d.unicode] ?? [])].map(semAcento)] });
  }
  return [...grupos.values()].sort((a, b) => a.id - b.id);
}

/**
 * Busca por nome e palavras-chave, sem acento: primeiro quem começa pelo termo, depois quem tem uma palavra
 * começando por ele, depois quem o contém. Até `max` resultados.
 */
export function buscarEmojis(grupos: readonly GrupoEmojis[], termo: string, max = 64): Emoji[] {
  const t = semAcento(termo.trim());
  if (!t) return [];
  const pontos = (e: Emoji): number => {
    let melhor = 0;
    for (const [i, b] of e.busca.entries()) {
      const peso = i === 0 ? 1 : 0;
      if (b.startsWith(t)) melhor = Math.max(melhor, 6 + peso);
      else if (b.split(/[\s:-]+/).some((p) => p.startsWith(t))) melhor = Math.max(melhor, 4 + peso);
      else if (b.includes(t)) melhor = Math.max(melhor, 2 + peso);
    }
    return melhor;
  };
  const achados: { e: Emoji; p: number; i: number }[] = [];
  let i = 0;
  for (const g of grupos) for (const e of g.emojis) {
    const p = pontos(e);
    if (p > 0) achados.push({ e, p, i });
    i++;
  }
  return achados
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, max)
    .map((a) => a.e);
}

let carga: Promise<GrupoEmojis[]> | null = null;

/** Os dados (cerca de 600 KB) só vêm na primeira vez que alguém abre o seletor. */
export function carregarEmojis(): Promise<GrupoEmojis[]> {
  carga ??= import('emojibase-data/pt/compact.json')
    .then((m) => montarGrupos((m.default ?? m) as unknown as DadoEmoji[]))
    .catch((e: unknown) => {
      carga = null;
      throw e;
    });
  return carga;
}

const CHAVE_RECENTES = 'tofalany:emojis-recentes';
export const RECENTES_MAX = 16;

/** Usados recentemente (deste aparelho), do mais novo para o mais antigo. Sem armazenamento, lista vazia. */
export function lerRecentes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter(validarEmojiReacao).slice(0, RECENTES_MAX) : [];
  } catch {
    return [];
  }
}

export function guardarRecente(emoji: string): void {
  try {
    const lista = [emoji, ...lerRecentes().filter((e) => e !== emoji)].slice(0, RECENTES_MAX);
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}
