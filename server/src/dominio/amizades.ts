import type { AmizadeDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarPorId } from './usuarios.js';

/** Amigos (como no Discord): um pede, o outro aceita. Valem em todos os servidores da instalação. */
interface Linha {
  usuario_a: number;
  usuario_b: number;
  pedido_por: number;
  aceita: number;
}

const par = (x: number, y: number): [number, number] => (x < y ? [x, y] : [y, x]);
const LIMITE_AMIGOS = 200;

export function listarAmizades(banco: Banco, eu: number): AmizadeDto[] {
  const linhas = banco
    .prepare(
      `SELECT a.* FROM amizades a JOIN usuarios u ON u.id = CASE WHEN a.usuario_a = ? THEN a.usuario_b ELSE a.usuario_a END
       WHERE (a.usuario_a = ? OR a.usuario_b = ?) AND u.removido_em IS NULL`,
    )
    .all(eu, eu, eu) as Linha[];
  return linhas.map((l) => ({
    usuarioId: l.usuario_a === eu ? l.usuario_b : l.usuario_a,
    situacao: l.aceita ? 'amigo' : l.pedido_por === eu ? 'enviado' : 'recebido',
  }));
}

export function saoAmigos(banco: Banco, x: number, y: number): boolean {
  const [a, b] = par(x, y);
  return !!banco.prepare('SELECT 1 FROM amizades WHERE usuario_a = ? AND usuario_b = ? AND aceita = 1').get(a, b);
}

/** Pede amizade; se a outra pessoa já tinha pedido, vira amizade na hora. */
export function pedirAmizade(banco: Banco, eu: number, outro: number, agora: number = Date.now()): void {
  if (eu === outro) throw new ErroHttp(400, 'dados_invalidos', 'Escolha outra pessoa.');
  if (!buscarPorId(banco, outro)) throw new ErroHttp(404, 'nao_encontrado', 'Pessoa não encontrada.');
  banco.transaction(() => {
    const [a, b] = par(eu, outro);
    const atual = banco.prepare('SELECT * FROM amizades WHERE usuario_a = ? AND usuario_b = ?').get(a, b) as Linha | undefined;
    if (atual) {
      if (!atual.aceita && atual.pedido_por !== eu) banco.prepare('UPDATE amizades SET aceita = 1 WHERE usuario_a = ? AND usuario_b = ?').run(a, b);
      return;
    }
    const total = (banco.prepare('SELECT COUNT(*) AS n FROM amizades WHERE usuario_a = ? OR usuario_b = ?').get(eu, eu) as { n: number }).n;
    if (total >= LIMITE_AMIGOS) throw new ErroHttp(409, 'dados_invalidos', `Limite de ${LIMITE_AMIGOS} amigos e pedidos.`);
    banco.prepare('INSERT INTO amizades (usuario_a, usuario_b, pedido_por, aceita, criado_em) VALUES (?, ?, ?, 0, ?)').run(a, b, eu, agora);
  })();
}

/** Aceita um pedido recebido. */
export function aceitarAmizade(banco: Banco, eu: number, outro: number): void {
  const [a, b] = par(eu, outro);
  const r = banco.prepare('UPDATE amizades SET aceita = 1 WHERE usuario_a = ? AND usuario_b = ? AND pedido_por = ? AND aceita = 0').run(a, b, outro);
  if (!r.changes) throw new ErroHttp(404, 'nao_encontrado', 'Pedido de amizade não encontrado.');
}

/** Recusa um pedido, cancela o que mandei ou desfaz a amizade. */
export function removerAmizade(banco: Banco, eu: number, outro: number): void {
  const [a, b] = par(eu, outro);
  banco.prepare('DELETE FROM amizades WHERE usuario_a = ? AND usuario_b = ?').run(a, b);
}
