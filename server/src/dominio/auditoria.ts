import type { FiltroAuditoria, PaginaAuditoria, RegistroAuditoriaDto, TipoAuditoria } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';

export interface NovoRegistro {
  tipo: TipoAuditoria;
  /** null = host (comando no servidor). */
  atorId: number | null;
  alvoUsuarioId?: number | null;
  canal?: { id: number; nome: string } | null;
  detalhes?: Record<string, string | number>;
}

interface Linha {
  id: number;
  quando: number;
  tipo: TipoAuditoria;
  ator_id: number | null;
  alvo_usuario_id: number | null;
  canal_id: number | null;
  detalhes: string;
}

/** Nome no momento do evento, para o registro continuar legível depois de renomear ou remover. */
function nomeDe(banco: Banco, id: number | null | undefined): string | undefined {
  if (id === null || id === undefined) return undefined;
  const u = banco.prepare('SELECT usuario, nome_exibicao FROM usuarios WHERE id = ?').get(id) as
    | { usuario: string; nome_exibicao: string }
    | undefined;
  if (!u) return undefined;
  return u.nome_exibicao === u.usuario ? u.usuario : `${u.nome_exibicao} (${u.usuario})`;
}

export function registrarAuditoria(banco: Banco, r: NovoRegistro, agora: number = Date.now()): void {
  const detalhes: Record<string, string | number> = { ...r.detalhes };
  const atorNome = nomeDe(banco, r.atorId);
  const alvoNome = nomeDe(banco, r.alvoUsuarioId);
  if (atorNome) detalhes.atorNome = atorNome;
  if (alvoNome) detalhes.alvoNome = alvoNome;
  if (r.canal) detalhes.canalNome = r.canal.nome;
  banco
    .prepare('INSERT INTO auditoria (quando, tipo, ator_id, alvo_usuario_id, canal_id, detalhes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(agora, r.tipo, r.atorId, r.alvoUsuarioId ?? null, r.canal?.id ?? null, JSON.stringify(detalhes));
}

function paraDto(l: Linha): RegistroAuditoriaDto {
  const { atorNome, alvoNome, canalNome, ...resto } = JSON.parse(l.detalhes) as Record<string, string | number>;
  return {
    id: l.id,
    quando: l.quando,
    tipo: l.tipo,
    ator: l.ator_id === null ? null : { id: l.ator_id, nome: String(atorNome ?? `#${l.ator_id}`) },
    alvo: l.alvo_usuario_id === null ? null : { id: l.alvo_usuario_id, nome: String(alvoNome ?? `#${l.alvo_usuario_id}`) },
    canal: l.canal_id === null ? null : { id: l.canal_id, nome: String(canalNome ?? `#${l.canal_id}`) },
    detalhes: resto,
  };
}

export const LIMITE_PAGINA_AUDITORIA = 100;

/** Mais recente primeiro; "pessoa" casa com quem fez ou com o alvo. Paginação por id (antes). */
export function listarAuditoria(banco: Banco, filtro: FiltroAuditoria = {}): PaginaAuditoria {
  const condicoes: string[] = [];
  const valores: (string | number)[] = [];
  if (filtro.pessoa !== undefined) {
    condicoes.push('(ator_id = ? OR alvo_usuario_id = ?)');
    valores.push(filtro.pessoa, filtro.pessoa);
  }
  if (filtro.tipo !== undefined) {
    condicoes.push('tipo = ?');
    valores.push(filtro.tipo);
  }
  if (filtro.canal !== undefined) {
    condicoes.push('canal_id = ?');
    valores.push(filtro.canal);
  }
  if (filtro.de !== undefined) {
    condicoes.push('quando >= ?');
    valores.push(filtro.de);
  }
  if (filtro.ate !== undefined) {
    condicoes.push('quando <= ?');
    valores.push(filtro.ate);
  }
  if (filtro.antes !== undefined) {
    condicoes.push('id < ?');
    valores.push(filtro.antes);
  }
  const limite = Math.min(Math.max(filtro.limite ?? LIMITE_PAGINA_AUDITORIA, 1), 200);
  const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const linhas = banco.prepare(`SELECT * FROM auditoria ${onde} ORDER BY id DESC LIMIT ?`).all(...valores, limite + 1) as Linha[];
  return { registros: linhas.slice(0, limite).map(paraDto), fim: linhas.length <= limite };
}

/** RN-23: apaga o que passou do prazo. Devolve quantos registros saíram. */
export function limparAuditoria(banco: Banco, dias: number, agora: number = Date.now()): number {
  return banco.prepare('DELETE FROM auditoria WHERE quando < ?').run(agora - dias * 86_400_000).changes;
}

/**
 * Quem ficou "online" no registro sem "offline" (servidor parou com a pessoa conectada)
 * recebe um offline com motivo servidor_reiniciado. Chamado ao subir.
 */
export function fecharOnlinesPendentes(banco: Banco, agora: number = Date.now()): number {
  const pendentes = banco
    .prepare(
      `SELECT a.ator_id AS id FROM auditoria a
       WHERE a.tipo = 'online' AND a.id = (
         SELECT MAX(b.id) FROM auditoria b WHERE b.ator_id = a.ator_id AND b.tipo IN ('online', 'offline')
       )`,
    )
    .all() as { id: number }[];
  for (const { id } of pendentes) {
    registrarAuditoria(banco, { tipo: 'offline', atorId: id, detalhes: { motivo: 'servidor_reiniciado' } }, agora);
  }
  return pendentes.length;
}
