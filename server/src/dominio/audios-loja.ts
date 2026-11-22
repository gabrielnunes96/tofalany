/**
 * Áudios da loja (docs/demandas/audios-na-loja): cadastro pelo administrador da instalação, posse por conta e a
 * lista do "Meus sons". O arquivo de um áudio nunca é trocado; tirar da loja só apaga quando ninguém tem (RN-8).
 */
import { AUDIOS_LOJA_MAX, RARIDADES_AUDIO, type AudioLojaAdminDto, type AudioLojaDto, type RaridadeAudio } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { ehAdminDaInstalacao } from './comunidades.js';

interface LinhaAudio {
  id: number;
  nome: string;
  arquivo: string;
  duracao_ms: number;
  raridade: RaridadeAudio;
  retirado_em: number | null;
}

/** Ordem da loja (RF-2): lendário primeiro, depois pelo nome. */
const ORDEM = `ORDER BY CASE raridade WHEN 'lendario' THEN 0 WHEN 'epico' THEN 1 WHEN 'raro' THEN 2 ELSE 3 END, nome COLLATE NOCASE, id`;

export const paraDto = (a: LinhaAudio): AudioLojaDto => ({ id: a.id, nome: a.nome, url: `/files/${a.arquivo}`, duracaoMs: a.duracao_ms, raridade: a.raridade });

export const ehRaridade = (v: unknown): v is RaridadeAudio => typeof v === 'string' && (RARIDADES_AUDIO as string[]).includes(v);

export function buscarAudio(banco: Banco, id: number): (LinhaAudio & { dto: AudioLojaDto }) | undefined {
  const a = banco.prepare('SELECT * FROM loja_audios WHERE id = ?').get(id) as LinhaAudio | undefined;
  return a && { ...a, dto: paraDto(a) };
}

/** À venda (catálogo, A13: sem dados de quem comprou). */
export function audiosAVenda(banco: Banco): AudioLojaDto[] {
  return (banco.prepare(`SELECT * FROM loja_audios WHERE retirado_em IS NULL ${ORDEM}`).all() as LinhaAudio[]).map(paraDto);
}

/** "Meus sons": os comprados; o administrador da instalação tem todos os que existem (RN-6). */
export function audiosDaConta(banco: Banco, usuarioId: number): AudioLojaDto[] {
  const linhas = ehAdminDaInstalacao(banco, usuarioId)
    ? (banco.prepare(`SELECT * FROM loja_audios ${ORDEM}`).all() as LinhaAudio[])
    : (banco.prepare(`SELECT a.* FROM loja_audios a JOIN loja_audios_compras c ON c.audio_id = a.id WHERE c.usuario_id = ? ${ORDEM}`).all(usuarioId) as LinhaAudio[]);
  return linhas.map(paraDto);
}

/** Ids dos áudios da conta (vai no estado da loja, que sai a cada minuto em voz). */
export function idsDaConta(banco: Banco, usuarioId: number): number[] {
  if (ehAdminDaInstalacao(banco, usuarioId)) return (banco.prepare('SELECT id FROM loja_audios ORDER BY id').all() as { id: number }[]).map((a) => a.id);
  return (banco.prepare('SELECT audio_id FROM loja_audios_compras WHERE usuario_id = ? ORDER BY audio_id').all(usuarioId) as { audio_id: number }[]).map((a) => a.audio_id);
}

/** A conta pode tocar este áudio (comprou, ou é o administrador da instalação); retirado continua valendo (RN-8). */
export function temAudio(banco: Banco, usuarioId: number, audioId: number): boolean {
  if (!buscarAudio(banco, audioId)) return false;
  if (ehAdminDaInstalacao(banco, usuarioId)) return true;
  return !!banco.prepare('SELECT 1 FROM loja_audios_compras WHERE usuario_id = ? AND audio_id = ?').get(usuarioId, audioId);
}

/** Tela "Áudios da loja" (só administrador da instalação): com a contagem de compradores, numa consulta só. */
export function audiosParaAdmin(banco: Banco): AudioLojaAdminDto[] {
  const linhas = banco
    .prepare(`SELECT a.*, (SELECT COUNT(*) FROM loja_audios_compras c WHERE c.audio_id = a.id) AS compradores FROM loja_audios a ${ORDEM}`)
    .all() as (LinhaAudio & { compradores: number })[];
  return linhas.map((a) => ({ ...paraDto(a), compradores: a.compradores, retirado: a.retirado_em !== null }));
}

export const totalDeAudios = (banco: Banco): number => (banco.prepare('SELECT COUNT(*) AS n FROM loja_audios').get() as { n: number }).n;

/** Cadastra (RN-14: até 200, contando os retirados que alguém ainda tem). Chamar dentro de uma transação. */
export function inserirAudio(banco: Banco, a: { nome: string; arquivo: string; duracaoMs: number; raridade: RaridadeAudio; criadoPor: number }, agora = Date.now()): AudioLojaDto {
  if (totalDeAudios(banco) >= AUDIOS_LOJA_MAX) throw new ErroHttp(409, 'limite_sons', `A loja já tem ${AUDIOS_LOJA_MAX} áudios.`);
  const r = banco
    .prepare('INSERT INTO loja_audios (nome, arquivo, duracao_ms, raridade, criado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(a.nome, a.arquivo, a.duracaoMs, a.raridade, a.criadoPor, agora);
  return buscarAudio(banco, Number(r.lastInsertRowid))!.dto;
}

/**
 * Tira da loja (RN-8): ninguém mais compra. Sem compradores, a linha sai e o arquivo deve ser apagado depois do
 * commit (devolvido em `apagar`). Chamar dentro de uma transação (a contagem e o DELETE juntos, A12).
 */
export function retirarAudio(banco: Banco, id: number, agora = Date.now()): { audio: AudioLojaDto; apagar?: string } {
  const a = buscarAudio(banco, id);
  if (!a || a.retirado_em !== null) throw new ErroHttp(404, 'nao_encontrado', 'Áudio não encontrado na loja.');
  const compradores = (banco.prepare('SELECT COUNT(*) AS n FROM loja_audios_compras WHERE audio_id = ?').get(id) as { n: number }).n;
  if (compradores === 0) {
    banco.prepare('DELETE FROM loja_audios WHERE id = ?').run(id);
    return { audio: a.dto, apagar: a.arquivo };
  }
  banco.prepare('UPDATE loja_audios SET retirado_em = ? WHERE id = ?').run(agora, id);
  return { audio: a.dto };
}
