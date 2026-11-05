import { PAGINA_MENSAGENS, type MensagemDto, type PaginaMensagens } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';

interface LinhaMensagem {
  id: number;
  canal_id: number | null;
  autor_id: number;
  texto: string;
  criada_em: number;
  editada_em: number | null;
}

export const paraDto = (m: LinhaMensagem): MensagemDto => ({
  id: m.id,
  canalId: m.canal_id,
  autorId: m.autor_id,
  texto: m.texto,
  criadaEm: m.criada_em,
  editadaEm: m.editada_em,
});

export function criarMensagemCanal(banco: Banco, canalId: number, autorId: number, texto: string, agora: number = Date.now()): MensagemDto {
  const r = banco.prepare('INSERT INTO mensagens (canal_id, autor_id, texto, criada_em) VALUES (?, ?, ?, ?)').run(canalId, autorId, texto, agora);
  return paraDto(banco.prepare('SELECT * FROM mensagens WHERE id = ?').get(Number(r.lastInsertRowid)) as LinhaMensagem);
}

/** Histórico paginado por id (RF-8): as `limite` mais recentes antes de `antes`, devolvidas em ordem cronológica. */
export function listarMensagensCanal(banco: Banco, canalId: number, antes?: number, limite: number = PAGINA_MENSAGENS): PaginaMensagens {
  const n = Math.min(Math.max(limite, 1), 100);
  const linhas = banco
    .prepare(`SELECT * FROM mensagens WHERE canal_id = ? ${antes ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`)
    .all(...(antes ? [canalId, antes, n + 1] : [canalId, n + 1])) as LinhaMensagem[];
  return { mensagens: linhas.slice(0, n).reverse().map(paraDto), fim: linhas.length <= n };
}
