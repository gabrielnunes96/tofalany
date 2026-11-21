import { FIXADAS_POR_CONVERSA, LINHA_FIXOU_INTERVALO_MS, type Destino, type FixadaDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { paraDtos } from './mensagens.js';

/** Texto da linha de sistema: os apps antigos o mostram como uma mensagem comum de quem fixou. */
export const TEXTO_LINHA_FIXOU = 'fixou uma mensagem.';

const colunaDo = (destino: Destino): ['canal_id' | 'dm_id', number] => ('canalId' in destino ? ['canal_id', destino.canalId] : ['dm_id', destino.dmId]);

/** Quantas fixadas a conversa tem (a conversa vem da própria mensagem). */
export function contarFixadas(banco: Banco, destino: Destino): number {
  const [coluna, id] = colunaDo(destino);
  return (
    banco.prepare(`SELECT COUNT(*) AS n FROM mensagens_fixadas f JOIN mensagens m ON m.id = f.mensagem_id WHERE m.${coluna} = ?`).get(id) as { n: number }
  ).n;
}

export function estaFixada(banco: Banco, mensagemId: number): boolean {
  return !!banco.prepare('SELECT 1 FROM mensagens_fixadas WHERE mensagem_id = ?').get(mensagemId);
}

/**
 * Fixa (RN-3: até 50 por conversa) e grava a linha "fixou" (RN-4), a não ser que a mesma pessoa tenha fixado a mesma
 * mensagem há menos de 10 min. Quem chama confere as permissões e roda numa transação imediata.
 * Devolve se mudou e o id da linha nova (se houver).
 */
export function fixar(
  banco: Banco,
  mensagemId: number,
  destino: Destino,
  usuarioId: number,
  agora: number = Date.now(),
): { mudou: boolean; linhaId: number | null } {
  if (estaFixada(banco, mensagemId)) return { mudou: false, linhaId: null };
  if (contarFixadas(banco, destino) >= FIXADAS_POR_CONVERSA) {
    const onde = 'canalId' in destino ? 'Este canal' : 'Esta conversa';
    throw new ErroHttp(400, 'limite_fixadas', `${onde} já tem ${FIXADAS_POR_CONVERSA} mensagens fixadas. Desafixe uma antes.`);
  }
  banco.prepare('INSERT INTO mensagens_fixadas (mensagem_id, fixada_por, fixada_em) VALUES (?, ?, ?)').run(mensagemId, usuarioId, agora);
  // Pelo índice da conversa (mensagens_canal/mensagens_dm), não a tabela inteira.
  const [coluna, conversa] = colunaDo(destino);
  const recente = banco
    .prepare(`SELECT 1 FROM mensagens WHERE ${coluna} = ? AND tipo = 'fixou' AND ref_mensagem_id = ? AND autor_id = ? AND criada_em > ?`)
    .get(conversa, mensagemId, usuarioId, agora - LINHA_FIXOU_INTERVALO_MS);
  if (recente) return { mudou: true, linhaId: null };
  const [canalId, dmId] = 'canalId' in destino ? [destino.canalId, null] : [null, destino.dmId];
  const linha = banco
    .prepare("INSERT INTO mensagens (canal_id, dm_id, autor_id, texto, criada_em, tipo, ref_mensagem_id) VALUES (?, ?, ?, ?, ?, 'fixou', ?)")
    .run(canalId, dmId, usuarioId, TEXTO_LINHA_FIXOU, agora, mensagemId);
  return { mudou: true, linhaId: Number(linha.lastInsertRowid) };
}

/** Desafixar não gera linha (RN-4). Devolve se mudou. */
export function desafixar(banco: Banco, mensagemId: number): boolean {
  return banco.prepare('DELETE FROM mensagens_fixadas WHERE mensagem_id = ?').run(mensagemId).changes > 0;
}

/** Fixadas da conversa, da mais nova para a mais antiga, com a mensagem atual (texto editado; apagada já saiu). */
export function listarFixadas(banco: Banco, destino: Destino): FixadaDto[] {
  const [coluna, id] = colunaDo(destino);
  const linhas = banco
    .prepare(
      `SELECT m.*, f.fixada_por, f.fixada_em FROM mensagens_fixadas f JOIN mensagens m ON m.id = f.mensagem_id
        WHERE m.${coluna} = ? ORDER BY f.fixada_em DESC, m.id DESC LIMIT ?`,
    )
    .all(id, FIXADAS_POR_CONVERSA) as ({ fixada_por: number | null; fixada_em: number } & Parameters<typeof paraDtos>[1][number])[];
  const mensagens = paraDtos(banco, linhas);
  return linhas.map((l, i) => ({ mensagem: mensagens[i]!, fixadaPor: l.fixada_por, fixadaEm: l.fixada_em }));
}
