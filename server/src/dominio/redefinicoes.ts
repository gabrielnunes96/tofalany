import { randomInt } from 'node:crypto';
import type { Banco } from '../db/banco.js';
import { hashToken, iguaisSeguro } from '../auth/tokens.js';

/** Backlog v2, item 3: o código de redefinição vale 24 h e uma vez só. */
export const VALIDADE_REDEFINICAO_MS = 24 * 60 * 60 * 1000;
/** Sem letras que se confundem (0/O, 1/I/L): é ditado ou copiado por mensagem. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Normaliza o que a pessoa digitou: maiúsculas, sem espaços nem hífen. */
export const normalizarCodigoRedefinicao = (texto: string): string => texto.toUpperCase().replace(/[\s-]/g, '');

function novoCodigo(): string {
  let c = '';
  for (let i = 0; i < 8; i++) c += ALFABETO[randomInt(ALFABETO.length)];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Gera (ou troca) o código de uma conta; devolve o código em claro (só ele vê) e quando expira. */
export function gerarRedefinicao(banco: Banco, usuarioId: number, criadoPor: number, agora = Date.now()): { codigo: string; expiraEm: number } {
  const codigo = novoCodigo();
  const expiraEm = agora + VALIDADE_REDEFINICAO_MS;
  banco
    .prepare(
      `INSERT INTO redefinicoes_senha (usuario_id, codigo_hash, expira_em, criado_por, criado_em) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(usuario_id) DO UPDATE SET codigo_hash = excluded.codigo_hash, expira_em = excluded.expira_em, criado_por = excluded.criado_por, criado_em = excluded.criado_em`,
    )
    .run(usuarioId, hashToken(normalizarCodigoRedefinicao(codigo)), expiraEm, criadoPor, agora);
  return { codigo, expiraEm };
}

/** Confere o código da conta; se vale, apaga (uso único) e devolve true. Expirado também é apagado. */
export function usarRedefinicao(banco: Banco, usuarioId: number, codigo: string, agora = Date.now()): boolean {
  const linha = banco.prepare('SELECT codigo_hash, expira_em FROM redefinicoes_senha WHERE usuario_id = ?').get(usuarioId) as
    | { codigo_hash: string; expira_em: number }
    | undefined;
  if (!linha) return false;
  if (linha.expira_em <= agora) {
    banco.prepare('DELETE FROM redefinicoes_senha WHERE usuario_id = ?').run(usuarioId);
    return false;
  }
  if (!iguaisSeguro(hashToken(normalizarCodigoRedefinicao(codigo)), linha.codigo_hash)) return false;
  banco.prepare('DELETE FROM redefinicoes_senha WHERE usuario_id = ?').run(usuarioId);
  return true;
}
