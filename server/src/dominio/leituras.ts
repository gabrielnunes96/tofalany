import type { Destino } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';

export const chaveDoDestino = (d: Destino): string => ('canalId' in d ? `c:${d.canalId}` : `d:${d.dmId}`);

/**
 * Só avança: ler uma mensagem antiga (outro computador atrasado) não "desle" as mais novas.
 * E nunca passa da última mensagem que existe na conversa (um id inventado não marca mensagens futuras como lidas).
 * Devolve até onde ficou lido, ou undefined se a conversa não tem mensagens.
 */
export function marcarLido(banco: Banco, usuarioId: number, destino: Destino, ultimaMensagemId: number): number | undefined {
  const chave = chaveDoDestino(destino);
  const [coluna, id] = 'canalId' in destino ? ['canal_id', destino.canalId] : ['dm_id', destino.dmId];
  const maior = (banco.prepare(`SELECT MAX(id) AS m FROM mensagens WHERE ${coluna} = ?`).get(id) as { m: number | null }).m;
  if (maior === null) return undefined;
  ultimaMensagemId = Math.min(ultimaMensagemId, maior);
  banco
    .prepare(
      `INSERT INTO leituras (usuario_id, chave, ultima_mensagem_id) VALUES (?, ?, ?)
       ON CONFLICT(usuario_id, chave) DO UPDATE SET ultima_mensagem_id = MAX(ultima_mensagem_id, excluded.ultima_mensagem_id)`,
    )
    .run(usuarioId, chave, ultimaMensagemId);
  return (banco.prepare('SELECT ultima_mensagem_id AS u FROM leituras WHERE usuario_id = ? AND chave = ?').get(usuarioId, chave) as { u: number }).u;
}

/**
 * Não lidas de cada conversa da pessoa (canais de texto e as DMs dela): mensagens de outras pessoas
 * depois da última lida. Só as conversas com pelo menos uma.
 */
export function contarNaoLidas(banco: Banco, usuarioId: number): Record<string, number> {
  const linhas = banco
    .prepare(
      `SELECT 'c:' || c.id AS chave,
              (SELECT COUNT(*) FROM mensagens m WHERE m.canal_id = c.id AND m.autor_id <> ?
                 AND m.id > COALESCE((SELECT l.ultima_mensagem_id FROM leituras l WHERE l.usuario_id = ? AND l.chave = 'c:' || c.id), 0)) AS n
         FROM canais c WHERE c.tipo = 'texto'
       UNION ALL
       SELECT 'd:' || d.id,
              (SELECT COUNT(*) FROM mensagens m WHERE m.dm_id = d.id AND m.autor_id <> ?
                 AND m.id > COALESCE((SELECT l.ultima_mensagem_id FROM leituras l WHERE l.usuario_id = ? AND l.chave = 'd:' || d.id), 0))
         FROM dms d WHERE d.usuario_a = ? OR d.usuario_b = ?`,
    )
    .all(usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId) as { chave: string; n: number }[];
  return Object.fromEntries(linhas.filter((l) => l.n > 0).map((l) => [l.chave, l.n]));
}
