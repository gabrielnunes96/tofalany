import type { Banco } from '../db/banco.js';

/** Existe conversa direta entre as duas pessoas. */
export function temDm(banco: Banco, x: number, y: number): boolean {
  const [a, b] = x < y ? [x, y] : [y, x];
  return !!banco.prepare('SELECT 1 FROM dms WHERE usuario_a = ? AND usuario_b = ?').get(a, b);
}

/** Amizade aceita (pedido pendente não conta: T-5). Consulta própria, sem depender de amizades.ts. */
function amigosAceitos(banco: Banco, x: number, y: number): boolean {
  const [a, b] = x < y ? [x, y] : [y, x];
  return !!banco.prepare('SELECT 1 FROM amizades WHERE usuario_a = ? AND usuario_b = ? AND aceita = 1').get(a, b);
}

/** As duas pessoas estão em pelo menos um servidor em comum. */
export function dividemServidor(banco: Banco, x: number, y: number): boolean {
  return !!banco.prepare('SELECT 1 FROM membros m1 JOIN membros m2 ON m2.comunidade_id = m1.comunidade_id WHERE m1.usuario_id = ? AND m2.usuario_id = ? LIMIT 1').get(x, y);
}

/**
 * Mini perfil (T-5): quem pode ver o perfil de alguém e pedir amizade a ele: quem divide um servidor, é amigo aceito
 * ou já tem uma conversa direta. Fora disso, a resposta é a mesma de uma conta que não existe.
 */
export function seConhecem(banco: Banco, eu: number, outro: number): boolean {
  if (eu === outro) return true;
  return dividemServidor(banco, eu, outro) || amigosAceitos(banco, eu, outro) || temDm(banco, eu, outro);
}

/** Amigos aceitos das duas pessoas ao mesmo tempo (sem contas removidas nem as próprias). */
export function amigosEmComum(banco: Banco, x: number, y: number): number[] {
  const amigosDe = `SELECT CASE WHEN usuario_a = ? THEN usuario_b ELSE usuario_a END AS id FROM amizades WHERE aceita = 1 AND (usuario_a = ? OR usuario_b = ?)`;
  const linhas = banco
    .prepare(`SELECT u.id FROM usuarios u WHERE u.removido_em IS NULL AND u.id NOT IN (?, ?) AND u.id IN (${amigosDe}) AND u.id IN (${amigosDe}) ORDER BY u.nome_exibicao COLLATE NOCASE, u.id`)
    .all(x, y, x, x, x, y, y, y) as { id: number }[];
  return linhas.map((l) => l.id);
}

/** Servidores em que as duas pessoas estão (quem foi banido já saiu de membros). */
export function servidoresEmComum(banco: Banco, x: number, y: number): number[] {
  return (
    banco
      .prepare('SELECT m1.comunidade_id AS id FROM membros m1 JOIN membros m2 ON m2.comunidade_id = m1.comunidade_id WHERE m1.usuario_id = ? AND m2.usuario_id = ? ORDER BY m1.comunidade_id')
      .all(x, y) as { id: number }[]
  ).map((l) => l.id);
}
