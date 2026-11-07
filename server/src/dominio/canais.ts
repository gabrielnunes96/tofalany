import { COMUNIDADE_PRINCIPAL, type CanalDto, type TipoCanal } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';

interface LinhaCanal {
  id: number;
  tipo: TipoCanal;
  nome: string;
  posicao: number;
}

const paraDto = (c: LinhaCanal): CanalDto => ({ id: c.id, tipo: c.tipo, nome: c.nome, posicao: c.posicao });

export function listarCanais(banco: Banco, comunidadeId: number = COMUNIDADE_PRINCIPAL): CanalDto[] {
  return (banco.prepare('SELECT id, tipo, nome, posicao FROM canais WHERE comunidade_id = ? ORDER BY tipo, posicao, id').all(comunidadeId) as LinhaCanal[]).map(paraDto);
}

/** De qual servidor é o canal (undefined se não existe). */
export function comunidadeDoCanal(banco: Banco, id: number): number | undefined {
  return (banco.prepare('SELECT comunidade_id FROM canais WHERE id = ?').get(id) as { comunidade_id: number } | undefined)?.comunidade_id;
}

export function buscarCanal(banco: Banco, id: number): CanalDto | undefined {
  const c = banco.prepare('SELECT id, tipo, nome, posicao FROM canais WHERE id = ?').get(id) as LinhaCanal | undefined;
  return c && paraDto(c);
}

/** Novo canal no fim da lista do seu tipo. */
export function criarCanal(banco: Banco, tipo: TipoCanal, nome: string, criadoPor: number, agora: number = Date.now(), comunidadeId: number = COMUNIDADE_PRINCIPAL): CanalDto {
  const { proxima } = banco.prepare('SELECT COALESCE(MAX(posicao), 0) + 1 AS proxima FROM canais WHERE tipo = ? AND comunidade_id = ?').get(tipo, comunidadeId) as {
    proxima: number;
  };
  const r = banco
    .prepare('INSERT INTO canais (tipo, nome, posicao, criado_por, criado_em, comunidade_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tipo, nome, proxima, criadoPor, agora, comunidadeId);
  return buscarCanal(banco, Number(r.lastInsertRowid))!;
}

export function renomearCanal(banco: Banco, id: number, nome: string): CanalDto | undefined {
  banco.prepare('UPDATE canais SET nome = ? WHERE id = ?').run(nome, id);
  return buscarCanal(banco, id);
}

/** Remove o canal; as mensagens saem junto pelo ON DELETE CASCADE (RN-8). Os arquivos de anexo entram na T11. */
export function removerCanal(banco: Banco, id: number): void {
  banco.prepare('DELETE FROM canais WHERE id = ?').run(id);
  banco.prepare('DELETE FROM leituras WHERE chave = ?').run(`c:${id}`);
}
