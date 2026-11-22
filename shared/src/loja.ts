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

/** audios-na-loja (RN-2): raridade de um áudio da loja; define o preço (RN-3). */
export type RaridadeAudio = 'comum' | 'raro' | 'epico' | 'lendario';
/** Da mais comum para a mais rara. */
export const RARIDADES_AUDIO: RaridadeAudio[] = ['comum', 'raro', 'epico', 'lendario'];
export const NOMES_RARIDADE: Record<RaridadeAudio, string> = { comum: 'Comum', raro: 'Raro', epico: 'Épico', lendario: 'Lendário' };

/** Um áudio da loja: o que a loja mostra e o que a sala recebe ao tocar. `url` é sempre `/files/<arquivo>`. */
export interface AudioLojaDto {
  id: number;
  nome: string;
  url: string;
  duracaoMs: number;
  raridade: RaridadeAudio;
}

/** Visão do administrador da instalação (tela "Áudios da loja"). */
export interface AudioLojaAdminDto extends AudioLojaDto {
  compradores: number;
  retirado: boolean;
}

/** O que se compra: um tema (para sempre), um vale de qualidade (7 dias) ou um áudio (para sempre). */
export type ItemLoja = { tipo: 'tema'; tema: TemaLoja } | { tipo: 'vale'; qualidade: QualidadeVale } | { tipo: 'audio'; audioId: number };

/** Item como texto no extrato e na auditoria: "tema:cinzas", "vale:1080p60", "audio:12". */
export const chaveItem = (item: ItemLoja): string =>
  item.tipo === 'tema' ? `tema:${item.tema}` : item.tipo === 'vale' ? `vale:${item.qualidade}` : `audio:${item.audioId}`;

/** Lê um item vindo de fora (corpo da compra); fora do catálogo → null. */
export function lerItemLoja(bruto: unknown): ItemLoja | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Record<string, unknown>;
  if (o.tipo === 'tema' && TEMAS_LOJA.includes(o.tema as TemaLoja)) return { tipo: 'tema', tema: o.tema as TemaLoja };
  if (o.tipo === 'vale' && QUALIDADES_VALE.includes(o.qualidade as QualidadeVale)) return { tipo: 'vale', qualidade: o.qualidade as QualidadeVale };
  if (o.tipo === 'audio' && typeof o.audioId === 'number' && Number.isInteger(o.audioId) && o.audioId >= 1) return { tipo: 'audio', audioId: o.audioId };
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
  /** audios-na-loja: ids dos áudios da conta (só os ids: este estado vai a cada minuto em voz). Servidor antigo não manda. */
  audiosIds?: number[];
}

export interface PrecosLoja {
  tema: number;
  vales: Record<QualidadeVale, number>;
  /** audios-na-loja (RN-3): preço por raridade. Servidor antigo não manda. */
  audios?: Record<RaridadeAudio, number>;
}

/** GET /api/loja. */
export interface CatalogoLojaDto {
  precos: PrecosLoja;
  pontosPorMinuto: number;
  estado: LojaEstadoDto;
  /** audios-na-loja: áudios à venda (sem dados de quem comprou). */
  audios?: AudioLojaDto[];
}

/** Uma linha do extrato: ganho (por sessão de voz) ou compra (valor negativo). */
export interface MovimentoDto {
  id: number;
  tipo: 'ganho' | 'compra';
  item: string | null;
  valor: number;
  em: number;
  /** audios-na-loja: nome do item quando ele não está no app (o áudio comprado, com o nome de hoje). */
  nomeItem?: string;
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

/**
 * R-8: o tema pode ficar? Grátis sempre; de loja só se a conta comprou ou tem tudo liberado (sem loja no servidor,
 * não). Usado ao chegar o ola, para um tema salvo no computador por outra conta ou instalação voltar ao neon.
 */
export function temaPermitido(tema: string, loja: { temas: readonly string[]; tudoLiberado: boolean } | null | undefined): boolean {
  if (!(TEMAS_LOJA as string[]).includes(tema)) return true;
  return !!loja && (loja.tudoLiberado || loja.temas.includes(tema));
}

/** Nova validade de um vale comprado agora (RN-8): soma ao fim do atual, ou começa agora se já venceu. */
export const novaValidade = (expiraAtual: number | undefined, agora: number): number => Math.max(agora, expiraAtual ?? 0) + VALE_MS;
