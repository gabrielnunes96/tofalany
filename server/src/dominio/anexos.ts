import { randomBytes } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import { ANEXO_IMAGEM_MAX_PIXELS, type AnexoDto, type TipoAnexo } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import type { Armazem } from '../arquivos/armazem.js';
import { ErroHttp } from '../erros.js';

interface LinhaAnexo {
  id: string;
  mensagem_id: number | null;
  autor_id: number;
  tipo: TipoAnexo;
  mime: string;
  nome_original: string;
  largura: number | null;
  altura: number | null;
  bytes: number;
  arquivo: string;
  criado_em: number;
}

export const paraDto = (a: LinhaAnexo): AnexoDto => ({
  id: a.id,
  url: `/files/${a.arquivo}`,
  tipo: a.tipo,
  nome: a.nome_original,
  bytes: a.bytes,
  largura: a.largura,
  altura: a.altura,
});

const FORMATOS_IMAGEM: Record<string, { ext: string; mime: string }> = {
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  png: { ext: 'png', mime: 'image/png' },
  gif: { ext: 'gif', mime: 'image/gif' },
  webp: { ext: 'webp', mime: 'image/webp' },
};

/** Nome que vai aparecer no cartão: sem caminho, sem controle, até 120 caracteres. */
export function sanearNome(nome: string | undefined, padrao: string): string {
  // eslint-disable-next-line no-control-regex
  const limpo = (nome ?? '').split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"<>|]/g, '').trim();
  return [...(limpo || padrao)].slice(0, 120).join('');
}

/** Extensões aceitas como equivalentes ao formato detectado (o resto é trocado). */
const EQUIVALENTES: Record<string, string[]> = { jpg: ['jpg', 'jpeg'], png: ['png'], gif: ['gif'], webp: ['webp'], pdf: ['pdf'], zip: ['zip'] };

/**
 * O nome mostrado e sugerido no "Salvar como" termina sempre na extensão do formato que o servidor conferiu:
 * "x.bat" com conteúdo de PDF vira "x.pdf" (um script disfarçado nunca é salvo com extensão executável).
 */
export function nomeComExtensao(nome: string, ext: string): string {
  const ponto = nome.lastIndexOf('.');
  const atual = ponto > 0 ? nome.slice(ponto + 1).toLowerCase() : '';
  if ((EQUIVALENTES[ext] ?? [ext]).includes(atual)) return nome;
  const base = ponto > 0 ? nome.slice(0, ponto) : nome;
  return `${base || 'anexo'}.${ext}`;
}

/** GIF/WebP animado: no máximo 500 quadros e 400 milhões de pixels somando os quadros. */
const MAX_QUADROS = 500;
const MAX_PIXELS_ANIMACAO = 400_000_000;

const comecaCom = (dados: Buffer, assinatura: number[]) => assinatura.every((b, i) => dados[i] === b);

export interface ArquivoProcessado {
  tipo: TipoAnexo;
  mime: string;
  ext: string;
  dados: Buffer;
  largura: number | null;
  altura: number | null;
}

/**
 * RN-19: confere o formato pelo conteúdo. Imagens são regravadas (sem EXIF/localização, GIF mantém a animação);
 * PDF e ZIP são guardados como vieram e só servidos como download.
 */
