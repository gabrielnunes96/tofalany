import type { Banco } from '../db/banco.js';
import { randomBytes } from 'node:crypto';
import type { SessaoAparelhoDto } from '@tofalando/shared';
import { gerarToken, hashToken } from '../auth/tokens.js';

/** Atualiza visto_em no máximo uma vez por minuto por sessão. */
const INTERVALO_VISTO_MS = 60_000;

export function criarSessao(banco: Banco, usuarioId: number, agora: number = Date.now(), aparelho?: string): string {
  const token = gerarToken();
  banco
    .prepare('INSERT INTO sessoes (token_hash, usuario_id, criado_em, visto_em, id, aparelho) VALUES (?, ?, ?, ?, ?, ?)')
    .run(hashToken(token), usuarioId, agora, agora, randomBytes(16).toString('hex'), nomeAparelho(aparelho));
  return token;
}

/** Nome do aparelho informado no login: texto curto e visível (sem controle nem marcas de direção). */
export function nomeAparelho(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const limpo = bruto.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 40);
  return limpo || null;
}

/** celular (RN-12): as sessões da conta, da mais recente; `atual` marca a do pedido. */
export function sessoesDaConta(banco: Banco, usuarioId: number, tokenAtual: string): SessaoAparelhoDto[] {
  const atual = hashToken(tokenAtual);
  return (
    banco.prepare('SELECT id, aparelho, criado_em, visto_em, token_hash FROM sessoes WHERE usuario_id = ? ORDER BY visto_em DESC').all(usuarioId) as {
      id: string;
      aparelho: string | null;
      criado_em: number;
      visto_em: number;
      token_hash: string;
    }[]
  ).map((s) => ({ id: s.id, aparelho: s.aparelho, criadoEm: s.criado_em, vistoEm: s.visto_em, atual: s.token_hash === atual }));
}

/** Apaga a sessão da conta pelo id opaco; devolve o hash (para derrubar o socket) ou undefined (não é sua ou não existe). */
export function desconectarSessao(banco: Banco, usuarioId: number, id: string): string | undefined {
  const linha = banco.prepare('SELECT token_hash FROM sessoes WHERE id = ? AND usuario_id = ?').get(id, usuarioId) as { token_hash: string } | undefined;
  if (!linha) return undefined;
  banco.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(linha.token_hash);
  return linha.token_hash;
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

/** A sessão (pelo hash) ainda existe e é de um usuário ativo. */
export function sessaoValida(banco: Banco, tokenHash: string): boolean {
  return (
    banco
      .prepare('SELECT 1 FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id AND u.removido_em IS NULL WHERE s.token_hash = ?')
      .get(tokenHash) !== undefined
  );
}

export function revogarSessao(banco: Banco, token: string): void {
  banco.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
}

export function revogarSessoesDoUsuario(banco: Banco, usuarioId: number): void {
  banco.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId);
}
