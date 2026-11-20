import sharp, { type Metadata } from 'sharp';
import {
  FORMATOS_AVATAR,
  FUNDO_ALTURA,
  FUNDO_LARGURA,
  FUNDO_MAX_PIXELS_ANIMACAO,
  FUNDO_MAX_QUADROS,
  FUNDO_SAIDA_MAX_BYTES,
  IMAGEM_MAX_PIXELS,
} from '@tofalando/shared';
import { ErroHttp } from '../erros.js';

/** Miniatura parada do fundo, para a lista de membros (técnica T-3). */
export const MINI_LARGURA = 300;
export const MINI_ALTURA = 40;

export interface FundoProcessado {
  /** webp (animado quando a imagem era animada), até 600×240, sem metadados. */
  imagem: Buffer;
  /** webp parado, 300×40, do primeiro quadro. */
  miniatura: Buffer;
  animado: boolean;
}

/** Um processamento de fundo por vez no servidor: um GIF pesado não ocupa a CPU de todos (T-4). */
let fila: Promise<unknown> = Promise.resolve();
export function emFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const vez = fila.then(tarefa);
  fila = vez.catch(() => undefined);
  return vez;
}

/** Prazo da tarefa inteira (leitura do cabeçalho, regravação e miniatura): a fila nunca fica presa. */
const PRAZO_MS = 20_000;
function comPrazo<T>(tarefa: Promise<T>): Promise<T> {
  let relogio: NodeJS.Timeout | undefined;
  const estourou = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new ErroHttp(413, 'arquivo_grande', 'A imagem demorou demais para processar.')), PRAZO_MS);
  });
  return Promise.race([tarefa, estourou]).finally(() => clearTimeout(relogio));
}

/**
 * Mini perfil (T-3, T-4): confere pelo conteúdo e pelos limites do cabeçalho antes de decodificar (resolução por
 * quadro, número de quadros e pixels somados), regrava em webp até 600×240 (recorte no centro, sem ampliar) e gera
 * a miniatura parada. O sharp não faz recorte "atenção" nem rotação por EXIF de 90°/270° com animação.
 */
export function processarFundo(dados: Buffer, limiteSaida: number = FUNDO_SAIDA_MAX_BYTES): Promise<FundoProcessado> {
  return emFila(() => comPrazo(processar(dados, limiteSaida)));
}

async function processar(dados: Buffer, limiteSaida: number): Promise<FundoProcessado> {
  let meta: Metadata | undefined;
  try {
    // Só o cabeçalho: sem o limite padrão do sharp aqui, quem decide o tamanho é a conferência logo abaixo (413).
    meta = await sharp(dados, { limitInputPixels: false }).metadata();
  } catch {
    meta = undefined;
  }
  if (!meta?.format || !(FORMATOS_AVATAR as readonly string[]).includes(meta.format)) {
    throw new ErroHttp(415, 'formato_invalido', 'Use uma imagem PNG, JPEG, GIF ou WebP.');
  }
  const largura = meta.width ?? 0;
  const altura = meta.pageHeight ?? meta.height ?? 0;
  // Sem tamanho no cabeçalho, o limite de pixels do sharp ficaria desligado (0): recusa.
  if (!largura || !altura) throw new ErroHttp(415, 'formato_invalido', 'Não deu para ler essa imagem.');
  const quadros = Math.max(1, meta.pages ?? 1);
  if (largura * altura > IMAGEM_MAX_PIXELS) throw new ErroHttp(413, 'arquivo_grande', 'A imagem tem resolução grande demais (máximo 4096×4096).');
  if (quadros > FUNDO_MAX_QUADROS || largura * altura * quadros > FUNDO_MAX_PIXELS_ANIMACAO) {
    throw new ErroHttp(413, 'arquivo_grande', `A animação é grande demais (até ${FUNDO_MAX_QUADROS} quadros).`);
  }
  const animado = quadros > 1;
  const redimensionar = { fit: 'cover' as const, position: 'centre' as const, withoutEnlargement: true };
  try {
    let base = sharp(dados, { animated: animado, limitInputPixels: largura * altura * quadros }).timeout({ seconds: 15 });
    // Rotação pelo EXIF só em imagem parada (com animação o sharp recusa 90°/270°).
    if (!animado) base = base.rotate();
    const imagem = await base.resize(FUNDO_LARGURA, FUNDO_ALTURA, redimensionar).webp({ quality: 80, effort: 4 }).toBuffer();
    if (imagem.length > limiteSaida) throw new ErroHttp(413, 'arquivo_grande', 'O fundo ficou pesado demais. Use um GIF mais curto ou menor.');
    // Miniatura do primeiro quadro, a partir da imagem já reduzida (barato).
    const miniatura = await sharp(imagem, { animated: false }).resize(MINI_LARGURA, MINI_ALTURA, { fit: 'cover', position: 'centre' }).webp({ quality: 70 }).toBuffer();
    return { imagem, miniatura, animado };
  } catch (erro) {
    if (erro instanceof ErroHttp) throw erro;
    throw new ErroHttp(415, 'formato_invalido', 'Não deu para ler essa imagem.');
  }
}
