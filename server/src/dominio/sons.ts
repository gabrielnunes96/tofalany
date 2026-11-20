import { parseBuffer } from 'music-metadata';
import { COMUNIDADE_PRINCIPAL, SOM_DURACAO_MAX_MS, SONS_MAX, type SomDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';

interface LinhaSom {
  id: number;
  nome: string;
  arquivo: string;
  duracao_ms: number;
}

const paraDto = (s: LinhaSom): SomDto => ({ id: s.id, nome: s.nome, url: `/files/${s.arquivo}`, duracaoMs: s.duracao_ms });

export function listarSons(banco: Banco, comunidadeId: number = COMUNIDADE_PRINCIPAL): SomDto[] {
  return (banco.prepare('SELECT * FROM sons WHERE comunidade_id = ? ORDER BY id').all(comunidadeId) as LinhaSom[]).map(paraDto);
}

export function comunidadeDoSom(banco: Banco, id: number): number | undefined {
  return (banco.prepare('SELECT comunidade_id FROM sons WHERE id = ?').get(id) as { comunidade_id: number } | undefined)?.comunidade_id;
}

export function buscarSom(banco: Banco, id: number): (SomDto & { arquivo: string }) | undefined {
  const s = banco.prepare('SELECT * FROM sons WHERE id = ?').get(id) as LinhaSom | undefined;
  return s && { ...paraDto(s), arquivo: s.arquivo };
}

/** Formato (pela assinatura do conteúdo) e extensão gravada. */
function formatoDoAudio(dados: Buffer): { ext: 'mp3' | 'ogg' | 'wav'; mime: string } | undefined {
  const ascii = (i: number, n: number) => dados.subarray(i, i + n).toString('latin1');
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (ascii(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  // MP3: marca ID3 ou cabeçalho de quadro (11 bits de sincronia).
  if (ascii(0, 3) === 'ID3' || (dados[0] === 0xff && ((dados[1] ?? 0) & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  return undefined;
}

/** RN-11: só MP3, OGG ou WAV de verdade (conteúdo, não o nome) e com até 10 s. */
export async function conferirAudio(dados: Buffer): Promise<{ ext: 'mp3' | 'ogg' | 'wav'; duracaoMs: number }> {
  const formato = formatoDoAudio(dados);
  if (!formato) throw new ErroHttp(415, 'formato_invalido', 'Use um arquivo de áudio MP3, OGG ou WAV.');
  let duracao: number | undefined;
  try {
    duracao = (await parseBuffer(dados, { mimeType: formato.mime }, { duration: true })).format.duration;
  } catch {
    duracao = undefined;
  }
  if (duracao === undefined || !Number.isFinite(duracao) || duracao <= 0) {
    throw new ErroHttp(415, 'formato_invalido', 'Não foi possível ler esse áudio. Use MP3, OGG ou WAV.');
  }
  const duracaoMs = Math.round(duracao * 1000);
  if (duracaoMs > SOM_DURACAO_MAX_MS) throw new ErroHttp(422, 'som_longo', 'O som deve ter no máximo 10 segundos.');
  return { ext: formato.ext, duracaoMs };
}

export function inserirSom(banco: Banco, nome: string, arquivo: string, duracaoMs: number, criadoPor: number, agora: number = Date.now(), comunidadeId: number = COMUNIDADE_PRINCIPAL): SomDto {
  const total = (banco.prepare('SELECT COUNT(*) AS n FROM sons WHERE comunidade_id = ?').get(comunidadeId) as { n: number }).n;
  if (total >= SONS_MAX) throw new ErroHttp(409, 'limite_sons', `O soundboard já tem ${SONS_MAX} sons. Remova um para cadastrar outro.`);
  const r = banco.prepare('INSERT INTO sons (nome, arquivo, duracao_ms, criado_por, criado_em, comunidade_id) VALUES (?, ?, ?, ?, ?, ?)').run(nome, arquivo, duracaoMs, criadoPor, agora, comunidadeId);
  return paraDto(banco.prepare('SELECT * FROM sons WHERE id = ?').get(Number(r.lastInsertRowid)) as LinhaSom);
}
