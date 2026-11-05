import type { Banco } from '../db/banco.js';
import { gerarToken, hashToken } from '../auth/tokens.js';

/** Atualiza visto_em no máximo uma vez por minuto por sessão. */
const INTERVALO_VISTO_MS = 60_000;

export function criarSessao(banco: Banco, usuarioId: number, agora: number = Date.now()): string {
  const token = gerarToken();
  banco.prepare('INSERT INTO sessoes (token_hash, usuario_id, criado_em, visto_em) VALUES (?, ?, ?, ?)').run(hashToken(token), usuarioId, agora, agora);
  return token;
}

/** Usuário ativo dono do token, ou undefined. Sessões não expiram (RF-3); são revogadas. */
export function usuarioDaSessao(banco: Banco, token: string, agora: number = Date.now()): number | undefined {
  const hash = hashToken(token);
  const linha = banco
    .prepare(
      `SELECT s.usuario_id AS id, s.visto_em AS visto FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id AND u.removido_em IS NULL
       WHERE s.token_hash = ?`,
    )
    .get(hash) as { id: number; visto: number } | undefined;
  if (!linha) return undefined;
  if (agora - linha.visto > INTERVALO_VISTO_MS) banco.prepare('UPDATE sessoes SET visto_em = ? WHERE token_hash = ?').run(agora, hash);
  return linha.id;
}

export function revogarSessao(banco: Banco, token: string): void {
  banco.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
}

export function revogarSessoesDoUsuario(banco: Banco, usuarioId: number): void {
  banco.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId);
}
