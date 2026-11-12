/**
 * Pontos e loja (docs/demandas/pontos-e-loja): catálogo, vales de transmissão e os contratos da loja.
 * Os preços ficam no servidor (configuração); aqui só o que não muda sem nova versão do app.
 */
import { QUALIDADES_TELA, TEMAS_LOJA, type QualidadeTela, type TemaLoja } from './protocolo.js';

/** Qualidades vendidas em vale (2K continua só por cargo). */
export type QualidadeVale = '720p60' | '1080p30' | '1080p60';
export const QUALIDADES_VALE: QualidadeVale[] = ['720p60', '1080p30', '1080p60'];

/** RN-8: cada vale vale 7 dias; comprar de novo soma 7 dias ao fim do atual. */
export const VALE_DIAS = 7;
export const VALE_MS = VALE_DIAS * 24 * 60 * 60 * 1000;

/** Temas da loja: originais, só no clima (RN-12). O CSS de cada um fica no app. */
export const ITENS_TEMA: { id: TemaLoja; nome: string; descricao: string }[] = [
  { id: 'cinzas', nome: 'Cinzas do Trono', descricao: 'fantasia sombria: ouro gasto, brasa e pedra' },
  { id: 'arcano', nome: 'Arcano Dourado', descricao: 'arena arcana: azul profundo, ouro e luz ciano' },
  { id: 'gibi', nome: 'Gibi', descricao: 'HQ de super-herói à noite: tinta, amarelo e vermelho' },
];

/** O que se compra: um tema (para sempre) ou um vale de qualidade (7 dias). */
export type ItemLoja = { tipo: 'tema'; tema: TemaLoja } | { tipo: 'vale'; qualidade: QualidadeVale };

/** Item como texto no extrato e na auditoria: "tema:cinzas", "vale:1080p60". */
export const chaveItem = (item: ItemLoja): string => (item.tipo === 'tema' ? `tema:${item.tema}` : `vale:${item.qualidade}`);

/** Lê um item vindo de fora (corpo da compra); fora do catálogo → null. */
export function lerItemLoja(bruto: unknown): ItemLoja | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Record<string, unknown>;
  if (o.tipo === 'tema' && TEMAS_LOJA.includes(o.tema as TemaLoja)) return { tipo: 'tema', tema: o.tema as TemaLoja };
  if (o.tipo === 'vale' && QUALIDADES_VALE.includes(o.qualidade as QualidadeVale)) return { tipo: 'vale', qualidade: o.qualidade as QualidadeVale };
  return null;
}

export interface ValeDto {
  qualidade: QualidadeVale;
  /** Fim da validade (ms desde 1970). */
  expiraEm: number;
}

/** Saldo e itens da conta; `tudoLiberado` = administrador da instalação (RN-11). */
export interface LojaEstadoDto {
  saldo: number;
  temas: TemaLoja[];
  vales: ValeDto[];
  tudoLiberado: boolean;
}

export interface PrecosLoja {
  tema: number;
  vales: Record<QualidadeVale, number>;
}

/** GET /api/loja. */
export interface CatalogoLojaDto {
  precos: PrecosLoja;
  pontosPorMinuto: number;
  estado: LojaEstadoDto;
}

/** Uma linha do extrato: ganho (por sessão de voz) ou compra (valor negativo). */
export interface MovimentoDto {
  id: number;
  tipo: 'ganho' | 'compra';
  item: string | null;
  valor: number;
  em: number;
}

/**
 * Qualidades que os vales ativos liberam (RN-9: o de 1080p60 também libera 720p60 e 1080p30), da menor para a
 * maior. Vale vencido não conta.
 */
export function qualidadesDosVales(vales: readonly ValeDto[], agora: number): QualidadeTela[] {
  const ativos = new Set<QualidadeTela>(vales.filter((v) => v.expiraEm > agora).map((v) => v.qualidade));
  if (ativos.has('1080p60')) {
    ativos.add('720p60');
    ativos.add('1080p30');
  }
  return QUALIDADES_TELA.filter((q) => ativos.has(q));
}

/** Nova validade de um vale comprado agora (RN-8): soma ao fim do atual, ou começa agora se já venceu. */
export const novaValidade = (expiraAtual: number | undefined, agora: number): number => Math.max(agora, expiraAtual ?? 0) + VALE_MS;