export async function processarAnexo(dados: Buffer): Promise<ArquivoProcessado> {
  if (comecaCom(dados, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { tipo: 'documento', mime: 'application/pdf', ext: 'pdf', dados, largura: null, altura: null };
  }
  if (comecaCom(dados, [0x50, 0x4b, 0x03, 0x04]) || comecaCom(dados, [0x50, 0x4b, 0x05, 0x06])) {
    return { tipo: 'documento', mime: 'application/zip', ext: 'zip', dados, largura: null, altura: null };
  }
  let meta: Metadata | undefined;
  try {
    meta = await sharp(dados).metadata();
  } catch {
    meta = undefined;
  }
  const formato = meta?.format ? FORMATOS_IMAGEM[meta.format] : undefined;
  if (!meta || !formato) throw new ErroHttp(415, 'formato_invalido', 'Formato não aceito. Envie JPEG, PNG, GIF, WebP, PDF ou ZIP.');
  const altura = meta.pageHeight ?? meta.height ?? 0;
  const quadros = Math.max(1, meta.pages ?? 1);
  if ((meta.width ?? 0) * altura > ANEXO_IMAGEM_MAX_PIXELS) {
    throw new ErroHttp(413, 'arquivo_grande', 'A imagem tem resolução grande demais.');
  }
  if (quadros > MAX_QUADROS || (meta.width ?? 0) * altura * quadros > MAX_PIXELS_ANIMACAO) {
    throw new ErroHttp(413, 'arquivo_grande', 'A animação é grande demais.');
  }
  const animada = meta.format === 'gif' || meta.format === 'webp';
  let img = sharp(dados, { animated: animada, limitInputPixels: ANEXO_IMAGEM_MAX_PIXELS * Math.max(1, meta.pages ?? 1) }).rotate();
  img = meta.format === 'jpeg' ? img.jpeg({ quality: 90 }) : meta.format === 'png' ? img.png() : meta.format === 'gif' ? img.gif() : img.webp({ quality: 90 });
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  return { tipo: 'imagem', mime: formato.mime, ext: formato.ext, dados: data, largura: info.width, altura: info.pageHeight ?? info.height };
}

export function registrarAnexo(banco: Banco, armazem: Armazem, autorId: number, nome: string, p: ArquivoProcessado, agora: number = Date.now()): AnexoDto {
  const arquivo = armazem.gravar(p.dados, p.ext);
  const id = randomBytes(12).toString('hex');
  try {
    banco
      .prepare(
        `INSERT INTO anexos (id, autor_id, tipo, mime, nome_original, largura, altura, bytes, arquivo, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, autorId, p.tipo, p.mime, nome, p.largura, p.altura, p.dados.length, arquivo, agora);
  } catch (erro) {
    armazem.apagar(arquivo);
    throw erro;
  }
  return paraDto(banco.prepare('SELECT * FROM anexos WHERE id = ?').get(id) as LinhaAnexo);
}

/** Vincula anexos do autor, ainda soltos, a uma mensagem (dentro da transação do envio). */
export function vincularAnexos(banco: Banco, ids: string[], autorId: number, mensagemId: number): void {
  for (const id of ids) {
    const r = banco.prepare('UPDATE anexos SET mensagem_id = ? WHERE id = ? AND autor_id = ? AND mensagem_id IS NULL').run(mensagemId, id, autorId);
    if (r.changes !== 1) throw new ErroHttp(400, 'dados_invalidos', 'Anexo inválido ou já usado.');
  }
}

export function anexosDasMensagens(banco: Banco, ids: number[]): Map<number, AnexoDto[]> {
  const mapa = new Map<number, AnexoDto[]>();
  if (ids.length === 0) return mapa;
  const linhas = banco
    .prepare(`SELECT * FROM anexos WHERE mensagem_id IN (${ids.map(() => '?').join(',')}) ORDER BY criado_em, id`)
    .all(...ids) as LinhaAnexo[];
  for (const l of linhas) {
    const lista = mapa.get(l.mensagem_id!) ?? [];
    lista.push(paraDto(l));
    mapa.set(l.mensagem_id!, lista);
  }
  return mapa;
}

/** Arquivos em disco de uma mensagem ou de um canal (para apagar depois do DELETE em cascata). */
export function arquivosDaMensagem(banco: Banco, mensagemId: number): string[] {
  return (banco.prepare('SELECT arquivo FROM anexos WHERE mensagem_id = ?').all(mensagemId) as { arquivo: string }[]).map((a) => a.arquivo);
}

export function arquivosDoCanal(banco: Banco, canalId: number): string[] {
  return (
    banco.prepare('SELECT a.arquivo FROM anexos a JOIN mensagens m ON m.id = a.mensagem_id WHERE m.canal_id = ?').all(canalId) as { arquivo: string }[]
  ).map((a) => a.arquivo);
}

/** Anexos enviados e nunca usados numa mensagem, há mais de `idadeMs`. */
export function limparOrfaos(banco: Banco, armazem: Armazem, idadeMs: number, agora: number = Date.now()): number {
  const orfaos = banco.transaction(() => {
    const lista = banco.prepare('SELECT id, arquivo FROM anexos WHERE mensagem_id IS NULL AND criado_em < ?').all(agora - idadeMs) as {
      id: string;
      arquivo: string;
    }[];
    for (const o of lista) banco.prepare('DELETE FROM anexos WHERE id = ?').run(o.id);
    return lista;
  })();
  // Como em apagar mensagem e remover canal: o disco só depois do commit.
  for (const o of orfaos) armazem.apagar(o.arquivo);
  return orfaos.length;
}
