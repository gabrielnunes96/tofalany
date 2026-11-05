import { PAGINA_MENSAGENS, type Destino, type MensagemDto, type PaginaMensagens } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { anexosDasMensagens } from './anexos.js';

interface LinhaMensagem {
  id: number;
  canal_id: number | null;
  dm_id: number | null;
  autor_id: number;
  texto: string;
  criada_em: number;
  editada_em: number | null;
}

const paraDtoSemAnexos = (m: LinhaMensagem): MensagemDto => ({
  id: m.id,
  canalId: m.canal_id,
  dmId: m.dm_id,
  autorId: m.autor_id,
  texto: m.texto,
  criadaEm: m.criada_em,
  editadaEm: m.editada_em,
  anexos: [],
});

/** Mensagens com os anexos de cada uma (uma consulta só para a página toda). */
function comAnexos(banco: Banco, linhas: LinhaMensagem[]): MensagemDto[] {
  const anexos = anexosDasMensagens(banco, linhas.map((l) => l.id));
  return linhas.map((l) => ({ ...paraDtoSemAnexos(l), anexos: anexos.get(l.id) ?? [] }));
}

/** Cria a linha num canal ou numa DM e devolve o id (os anexos são vinculados na mesma transação por quem chama). */
export function inserirMensagem(banco: Banco, destino: Destino, autorId: number, texto: string, agora: number = Date.now()): number {
  const [canalId, dmId] = 'canalId' in destino ? [destino.canalId, null] : [null, destino.dmId];
  return Number(
    banco.prepare('INSERT INTO mensagens (canal_id, dm_id, autor_id, texto, criada_em) VALUES (?, ?, ?, ?, ?)').run(canalId, dmId, autorId, texto, agora)
      .lastInsertRowid,
  );
}

export function buscarMensagem(banco: Banco, id: number): MensagemDto | undefined {
  const m = banco.prepare('SELECT * FROM mensagens WHERE id = ?').get(id) as LinhaMensagem | undefined;
  return m && comAnexos(banco, [m])[0];
}

export function editarMensagem(banco: Banco, id: number, texto: string, agora: number = Date.now()): MensagemDto {
  banco.prepare('UPDATE mensagens SET texto = ?, editada_em = ? WHERE id = ?').run(texto, agora, id);
  return buscarMensagem(banco, id)!;
}

export function apagarMensagem(banco: Banco, id: number): void {
  banco.prepare('DELETE FROM mensagens WHERE id = ?').run(id);
}

/** Histórico paginado por id (RF-8, RF-12a): as `limite` mais recentes antes de `antes`, em ordem cronológica. */
export function listarMensagens(banco: Banco, destino: Destino, antes?: number, limite: number = PAGINA_MENSAGENS): PaginaMensagens {
  const n = Math.min(Math.max(limite, 1), 100);
  const [coluna, id] = 'canalId' in destino ? ['canal_id', destino.canalId] : ['dm_id', destino.dmId];
  const linhas = banco
    .prepare(`SELECT * FROM mensagens WHERE ${coluna} = ? ${antes ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`)
    .all(...(antes ? [id, antes, n + 1] : [id, n + 1])) as LinhaMensagem[];
  return { mensagens: comAnexos(banco, linhas.slice(0, n).reverse()), fim: linhas.length <= n };
}
